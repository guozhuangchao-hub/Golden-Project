CREATE TYPE "MessageSignalType" AS ENUM (
  'TASK_CANDIDATE',
  'RISK_SIGNAL',
  'PROGRESS_UPDATE',
  'HELP_REQUEST',
  'CONTACT_UPDATE'
);

CREATE TABLE "message_signals" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_type" "EventSourceType" NOT NULL,
    "source_message_id" VARCHAR(160) NOT NULL,
    "source_channel" VARCHAR(160),
    "sender_name" VARCHAR(100),
    "signal_type" "MessageSignalType" NOT NULL,
    "summary" VARCHAR(255) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "payload" JSONB,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_signals_project_id_created_at_idx" ON "message_signals"("project_id", "created_at");
CREATE INDEX "message_signals_project_id_signal_type_created_at_idx" ON "message_signals"("project_id", "signal_type", "created_at");
CREATE INDEX "message_signals_source_type_source_message_id_idx" ON "message_signals"("source_type", "source_message_id");

ALTER TABLE "message_signals"
ADD CONSTRAINT "message_signals_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
