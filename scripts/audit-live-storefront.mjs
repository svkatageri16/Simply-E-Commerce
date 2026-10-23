import fs from 'node:fs';
const url = 'https://letzshop-storefront.vercel.app/store/bridgeoceans-wealth';
const report = { checkedAt: new Date().toISOString(), storefront: url };
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  report.status = response.status;
  const html = await response.text();
  const scripts = [...html.matchAll(/src="([^"]+\.js[^"]*)"/g)].map(m => m[1]);
  const origins = new Set();
  for (const script of scripts) {
    const text = await (await fetch(new URL(script, url), { signal: AbortSignal.timeout(15000) })).text();
    for (const match of text.matchAll(/https:\/\/[a-zA-Z0-9._-]+(?:\.app|\.com|\.in|\.dev|\.store)/g)) origins.add(match[0]);
  }
  report.publicOrigins = [...origins];
  report.apiCandidates = [];
  for (const origin of ['https://api.letzshop.store', 'https://simply-ecommerce-api.onrender.com']) {
    const candidate = { origin };
    try {
      const health = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(12000) });
      candidate.healthStatus = health.status;
      const publicStore = await fetch(`${origin}/storefront/bridgeoceans-wealth`, { signal: AbortSignal.timeout(12000) });
      candidate.storefrontStatus = publicStore.status;
      const body = await publicStore.json().catch(() => ({}));
      const data = body.data || body;
      candidate.storeMatched = data.store?.slug === 'bridgeoceans-wealth';
      if (candidate.storeMatched) {
        const catalog = await fetch(`${origin}/storefront/bridgeoceans-wealth/products?limit=6`, { signal: AbortSignal.timeout(12000) });
        const json = await catalog.json();
        const products = (json.data || json).products || [];
        candidate.catalogStatus = catalog.status;
        candidate.sampleProductCount = products.length;
        candidate.mediaChecks = [];
        for (const product of products.slice(0, 3)) {
          const media = product.media?.[0];
          if (!media?.publicUrl) continue;
          const asset = new URL(media.publicUrl);
          if (asset.origin !== origin) continue;
          const image = await fetch(asset, { signal: AbortSignal.timeout(12000) });
          candidate.mediaChecks.push({ path: asset.pathname, status: image.status, contentType: image.headers.get('content-type') });
          await image.body?.cancel();
        }
      }
    } catch (error) { candidate.error = error.message; }
    report.apiCandidates.push(candidate);
  }
} catch (error) { report.error = error.message; }
fs.writeFileSync('artifacts/production-final/live-public-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
