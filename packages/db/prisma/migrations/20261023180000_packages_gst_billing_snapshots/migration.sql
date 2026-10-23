-- Additive package fields
ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "gst_basis_points" INTEGER NOT NULL DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "display_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "badge" TEXT,
  ADD COLUMN IF NOT EXISTS "is_purchasable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "features" JSONB;

-- Additive invoice snapshot field
ALTER TABLE "subscription_invoices"
  ADD COLUMN IF NOT EXISTS "snapshot" JSONB;

-- Additive merchant billing profile fields on tenants
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "billing_name" TEXT,
  ADD COLUMN IF NOT EXISTS "billing_address" TEXT,
  ADD COLUMN IF NOT EXISTS "billing_state" TEXT,
  ADD COLUMN IF NOT EXISTS "billing_pincode" TEXT,
  ADD COLUMN IF NOT EXISTS "billing_email" TEXT;
