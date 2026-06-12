# Golden Project Deployment Baseline

Updated: 2026-06-12

## Runtime Topology

- Main repo path on server: `/opt/golden-project`
- Main backend process: `golden-project`
- Agent-related process: `gp-agent`
- Webhook-related process: `webhook`
- Main domain: `https://goldenproject.ltd/`
- Agent entry: `https://goldenproject.ltd/agent/`
- IM Genius entry on same host: `https://goldenproject.ltd/im-genius/`

## Ports

- Golden Project backend: `3001`
- GP Agent: `3003`
- GP Webhook: `3002`

## Environment Variables

At minimum, production needs:

- `DATABASE_URL`
- `PORT`
- `PROJECT_DELETE_PASSWORD`
- `GEMINI_API_KEY`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_VERIFICATION_TOKEN`

Recommended source of truth:

- server-side `.env` under `/opt/golden-project/.env`
- local example file: `.env.example`

## Build and Start

Local development:

```bash
npm install
npx prisma generate
npm run build
npm test -- --runInBand
npm run start:dev
```

Server-side production process:

```bash
cd /opt/golden-project
npm install
npx prisma generate
npm run build
pm2 restart golden-project
```

## Logs and Health Checks

Backend logs:

```bash
pm2 logs golden-project
```

Agent logs:

```bash
pm2 logs gp-agent
```

Webhook logs:

```bash
pm2 logs webhook
```

Quick process status:

```bash
pm2 status
```

Basic API smoke check:

```bash
curl http://127.0.0.1:3001/api/projects
```

## Current Deployment Rule

- Prefer direct server access when available.
- Do not leave production running from a dirty worktree.
- Server code must map back to a known git commit.
- Local backup and live server state should be compared before and after hotfix work.

## Rollback Procedure

If the current deployment is bad but the previous git commit is known-good:

```bash
cd /opt/golden-project
git log --oneline -5
git checkout <known_good_commit>
npx prisma generate
npm run build
pm2 restart golden-project
pm2 status
```

If the server had temporary live-only scripts or snapshots:

- preserve them under a dedicated snapshot folder first
- never mix temporary recovery artifacts into the active app root without reason

## Current Stability Baseline

The current code baseline should be treated as:

- repo-tracked backend code from the main branch
- PM2-managed runtime on the server
- no long-term reliance on ad-hoc server-only file edits

## Deployment Acceptance Checklist

Before considering a deployment stable:

- `npm run build` passes
- `npm test -- --runInBand` passes
- PM2 process is online
- `/api/projects` responds locally on the server
- expected environment variables are present
- deployed code matches an explicit git commit
