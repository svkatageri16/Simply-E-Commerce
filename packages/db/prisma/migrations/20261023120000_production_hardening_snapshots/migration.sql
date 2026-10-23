-- Additive snapshots; historical billing totals are not recalculated.
ALTER TABLE "orders" ADD COLUMN "buyer_email" TEXT, ADD COLUMN "buyer_name" TEXT,
  ADD COLUMN "checkout_key" TEXT, ADD COLUMN "checkout_hash" TEXT;
CREATE UNIQUE INDEX "orders_checkout_key_key" ON "orders"("checkout_key");
UPDATE "orders" o SET "buyer_email" = NULLIF(lower(trim(c.email)), ''), "buyer_name" = c.full_name
  FROM "customers" c WHERE c.id = o.customer_id;
ALTER TABLE "payment_orders" ADD COLUMN "base_amount_paise" INTEGER,
  ADD COLUMN "tax_paise" INTEGER, ADD COLUMN "gst_basis_points" INTEGER;
ALTER TABLE "subscription_invoices" ADD COLUMN "base_amount_paise" INTEGER,
  ADD COLUMN "tax_paise" INTEGER, ADD COLUMN "gst_basis_points" INTEGER;
