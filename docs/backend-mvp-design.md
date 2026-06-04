# Golden Project MVP Backend Design

## Core tables

The MVP uses 8 core tables:

1. `users`
2. `projects`
3. `project_modules`
4. `project_members`
5. `tasks`
6. `task_logs`
7. `notifications`
8. `ai_reports`

## Table overview

### `users`

- Stores all staff, including full-time and temporary workers.
- `feishu_user_id` is reserved for Feishu task sync.
- `wechat_open_id` is reserved for WeChat Mini Program notifications.

### `projects`

- Represents one event project.
- Can contain multiple modules, members, tasks, notifications, and AI reports.

### `project_modules`

- Represents execution modules under a project, such as stage, registration, or materials.
- `leader_member_id` points to a project member instead of a raw user, so role scope stays inside one project.

### `project_members`

- Join table between `users` and `projects`.
- Supports project-scoped roles: `ADMIN`, `LEADER`, `EXECUTOR`, `TEMP`.

### `tasks`

- Core execution unit.
- Supports direct project-level tasks and module-level tasks.
- Keeps both `owner_id` and `owner_member_id` for easier querying plus project-scope validation.

### `task_logs`

- Immutable operation log for key lifecycle changes.
- Recommended for confirmation, reassignment, transfer, completion, and cancellation.

### `notifications`

- Outbound and in-app message record.
- Can be used later as the reliable delivery queue for WeChat Mini Program and Feishu integrations.

### `ai_reports`

- Stores AI-generated daily reports and risk summaries.
- `source_data` preserves the source snapshot used by Coze or other AI platforms.

## Relationship summary

- One `project` has many `project_modules`.
- One `project` has many `project_members`.
- One `project_module` has many `tasks`.
- One `project` has many `tasks`.
- One `task` has many `task_logs`.
- One `task` has many `notifications`.
- One `project` has many `ai_reports`.
- One `user` can join many `projects` through `project_members`.

## NestJS module suggestion

Recommended backend module split:

1. `prisma`
2. `users`
3. `projects`
4. `project-members`
5. `project-modules`
6. `tasks`
7. `notifications`
8. `ai-reports`
9. `integrations`

Suggested ownership:

- `projects` handles project lifecycle and project dashboard aggregation.
- `project-members` handles participant onboarding, role changes, and temporary staff enrollment.
- `project-modules` handles module CRUD and module leader assignment.
- `tasks` handles creation, assignment, confirmation, transfer, completion, overdue scan, and log writing.
- `notifications` handles message persistence and async dispatch.
- `ai-reports` handles report storage and AI generation records.
- `integrations` handles Coze, Feishu, and WeChat integration adapters.

## API route suggestion

### Users

- `POST /users`
- `GET /users`
- `GET /users/:id`
- `PATCH /users/:id`

### Projects

- `POST /projects`
- `GET /projects`
- `GET /projects/:id`
- `PATCH /projects/:id`
- `GET /projects/:id/dashboard`

### Project modules

- `POST /projects/:projectId/modules`
- `GET /projects/:projectId/modules`
- `PATCH /projects/:projectId/modules/:moduleId`
- `DELETE /projects/:projectId/modules/:moduleId`

### Project members

- `POST /projects/:projectId/members`
- `GET /projects/:projectId/members`
- `PATCH /projects/:projectId/members/:memberId`
- `DELETE /projects/:projectId/members/:memberId`

### Tasks

- `POST /projects/:projectId/tasks`
- `GET /projects/:projectId/tasks`
- `GET /projects/:projectId/tasks/:taskId`
- `PATCH /projects/:projectId/tasks/:taskId`
- `POST /projects/:projectId/tasks/:taskId/confirm`
- `POST /projects/:projectId/tasks/:taskId/transfer`
- `POST /projects/:projectId/tasks/:taskId/complete`
- `POST /projects/:projectId/tasks/:taskId/cancel`
- `GET /projects/:projectId/tasks/:taskId/logs`

### Notifications

- `GET /notifications`
- `GET /notifications/:id`
- `POST /notifications/:id/read`
- `POST /internal/notifications/task-change`

### AI reports

- `POST /projects/:projectId/ai-reports`
- `GET /projects/:projectId/ai-reports`
- `GET /projects/:projectId/ai-reports/:reportId`
- `POST /projects/:projectId/ai-reports/generate`

## Business rule notes

- A task should only be assigned to a user who is already in `project_members`.
- When task status changes, append a `task_logs` record instead of updating history in place.
- Overdue state can be computed by scheduler, then persisted for easier querying.
- Notifications should be written before external push to support retry and traceability.
- AI report generation should store the prompt inputs or source snapshot in `source_data`.
