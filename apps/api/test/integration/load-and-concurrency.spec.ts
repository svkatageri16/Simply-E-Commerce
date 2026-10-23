import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { SEED_IDS } from '@simply/db';
import { PrismaClient, ProductMode, ProductStatus, VariantStatus } from '@prisma/client';
import request from 'supertest';

// Set high rate limit ceiling for the test suite so 250 VU parallel load tests run unimpeded
process.env.RATE_LIMIT_MAX_REQUESTS = '50000';

describe('Phase 4: Load, Concurrency & Performance Hardening Suite', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let sellerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      })
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = moduleFixture.get<PrismaClient>(PrismaClient);

    // 1. Authenticate Seller (+919876543210) via PIN login
    const sellerLogin = await request(app.getHttpServer())
      .post('/auth/pin/login')
      .send({ phone: '+919876543210', pin: '123456' });
    sellerToken = sellerLogin.body?.accessToken || sellerLogin.body?.data?.accessToken;
    if (!sellerToken) {
      await request(app.getHttpServer()).post('/auth/otp/send').send({ phone: '+919876543210' });
      const sellerAuth = await request(app.getHttpServer())
        .post('/auth/otp/verify')
        .send({ phone: '+919876543210', code: '123456' });
      sellerToken = sellerAuth.body?.accessToken || sellerAuth.body?.data?.accessToken;
    }

    // 2. Authenticate SuperAdmin (+919800000000)
    const adminAuth = await request(app.getHttpServer())
      .post('/auth/admin/login')
      .send({ identifier: '+919800000000', secret: 'Admin@123456' });
    adminToken = adminAuth.body?.accessToken || adminAuth.body?.data?.accessToken;
  }, 45000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ============================================================================
  // SCENARIO A: STOREFRONT BROWSING (50, 100, 250 concurrent requests)
  // ============================================================================
  it('Scenario A: Storefront Browsing Under Load (50, 100, 250 requests)', async () => {
    const runBatch = async (concurrency: number) => {
      const endpoints = [
        `/storefront/aurelia`,
        `/storefront/aaraa-jewels`,
        `/storefront/pulse-street`,
        `/storefront/mithaiwala`,
        `/storefront/foundry-industrial`,
        `/storefront/vriksha-living`,
        `/storefront/shree-ganesh`,
      ];

      const latencies: number[] = [];
      let errors = 0;

      const startTime = Date.now();
      const workerCount = Math.min(concurrency, 50);
      const itemsPerWorker = Math.ceil(concurrency / workerCount);

      const workers = Array.from({ length: workerCount }).map(async (_, wIdx) => {
        for (let i = 0; i < itemsPerWorker; i++) {
          const reqIdx = wIdx * itemsPerWorker + i;
          if (reqIdx >= concurrency) break;
          const ep = endpoints[reqIdx % endpoints.length];
          const reqStart = Date.now();
          try {
            const res = await request(app.getHttpServer()).get(ep);
            latencies.push(Date.now() - reqStart);
            if (res.status >= 400) {
              errors++;
              if (errors <= 3) {
                console.log(`[REQ ERROR] status=${res.status} body=${JSON.stringify(res.body)}`);
              }
            }
          } catch (err: any) {
            errors++;
            latencies.push(Date.now() - reqStart);
            if (errors <= 3) {
              console.log(`[REQ EXCEPTION] message=${err?.message}`);
            }
          }
        }
      });

      await Promise.all(workers);
      const totalTimeMs = Date.now() - startTime;

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
      const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
      const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
      const rps = Math.round((concurrency / (totalTimeMs / 1000)) * 10) / 10;
      const errorRate = Math.round((errors / concurrency) * 1000) / 10;

      console.log(`[LOAD TEST] Storefront Browsing (${concurrency} VUs): p50=${p50}ms, p95=${p95}ms, p99=${p99}ms | RPS=${rps} | ErrorRate=${errorRate}%`);

      expect(errorRate).toBeLessThan(1.0);
      return { concurrency, p50, p95, p99, rps, errorRate };
    };

    const res50 = await runBatch(50);
    const res100 = await runBatch(100);
    const res250 = await runBatch(250);

    expect(res50.p95).toBeLessThan(800);
    expect(res100.p95).toBeLessThan(750);
    expect(res250.errorRate).toBeLessThan(1.0);
  }, 60000);

  // ============================================================================
  // SCENARIO B: CHECKOUT CONCURRENCY
  // ============================================================================
  it('Scenario B: Concurrent Guest Checkouts (50 concurrent buyers)', async () => {
    const concurrency = 50;
    const initialOrderCount = await prisma.order.count({ where: { storeId: SEED_IDS.storeA } });

    // Seed sufficient stock on Navy S variant so all 50 can purchase 1 unit
    await prisma.inventory.update({
      where: { variantId: SEED_IDS.variantA1NavyS },
      data: { stockOnHand: 200, stockReserved: 0 },
    });

    const latencies: number[] = [];
    let successfulOrders = 0;
    let failedOrders = 0;

    const startTime = Date.now();
    const checkoutPromises = Array.from({ length: concurrency }).map(async (_, idx) => {
      const guestToken = `load_guest_${idx}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const reqStart = Date.now();

      try {
        // 1. Init cart
        const cartRes = await request(app.getHttpServer())
          .post('/cart/init')
          .send({ storeId: SEED_IDS.storeA, guestToken });

        const cartId = cartRes.body?.data?.id || cartRes.body?.id;
        if (!cartId) throw new Error('Cart init failed');

        // 2. Add item to cart
        await request(app.getHttpServer())
          .post(`/cart/${cartId}/items`)
          .send({ variantId: SEED_IDS.variantA1NavyS, quantity: 1 });

        // 3. Checkout with valid GuestCheckoutDto
        const checkoutRes = await request(app.getHttpServer())
          .post('/orders/checkout')
          .send({
            storeId: SEED_IDS.storeA,
            cartId,
            fullName: `Load Customer ${idx}`,
            phone: `+9198200${String(10000 + idx).slice(0, 5)}`,
            email: `customer${idx}@example.com`,
            paymentMethod: 'COD',
            deliveryAddress: {
              addressLine1: `${idx}, MG Road, High Street`,
              city: 'Mumbai',
              state: 'Maharashtra',
              pincode: '400001',
              country: 'India',
            },
            notes: 'Load test concurrent order',
          });

        latencies.push(Date.now() - reqStart);
        if (checkoutRes.status === 201 || checkoutRes.status === 200) {
          successfulOrders++;
        } else {
          failedOrders++;
        }
      } catch (err) {
        failedOrders++;
        latencies.push(Date.now() - reqStart);
      }
    });

    await Promise.all(checkoutPromises);
    const durationMs = Date.now() - startTime;

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;

    console.log(`[LOAD TEST] Checkout Concurrency (50 buyers): Successful=${successfulOrders}/${concurrency} | Duration=${durationMs}ms | p50=${p50}ms, p95=${p95}ms`);

    expect(successfulOrders).toBeGreaterThanOrEqual(48); // >= 96% success under parallel peak
    const finalOrderCount = await prisma.order.count({ where: { storeId: SEED_IDS.storeA } });
    expect(finalOrderCount).toBe(initialOrderCount + successfulOrders);
  }, 45000);

  // ============================================================================
  // SCENARIO C: INVENTORY CONTENTION (Zero Oversell Verification)
  // ============================================================================
  it('Scenario C: Inventory Contention (30 concurrent buyers for final 5 units)', async () => {
    // 1. Create a specialized test product variant with EXACTLY 5 units and allowBackorder: false
    const contentionProd = await prisma.product.create({
      data: {
        tenantId: SEED_IDS.tenantA,
        storeId: SEED_IDS.storeA,
        categoryId: SEED_IDS.categoryA1,
        name: 'Flash Drop Limited Edition Sneaker',
        slug: `flash-drop-${Date.now()}`,
        mode: ProductMode.SELL_ONLINE,
        status: ProductStatus.PUBLISHED,
        variants: {
          create: {
            tenantId: SEED_IDS.tenantA,
            storeId: SEED_IDS.storeA,
            sku: `FLASH-DROP-${Date.now()}`,
            pricePaise: 99900,
            status: VariantStatus.ACTIVE,
            inventory: {
              create: {
                tenantId: SEED_IDS.tenantA,
                storeId: SEED_IDS.storeA,
                stockOnHand: 5, // EXACTLY 5 UNITS AVAILABLE
                stockReserved: 0,
                allowBackorder: false,
              },
            },
          },
        },
      },
      include: { variants: true },
    });

    const targetVariant = contentionProd.variants[0];
    expect(targetVariant).toBeDefined();

    // 2. Launch 30 concurrent buyer checkout requests attempting to buy 1 unit each
    const contenders = 30;
    let successfulBuys = 0;
    let rejectedOOS = 0;

    const buyPromises = Array.from({ length: contenders }).map(async (_, idx) => {
      const guestToken = `contention_guest_${idx}_${Date.now()}`;
      try {
        const cartRes = await request(app.getHttpServer())
          .post('/cart/init')
          .send({ storeId: SEED_IDS.storeA, guestToken });
        const cartId = cartRes.body?.data?.id || cartRes.body?.id;

        await request(app.getHttpServer())
          .post(`/cart/${cartId}/items`)
          .send({ variantId: targetVariant.id, quantity: 1 });

        const checkoutRes = await request(app.getHttpServer())
          .post('/orders/checkout')
          .send({
            storeId: SEED_IDS.storeA,
            cartId,
            fullName: `Contender ${idx}`,
            phone: `+9198000${String(10000 + idx).slice(0, 5)}`,
            email: `contender${idx}@example.com`,
            paymentMethod: 'COD',
            deliveryAddress: {
              addressLine1: 'Lane 5',
              city: 'Pune',
              state: 'Maharashtra',
              pincode: '411001',
              country: 'India',
            },
          });

        if (checkoutRes.status === 201 || checkoutRes.status === 200) {
          successfulBuys++;
        } else {
          rejectedOOS++;
        }
      } catch {
        rejectedOOS++;
      }
    });

    await Promise.all(buyPromises);

    // 3. Verify PostgreSQL Final Inventory State
    const finalInventory = await prisma.inventory.findUnique({
      where: { variantId: targetVariant.id },
    });

    console.log(`[INVENTORY CONTENTION] 30 Users for 5 Units: Purchased=${successfulBuys}, Rejected=${rejectedOOS}, Final StockOnHand=${finalInventory?.stockOnHand}`);

    // EXACT GUARANTEES:
    expect(successfulBuys).toBe(5); // Exactly 5 units sold
    expect(rejectedOOS).toBe(25);   // Exactly 25 rejected gracefully
    expect(finalInventory?.stockOnHand).toBe(0); // Never negative!
    expect(finalInventory?.stockOnHand).toBeGreaterThanOrEqual(0); // ZERO OVERSELLING
  }, 45000);

  // ============================================================================
  // SCENARIO D: MULTI-TENANT ISOLATION UNDER LOAD
  // ============================================================================
  it('Scenario D: Multi-Tenant Isolation Under Parallel Storefront Access', async () => {
    const storeSlugs = [
      'aurelia',
      'aaraa-jewels',
      'pulse-street',
      'mithaiwala',
      'foundry-industrial',
      'vriksha-living',
      'shree-ganesh',
    ];

    const results = await Promise.all(
      storeSlugs.map(async (slug) => {
        const res = await request(app.getHttpServer()).get(`/storefront/${slug}`);
        return {
          slug,
          status: res.status,
          storeName: res.body?.data?.store?.name || res.body?.store?.name,
          themeCode: res.body?.data?.themeConfig?.themeId || res.body?.themeConfig?.themeId,
        };
      })
    );

    results.forEach((r) => {
      expect(r.status).toBe(200);
      expect(r.storeName).toBeDefined();
    });

    // Verify distinct themes returned
    const themesFound = new Set(results.map((r) => r.themeCode));
    expect(themesFound.size).toBeGreaterThanOrEqual(4);
    console.log(`[MULTI-TENANT] Verified ${results.length} stores across ${themesFound.size} distinct themes concurrently.`);
  });

  // ============================================================================
  // SCENARIO E: LARGE CATALOG QUERY LATENCY
  // ============================================================================
  it('Scenario E: Large Catalog Filter & Search Response Times', async () => {
    const latencies: number[] = [];
    const queries = ['shirt', 'linen', 'cotton', 'classic', 'summer', 'navy', 'white'];

    for (const q of queries) {
      const t0 = Date.now();
      const res = await request(app.getHttpServer())
        .get(`/catalog/products?search=${q}&page=1&limit=20`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .set('x-tenant-id', SEED_IDS.tenantA);
      latencies.push(Date.now() - t0);
      expect(res.status).toBe(200);
    }

    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    console.log(`[CATALOG BENCHMARK] Average search/filter latency: ${avgLatency}ms (queries: ${queries.length})`);
    expect(avgLatency).toBeLessThan(300); // Normal read p95 < 300ms
  });

  // ============================================================================
  // SCENARIO F: ADMIN GOVERNANCE & TELEMETRY PAGINATION
  // ============================================================================
  it('Scenario F: Admin Telemetry & Merchants Pagination', async () => {
    expect(adminToken).toBeDefined();

    // Fetch paginated merchants list
    const t0 = Date.now();
    const merchantsRes = await request(app.getHttpServer())
      .get('/admin/merchants?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);
    const duration = Date.now() - t0;

    expect(merchantsRes.status).toBe(200);
    expect(duration).toBeLessThan(300);
    console.log(`[ADMIN BENCHMARK] Admin merchants query returned in ${duration}ms`);
  });
});
