CREATE TYPE "RiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

CREATE TABLE "risk_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "owner_member_id" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "severity" "RiskSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "source_kind" VARCHAR(40) NOT NULL,
    "source_ref_id" VARCHAR(160),
    "identified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "risk_items_project_id_status_severity_idx" ON "risk_items"("project_id", "status", "severity");
CREATE INDEX "risk_items_project_id_identified_at_idx" ON "risk_items"("project_id", "identified_at");
CREATE INDEX "risk_items_source_kind_source_ref_id_idx" ON "risk_items"("source_kind", "source_ref_id");

ALTER TABLE "risk_items"
ADD CONSTRAINT "risk_items_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "risk_items"
ADD CONSTRAINT "risk_items_owner_member_id_fkey"
FOREIGN KEY ("owner_member_id") REFERENCES "project_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
