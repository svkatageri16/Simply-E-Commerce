#!/usr/bin/env node
/**
 * Safe internal diagnostic script to test SMTP transport health and connectivity.
 *
 * Usage:
 *   node scripts/test-smtp-health.mjs
 *   node scripts/test-smtp-health.mjs --to=admin@letzshop.store
 *   node scripts/test-smtp-health.mjs --verify-only
 *
 * NEVER LOGS: Passwords, credentials, or sensitive headers.
 */
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
let nodemailer;
try {
  nodemailer = require('../apps/api/node_modules/nodemailer');
} catch {
  nodemailer = require('nodemailer');
}

// Load .env if present
const envPath = path.resolve(process.cwd(), '.env');
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

const args = process.argv.slice(2);
const toArg = args.find((a) => a.startsWith('--to='))?.split('=')[1];
const verifyOnly = args.includes('--verify-only');

const host = process.env.SMTP_HOST || '';
const port = parseInt(process.env.SMTP_PORT || '587', 10);
const user = process.env.SMTP_USER || '';
const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '';
const from = process.env.SMTP_FROM || `"LetzShop Health" <${user || 'noreply@letzshop.store'}>`;

console.log('=== LetzShop SMTP Diagnostic Health Check ===');

const isConfigured = Boolean(host && user && pass);
console.log(`SMTP configured: ${isConfigured ? 'yes' : 'no'}`);
console.log(`SMTP host: ${host || '(not set)'}`);
console.log(`SMTP port: ${port}`);
console.log(`SMTP user: ${user ? `${user.slice(0, 3)}***` : '(not set)'}`);

if (!isConfigured) {
  console.error('\n❌ SMTP is not configured. Missing SMTP_HOST, SMTP_USER, or SMTP_PASS.');
  process.exit(1);
}

async function runHealthCheck() {
  // Step 1: DNS Resolution Check
  try {
    const addresses = await dns.lookup(host);
    console.log(`DNS lookup for ${host}: success (${addresses.address})`);
  } catch (dnsErr) {
    console.error(`DNS lookup for ${host}: failed (${dnsErr.code || dnsErr.message})`);
    console.log('SMTP connection: failed');
    process.exit(1);
  }

  // Step 2: Transport Initialization & Verification
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  try {
    await transporter.verify();
    console.log('SMTP connection: success');
  } catch (connErr) {
    console.error(`SMTP connection: failed (${connErr.code || connErr.message})`);
    process.exit(1);
  }

  // Step 3: Optional Test Message Acceptance
  if (verifyOnly || !toArg) {
    console.log('\n[Note] Verification complete. To send a controlled test email, rerun with: --to=<address>');
    console.log('SMTP status: HEALTHY ✅');
    process.exit(0);
  }

  console.log(`\nAttempting controlled test email to: ${toArg.slice(0, 2)}***@${toArg.split('@')[1] || 'domain'}`);
  try {
    const info = await transporter.sendMail({
      from,
      to: toArg,
      subject: `[Diagnostic] LetzShop SMTP Health Test - ${new Date().toISOString()}`,
      text: `LetzShop SMTP Health Diagnostic ran successfully at ${new Date().toISOString()}.\nThis is a controlled infrastructure test message.`,
    });

    const isAccepted = Array.isArray(info.accepted) && info.accepted.length > 0;
    console.log(`SMTP accepted: ${isAccepted ? 'yes' : 'no'}`);
    console.log(`SMTP messageId: ${info.messageId ? 'generated' : 'none'}`);
    console.log(`SMTP response code: ${info.response ? info.response.slice(0, 20) : 'OK'}`);
    console.log('SMTP status: FULLY OPERATIONAL ✅');
  } catch (sendErr) {
    console.error(`SMTP accepted: no (Error: ${sendErr.message})`);
    process.exit(1);
  }
}

runHealthCheck().catch((err) => {
  console.error('Unexpected error during SMTP health check:', err.message);
  process.exit(1);
});
