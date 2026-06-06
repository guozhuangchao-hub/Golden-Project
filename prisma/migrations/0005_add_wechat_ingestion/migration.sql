CREATE TYPE "WechatInboundMessageStatus" AS ENUM ('NEW', 'PROCESSED', 'IGNORED');
CREATE TYPE "WechatDigestStatus" AS ENUM ('CREATED', 'APPLIED', 'SKIPPED');

CREATE TABLE "wechat_project_settings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "group_names" JSONB,
    "digest_interval_minutes" INTEGER NOT NULL DEFAULT 10,
    "last_digest_at" TIMESTAMP(3),
    "next_digest_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_project_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wechat_messages" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "setting_id" TEXT,
    "external_message_id" VARCHAR(160) NOT NULL,
    "group_id" VARCHAR(120),
    "group_name" VARCHAR(160) NOT NULL,
    "sender_id" VARCHAR(120),
    "sender_name" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "message_type" VARCHAR(50),
    "raw_payload" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "status" "WechatInboundMessageStatus" NOT NULL DEFAULT 'NEW',

    CONSTRAINT "wechat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wechat_task_digests" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "setting_id" TEXT,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" TEXT NOT NULL,
    "source_messages" JSONB,
    "extracted_tasks" JSONB,
    "created_task_ids" JSONB,
    "status" "WechatDigestStatus" NOT NULL DEFAULT 'CREATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wechat_task_digests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wechat_project_settings_project_id_key" ON "wechat_project_settings"("project_id");
CREATE INDEX "wechat_project_settings_enabled_next_digest_at_idx" ON "wechat_project_settings"("enabled", "next_digest_at");

CREATE UNIQUE INDEX "wechat_messages_external_message_id_key" ON "wechat_messages"("external_message_id");
CREATE INDEX "wechat_messages_project_id_received_at_idx" ON "wechat_messages"("project_id", "received_at");
CREATE INDEX "wechat_messages_project_id_status_received_at_idx" ON "wechat_messages"("project_id", "status", "received_at");
CREATE INDEX "wechat_messages_group_name_received_at_idx" ON "wechat_messages"("group_name", "received_at");

CREATE INDEX "wechat_task_digests_project_id_window_end_idx" ON "wechat_task_digests"("project_id", "window_end");
CREATE INDEX "wechat_task_digests_status_created_at_idx" ON "wechat_task_digests"("status", "created_at");

ALTER TABLE "wechat_project_settings" ADD CONSTRAINT "wechat_project_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wechat_messages" ADD CONSTRAINT "wechat_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wechat_messages" ADD CONSTRAINT "wechat_messages_setting_id_fkey" FOREIGN KEY ("setting_id") REFERENCES "wechat_project_settings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wechat_task_digests" ADD CONSTRAINT "wechat_task_digests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wechat_task_digests" ADD CONSTRAINT "wechat_task_digests_setting_id_fkey" FOREIGN KEY ("setting_id") REFERENCES "wechat_project_settings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
