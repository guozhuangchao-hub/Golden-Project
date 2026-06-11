CREATE TABLE "project_runtime_states" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "structure_tree" JSONB,
    "identity_claims" JSONB,
    "intake_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_runtime_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_runtime_states_project_id_key" ON "project_runtime_states"("project_id");

ALTER TABLE "project_runtime_states"
ADD CONSTRAINT "project_runtime_states_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
