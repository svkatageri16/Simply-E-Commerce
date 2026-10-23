const path = require('node:path');
const fs = require('node:fs');

const rootDir = path.resolve(__dirname, '../../..');
const envPath = path.resolve(rootDir, '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// 1. Force NODE_ENV to 'test'
process.env.NODE_ENV = 'test';

// 2. Redirect DATABASE_URL to TEST_DATABASE_URL if available
const testDbUrl = process.env.TEST_DATABASE_URL;
if (testDbUrl) {
  process.env.DATABASE_URL = testDbUrl;
}

const activeUrl = process.env.DATABASE_URL;
if (!activeUrl) {
  const errorMsg =
    '❌ FATAL: Neither TEST_DATABASE_URL nor DATABASE_URL is set for test execution.\n' +
    'Automated integration tests require an isolated test database (e.g. simply_ecommerce_test).\n';
  console.error(errorMsg);
  throw new Error(errorMsg);
}

try {
  const parsed = new URL(activeUrl);
  const dbName = parsed.pathname.replace(/^\//, '');

  // 3. HARD TEST DATABASE GUARD
  // Under NO circumstances may automated tests run against the primary development database
  if (dbName === 'simply_ecommerce') {
    const errorMsg =
      '\n================================================================================\n' +
      '❌ FATAL SAFETY VIOLATION: Automated tests attempted to run against "simply_ecommerce"!\n' +
      'Automated integration/E2E tests must NEVER write into or modify the shared development database.\n' +
      'Please configure a separate test database in .env:\n' +
      '   TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/simply_ecommerce_test?schema=public"\n' +
      '================================================================================\n';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('❌ FATAL: Running tests in NODE_ENV=production is strictly forbidden.');
  }
} catch (e) {
  if (e.message && e.message.includes('FATAL')) {
    throw e;
  }
}
