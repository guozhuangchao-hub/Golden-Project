# Golden Project Server Sync Playbook

Updated: 2026-06-12

## Goal

This playbook defines how to compare local backup code with the live server and how to avoid drifting back into server-only hand edits.

## Standard Sync Order

1. Check local repo state
2. Check live server repo state
3. Compare current commit and working tree differences
4. Identify whether the live server contains:
   - real code changes
   - backup files
   - runtime snapshots
5. Preserve server-only artifacts before resetting or normalizing the repo
6. Bring the live repo back to an explicit git commit
7. Rebuild and verify runtime

## Local Check

```bash
git status --short
git log --oneline --decorate -5
npm run build
npm test -- --runInBand
```

## Server Check

```bash
ssh -i ~/.ssh/id_ed25519_gp_server root@120.78.0.232
cd /opt/golden-project
git status --short
git log --oneline --decorate -5
pm2 status
```

## If Server Has Uncommitted Changes

Classify them first:

- tracked source changes that should exist in git
- backup files such as `.bak`
- temporary runtime state or recovery snapshots

Rule:

- source changes should be normalized into real git history
- backup and recovery artifacts should be moved into a dedicated snapshot directory

## Snapshot Rule

Server-only operational artifacts should be moved into a directory like:

```bash
/opt/golden-project/_server_snapshots/<timestamp>/
```

Local copies of those server-only artifacts should go into:

```bash
server-sync/<timestamp>/
```

## After Normalizing the Server Repo

Run:

```bash
npx prisma generate
npm run build
pm2 restart golden-project
pm2 status
```

Then verify:

- main backend process is online
- key files still exist
- live repo commit is explicit and known

## What Not To Do

- do not leave production dependent on dirty worktree edits
- do not overwrite server-only artifacts before preserving them
- do not assume the live server and local repo are aligned without checking hashes or diffs
- do not mix runtime recovery data into normal source folders without intent
