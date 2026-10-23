import { Logger } from '@nestjs/common';

const logger = new Logger('SecurityAudit');

export function validateProductionSecrets(): void {
  const isProd = process.env.NODE_ENV === 'production';

  const insecureDefaults = [
    'dev-access-token-secret-change-in-prod-32!',
    'dev-refresh-token-secret-change-in-prod-32!',
    'dev-cookie-secret-change-in-prod-32!',
  ];

  const dbUrl = process.env.DATABASE_URL || '';
  const jwtAccess = process.env.JWT_ACCESS_SECRET || '';
  const jwtRefresh = process.env.JWT_REFRESH_SECRET || '';
  const cookieSecret = process.env.COOKIE_SECRET || '';
  const devMockOtp = process.env.OTP_DEV_MOCK_ENABLED === 'true';
  const storageProvider = (process.env.STORAGE_PROVIDER || 'local-disk').toLowerCase();
  const s3Bucket = process.env.STORAGE_S3_BUCKET || '';
  const s3AccessKey = process.env.STORAGE_S3_ACCESS_KEY || '';
  const s3SecretKey = process.env.STORAGE_S3_SECRET_KEY || '';
  const s3Endpoint = process.env.STORAGE_S3_ENDPOINT || '';
  const smtpHost = process.env.SMTP_HOST || '';
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '';
  const razorpayKey = process.env.RAZORPAY_KEY_ID || '';
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || '';

  const isDbConfigured = Boolean(dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')));
  const isSmtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);
  const isRazorpayConfigured = Boolean(razorpayKey && razorpaySecret);

  if (isProd) {
    const violations: string[] = [];

    if (!dbUrl) {
      violations.push('DATABASE_URL is missing. Production requires a valid PostgreSQL connection string.');
    } else if (dbUrl.includes('postgres:postgres@localhost')) {
      violations.push('DATABASE_URL must not use default local development credentials in production.');
    } else if (!dbUrl.startsWith('postgres://') && !dbUrl.startsWith('postgresql://')) {
      violations.push('DATABASE_URL must be a valid PostgreSQL connection URI starting with postgres:// or postgresql://.');
    }

    if (!jwtAccess || insecureDefaults.includes(jwtAccess) || jwtAccess.length < 32) {
      violations.push('JWT_ACCESS_SECRET must be at least 32 random characters and not a development default.');
    }

    if (!jwtRefresh || insecureDefaults.includes(jwtRefresh) || jwtRefresh.length < 32) {
      violations.push('JWT_REFRESH_SECRET must be at least 32 random characters and not a development default.');
    }

    if (!cookieSecret || insecureDefaults.includes(cookieSecret) || cookieSecret.length < 32) {
      violations.push('COOKIE_SECRET must be at least 32 random characters and not a development default.');
    }

    // Storage contract validation
    if (storageProvider === 's3') {
      if (!s3Bucket) {
        violations.push('STORAGE_PROVIDER=s3 requires STORAGE_S3_BUCKET.');
      }
      if (!s3Endpoint) {
        violations.push('STORAGE_PROVIDER=s3 requires STORAGE_S3_ENDPOINT (e.g. https://<account_id>.r2.cloudflarestorage.com for Cloudflare R2).');
      } else {
        try {
          const endpointUrl = new URL(s3Endpoint);
          if (endpointUrl.protocol !== 'http:' && endpointUrl.protocol !== 'https:') {
            violations.push('STORAGE_S3_ENDPOINT must have an http: or https: scheme.');
          }
        } catch {
          violations.push('STORAGE_S3_ENDPOINT must be a valid URL.');
        }
      }
      if (!s3AccessKey) {
        violations.push('STORAGE_PROVIDER=s3 requires STORAGE_S3_ACCESS_KEY.');
      }
      if (!s3SecretKey) {
        violations.push('STORAGE_PROVIDER=s3 requires STORAGE_S3_SECRET_KEY.');
      }
    }

    // Public URLs validation
    const publicUrls = [
      { name: 'API_PUBLIC_URL', val: process.env.API_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL },
      { name: 'STOREFRONT_PUBLIC_URL', val: process.env.STOREFRONT_PUBLIC_URL || process.env.STOREFRONT_BASE_URL || process.env.STOREFRONT_URL },
      { name: 'SELLER_PUBLIC_URL', val: process.env.SELLER_PUBLIC_URL || process.env.SELLER_URL || process.env.NEXT_PUBLIC_SELLER_URL },
      { name: 'STORAGE_PUBLIC_BASE_URL', val: process.env.STORAGE_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_MEDIA_URL },
    ];
    for (const { name, val } of publicUrls) {
      if (val && val.trim() !== '') {
        try {
          const parsed = new URL(val.trim());
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            violations.push(`${name} must have an http: or https: protocol.`);
          }
        } catch {
          violations.push(`${name} is not a valid URL: "${val}".`);
        }
      }
    }

    if (!isSmtpConfigured) {
      violations.push('SMTP configuration (SMTP_HOST, SMTP_USER, and SMTP_PASSWORD/SMTP_PASS) is required for transactional emails in production.');
    }

    if (devMockOtp) {
      violations.push('OTP_DEV_MOCK_ENABLED cannot be true in production.');
    }

    if (razorpayKey && !razorpaySecret) {
      violations.push('RAZORPAY_KEY_ID is set but RAZORPAY_KEY_SECRET is missing. Both are required when Razorpay is enabled.');
    }

    if (violations.length > 0) {
      logger.error('🚨 PRODUCTION SECURITY GATE FAILED: The following configuration violations prevent startup:');
      violations.forEach((v) => logger.error(`   - ${v}`));
      throw new Error(`CRITICAL CONFIGURATION FAILURE: Production environment contract violated (${violations.length} violations). Server aborted.`);
    }

    logger.log('🛡️ Production environment contract validated successfully (FAIL-CLOSED gate passed).');
  } else {
    logger.warn('⚠️ Running in development/test mode. Production secret checks are relaxed; registration still requires real SMTP.');
  }

  // Safe configuration diagnostics (NEVER print secret values)
  logger.log(`[Config Diagnostic] Database configured: ${isDbConfigured ? 'yes' : 'no'}`);
  logger.log(`[Config Diagnostic] Storage provider: ${storageProvider}`);
  if (storageProvider === 's3') {
    logger.log(`[Config Diagnostic] S3/R2 Bucket: ${s3Bucket}`);
    logger.log(`[Config Diagnostic] S3/R2 Endpoint: ${s3Endpoint ? s3Endpoint : 'AWS default'}`);
  }
  logger.log(`[Config Diagnostic] SMTP configured: ${isSmtpConfigured ? 'yes' : 'no'}`);
  logger.log(`[Config Diagnostic] Razorpay configured: ${isRazorpayConfigured ? 'yes' : 'no'}`);
  logger.log(`[Config Diagnostic] Environment: ${process.env.NODE_ENV || 'development'}`);
}
