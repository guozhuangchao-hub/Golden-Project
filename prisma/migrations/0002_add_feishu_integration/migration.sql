-- CreateEnum
CREATE TYPE "FeishuInboundMessageStatus" AS ENUM ('NEW', 'PROCESSED', 'IGNORED');

-- CreateEnum
CREATE TYPE "FeishuProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateTable
CREATE TABLE "feishu_project_settings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "manager_user_id" TEXT,
    "group_chat_id" VARCHAR(100),
    "summary_hour" INTEGER NOT NULL DEFAULT 22,
    "summary_minute" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_digest_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feishu_project_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feishu_messages" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "setting_id" TEXT,
    "chat_id" VARCHAR(100) NOT NULL,
    "message_id" VARCHAR(120) NOT NULL,
    "sender_feishu_user_id" VARCHAR(100),
    "sender_name" VARCHAR(100),
    "message_type" VARCHAR(50),
    "content" TEXT,
    "raw_payload" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "status" "FeishuInboundMessageStatus" NOT NULL DEFAULT 'NEW',

    CONSTRAINT "feishu_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feishu_task_proposals" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "setting_id" TEXT,
    "summary_date" TIMESTAMP(3) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" TEXT NOT NULL,
    "source_messages" JSONB,
    "proposed_tasks" JSONB,
    "card_message_id" VARCHAR(120),
    "status" "FeishuProposalStatus" NOT NULL DEFAULT 'PENDING',
    "manager_comment" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feishu_task_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "feishu_project_settings_project_id_key" ON "feishu_project_settings"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "feishu_project_settings_group_chat_id_key" ON "feishu_project_settings"("group_chat_id");

-- CreateIndex
CREATE INDEX "feishu_project_settings_enabled_summary_hour_summary_minute_idx" ON "feishu_project_settings"("enabled", "summary_hour", "summary_minute");

-- CreateIndex
CREATE UNIQUE INDEX "feishu_messages_message_id_key" ON "feishu_messages"("message_id");

-- CreateIndex
CREATE INDEX "feishu_messages_project_id_received_at_idx" ON "feishu_messages"("project_id", "received_at");

-- CreateIndex
CREATE INDEX "feishu_messages_chat_id_received_at_idx" ON "feishu_messages"("chat_id", "received_at");

-- CreateIndex
CREATE INDEX "feishu_messages_status_received_at_idx" ON "feishu_messages"("status", "received_at");

-- CreateIndex
CREATE INDEX "feishu_task_proposals_project_id_summary_date_idx" ON "feishu_task_proposals"("project_id", "summary_date");

-- CreateIndex
CREATE INDEX "feishu_task_proposals_status_summary_date_idx" ON "feishu_task_proposals"("status", "summary_date");

-- AddForeignKey
ALTER TABLE "feishu_project_settings" ADD CONSTRAINT "feishu_project_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feishu_project_settings" ADD CONSTRAINT "feishu_project_settings_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feishu_messages" ADD CONSTRAINT "feishu_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feishu_messages" ADD CONSTRAINT "feishu_messages_setting_id_fkey" FOREIGN KEY ("setting_id") REFERENCES "feishu_project_settings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feishu_task_proposals" ADD CONSTRAINT "feishu_task_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feishu_task_proposals" ADD CONSTRAINT "feishu_task_proposals_setting_id_fkey" FOREIGN KEY ("setting_id") REFERENCES "feishu_project_settings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feishu_task_proposals" ADD CONSTRAINT "feishu_task_proposals_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
