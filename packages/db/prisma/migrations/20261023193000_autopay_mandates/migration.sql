CREATE TABLE "autopay_mandates" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id"),
  "plan_id" TEXT NOT NULL REFERENCES "plans"("id"),
  "provider_subscription_id" TEXT NOT NULL,
  "provider_plan_id" TEXT NOT NULL,
  "quote" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "autopay_mandates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "autopay_mandates_provider_subscription_id_key" ON "autopay_mandates"("provider_subscription_id");
CREATE INDEX "autopay_mandates_tenant_id_idx" ON "autopay_mandates"("tenant_id");
