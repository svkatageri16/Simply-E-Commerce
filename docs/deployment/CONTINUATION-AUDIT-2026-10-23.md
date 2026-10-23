# LetzShop continuation audit — 23 October 2026

The application changes are locally verified. **The deployed store is not ready for a release sign-off:** its active API is Render, three sampled live product images return 404, the intended Railway endpoint/volume is unconfirmed, and the aggregate legacy integration run did not pass. No live payment or deployment configuration was changed.

## A. Inherited AG work and Codex changes

Audit baseline: continuation branch `fix/final-launch-blockers`, committed HEAD `a95efa66c321c6e731e23ad66fad4714a5ccbe4f`; fetched main `ac4eedb6e722207eb5a97666bd4791ffcc4149ba`. Existing commits and incoming working changes were preserved. “Inherited” includes AG's uncommitted work, rather than attributing that work to this continuation.

| Area | Before this continuation | Codex action and final evidence |
| --- | --- | --- |
| Variant base price/stock | IMPLEMENTED, NOT VERIFIED | Preserved inherited baseline inheritance and overrides. Product create/update, merchant HTTP creation, types and seller build pass. |
| PostgreSQL checkout lock | IMPLEMENTED, NOT VERIFIED in incoming edits; committed version used a void-returning query | Preserved `$executeRaw` fix; exercised real PostgreSQL limited-stock concurrency and duplicate recovery. |
| Product updates | PARTIAL | Preserved incoming draft/status and SKU fixes. Completed variant-only updates, retained stock/price/inactive state/option links when omitted. Expanded matrix passes. |
| Login/register separation | IMPLEMENTED, NOT VERIFIED | Preserved `/login`, `/register`, existing compatibility routes. Browser auth, OTP/PIN stage, desktop/mobile navigation verified. |
| Preview bridge | IMPLEMENTED, NOT VERIFIED | Preserved existing origin/source-checked bidirectional implementation. No preview redesign. Full preview bridge interaction matrix was not independently rerun in this continuation. |
| Outbox email | PARTIAL | Preserved queue/worker; completed shipment status events, immutable recipient handling, stable Message-ID, retry and duplicate tests. |
| WhatsApp drafts | PARTIAL | Preserved prepared-message panel/copy action. Corrected remaining automatic-send claims and added out-for-delivery draft. |
| Three packages | PARTIAL | Completed authoritative availability/GST, admin controls and existing-database data migration. |
| AutoPay | MISSING behind an existing selector | Implemented separate Razorpay mandate/charge path and idempotent renewal. Gateway transport mocked in tests; live account verification outstanding. |
| Billing profile/invoices | PARTIAL | Validated fields/GSTIN, required billing details for new purchases, preserved omitted GSTIN, fixed mutable PDF fallbacks and concurrent invoice creation. |
| Landing/footer | PARTIAL | Preserved incoming attribution components and approved screens; completed five final steps and corrected package behavior without restoring Brand Studio. |
| Infrastructure/storage | PARTIAL | Preserved Docker/Nginx/KVM/R2 files. Fixed production entry point and supported durable Railway/local mounts alongside S3/R2. Local and isolated SDK checks pass; target deployment not verified. |

## B. Order creation

The required product matrix was the **first test run**, before source edits. It initially failed because the isolated test DB lacked `plans.gst_basis_points`. The existing additive migration was applied locally and the unchanged matrix passed. It was subsequently expanded, rather than weakened.

Checkout retains `SELECT pg_advisory_xact_lock(...)` through Prisma `$executeRaw`, avoiding deserialization of PostgreSQL `void`. Order/inventory transactions retain their locks. Replays now pass the current public-store/subscription gate. Keys are store scoped; payment idempotency keys are scoped to their merchant order or tenant. Real DB tests exercise limited stock, duplicate checkout, invalid tenant access and cancelled online-to-COD conversion.

## C–D. Product create and update

Verified service matrix and an HTTP Bug 25 reproduction. Coverage includes title, description, base price, stock, SKU, category, selling mode, enquiry CTA, draft/publish, unchanged/replaced/added/removed images, three images, variants, price/stock edits and inactive status. Removing all required images remains a meaningful validation error.

The incoming SKU matching/status fixes were retained. Additional faults found during audit: supplying variants without options skipped variant updates; incomplete variant fields could reset price/stock/status and erase option links. Partial edits now preserve those fields and existing option relationships. New variants continue using the merchant baseline, without reinstating ₹799 or stock 10 defaults.

## E. Checkout and payments

Real local browser tests exercised Buy Now → required email → online initiation → dismissal/failure → COD → fully rendered confirmation. Both failure paths create **one order and one inventory deduction** through the actual local API/DB; the Razorpay browser surface is an isolated stub. No real charge was made.

Checkout keys survive refresh for the same selection. Gateway SDK loading has a timeout. Dismiss/failure/verification errors release the busy state. Server authority uses integer paise, strict amount/currency/order matching and captured-payment checks. Production no longer fabricates orders/captured payments on network failures or silently chooses the mock gateway. Public verification controllers do not forward caller-supplied signature-bypass flags.

Duplicate callbacks serialize on database rows; paid access, transactions and invoices commit together. Production activation cannot reuse a different tenant/plan's paid order or extend access repeatedly from a redirect. Webhooks verify signed raw bodies and retain provider event IDs; repeated charge processing is idempotent.

## F. Notifications

Real database lifecycle tests and the real email templates run against an isolated SMTP transport. Verified NEW, CONFIRMED, READY, DISPATCHED, OUT_FOR_DELIVERY, COMPLETED/delivery-review and CANCELLED. The merchant UI's READY/COMPLETED map to ready-to-ship/delivered. Order updates and outbox events commit together; SMTP failure does not roll back the status. Retry, repeated status clicks, worker restart, immutable buyer email, stable Message-ID and one delivered review email were checked. Cancellation restores stock once.

Shiprocket out-for-delivery no longer maps to in-transit. Merchants can explicitly mark an already dispatched order out for delivery. Prepared WhatsApp actions use stage-specific text, normalized phones, the “Open WhatsApp Message” instruction and Copy Message fallback. No Cloud API delivery is claimed. The confirmation page states that email is queued rather than claiming delivery before processing.

SMTP cannot atomically commit with PostgreSQL: a crash after SMTP acceptance and before DB completion can still cause a resend. This limit is documented; ordinary retry/restart/double-click paths are tested. No additional real customer email was sent during this continuation.

## G. Packages

Canonical existing IDs/codes remain intact. The additive data migration updates existing records, rather than requiring a production seed/reset:

| Package | Base paise | GST basis points | Tax paise | Payable paise | Availability |
| --- | ---: | ---: | ---: | ---: | --- |
| Solopreneur | 99900 | 1800 | 17982 | 117882 | Active and available |
| Professional | 299900 | 1800 | 53982 | 353882 | Coming Soon; purchase rejected |
| Scale | Custom | 1800 | Quote-derived | Quote-derived | Contact Sales; no arbitrary payment |

Admin controls name, description/highlights/features, price, GST, status, visibility, purchase permission, display order and badge. Availability and configured tax are enforced on the server and reflected by seller/landing. Hidden plans stay hidden. Professional can become purchasable only when explicitly made active and enabled by an administrator. Normal merchants are rejected by the actual admin controller role policy.

An owned administrator signed in through the real HttpOnly session endpoint, edited an owned package through the UI/API, and the test checked persisted GST/status before cleaning up its user, session, package and audit records. No existing package was changed by this smoke test.

One-time purchase grants 30 days with manual renewal. AutoPay creates a separate Razorpay monthly plan/mandate; mandate creation alone grants no access. A captured payment must belong to that mandate/invoice and match the agreed amount. Duplicate charges grant one renewal and invoice. Existing access is retained on early renewal and the new invoice period covers the additional 30 days. Account-level mandate, real recurring payment and cancellation tests remain outstanding.

## H. GST, profile and invoices

Business/legal name, billing address, state, PIN code and billing email are required for new subscription purchases; GSTIN remains optional. GSTIN is uppercased and syntax checked on both sides; no government verification is claimed. Updating other profile fields does not erase an existing GSTIN.

Verified payments create immutable snapshots of invoice number/date, buyer details (including empty historical GSTIN), package/period, base/tax/total, payment reference/method and configured issuer. Later profile changes do not change the invoice PDF. No fabricated issuer GSTIN is used. Actual issuer legal/GST/address configuration must be confirmed before production tax invoicing. Historical payment totals were not rewritten and active Launch subscriptions were not revoked.

## I. Landing

Approved layout and markup were retained. **The user's clarified Screen 6 is the existing eight-stage Customer Journey in `Screen5CustomerJourney.tsx`; the older filename is not its current approved screen number.** Discover → Product → Variant → Checkout → Payment/COD → Order Confirmed → Shipping & Tracking → Review remains before pricing. The theme gallery is not relabelled as Screen 6. Removed standalone Brand Studio marketing remains removed.

Pricing shows the three packages from backend records. Screen 8 reuses the existing design and now communicates five steps, with `/register` and `/login` final CTAs. Navigation anchors remain live. EN/MR/HI checks pass. The frozen showcase suite passed 108 geometry/interaction cases, and Customer Journey passed 21 viewport/language checks plus native touch.

## J. Attribution

Preserved the reusable per-app attribution components and existing store branding. Landing, merchant layouts, admin layout, public store footer, seller login/registration/onboarding and admin login include the required AIKYAM attribution/link. It is in document flow. Browser checks cover landing/auth, real admin package UI, and fully rendered buyer confirmation; layout reuse covers the remaining pages. The existing merchant-themed store footer remains.

## K. Deployment, media and portability

Storage/package builds, API startup and production frontend builds pass locally. The API production command now matches its emitted `dist/main.js`. Development local storage works; production local media must be within `RAILWAY_VOLUME_MOUNT_PATH` or an explicitly declared persistent mount. S3/R2 uses the existing real SDK adapter. The SDK contract verifies upload bytes, read, replacement, metadata, deletion and exclusion of private KYC. Local JPEG/PNG/WebP/AVIF decoding passes in four engines. Existing Docker/Nginx/KVM files were preserved; a new Docker image/KVM installation or real R2 bucket was not tested.

Read-only live observations:

- Vercel storefront HTML: HTTP 200.
- A real browser called `https://simply-ecommerce-api.onrender.com/storefront/bridgeoceans-wealth` and received HTTP 200. The observed active API is **Render**, despite the intended Railway architecture in the task. No live migration was performed.
- Render health, store and six-product catalog sample: HTTP 200.
- Three sampled product media URLs: **all HTTP 404**. Originals were not found by exact key in known local media roots, or by exact original filename in the known download/workspace directories. Missing bytes cannot be repaired with placeholders or a frontend URL change.
- `https://api.letzshop.store` could not be reached from this environment. No current Railway API URL or persistent-volume configuration was supplied.

Before deployment sign-off: identify the intended API service; set/rebuild both Vercel API origins appropriately; confirm durable media storage; restore missing originals from backup or re-upload them through the merchant UI; apply additive migrations; confirm issuer/SMTP/gateway environment and real gateway/webhook behavior. Do not delete existing stores or reset/seed production. See `ENVIRONMENT.md` for the current Railway/Vercel configuration and retained KVM/R2 path.

Prisma client generation and local migration status pass (21 migrations applied). Read-only local schema comparison reports only three pre-existing `updated_at` default differences (`plan_highlights`, `platform_settings`, `review_reports`); it proposes no dropped tables/columns. No unrelated drift changes were applied.

## L. Tests and practical limits

- Storage, shared contracts, i18n and API builds: PASS.
- Seller/storefront/admin TypeScript checks and production builds: PASS.
- API unit suite: **434 tests / 28 suites PASS**.
- Focused real-DB launch integration suite: **30 tests / 8 suites PASS** (product matrix, HTTP create/update, checkout stock/recovery, billing/AutoPay/invoices, lifecycle mail, admin packages and tenant isolation).
- Existing four-browser buyer/category/Buy Now matrix: **48 cases PASS**, plus four out-of-stock checks. WebKit is not physical Safari.
- Final focused browser smoke: **10 checks PASS**, including real owned admin session/package persistence and both gateway failure-to-COD paths.
- Frozen landing: **108 cases PASS**. Eight-stage journey: **21 cases and native touch PASS**. Landing auth navigation: desktop/mobile PASS.
- i18n coverage/scenarios: PASS; 100% key coverage with fallback. Production configuration fail-fast: **14 checks PASS**.
- Isolated SMTP/SDK/gateway fixtures were used where stated. No live payment, real AutoPay mandate or real R2 write is claimed.

**The aggregate `pnpm --filter @simply/api test:e2e` run did not pass.** Multiple older suites still use removed `/auth/otp/send` / `/auth/otp/verify` fixed-`123456` login or phone-only registration fixtures, and old pricing/email assumptions. That aggregate process later aborted with a native Node memory allocation error while builds were also in progress. Current focused checks and builds were run sequentially and passed. Those legacy fixtures were not bypassed, removed, or made insecure to claim a green complete suite. The complete production regression status therefore remains FAIL even though the independently exercised launch paths pass.

## M. Local load

GET-only mixed-store runs, approximately ten seconds per phase, production-built local storefront plus local API/PostgreSQL. Owned fixtures were cleaned up; existing store IDs/slugs/names were checked unchanged.

| Users | Requests | Errors | p50 ms | p95 ms | p99 ms | API heap MB | Runner RSS MB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 25 | 4548 | 0 | 50.39 | 99.48 | 110.30 | 65 | 189 |
| 50 | 5082 | 0 | 91.12 | 178.21 | 192.03 | 54 | 194 |
| 100 | 6690 | 0 | 150.17 | 315.07 | 357.98 | 70 | 203 |

API heap is a post-phase `/health` sample, not peak server RSS; runner RSS measures the harness. These short local measurements do not establish Railway, Render or KVM production capacity. Separate real DB tests cover scarce stock, duplicate checkout/callback/webhook/status/email/invoice behavior.

## N. Git and evidence

Work continued on `fix/final-launch-blockers`; inherited commits/working edits were retained. Changes are grouped into catalog, billing, order notifications, landing/footer and verification/documentation commits. Normal fetch/merge/push only; no reset, clean, force push or migration-history rewrite. The new mandate migration's initial local-only failed attempt was marked rolled back before its corrected version applied; no tables or user data were reset.

Machine-readable logs, screenshots, load results and public deployment observations are under `artifacts/production-final/` (ignored generated evidence). The original unrelated local inspection/update snippets remain untracked and unchanged. Final push/merge hashes are reported in the final response after remote verification.
