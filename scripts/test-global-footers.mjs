import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const attribution = '© 2026 AIKYAM AI SYSTEMS / www.aikyamaisystems.com. All rights reserved. Powered by AIKYAM AI SYSTEMS';

export async function verifyGlobalFooters(fixtures, out) {
  const results = [];
  const store = fixtures[0].store;
  const product = fixtures[0].products[0];
  // Every built page must include attribution even before hydration, during loading,
  // and when a route eventually redirects to an authenticated screen.
  for (const [app, port] of [['storefront', 3000], ['seller', 3001], ['admin', 3002]]) {
    const manifest = JSON.parse(fs.readFileSync(`apps/${app}/.next/server/pages-manifest.json`, 'utf8'));
    for (const route of Object.keys(manifest)) {
      if (route.startsWith('/_') || route.startsWith('/api/')) continue;
      const resolved = route.replace('[slug]', store.slug).replace('[orderNumber]', 'OWNED-FOOTER').replace('[id]', product.id);
      const response = await fetch(`http://localhost:${port}${resolved}`);
      const html = await response.text();
      assert.equal((html.match(/aria-label="Platform attribution"/g) || []).length, 1, `${app}${route}: SSR attribution exactly once`);
      assert.ok(html.includes('https://www.aikyamaisystems.com/'), `${app}${route}: attribution website`);
      results.push({ app, route, check: 'server-rendered', result: 'PASS' });
    }
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const routes = [
      [3000, '/'], [3000, '/missing-footer-test'], [3000, '/track/OWNED-FOOTER'],
      ...['', '/products', `/product/${product.id}`, '/search', '/about', '/cart', '/checkout', '/order/OWNED-FOOTER', '/review/OWNED-FOOTER'].map(path => [3000, `/store/${store.slug}${path}`]),
      [3001, '/login'], [3001, '/register'], [3001, '/onboarding'], [3001, '/missing-footer-test'],
      [3002, '/login'], [3002, '/activate'], [3002, '/change-password'], [3002, '/missing-footer-test'],
    ];
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [port, route] of routes) {
        await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.next?.router?.isReady);
        const footer = page.getByRole('contentinfo', { name: 'Platform attribution', exact: true });
        assert.equal(await footer.count(), 1);
        assert.equal((await footer.innerText()).replace(/\s+/g, ' ').trim(), attribution);
        const link = footer.getByRole('link', { name: 'www.aikyamaisystems.com', exact: true });
        assert.equal(await link.getAttribute('href'), 'https://www.aikyamaisystems.com/');
        assert.equal(await link.getAttribute('target'), '_blank');
        assert.match(await link.getAttribute('rel'), /noopener/);
        await footer.scrollIntoViewIfNeeded();
        const geometry = await footer.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const text = el.querySelector('p').getBoundingClientRect();
          return { position: getComputedStyle(el).position, left: text.left, right: text.right, width: innerWidth, height: rect.height };
        });
        assert.ok(!['fixed', 'absolute', 'sticky'].includes(geometry.position));
        assert.ok(geometry.left >= -1 && geometry.right <= width + 1, `${port}${route}/${width}: footer fits`);
        assert.ok(geometry.height > 0);
        if (route === '/' || route === '/login' || route === `/store/${store.slug}`)
          await page.screenshot({ path: `${out}/footer-${port}-${width}.png` });
        results.push({ port, route, width, check: 'hydrated responsive footer', result: 'PASS' });
      }
    }
    fs.writeFileSync(`${out}/global-footer-results.json`, JSON.stringify(results, null, 2));
    console.log(`Global footer: ${results.length} route/render checks passed.`);
  } finally {
    await browser.close();
  }
}
