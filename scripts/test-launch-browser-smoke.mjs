import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID, randomInt, scryptSync } from 'node:crypto';
import { chromium } from 'playwright';
import { createTranslator } from '../packages/i18n/dist/index.js';

export async function verifyLaunchBrowser(fixtures, db, out) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [], errors = [];
  let ownedAdmin, ownedPlan;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    for (const [locale, label] of [['en-IN', 'English'], ['mr-IN', 'मराठी'], ['hi-IN', 'हिंदी']]) {
      await page.getByRole('button', { name: label, exact: true }).first().click();
      const t = createTranslator(locale);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        const pricing = page.locator('#pricing');
        await pricing.scrollIntoViewIfNeeded();
        const text = await pricing.innerText();
        const money = value => new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
        assert.ok(text.includes(money(999)));
        assert.ok(text.includes(money(2999)));
        assert.equal(await pricing.locator('a[href*="/register"]').count(), 1);
        assert.equal(await page.locator('#legacy-steps').getByRole('heading', { name: t('landing.launchStep3Title'), exact: true }).count(), 1);
        assert.equal(await page.locator('#legacy-steps h3').count(), 5);
        assert.equal(await page.locator('footer[aria-label="Platform attribution"]').count(), 1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false, `landing overflow ${locale}/${width}`);
        results.push({ area: 'landing', locale, width, result: 'PASS' });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.goto('http://localhost:3001/register', { waitUntil: 'networkidle' });
    await page.locator('#register-email').waitFor();
    await page.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
    await page.locator('#login-phone').waitFor();
    assert.equal(await page.locator('footer[aria-label="Platform attribution"]').count(), 1);
    results.push({ area: 'auth-routes-footer', result: 'PASS' });
    await page.goto('http://localhost:3002/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'LetzShop Admin', exact: true }).waitFor();
    assert.equal(await page.locator('footer[aria-label="Platform attribution"]').count(), 1);
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const salt = randomUUID(), password = randomUUID(), email = `admin-${randomUUID()}@example.test`;
    ownedAdmin = await db.user.create({ data: { email, phone: `+9199${randomInt(10000000, 99999999)}`, fullName: 'Owned UI Administrator', role: 'PLATFORM_ADMIN', isSuperAdmin: true, credentials: { create: { credentialType: 'PIN', pinHash: `${salt}:${scryptSync(password, salt, 64).toString('hex')}` } } } });
    ownedPlan = await db.plan.create({ data: { code: `OWNED_UI_${randomUUID().replaceAll('-', '_')}`, name: 'Owned UI Package', pricePaise: 99900, gstBasisPoints: 1800, status: 'ACTIVE', isPublic: false, displayOrder: 0 } });
    const login = await adminContext.request.post('http://localhost:3002/api/admin-session', { data: { identifier: email, secret: password }, headers: { origin: 'http://localhost:3002' } });
    assert.equal(login.status(), 200, 'Owned admin signs in through the real HttpOnly session route');
    const adminPage = await adminContext.newPage();
    adminPage.on('pageerror', error => errors.push(error.message));
    await adminPage.goto('http://localhost:3002/billing', { waitUntil: 'domcontentloaded' });
    await adminPage.locator('div.rounded-2xl').filter({ has: adminPage.getByRole('heading', { name: 'Owned UI Package', exact: true }) }).locator('button[title="Edit Plan"]').click();
    await adminPage.getByLabel('GST rate', { exact: true }).fill('17.5');
    await adminPage.getByLabel('Package status', { exact: true }).selectOption('COMING_SOON');
    await adminPage.getByRole('button', { name: 'Update Plan', exact: true }).click();
    await adminPage.waitForFunction(() => !document.querySelector('select[aria-label="Package status"]'));
    const savedPackage = await db.plan.findUniqueOrThrow({ where: { id: ownedPlan.id } });
    assert.equal(savedPackage.gstBasisPoints, 1750);
    assert.equal(savedPackage.status, 'COMING_SOON');
    assert.equal(typeof savedPackage.displayOrder, 'number');
    assert.equal(typeof savedPackage.isPurchasable, 'boolean');
    await adminPage.screenshot({ path: `${out}/admin-packages.png`, fullPage: true });
    results.push({ area: 'admin-package-form-and-footer', transport: 'real HttpOnly admin session, API and owned DB package', result: 'PASS' });
    await adminContext.close();

    const fixture = fixtures.at(-1), product = fixture.products[0];
    for (const failure of ['dismiss', 'failed']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(mode => {
        window.Razorpay = class {
          constructor(options) { this.options = options; this.listeners = {}; }
          on(event, handler) { this.listeners[event] = handler; }
          open() {
            window.__gatewayOptions = this.options;
            setTimeout(() => mode === 'dismiss' ? this.options.modal.ondismiss() : this.listeners['payment.failed']({ error: { description: 'Isolated gateway failure' } }), 50);
          }
        };
      }, failure);
      const buyer = await context.newPage();
      buyer.on('pageerror', error => errors.push(error.message));
      const beforeOrders = await db.order.count({ where: { storeId: fixture.store.id } });
      const stock = await db.inventory.findUniqueOrThrow({ where: { variantId: product.variants[0].id } });
      await buyer.goto(`http://localhost:3000/store/${fixture.store.slug}/product/${product.id}`, { waitUntil: 'networkidle' });
      await buyer.locator('[data-testid="buy-now-button"]:visible').first().click();
      await buyer.waitForURL('**/checkout?direct=*');
      const place = buyer.getByTestId('place-order-button');
      await place.waitFor();
      await buyer.locator('input[type="text"]').first().fill('Owned Browser Buyer');
      await buyer.locator('input[type="tel"]').fill('9876500123');
      await buyer.getByTestId('checkout-email-input').fill('buyer@example.test');
      const radio = buyer.locator('input[name="paymentMethod"]');
      await radio.nth(1).check();
      await place.click();
      await buyer.waitForFunction(() => Boolean(window.__gatewayOptions));
      await place.waitFor({ state: 'visible' });
      await buyer.waitForFunction(() => !document.querySelector('[data-testid="place-order-button"]').disabled);
      assert.equal(await db.order.count({ where: { storeId: fixture.store.id } }), beforeOrders + 1);
      await radio.nth(0).check();
      await place.click();
      await buyer.waitForURL('**/order/**');
      await buyer.getByText('Order Confirmed & Placed', { exact: true }).waitFor();
      assert.equal(await db.order.count({ where: { storeId: fixture.store.id } }), beforeOrders + 1);
      const afterStock = await db.inventory.findUniqueOrThrow({ where: { variantId: product.variants[0].id } });
      assert.equal(afterStock.stockOnHand, stock.stockOnHand - 1);
      const order = await db.order.findFirstOrThrow({ where: { storeId: fixture.store.id }, orderBy: { createdAt: 'desc' } });
      assert.equal(order.paymentMethod, 'COD');
      assert.equal(order.buyerEmail, 'buyer@example.test');
      assert.equal(await buyer.locator('footer[aria-label="Platform attribution"]').count(), 1);
      await buyer.screenshot({ path: `${out}/checkout-${failure}-cod.png`, fullPage: true });
      results.push({ area: `real-checkout-${failure}-cod`, duplicateOrders: 0, stockDeductions: 1, result: 'PASS' });
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/launch-browser-results.json`, JSON.stringify({ results, errors }, null, 2));
    console.log(`Launch browser smoke passed: ${results.length} checks.`);
  } finally {
    await browser.close();
    if (ownedPlan) await db.plan.delete({ where: { id: ownedPlan.id } });
    if (ownedAdmin) {
      await db.auditLog.deleteMany({ where: { actorId: ownedAdmin.id } });
      await db.user.delete({ where: { id: ownedAdmin.id } });
    }
  }
}
