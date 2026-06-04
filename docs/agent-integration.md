# Agent Integration

Golden Project keeps a generic agent entry so future automation workers such as Hermes can plug in without changing the Feishu flow.

## Scope

The generic agent integration is project-scoped and supports:

- integration registration
- inbound event collection
- event acknowledgement

## Endpoints

- `GET /api/integrations/agents/projects/:projectId/integrations/:provider`
- `PATCH /api/integrations/agents/projects/:projectId/integrations`
- `GET /api/integrations/agents/projects/:projectId/events`
- `POST /api/integrations/agents/webhooks/events`
- `POST /api/integrations/agents/events/:eventId/ack`

## Recommended provider names

- `hermes`
- `generic`
- `custom`

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
