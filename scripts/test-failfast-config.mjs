import { validateProductionSecrets } from '../apps/api/dist/common/config/security-audit.js';

console.log('--- Testing Production Config Fail-Fast Validation ---');

const baseValidEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://prod_user:strong_password_here@postgres.railway.internal:5432/railway',
  JWT_ACCESS_SECRET: 'super-secure-production-access-token-secret-32-chars-long!',
  JWT_REFRESH_SECRET: 'super-secure-production-refresh-token-secret-32-chars-long!',
  COOKIE_SECRET: 'super-secure-production-cookie-signing-secret-32-chars-long!',
  SMTP_HOST: 'smtp.sendgrid.net',
  SMTP_USER: 'apikey',
  SMTP_PASS: 'SG.valid_smtp_password_secret',
  API_PUBLIC_URL: 'https://api.letzshop.store',
  STOREFRONT_PUBLIC_URL: 'https://www.letzshop.store',
  SELLER_PUBLIC_URL: 'https://seller.letzshop.store',
  STORAGE_PROVIDER: 'local-disk',
};

function runTest(name, envOverrides, expectPass = false) {
  const originalEnv = { ...process.env };
  try {
    process.env = { ...originalEnv, ...baseValidEnv, ...envOverrides };
    validateProductionSecrets();
    if (!expectPass) {
      console.error(`❌ FAIL: [${name}] expected error but passed.`);
      return false;
    } else {
      console.log(`✅ PASS: [${name}] passed as expected.`);
      return true;
    }
  } catch (err) {
    if (expectPass) {
      console.error(`❌ FAIL: [${name}] expected pass but threw: ${err.message}`);
      return false;
    } else {
      console.log(`✅ PASS: [${name}] caught expected failure: ${err.message}`);
      return true;
    }
  } finally {
    process.env = originalEnv;
  }
}

let allPassed = true;

// 1. Missing DATABASE_URL
allPassed = runTest('1. Missing DATABASE_URL', { DATABASE_URL: '' }) && allPassed;

// 2. Local dev credentials in prod DATABASE_URL
allPassed = runTest('2. Local dev credentials in prod DATABASE_URL', { DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/db' }) && allPassed;

// 3. Missing JWT secret
allPassed = runTest('3. Missing JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: '' }) && allPassed;

// 4. Default insecure JWT secret
allPassed = runTest('4. Dev default JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: 'dev-access-token-secret-change-in-prod-32!' }) && allPassed;

// 5. Short JWT secret (< 32 chars)
allPassed = runTest('5. Short JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: 'short-secret' }) && allPassed;

// 6. Invalid API_PUBLIC_URL
allPassed = runTest('6. Malformed API_PUBLIC_URL', { API_PUBLIC_URL: 'not-a-valid-url' }) && allPassed;

// 7. Non-http/https protocol for public URL
allPassed = runTest('7. Non-HTTP API_PUBLIC_URL', { API_PUBLIC_URL: 'ftp://api.letzshop.store' }) && allPassed;

// 8. STORAGE_PROVIDER=s3 missing bucket
allPassed = runTest('8. STORAGE_PROVIDER=s3 missing bucket', {
  STORAGE_PROVIDER: 's3',
  STORAGE_S3_BUCKET: '',
  STORAGE_S3_ENDPOINT: 'https://12345.r2.cloudflarestorage.com',
  STORAGE_S3_ACCESS_KEY: 'test-key',
  STORAGE_S3_SECRET_KEY: 'test-secret',
}) && allPassed;

// 9. STORAGE_PROVIDER=s3 missing endpoint
allPassed = runTest('9. STORAGE_PROVIDER=s3 missing endpoint', {
  STORAGE_PROVIDER: 's3',
  STORAGE_S3_BUCKET: 'letzshop-media',
  STORAGE_S3_ENDPOINT: '',
  STORAGE_S3_ACCESS_KEY: 'test-key',
  STORAGE_S3_SECRET_KEY: 'test-secret',
}) && allPassed;

// 10. STORAGE_PROVIDER=s3 malformed endpoint
allPassed = runTest('10. STORAGE_PROVIDER=s3 malformed endpoint', {
  STORAGE_PROVIDER: 's3',
  STORAGE_S3_BUCKET: 'letzshop-media',
  STORAGE_S3_ENDPOINT: 'not-a-url',
  STORAGE_S3_ACCESS_KEY: 'test-key',
  STORAGE_S3_SECRET_KEY: 'test-secret',
}) && allPassed;

// 11. STORAGE_PROVIDER=s3 missing access key
allPassed = runTest('11. STORAGE_PROVIDER=s3 missing access key', {
  STORAGE_PROVIDER: 's3',
  STORAGE_S3_BUCKET: 'letzshop-media',
  STORAGE_S3_ENDPOINT: 'https://12345.r2.cloudflarestorage.com',
  STORAGE_S3_ACCESS_KEY: '',
  STORAGE_S3_SECRET_KEY: 'test-secret',
}) && allPassed;

// 12. STORAGE_PROVIDER=s3 missing secret key
allPassed = runTest('12. STORAGE_PROVIDER=s3 missing secret key', {
  STORAGE_PROVIDER: 's3',
  STORAGE_S3_BUCKET: 'letzshop-media',
  STORAGE_S3_ENDPOINT: 'https://12345.r2.cloudflarestorage.com',
  STORAGE_S3_ACCESS_KEY: 'test-key',
  STORAGE_S3_SECRET_KEY: '',
}) && allPassed;

// 13. STORAGE_PROVIDER=s3 with all valid config
allPassed = runTest('13. STORAGE_PROVIDER=s3 with full valid config', {
  STORAGE_PROVIDER: 's3',
  STORAGE_S3_BUCKET: 'letzshop-media',
  STORAGE_S3_ENDPOINT: 'https://12345.r2.cloudflarestorage.com',
  STORAGE_S3_ACCESS_KEY: 'test-key',
  STORAGE_S3_SECRET_KEY: 'test-secret',
  STORAGE_PUBLIC_BASE_URL: 'https://media.letzshop.store',
}, true) && allPassed;

// 14. Development mode (NODE_ENV=development) relaxing secrets when STORAGE_PROVIDER=local
allPassed = runTest('14. Development mode relaxes checks for local storage', {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/simply_ecommerce',
  JWT_ACCESS_SECRET: 'dev-access-token-secret-change-in-prod-32!',
  JWT_REFRESH_SECRET: 'dev-refresh-token-secret-change-in-prod-32!',
  COOKIE_SECRET: 'dev-cookie-secret-change-in-prod-32!',
  STORAGE_PROVIDER: 'local-disk',
}, true) && allPassed;

console.log('--- Result ---');
if (allPassed) {
  console.log('ALL 14 FAIL-FAST TESTS PASSED SUCCESSFULLY! ✅');
  process.exit(0);
} else {
  console.error('SOME FAIL-FAST TESTS FAILED! ❌');
  process.exit(1);
}
