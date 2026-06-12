CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "actor_user_id" TEXT,
    "actor_project_member_id" TEXT,
    "actor_system_role" VARCHAR(40),
    "action" VARCHAR(80) NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" VARCHAR(160),
    "status" VARCHAR(30) NOT NULL,
    "summary" VARCHAR(255),
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_project_id_created_at_idx" ON "audit_logs"("project_id", "created_at");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_project_member_id_fkey" FOREIGN KEY ("actor_project_member_id") REFERENCES "project_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
