import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
const base = process.env.STOREFRONT_URL || "http://localhost:3000";
const seller = process.env.SELLER_URL || "http://localhost:3001";
const out = process.env.ROUTING_ARTIFACTS || "artifacts/production-hardening";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [],
  errors = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    for (const [suffix, field] of [
      ["/register", "#register-email"],
      ["/login", "#login-phone"],
    ]) {
      await page.goto(base, { waitUntil: "networkidle" });
      if (width < 640) await page.locator('header button[aria-label="Toggle navigation menu"]:visible').click();
      const link = page.locator(`header a[href$="${suffix}"]:visible`).first();
      assert.equal(
        await link.getAttribute("href"),
        seller + suffix,
        "hydrated link must use the current configured/local merchant origin",
      );
      await link.click();
      await page.locator(field).waitFor();
      assert.equal(page.url(), seller + suffix);
      assert.ok(
        !(await page.locator("body").innerText()).includes(
          "This service has been suspended.",
        ),
      );
      results.push({ width, destination: page.url(), result: "PASS" });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    `${out}/landing-routing-results.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(
    "Landing Create Store / Merchant Login: desktop/mobile hydration and navigation passed.",
  );
} finally {
  await browser.close();
}
