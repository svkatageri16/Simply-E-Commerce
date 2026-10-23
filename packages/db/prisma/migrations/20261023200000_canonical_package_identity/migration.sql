-- Retain canonical plan IDs/codes and every existing subscription/payment/invoice.
-- Seed changes alone do not update an existing deployment.
UPDATE "plans" SET "name" = 'Solopreneur', "price_paise" = 99900,
  "status" = 'ACTIVE', "is_purchasable" = true, "is_public" = true,
  "gst_basis_points" = 1800, "display_order" = 1
WHERE "code" = 'STARTER_MONTHLY';
UPDATE "plans" SET "name" = 'Professional', "price_paise" = 299900,
  "status" = 'COMING_SOON', "is_purchasable" = false, "is_public" = true,
  "gst_basis_points" = 1800, "display_order" = 2, "badge" = 'Coming Soon'
WHERE "code" = 'GROWTH_MONTHLY';
UPDATE "plans" SET "name" = 'Scale', "status" = 'CONTACT_SALES',
  "is_purchasable" = false, "is_public" = true, "gst_basis_points" = 1800,
  "display_order" = 3, "badge" = 'Contact Sales'
WHERE "code" = 'CUSTOM';
