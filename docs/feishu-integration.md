# Feishu Integration

This project supports a lightweight Feishu workflow for project communication:

1. Feishu group messages are received by the bot through the event webhook.
2. Messages are stored in `feishu_messages`.
3. A nightly digest job groups the messages into a review proposal.
4. A confirmation card is sent to the project manager in Feishu.
5. After approval, the proposal is written back into `tasks` and `task_logs`.

## Environment variables

Set these values in `.env`:

```bash
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_VERIFICATION_TOKEN=your_verification_token
```

## Webhook endpoints

Configure these URLs in the Feishu developer console:

- Events: `POST /api/integrations/feishu/webhooks/events`
- Card callbacks: `POST /api/integrations/feishu/webhooks/callbacks`

## Recommended Feishu subscriptions

- `im.message.receive_v1`
- `card.action.trigger`

For group message collection, the app should be granted the group-message scope so it can receive all messages in the bot’s group.

## Project setting

Use `PATCH /api/integrations/feishu/projects/:projectId/setting` to bind:

- `groupChatId`
- `managerUserId`
- nightly summary time

## Manual trigger

You can force a nightly digest for a project with:

- `POST /api/integrations/feishu/projects/:projectId/digest`
