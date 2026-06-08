CREATE TYPE "TaskUpdateType" AS ENUM ('PROGRESS', 'BLOCKER', 'HELP_REQUEST', 'COMMENT');

ALTER TABLE "tasks"
ADD COLUMN "last_progress_at" TIMESTAMP(3),
ADD COLUMN "last_reminder_at" TIMESTAMP(3),
ADD COLUMN "blocked_at" TIMESTAMP(3),
ADD COLUMN "needs_help" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "task_updates" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "member_id" TEXT,
    "type" "TaskUpdateType" NOT NULL,
    "content" TEXT NOT NULL,
    "progress_percent" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_updates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_updates_task_id_created_at_idx" ON "task_updates"("task_id", "created_at");
CREATE INDEX "task_updates_member_id_created_at_idx" ON "task_updates"("member_id", "created_at");

ALTER TABLE "task_updates"
ADD CONSTRAINT "task_updates_task_id_fkey"
FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_updates"
ADD CONSTRAINT "task_updates_member_id_fkey"
FOREIGN KEY ("member_id") REFERENCES "project_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
