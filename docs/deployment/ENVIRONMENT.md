# LetzShop Production Environment Contract

This document defines the canonical environment variables used across the LetzShop platform (API, Storefront, Seller Dashboard, and Shared Packages).

---

## 1. Core Runtime Configuration

| Variable | Required | Consumed By | Dev Example | Production Purpose | Secret? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | All apps | `development` | Sets optimization, logging levels, and triggers strict fail-fast security checks when set to `production`. | No |
| `PORT` | Optional (default: 4000 for API, 3000 for Storefront, 3001 for Seller) | API / Frontends | `4000` | Port on which the HTTP server listens. Railway/KVM supply this. | No |

---

## 2. Database (PostgreSQL)

| Variable | Required | Consumed By | Dev Example | Production Purpose | Secret? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | **Yes** | API, Prisma | `postgresql://postgres:postgres@localhost:5432/simply_ecommerce` | Connection URI for PostgreSQL database. Stored on Railway (or later Hostinger KVM). Must use a pooled connection string with SSL in production. | **YES** |

---

## 3. Public Canonical URLs

These define the public domains for CORS verification, canonical link generation, media rewrite rules, and inter-service communication.

| Variable | Required | Consumed By | Dev Example | Production Purpose | Secret? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `API_PUBLIC_URL` | **Yes** | API, Frontends | `http://localhost:4000` | Publicly reachable URL of the NestJS API (e.g. `https://api.letzshop.store` or current Railway URL). | No |
| `NEXT_PUBLIC_API_URL` | **Yes** | Storefront, Seller | `http://localhost:4000` | Public API URL accessible from buyer and seller browsers. | No |
| `STOREFRONT_PUBLIC_URL` | **Yes** | API, Storefront | `http://localhost:3000` | Publicly reachable URL of the Buyer Storefront (e.g. `https://www.letzshop.store` or Vercel URL). Allowed in CORS. | No |
| `SELLER_PUBLIC_URL` | **Yes** | API, Seller | `http://localhost:3001` | Publicly reachable URL of the Merchant Dashboard (e.g. `https://seller.letzshop.store` or Vercel URL). Allowed in CORS. | No |
| `CORS_ALLOWED_ORIGINS` | Optional | API | `http://localhost:3000,http://localhost:3001` | Comma-separated list of additional trusted origins allowed for authenticated cross-origin requests. | No |

---

## 4. Media & Object Storage (Cloudflare R2 / AWS S3 / Local)

The storage abstraction is decoupled from the business layer. Local disk storage is used in local development, while S3/R2 is used in production.

| Variable | Required | Consumed By | Dev Example | Production Purpose | Secret? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `STORAGE_PROVIDER` | **Yes** | API, `@simply/storage` | `local-disk` | `local-disk` (or `local`) for local development filesystem; `s3` for Cloudflare R2 or AWS S3 in production. | No |
| `STORAGE_S3_BUCKET` | Required if `s3` | API, `@simply/storage` | `""` | Name of the S3/R2 bucket (e.g. `letzshop-media`). | No |
| `STORAGE_S3_REGION` | Required if `s3` | API, `@simply/storage` | `auto` | AWS region or `auto` for Cloudflare R2. | No |
| `STORAGE_S3_ENDPOINT` | Required if `s3` | API, `@simply/storage` | `""` | S3-compatible API endpoint URL (e.g. `https://<account_id>.r2.cloudflarestorage.com` for Cloudflare R2). | No |
| `STORAGE_S3_ACCESS_KEY` | Required if `s3` | API, `@simply/storage` | `""` | Cloudflare R2 API token access key ID or AWS IAM access key ID. | **YES** |
| `STORAGE_S3_SECRET_KEY` | Required if `s3` | API, `@simply/storage` | `""` | Cloudflare R2 API token secret access key or AWS IAM secret access key. | **YES** |
| `STORAGE_PUBLIC_BASE_URL` | Optional (Recommended) | API, Frontends | `""` | Public CDN base URL for media delivery (e.g. `https://media.letzshop.store` connected to R2 bucket). | No |
| `NEXT_PUBLIC_MEDIA_URL` | Optional | Frontends | `http://localhost:4000/media/file` | Client-side media URL prefix fallback. | No |

---

## 5. Transactional Email (SMTP)

Transactional emails power merchant registration OTP, buyer order confirmations, shipment updates, and review requests.

| Variable | Required | Consumed By | Dev Example | Production Purpose | Secret? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SMTP_HOST` | **Yes** in prod | API, Mailer | `smtp.gmail.com` | Hostname of SMTP relay (e.g. `smtp.sendgrid.net`, `smtp.mailgun.org`, `smtp.resend.com`). | No |
| `SMTP_PORT` | Optional (default: 587) | API, Mailer | `587` | Port for SMTP submission (587 for STARTTLS, 465 for SSL/TLS). | No |
| `SMTP_USER` | **Yes** in prod | API, Mailer | `apikey` | Username or API key identifier for SMTP authentication. | No |
| `SMTP_PASS` / `SMTP_PASSWORD` | **Yes** in prod | API, Mailer | `secret-smtp-password` | SMTP authentication token or password. | **YES** |
| `SMTP_FROM` | **Yes** in prod | API, Mailer | `LetzShop <no-reply@letzshop.store>` | Default RFC 5322 `From` header. | No |

---

## 6. Payment Gateway (Razorpay)

| Variable | Required | Consumed By | Dev Example | Production Purpose | Secret? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `RAZORPAY_KEY_ID` | Optional (if enabled) | API, Frontends | `rzp_test_xxxxxxxx` | Razorpay public key identifier for checkout modal and order creation. | No |
| `RAZORPAY_KEY_SECRET` | Required if KEY_ID set | API | `rzp_secret_xxxxxxxx` | Razorpay key secret for signature verification and order creation. | **YES** |
| `RAZORPAY_WEBHOOK_SECRET`| Required if webhook enabled | API | `whsec_xxxxxxxx` | Secret used to verify HMAC-SHA256 signatures on incoming Razorpay webhooks. | **YES** |

---

## 7. Authentication & Session Secrets

| Variable | Required | Consumed By | Dev Example | Production Purpose | Secret? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `JWT_ACCESS_SECRET` | **Yes** | API | `dev-access-token-secret-change-in-prod-32!` | Secret key for signing short-lived JWT access tokens. Must be >= 32 characters in production. | **YES** |
| `JWT_REFRESH_SECRET` | **Yes** | API | `dev-refresh-token-secret-change-in-prod-32!` | Secret key for signing long-lived JWT refresh tokens. Must be >= 32 characters in production. | **YES** |
| `COOKIE_SECRET` | **Yes** | API | `dev-cookie-secret-change-in-prod-32!` | Secret used by Fastify Cookie to sign session and auth cookies. Must be >= 32 characters in production. | **YES** |

---

## 8. Development & Diagnostic Toggles

| Variable | Required | Consumed By | Dev Example | Production Purpose | Secret? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `OTP_DEV_MOCK_ENABLED` | Dev only | API | `false` | When `true`, logs OTP to console and skips SMTP. **Must be `false` or absent in production (enforced by startup security gate).** | No |
| `NEXT_OUTPUT_STANDALONE`| Docker/KVM only | Storefront, Seller | `""` | When `true`, Next.js builds a standalone Node server output. Keep unset for normal Vercel deployments. | No |
