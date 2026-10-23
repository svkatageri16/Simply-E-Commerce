# LetzShop: Hostinger KVM 4 & Cloudflare R2 Migration Playbook

This playbook provides a step-by-step operational guide for migrating LetzShop application workloads from Vercel + Railway to a dedicated **Hostinger KVM 4** server with **Cloudflare R2** for object storage.

---

## 1. Target Architecture Overview

```text
                                Buyer & Merchant Traffic
                                           │
                                           ▼
                                ┌─────────────────────┐
                                │   Cloudflare CDN    │ (DNS, WAF, DDoS Protection, SSL)
                                └──────────┬──────────┘
                                           │
                      ┌────────────────────┼────────────────────┐
                      │ HTTPS              │ HTTPS              │ HTTPS
                      ▼                    ▼                    ▼
             www.letzshop.store   seller.letzshop.store   api.letzshop.store
                      │                    │                    │
                      └────────────────────┼────────────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │     Hostinger KVM 4     │
                              │   (Ubuntu 24.04 LTS)    │
                              │  Nginx Reverse Proxy    │
                              │         │               │
                              │  ┌──────┴──────┐        │
                              │  │Docker Engine│        │
                              │  │             │        │
                              │  │ Storefront  │ (:3000)│
                              │  │ Seller Dash │ (:3001)│
                              │  │ NestJS API  │ (:4000)│
                              │  └──────┬──────┘        │
                              └─────────┼───────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │                                       │
                    ▼ (Pooled TLS over WAN)                 ▼ (S3 API HTTPS)
        ┌───────────────────────┐               ┌───────────────────────┐
        │  Railway PostgreSQL   │               │     Cloudflare R2     │
        │   (Remains initially) │               │   Public Media Bucket │
        └───────────────────────┘               │ (media.letzshop.store)│
                                                └───────────────────────┘
```

> [!IMPORTANT]
> **Database Continuity**: PostgreSQL remains hosted on Railway during the initial workload migration. This eliminates database downtime risk and allows safe application migration. PostgreSQL may be migrated to a dedicated database instance or local KVM volume later without changing application code.

---

## 2. Cloudflare DNS & Proxy Setup

1. In Cloudflare Dashboard, add the following DNS records pointing to your Hostinger KVM 4 static IP:
   - `A` `www` -> `<KVM_IPV4_ADDRESS>` (Proxied: ON 🟧)
   - `A` `@` (or CNAME to www) -> `<KVM_IPV4_ADDRESS>` (Proxied: ON 🟧)
   - `A` `seller` -> `<KVM_IPV4_ADDRESS>` (Proxied: ON 🟧)
   - `A` `api` -> `<KVM_IPV4_ADDRESS>` (Proxied: ON 🟧)
2. **SSL/TLS Encryption Mode**:
   - Set to **Full (strict)** in Cloudflare Dashboard -> SSL/TLS -> Overview.
3. **WebSockets**:
   - Ensure WebSockets is enabled in Cloudflare -> Network.

---

## 3. Cloudflare R2 Media Storage Setup

1. Go to Cloudflare Dashboard -> **R2 Object Storage**.
2. Create a bucket named `letzshop-media`.
3. In Bucket Settings -> **Public Access**:
   - Attach a Custom Domain: `media.letzshop.store`.
   - Enable public read access for the bucket.
4. Go to **Manage R2 API Tokens**:
   - Create API token with **Object Read & Write** permissions scoped to `letzshop-media`.
   - Save the **Access Key ID**, **Secret Access Key**, and the S3 API endpoint URL:
     `https://<account_id>.r2.cloudflarestorage.com`.

### Public vs Private Media Policy
- **PUBLIC**:
  - `/{tenantId}/{storeId}/products/{filename}`
  - `/{tenantId}/{storeId}/branding/{filename}`
  - Review images and public store assets.
- **PRIVATE**:
  - KYC documents, identity proofs, invoices, merchant tax records, and internal backups.
  - Private assets MUST NEVER be stored in the public media bucket or public path prefix. They should be stored in a dedicated private bucket or encrypted storage.

---

## 4. Hostinger KVM 4 Server Provisioning

### 4.1. Operating System & Base Packages
Connect to your KVM 4 server via SSH:
```bash
ssh root@<KVM_IPV4_ADDRESS>
apt update && apt upgrade -y
apt install -y ufw curl git wget ca-certificates gnupg lsb-release
```

### 4.2. Firewall (UFW) Configuration
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

### 4.3. Docker & Docker Compose Installation
```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

---

## 5. Application Deployment

### 5.1. Clone Repository & Setup Directory
```bash
mkdir -p /opt/letzshop
cd /opt/letzshop
git clone https://github.com/svkatageri16/Simply-E-Commerce.git .
```

### 5.2. Configure Production Environment Variables
Create `/opt/letzshop/.env.production` (refer to `docs/deployment/ENVIRONMENT.md`):
```bash
cat << 'EOF' > /opt/letzshop/.env.production
NODE_ENV=production
PORT=4000

# Railway PostgreSQL Connection
DATABASE_URL=postgresql://user:password@postgres.railway.internal:5432/railway?sslmode=require

# Authentication Secrets (Generate with: openssl rand -base64 32)
JWT_ACCESS_SECRET=your_32_character_minimum_random_secret_here!
JWT_REFRESH_SECRET=your_32_character_minimum_random_secret_here!
COOKIE_SECRET=your_32_character_minimum_random_secret_here!

# Public Canonical URLs
API_PUBLIC_URL=https://api.letzshop.store
STOREFRONT_PUBLIC_URL=https://www.letzshop.store
SELLER_PUBLIC_URL=https://seller.letzshop.store

# Object Storage (Cloudflare R2)
STORAGE_PROVIDER=s3
STORAGE_S3_BUCKET=letzshop-media
STORAGE_S3_REGION=auto
STORAGE_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
STORAGE_S3_ACCESS_KEY=<r2_access_key_id>
STORAGE_S3_SECRET_KEY=<r2_secret_access_key>
STORAGE_PUBLIC_BASE_URL=https://media.letzshop.store

# Transactional Email (SMTP)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<smtp_api_key>
SMTP_FROM="LetzShop" <no-reply@letzshop.store>

# Payment Gateway (Razorpay)
RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxx
EOF

chmod 600 /opt/letzshop/.env.production
```

### 5.3. Build & Launch Containers
```bash
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

### 5.4. Execute Database Migrations
Run Prisma migrations against the production database:
```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec api npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
```

---

## 6. Nginx Reverse Proxy & SSL Setup

### 6.1. Install Nginx
```bash
apt install -y nginx
```

### 6.2. Deploy Nginx Virtual Hosts
Copy `deploy/nginx/letzshop.conf.example` to `/etc/nginx/sites-available/letzshop.conf`:
```bash
cp /opt/letzshop/deploy/nginx/letzshop.conf.example /etc/nginx/sites-available/letzshop.conf
ln -s /etc/nginx/sites-available/letzshop.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### 6.3. SSL Certificates
Because Cloudflare proxies traffic in Full (strict) mode, create a **Cloudflare Origin CA Certificate** in Cloudflare Dashboard -> SSL/TLS -> Origin Server:
- Save certificate to `/etc/ssl/certs/letzshop_origin.pem`
- Save private key to `/etc/ssl/private/letzshop_origin.key`
- Uncomment the SSL directives in `/etc/nginx/sites-available/letzshop.conf` and reload Nginx:
```bash
nginx -t && systemctl reload nginx
```

---

## 7. Verification & Health Checks

Verify that the services are online and responding correctly:
```bash
# 1. API Health (Liveness)
curl -I http://127.0.0.1:4000/health
# Expected: HTTP/1.1 200 OK {"status":"ok"}

# 2. API Readiness (PostgreSQL + Config readiness)
curl -s http://127.0.0.1:4000/health/ready
# Expected: {"status":"ok","database":"connected","storage":"configured"}

# 3. Storefront Status
curl -I http://127.0.0.1:3000/
# Expected: HTTP/1.1 200 OK

# 4. Seller Dashboard Status
curl -I http://127.0.0.1:3001/
# Expected: HTTP/1.1 200 OK

# 5. Public Domain Checks via Cloudflare
curl -s https://api.letzshop.store/health
curl -I https://www.letzshop.store/
curl -I https://seller.letzshop.store/
```

---

## 8. Deployment Update Procedure (Rolling Releases)

When a new release is ready to deploy to KVM 4:
```bash
cd /opt/letzshop
git fetch origin main
git pull origin main

# Build updated images without taking containers down
docker compose --env-file .env.production -f docker-compose.production.yml build

# Apply any pending Prisma migrations
docker compose --env-file .env.production -f docker-compose.production.yml exec api npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

# Recreate containers with zero/minimal downtime
docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-deps api
docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-deps storefront seller

# Clean up dangling build images
docker image prune -f
```

---

## 9. Rollback Procedure

If a deployed version has an issue:
```bash
cd /opt/letzshop
# Revert git to previous known good commit
git checkout <PREVIOUS_COMMIT_HASH>

# Rebuild and restart
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml up -d
```

---

## 10. Database Backups (Railway to Private R2 Bucket)

Automated backups should be configured as a daily cron job that runs `pg_dump` and uploads an encrypted snapshot to a private Cloudflare R2 backup bucket:

```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/letzshop_db_${TIMESTAMP}.sql.gz"

echo "Creating database dump..."
pg_dump "$DATABASE_URL" | gzip -9 > "$BACKUP_FILE"

echo "Uploading to private backup storage..."
# aws s3 cp "$BACKUP_FILE" "s3://letzshop-backups-private/db_${TIMESTAMP}.sql.gz" --endpoint-url "$STORAGE_S3_ENDPOINT"

rm -f "$BACKUP_FILE"
echo "Backup complete: ${TIMESTAMP}"
```
