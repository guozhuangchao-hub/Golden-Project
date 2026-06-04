-- CreateEnum
CREATE TYPE "AgentInboundEventStatus" AS ENUM ('NEW', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateTable
CREATE TABLE "agent_integration_settings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "display_name" VARCHAR(100),
    "webhook_url" VARCHAR(255),
    "webhook_secret" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "capabilities" JSONB,
    "config" JSONB,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_integration_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_inbound_events" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "integration_id" TEXT,
    "provider" VARCHAR(50) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "external_event_id" VARCHAR(120),
    "payload" JSONB NOT NULL,
    "status" "AgentInboundEventStatus" NOT NULL DEFAULT 'NEW',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_inbound_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_integration_settings_enabled_provider_idx" ON "agent_integration_settings"("enabled", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "agent_integration_settings_project_id_provider_key" ON "agent_integration_settings"("project_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "agent_inbound_events_external_event_id_key" ON "agent_inbound_events"("external_event_id");

-- CreateIndex
CREATE INDEX "agent_inbound_events_project_id_provider_received_at_idx" ON "agent_inbound_events"("project_id", "provider", "received_at");

-- CreateIndex
CREATE INDEX "agent_inbound_events_status_received_at_idx" ON "agent_inbound_events"("status", "received_at");

-- AddForeignKey
ALTER TABLE "agent_integration_settings" ADD CONSTRAINT "agent_integration_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_inbound_events" ADD CONSTRAINT "agent_inbound_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_inbound_events" ADD CONSTRAINT "agent_inbound_events_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "agent_integration_settings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
