-- CreateEnum
CREATE TYPE "EventSourceType" AS ENUM ('feishu', 'wechat_import', 'app_report', 'manual', 'dingtalk', 'wecom');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('pending_review', 'confirmed', 'in_progress', 'completed', 'rejected', 'cancelled', 'needs_more_info');

-- CreateEnum
CREATE TYPE "VisibilityScope" AS ENUM ('admin', 'module_leader', 'staff', 'part_time', 'temp_worker');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'pending_review',
    "confidence" DECIMAL(4,3),
    "source_type" "EventSourceType" NOT NULL,
    "source_channel" VARCHAR(100),
    "source_sender" VARCHAR(100),
    "source_sender_role" VARCHAR(50),
    "raw_content" TEXT,
    "visibility_scope" "VisibilityScope" NOT NULL DEFAULT 'admin',
    "ai_result" JSONB,
    "proposed_changes" JSONB,
    "created_by" TEXT,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_project_id_status_created_at_idx" ON "events"("project_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "events_source_type_created_at_idx" ON "events"("source_type", "created_at");

-- CreateIndex
CREATE INDEX "events_confidence_idx" ON "events"("confidence");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
