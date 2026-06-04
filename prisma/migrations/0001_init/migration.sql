CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "MemberRole" AS ENUM ('ADMIN', 'LEADER', 'EXECUTOR', 'TEMP');
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "ModuleStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TaskStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "TaskLogAction" AS ENUM ('CREATED', 'CONFIRMED', 'REASSIGNED', 'TRANSFERRED', 'STATUS_CHANGED', 'COMPLETED', 'CANCELLED', 'COMMENTED');
CREATE TYPE "NotificationType" AS ENUM ('TASK_CREATED', 'TASK_UPDATED', 'TASK_ASSIGNED', 'TASK_STATUS_CHANGED', 'TASK_OVERDUE', 'SYSTEM');
CREATE TYPE "NotificationChannel" AS ENUM ('MINI_PROGRAM', 'FEISHU', 'WECHAT', 'SYSTEM');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');
CREATE TYPE "AIReportType" AS ENUM ('DAILY', 'SUMMARY', 'RISK');

CREATE TABLE "users" (
  "id" TEXT PRIMARY KEY,
  "name" VARCHAR(100) NOT NULL,
  "mobile" VARCHAR(30),
  "email" VARCHAR(100),
  "avatar_url" TEXT,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "is_temporary" BOOLEAN NOT NULL DEFAULT false,
  "feishu_user_id" VARCHAR(100),
  "wechat_open_id" VARCHAR(100),
  "remark" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "projects" (
  "id" TEXT PRIMARY KEY,
  "name" VARCHAR(200) NOT NULL,
  "code" VARCHAR(50),
  "description" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
  "start_date" TIMESTAMP(3),
  "end_date" TIMESTAMP(3),
  "location" VARCHAR(255),
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "project_members" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" "MemberRole" NOT NULL,
  "title" VARCHAR(100),
  "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "left_at" TIMESTAMP(3),
  "remark" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "project_modules" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "status" "ModuleStatus" NOT NULL DEFAULT 'PENDING',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "leader_member_id" TEXT,
  "start_date" TIMESTAMP(3),
  "end_date" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "tasks" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "module_id" TEXT,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "owner_id" TEXT,
  "owner_member_id" TEXT,
  "assistant_id" TEXT,
  "assistant_member_id" TEXT,
  "created_by_id" TEXT NOT NULL,
  "start_time" TIMESTAMP(3),
  "due_time" TIMESTAMP(3),
  "confirmed_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "task_logs" (
  "id" TEXT PRIMARY KEY,
  "task_id" TEXT NOT NULL,
  "action" "TaskLogAction" NOT NULL,
  "operator_id" TEXT,
  "from_status" "TaskStatus",
  "to_status" "TaskStatus",
  "from_owner_id" TEXT,
  "to_owner_id" TEXT,
  "content" TEXT,
  "extra_data" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "notifications" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT,
  "task_id" TEXT,
  "receiver_id" TEXT NOT NULL,
  "sender_id" TEXT,
  "type" "NotificationType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL DEFAULT 'MINI_PROGRAM',
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL,
  "payload" JSONB,
  "sent_at" TIMESTAMP(3),
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ai_reports" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "report_date" TIMESTAMP(3) NOT NULL,
  "type" "AIReportType" NOT NULL DEFAULT 'DAILY',
  "title" VARCHAR(200) NOT NULL,
  "content" TEXT NOT NULL,
  "summary" TEXT,
  "source_data" JSONB,
  "generated_by" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "users_mobile_key" ON "users" ("mobile");
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE UNIQUE INDEX "users_feishu_user_id_key" ON "users" ("feishu_user_id");
CREATE UNIQUE INDEX "users_wechat_open_id_key" ON "users" ("wechat_open_id");
CREATE UNIQUE INDEX "projects_code_key" ON "projects" ("code");
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members" ("project_id", "user_id");
CREATE UNIQUE INDEX "project_modules_project_id_name_key" ON "project_modules" ("project_id", "name");
CREATE UNIQUE INDEX "ai_reports_project_id_report_date_type_key" ON "ai_reports" ("project_id", "report_date", "type");

CREATE INDEX "projects_status_idx" ON "projects" ("status");
CREATE INDEX "projects_start_date_end_date_idx" ON "projects" ("start_date", "end_date");
CREATE INDEX "project_members_project_id_role_status_idx" ON "project_members" ("project_id", "role", "status");
CREATE INDEX "project_modules_project_id_status_idx" ON "project_modules" ("project_id", "status");
CREATE INDEX "tasks_project_id_status_due_time_idx" ON "tasks" ("project_id", "status", "due_time");
CREATE INDEX "tasks_module_id_status_idx" ON "tasks" ("module_id", "status");
CREATE INDEX "tasks_owner_id_idx" ON "tasks" ("owner_id");
CREATE INDEX "tasks_assistant_id_idx" ON "tasks" ("assistant_id");
CREATE INDEX "task_logs_task_id_created_at_idx" ON "task_logs" ("task_id", "created_at");
CREATE INDEX "task_logs_operator_id_idx" ON "task_logs" ("operator_id");
CREATE INDEX "notifications_receiver_id_status_created_at_idx" ON "notifications" ("receiver_id", "status", "created_at");
CREATE INDEX "notifications_project_id_idx" ON "notifications" ("project_id");
CREATE INDEX "notifications_task_id_idx" ON "notifications" ("task_id");
CREATE INDEX "ai_reports_project_id_report_date_idx" ON "ai_reports" ("project_id", "report_date");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_members"
  ADD CONSTRAINT "project_members_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "project_modules"
  ADD CONSTRAINT "project_modules_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_modules"
  ADD CONSTRAINT "project_modules_leader_member_id_fkey"
  FOREIGN KEY ("leader_member_id") REFERENCES "project_members" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_module_id_fkey"
  FOREIGN KEY ("module_id") REFERENCES "project_modules" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_owner_member_id_fkey"
  FOREIGN KEY ("owner_member_id") REFERENCES "project_members" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_assistant_id_fkey"
  FOREIGN KEY ("assistant_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_assistant_member_id_fkey"
  FOREIGN KEY ("assistant_member_id") REFERENCES "project_members" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_logs"
  ADD CONSTRAINT "task_logs_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_logs"
  ADD CONSTRAINT "task_logs_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_receiver_id_fkey"
  FOREIGN KEY ("receiver_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_reports"
  ADD CONSTRAINT "ai_reports_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_reports"
  ADD CONSTRAINT "ai_reports_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
