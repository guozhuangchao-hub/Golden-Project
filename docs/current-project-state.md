# Golden Project Current State

Updated: 2026-06-12

## Runtime

- App: NestJS + Prisma + PostgreSQL
- Local URL: `http://127.0.0.1:3001`
- Database: `golden_project` on local PostgreSQL
- Build: `npm run build` passes
- Tests: `npm test -- --runInBand` passes
- Architecture baseline: project definition, architecture baseline, development rules, and framework acceptance checklist are now present under `docs/`
- Platform baseline: centralized config and unified error envelope are in place
- Security baseline: high-risk routes now use a permission decorator, guard, and audit interceptor

## Console Pages

| Page | Route | Data status |
| --- | --- | --- |
| Dashboard | `/console/dashboard` | Uses live project data via `/api/projects` and `/api/projects/:id/dashboard` |
| Structure | `/console/structure?projectCode=...` | Uses live dashboard data and module reorder/update APIs |
| Files | `/console/files?projectCode=...` | Uses live project folder scan via `/api/projects/:id/files` |
| Mobile | `/console/mobile?projectCode=...` | Uses live dashboard data and task/event actions |

## Main API Wiring

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `POST /api/projects/bootstrap`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `POST /api/projects/:id/delete`
- `GET /api/projects/:id/dashboard`
- `PATCH /api/projects/:id/modules/reorder`
- `PATCH /api/projects/:id/modules/:moduleId`
- `GET /api/projects/:id/files`
- `GET /api/projects/:id/files/download?path=...`
- `POST /api/projects/:id/files/open?path=...`
- `GET /api/projects/:id/intake-workbook`
- `POST /api/projects/:id/intake-workbook/open`
- `GET /api/projects/:id/runtime-state`
- `PATCH /api/projects/:id/runtime-state`
- `POST /api/projects/:id/intake-sync`

### Tasks

- `GET /api/projects/:projectId/tasks`
- `POST /api/projects/:projectId/tasks`
- `GET /api/projects/:projectId/tasks/:taskId`
- `POST /api/projects/:projectId/tasks/:taskId/confirm`
- `POST /api/projects/:projectId/tasks/:taskId/start`
- `POST /api/projects/:projectId/tasks/:taskId/complete`
- `PATCH /api/projects/:projectId/tasks/:taskId/status`

### Events

- `GET /api/projects/:projectId/events`
- `POST /api/projects/:projectId/events`
- `POST /api/projects/:projectId/events/ingest`
- `POST /api/projects/:projectId/events/demo-seed`
- `GET /api/projects/:projectId/events/pending-review`
- `GET /api/projects/:projectId/events/:eventId`
- `POST /api/projects/:projectId/events/:eventId/confirm`
- `POST /api/projects/:projectId/events/:eventId/reject`
- `POST /api/projects/:projectId/events/:eventId/needs-more-info`
- `PATCH /api/projects/:projectId/events/:eventId/status`

### Integrations

- Feishu settings, messages, proposals, digest, webhook callbacks are under `/api/integrations/feishu/...`
- Agent integration settings, inbound events, webhooks, and acknowledgements are under `/api/integrations/agents/...`

### Mini App

- `GET /api/mini/me/tasks`
- `GET /api/mini/me/reminders`
- `GET /api/mini/project/:projectCode/brief`
- `GET /api/mini/project/:projectCode/contacts`
- `GET /api/mini/project/:projectCode/identity-pool`
- `POST /api/mini/project/:projectCode/identity-claim`
- `POST /api/mini/project/:projectCode/identity-release`

## Current Architecture Status

- `projects` has been split into lifecycle, files, runtime-state, intake-sync, and dashboard-oriented services
- high-risk project/task/event/agent routes now have permission + audit hooks
- configuration reads for core project/task/feishu/agent flows are moving into `src/platform/config`
- an `audit_logs` schema and migration baseline now exist for security/audit work

Remaining major gaps:

- full guard / policy rollout across all sensitive modules is not done
- repository / dao extraction is not done
- many integration payloads still need stronger internal typing
- server deployment and rollback are now documented, but should still be validated in future release work

## Live Projects

The database currently has three projects:

- `2026食博会` · `2026SBH20260602YHGG`
- `2026金砖国家新工业革命伙伴关系论坛` · `2026JZGJXGYGMHBGXLT20260602YHGG`
- `2026 上海新品发布会` · `GP-DEMO-2026-01`

## Notes

- The project is now a git repository.
- Runtime artifacts are ignored: `node_modules`, `dist`, `.env`, `.playwright-cli`, `output`.
- `codex-recovery/` stores the current Codex CLI/MCP recovery baseline and is intentionally tracked.
- deployment reference: `docs/deployment-baseline.md`
- server sync reference: `docs/server-sync-playbook.md`
