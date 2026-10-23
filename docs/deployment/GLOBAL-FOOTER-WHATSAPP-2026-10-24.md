# Global attribution and WhatsApp continuation

Branch: `fix/final-launch-blockers`. Continued from `99d8ccd`; prior launch fixes preserved.

## Completed

- Landing, merchant, admin, buyer and auth attribution: PASS. Each app shell owns one reusable attribution footer, including loading/error/404 and standalone tracking/auth states. Removed duplicate placements and nested attribution footers. The merchant's themed footer remains. Exact copy, safe external link, normal document flow and wrapping verified at 390, 768 and 1440 pixels.
- WhatsApp CONFIRMED, READY_TO_SHIP, SHIPPED, OUT_FOR_DELIVERY, DELIVERED and CANCELLED: PASS. Removed tracking/order links from central templates, seller inline drafts and the legacy generator; removed the product URL from buyer product enquiries. Stage wording, names, order numbers, amounts, courier/AWB and manual deeplink/copy workflow retained.
- Persisted seller follow-up drafts are cleaned before both display/copy and deeplink reuse. The delivered review CTA accepts only the canonical token-protected review route, never a tracking fallback. Seller review links use the storefront origin helper rather than the seller's current origin. The legacy helper no longer invents a subdomain/order/review URL.
- Email URL builders and mail templates are unchanged. Existing real-DB notification lifecycle/retry/deduplication tests passed using an isolated SMTP transport; no real email sent.

## Verification

- API unit tests: 447 passed, 29 suites (including 13 new WhatsApp checks).
- Notification lifecycle integration: 2 passed, real local test DB and isolated SMTP transport.
- Global attribution: 112 checks (52 server-rendered route checks; 60 hydrated responsive checks). Covers all built page routes, including aliases, and buyer/auth/error states. Some protected routes redirect to login; the existing smoke below also exercises an authenticated admin layout.
- Existing browser launch smoke: 10 passed, including authenticated admin package editing and buyer payment failure/dismissal recovery to COD.
- Existing local data harness: OTP, category counts, checkout, tenant isolation and preservation/cleanup checks passed.
- Shared contracts, API, Seller, Storefront and Admin production builds/type validation: PASS. Seller rebuilt after its final review-origin change.
- Generated evidence: `artifacts/global-footer-whatsapp/` (ignored). These are local checks, not deployed-site certification. Footer screenshots can capture loading states intentionally covered by the app shell; the launch smoke also captures completed screens.
- An initial browser run timed out waiting for admin network idleness. Verification now waits for document loading and Next router readiness; external pending requests cannot block attribution checks. The rerun passed.
- Task-owned smoke servers stopped after verification. No unrelated processes or original untracked diagnostic scripts were removed.

## Razorpay audit only — no payment implementation changes

Presence checks printed names and status only:

| Variable | Status |
| --- | --- |
| RAZORPAY_KEY_ID | missing |
| RAZORPAY_KEY_SECRET | configured |
| RAZORPAY_SOLOPRENEUR_PLAN_ID | configured |
| RAZORPAY_PROFESSIONAL_PLAN_ID | configured |
| RAZORPAY_WEBHOOK_SECRET | missing |

The alternative platform key ID and platform webhook secret are also missing. No credentials, environment files or values are committed.

Existing architecture includes backend-calculated GST/order amounts, captured-payment/signature checks, tenant-scoped mandates, duplicate-payment guards, 30-day entitlement updates, immutable invoices and seller Checkout callbacks. Existing routes include both `POST /webhooks/razorpay` and `/payments/webhook/razorpay`, with raw-body support enabled in API bootstrap and HMAC verification. These are inherited implementations; real gateway completion is not claimed.

Continue next with:

1. Configure the missing key ID and webhook secret through environment settings; configure the Razorpay Dashboard webhook against the actual public HTTPS API. Keep values private.
2. Replace AutoPay's per-mandate remote-plan creation with the configured Solopreneur plan ID. Fetch and validate its monthly interval, INR currency and 117882-paise total; retain per-merchant subscription ownership and reuse/idempotency checks. Professional must remain unpurchasable until Admin marks it ACTIVE; Scale remains Contact Sales.
3. Complete durable subscription invoice email delivery after verified payment. Current subscription capture persists the invoice/payment but does not enqueue an invoice email.
4. Unify webhook handling: the public `/webhooks/razorpay` handler currently derives event IDs differently from the payments handler and does not use the provider event-ID header. Require original raw bytes for HMAC, consistently deduplicate distinct events and exercise callback/webhook races.
5. Test the real account's one-time order/capture, mandate authorization, charged renewal, invoice email, duplicate callbacks/events and tenant isolation. No live payment, mandate or charge was created during this audit.

One-time integration completed this pass: NO. AutoPay completed: NO. Webhook completion verified: NO. Real Razorpay testing completed: NO. No Razorpay commit was made.

Business rules preserved: Solopreneur ₹999 + configurable 18% GST = ₹1,178.82, ACTIVE; Professional ₹2,999 + GST = ₹3,538.82, COMING SOON; Scale custom + GST, CONTACT SALES.
