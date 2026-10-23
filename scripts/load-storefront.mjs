import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

/** Read-only, local-only load smoke. Supply persisted public stores in LOAD_STORES_FILE. */
export async function loadStorefront(
  stores,
  output = 'artifacts/rail-media-identity/load-results.json',
) {
  const api = process.env.LOAD_API_URL || 'http://localhost:4000';
  const web = process.env.LOAD_WEB_URL || 'http://localhost:3000';
  for (const base of [api, web]) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
      throw new Error('This test only permits localhost targets.');
  }
  if (new Set(stores.map((store) => store.slug)).size < 2)
    throw new Error(
      'Provide at least two persisted public stores for mixed-tenant checks.',
    );
  const results = [];
  for (const users of [25, 50, 100]) {
    const latencies = [],
      failures = [];
    const start = performance.now();
    const duration = Math.max(1000, Math.min(60000, Number(process.env.LOAD_DURATION_MS) || 10000));
    await Promise.all(
      Array.from({ length: users }, async (_, user) => {
        for (let round = 0; round < 1000 && (round === 0 || performance.now() < start + duration); round++) {
          const store = stores[(user + round) % stores.length];
          const slug = encodeURIComponent(store.slug);
          const requests = [
            [
              `${api}/storefront/${slug}`,
              (data) => data.store?.id === store.id,
            ],
            [
              `${api}/storefront/${slug}/products?limit=20`,
              (data) =>
                data.products?.every((product) => product.storeId === store.id),
            ],
            [
              `${api}/storefront/${slug}/products/${encodeURIComponent(store.productSlug)}`,
              (data) => data.product?.storeId === store.id,
            ],
            [`${web}/store/${slug}`],
            [`${web}/store/${slug}/products`],
            [
              `${web}/store/${slug}/product/${encodeURIComponent(store.productId)}`,
            ],
          ];
          for (const [url, validate] of requests) {
            const started = performance.now();
            try {
              const response = await fetch(url, {
                signal: AbortSignal.timeout(60000),
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              if (validate) {
                const body = await response.json();
                if (!validate(body.data || body))
                  throw new Error('Tenant identity mismatch');
              } else await response.arrayBuffer();
            } catch (error) {
              failures.push({ url, error: error.message });
            }
            latencies.push(performance.now() - started);
          }
        }
      }),
    );
    const seconds = (performance.now() - start) / 1000;
    latencies.sort((a, b) => a - b);
    const percentile = (value) =>
      Number(latencies[Math.ceil(latencies.length * value) - 1].toFixed(2));
    const result = {
      runnerRssMb: Math.round(process.memoryUsage().rss / 1048576),
      apiHeapMb: await fetch(`${api}/health`).then(r => r.json()).then(body => (body.data || body).memoryUsageMb).catch(() => null),
      users,
      requests: latencies.length,
      errors: failures.length,
      errorRate: failures.length / latencies.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      requestsPerSecond: Number((latencies.length / seconds).toFixed(2)),
      seconds: Number(seconds.toFixed(2)),
      failures,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    fs.writeFileSync(
      output,
      JSON.stringify(
        {
          localOnly: true,
          stores: stores.map(store => ({slug:store.slug,productCount:store.productCount||'not specified'})),
          method:
            'GET only; six-request browsing rounds per user for at least 10 seconds per phase by default; mixed persisted stores',
          results,
        },
        null,
        2,
      ),
    );
  }
  return results;
}

if (process.argv[1]?.endsWith('load-storefront.mjs')) {
  if (!process.env.LOAD_STORES_FILE)
    throw new Error(
      'Set LOAD_STORES_FILE to a JSON array containing id, slug, productId, productSlug for at least two public test stores.',
    );
  await loadStorefront(
    JSON.parse(fs.readFileSync(process.env.LOAD_STORES_FILE, 'utf8')),
  );
}
