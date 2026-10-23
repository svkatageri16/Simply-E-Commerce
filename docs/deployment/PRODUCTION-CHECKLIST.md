# LetzShop Production Launch Checklist

Use this pre-flight verification checklist prior to opening LetzShop to live merchants and buyers.

---

## 1. Infrastructure & Environment Readiness

- [ ] **DNS & Domain Names**:
  - `www.letzshop.store` resolves to Storefront (Vercel or KVM).
  - `seller.letzshop.store` resolves to Seller Dashboard (Vercel or KVM).
  - `api.letzshop.store` resolves to NestJS Backend API (Railway or KVM).
- [ ] **SSL / TLS**: Full HTTPS enforced on all domains with modern TLS 1.3/1.2; HSTS enabled.
- [ ] **PostgreSQL Database**:
  - Railway PostgreSQL instance provisioned and healthy.
  - Connection pooling configured with SSL mode enabled.
  - All Prisma migrations executed cleanly via `prisma migrate deploy`.
- [ ] **Object Storage (Cloudflare R2 / AWS S3)**:
  - S3/R2 configured, or Railway persistent volume attached with `MEDIA_STORAGE_LOCAL_ROOT` contained inside `RAILWAY_VOLUME_MOUNT_PATH`.
  - Bucket `letzshop-media` created and public custom domain attached (`media.letzshop.store`).
  - Read/write S3 API credentials tested and operational.
  - KYC and sensitive merchant documents confirmed strictly excluded from public bucket.
- [ ] **Transactional Email (SMTP)**:
  - Real SMTP relay configured (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).
  - Production verification passed via `node scripts/test-smtp-health.mjs`.
  - SPF, DKIM, and DMARC DNS records verified for sending domain.
- [ ] **Payment Gateway (Razorpay)**:
  - Live API keys configured (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
  - Webhook secret configured (`RAZORPAY_WEBHOOK_SECRET`).
  - Canonical pricing confirmed: ₹999 + 18% GST = ₹1,178.82 (117,882 paise).
- [ ] **CORS & Cookies**:
  - No wildcard CORS on authenticated endpoints.
  - `STOREFRONT_PUBLIC_URL`, `SELLER_PUBLIC_URL`, and trusted production origins explicitly whitelisted.
  - Cookies set with `Secure`, `HttpOnly`, and `SameSite=Lax`.
- [ ] **Observability & Health**:
  - `GET /health` returns `{ "status": "ok" }`.
  - `GET /health/ready` returns `{ "status": "ok", "database": "connected", "storage": "configured" }`.
  - Structured error logging active; no passwords, OTPs, or API secrets logged.

---

## 2. Merchant Lifecycle & Onboarding

- [ ] **Merchant Registration**:
  - Valid Indian 10-digit mobile number accepted.
  - Email address normalized and validated.
  - Email OTP delivered via real SMTP within 15 seconds.
  - Brute force and rate limiting active on OTP request and verify endpoints.
- [ ] **Security PIN & Login**:
  - 6-digit PIN created and hashed securely.
  - PIN login issues signed JWT access and refresh cookies.
  - Session refresh and logout flows clear tokens properly.
- [ ] **Store Creation**:
  - Store name, slug, currency (INR), and basic settings saved.
  - Store slug uniqueness validated.
- [ ] **Subscription & Entitlement**:
  - Inactive / unpaid merchant store is strictly **PRIVATE** (inaccessible to buyers).
  - 30-day subscription activation verified only through backend payment verification / webhook.
  - Verified active merchant store becomes **PUBLIC**.
  - Expired subscription automatically transitions store back to **PRIVATE**.

---

## 3. Product & Catalog Management

- [ ] **Product Creation**:
  - Title, description, price, SKU, and inventory created.
  - Category assignment and category count update correctly.
- [ ] **Media & Images**:
  - Product main image uploaded to R2/S3 storage.
  - Image persisted across API and frontend restarts.
  - Variant image upload and assignment verified.
  - Store logo and hero banner upload verified.
  - Path traversal and malicious extension protection verified.
- [ ] **Publishing**:
  - Product status toggled to `ACTIVE`.
  - Product visible in public storefront search and category filters.

---

## 4. Buyer Experience & Checkout Flow

- [ ] **Public Storefront Browsing**:
  - Buyer loads store homepage by slug: `/store/[slug]`.
  - Theme colors and styling render properly.
  - Product catalog renders with images, titles, and formatted INR prices.
  - Product detail page shows variants, inventory status, and descriptions.
- [ ] **Cart & Buy Now**:
  - Adding items to cart updates badge count and persists in session/local storage.
  - Quantity adjustments recalculate cart subtotal, shipping, and total.
  - Direct "Buy Now" navigates straight to checkout with selected item.
- [ ] **Checkout Validation**:
  - Mandatory customer email collected for order confirmations and tracking.
  - Indian delivery address collected and validated.
  - Out of stock items rejected.
- [ ] **Payment Methods**:
  - **Cash on Delivery (COD)**: Order created directly with status `PENDING` / payment `COD`.
  - **Razorpay Online Payment**: Order created with Razorpay order ID; modal initiates in browser.
  - **Failed Online Payment Fallback**: Seamless fallback option to complete order via COD without losing cart items.
- [ ] **Order Confirmation & Tracking**:
  - Confirmation page shows unique order number, itemized receipt, and tracking link.
  - Order confirmation email queued in outbox and sent to buyer email.
  - Public order tracking link `/track/[orderNumber]` accessible without requiring buyer login.
- [ ] **Customer Reviews**:
  - Review submission flow `/store/[slug]/review/[orderNumber]` operational for delivered orders.
  - Rating, title, comment, and optional review image saved.

---

## 5. Security & Isolation Verification

- [ ] **Tenant Isolation**:
  - Merchant A cannot view, edit, or delete Merchant B's products, orders, customers, or media.
  - All database queries enforce `tenantId` / `storeId` constraints.
- [ ] **Rate Limiting**:
  - Registration OTP endpoints protected by `ThrottlerGuard`.
  - Public checkout rate limited (20 req/min).
  - Media upload rate limited (30 req/min).
- [ ] **Graceful Shutdown**:
  - API handles `SIGTERM` and `SIGINT` cleanly:
  - Active HTTP requests completed.
  - Prisma database connections closed.
  - Outbox workers terminate timers cleanly without corrupting active jobs.

---

## 6. Disaster Recovery & Operations

- [ ] **Automated Backups**: Railway automated snapshots active + daily off-site `pg_dump` tested.
- [ ] **Rollback Plan**: Previous stable Git tag and container image verified.
- [ ] **Production Runbook**: Team members have access to deployment credentials and monitoring dashboards.
