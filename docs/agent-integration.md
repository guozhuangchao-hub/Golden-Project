# Agent Integration

Golden Project keeps a generic agent entry so future automation workers such as Hermes can plug in without changing the Feishu flow.

## Scope

The generic agent integration is project-scoped and supports:

- integration registration
- inbound event collection
- event acknowledgement
- customer-service chat through OpenClaw

## Endpoints

- `GET /api/integrations/agents/projects/:projectId/integrations/:provider`
- `PATCH /api/integrations/agents/projects/:projectId/integrations`
- `GET /api/integrations/agents/projects/:projectId/events`
- `POST /api/integrations/agents/webhooks/events`
- `POST /api/integrations/agents/events/:eventId/ack`
- `POST /api/integrations/agents/projects/:projectId/customer-service/chat`

## Recommended provider names

- `hermes`
- `codex`
- `openclaw`
- `generic`
- `custom`

## Current Default: Codex Customer Service

The dashboard currently calls the customer-service endpoint with:

```json
{
  "provider": "codex",
  "sessionId": "dashboard",
  "message": "今天最高风险是什么？",
  "includeProjectContext": true
}
```

`codex` is an internal stable customer-service mode. It reads the current project context from Golden Project and replies with concise project-manager guidance. It does not call OpenClaw.

## OpenClaw Customer Service

Register OpenClaw as the project customer-service agent:

```bash
curl -X PATCH http://localhost:3000/api/integrations/agents/projects/PROJECT_ID_OR_CODE/integrations \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "openclaw",
    "displayName": "OpenClaw 客服",
    "enabled": true,
    "capabilities": ["customer_service", "project_qa"],
    "config": {
      "mode": "openclaw-cli",
      "command": "/Users/xiaoguodelaoguo/.npm-global/bin/openclaw",
      "home": "/Users/xiaoguodelaoguo",
      "timeoutSeconds": 180,
      "customerPrompt": "你是 Golden Project 的客服 Agent，请用中文简洁回答项目、任务、风险和下一步动作。"
    }
  }'
```

Ask the agent:

```bash
curl -X POST http://localhost:3000/api/integrations/agents/projects/PROJECT_ID_OR_CODE/customer-service/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "openclaw",
    "sessionId": "dashboard",
    "message": "今天最高风险是什么？",
    "includeProjectContext": true
  }'
```

The dashboard Agent panel calls this endpoint automatically. The backend uses the configured OpenClaw CLI command and real user HOME so it can reach the local OpenClaw Gateway.

To let a project manager's OpenClaw take over later:

1. Register the project-level `openclaw` integration with the PATCH example above.
2. Change the dashboard request provider from `codex` to `openclaw`, or have the project manager call the same chat endpoint directly with `"provider": "openclaw"`.
3. Give OpenClaw this instruction:

```text
你是 Golden Project 的项目客服 Agent。
你会收到当前项目名称、模块、待处理任务、待确认事件，以及用户的问题。
请只基于这些上下文回答，不要编造。
回答必须简洁、可执行，适合项目经理和现场执行团队阅读。
如果用户问风险，先列逾期、高优先级、待确认事件。
如果用户问今天/下一步，给出 1-3 个优先动作。
如果信息不足，明确指出需要补充的字段。
```

## Suggested payload shape

```json
{
  "provider": "hermes",
  "projectId": "cmpw74qz80002bspiax53np0z",
  "eventType": "task.review",
  "eventId": "evt_123",
  "data": {
    "summary": "群消息已整理为任务提案"
  }
}
```

## How it fits with Feishu

Feishu remains the communication channel for project groups. The generic agent entry is only for future back-office automation or maintenance agents. That means:

- Feishu messages can still be collected and turned into proposals
- project managers can review those proposals in the dashboard
- Hermes or another agent can plug into the generic webhook later
