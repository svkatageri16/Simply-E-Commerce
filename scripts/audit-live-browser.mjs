import { chromium } from 'playwright';
import fs from 'node:fs';
const report = { checkedAt: new Date().toISOString(), url: 'https://letzshop-storefront.vercel.app/store/bridgeoceans-wealth', requests: [], failedRequests: [] };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.pathname.includes('/storefront/bridgeoceans-wealth')) report.requests.push({ origin: url.origin, path: url.pathname, status: response.status() });
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.pathname.includes('/storefront/bridgeoceans-wealth')) report.failedRequests.push({ origin: url.origin, path: url.pathname, failure: request.failure()?.errorText });
  });
  await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(15000);
  report.title = await page.title();
  report.imageStatus = await page.locator('img').evaluateAll(images => ({ total: images.length, loaded: images.filter(i => i.complete && i.naturalWidth > 0).length, broken: images.filter(i => i.complete && i.naturalWidth === 0).length }));
  report.storeUnavailableMessage = /store (not found|unavailable)|service has been suspended/i.test(await page.locator('body').innerText());
} catch (error) { report.error = error.message; }
finally { await browser.close(); }
fs.writeFileSync('artifacts/production-final/live-browser-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
