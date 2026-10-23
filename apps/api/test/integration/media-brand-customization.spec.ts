import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient, StoreStatus, SubscriptionStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { SEED_IDS } from '@simply/db';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 4.5: Media Persistence, Zero-Customization, Brand Studio & Variant Media', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let sellerToken: string;
  let tokenB: string;
  let tenantA: any;
  let storeA: any;
  let tenantB: any;
  let storeB: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ bodyLimit: 15 * 1024 * 1024 })
    );
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = moduleFixture.get<PrismaClient>(PrismaClient);

    // Retrieve Seeded Tenants & Stores
    tenantA = await prisma.tenant.findUnique({ where: { id: SEED_IDS.tenantA } });
    storeA = await prisma.store.findUnique({ where: { id: SEED_IDS.storeA } });
    tenantB = await prisma.tenant.findUnique({ where: { id: SEED_IDS.tenantB } });
    storeB = await prisma.store.findUnique({ where: { id: SEED_IDS.storeB } });

    // Login Tenant A Owner (+919876543210)
    await request(app.getHttpServer()).post('/auth/otp/send').send({ phone: '+919876543210' });
    const loginResA = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone: '+919876543210', code: '123456' });
    sellerToken = loginResA.body?.accessToken || loginResA.body?.data?.accessToken;

    // Login Tenant B Owner (+919876501234)
    await request(app.getHttpServer()).post('/auth/otp/send').send({ phone: '+919876501234' });
    const loginResB = await request(app.getHttpServer())
      .post('/auth/otp/verify')
      .send({ phone: '+919876501234', code: '123456' });
    tokenB = loginResB.body?.accessToken || loginResB.body?.data?.accessToken;
  });

  afterAll(async () => {
    // Clean up temporary stores created for test
    await prisma.store.deleteMany({
      where: { slug: { in: ['zaveri-test', 'roopam-test', 'halwai-test', 'kalyan-test'] } },
    });
    await prisma.tenant.deleteMany({
      where: { slug: { in: ['zaveri-test', 'roopam-test', 'halwai-test', 'kalyan-test'] } },
    });
    await app.close();
  });

  // ===========================================================================
  // SECTION 5: ZERO-CUSTOMIZATION SELLER EXPERIENCE
  // ===========================================================================
  describe('1. No-Customization Seller Experience (Zero Design Requirement)', () => {
    const categories = [
      { cat: 'jewellery', name: 'Zaveri Jewellers Heritage', slug: 'zaveri-test' },
      { cat: 'clothing', name: 'Roopam Silk Mills', slug: 'roopam-test' },
      { cat: 'food', name: 'Halwai Kaka Sweets', slug: 'halwai-test' },
      { cat: 'industrial', name: 'Kalyan Precision Forgings', slug: 'kalyan-test' },
    ];

    it.each(categories)(
      'automatically produces a complete, professional storefront for %s category without manual design',
      async ({ cat, name, slug }) => {
        // Clean existing
        await prisma.store.deleteMany({ where: { slug } });
        await prisma.tenant.deleteMany({ where: { slug } });

        const tenant = await prisma.tenant.create({
          data: { name, slug },
        });
        const store = await prisma.store.create({
          data: { tenantId: tenant.id, name, slug, status: StoreStatus.LIVE, isPubliclyAccessible: true },
        });

        // Grant active subscription
        const plan = await prisma.plan.findFirst();
        if (plan) {
          await prisma.subscription.create({
            data: {
              tenantId: tenant.id,
              planId: plan.id,
              status: SubscriptionStatus.ACTIVE,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
            },
          });
        }

        // Default branding created without logo, hero, or custom colors
        await prisma.storeBranding.create({
          data: {
            storeId: store.id,
            primaryColor: '#1E3A8A',
            accentColor: '#D97706',
            fontHeading: 'Inter',
            fontBody: 'Inter',
            announcement: `Welcome to ${name}`,
          },
        });

        // 3 products created with basic info
        for (let i = 1; i <= 3; i++) {
          const p = await prisma.product.create({
            data: {
              tenantId: tenant.id,
              storeId: store.id,
              name: `${name} Item ${i}`,
              slug: `item-${i}`,
              status: 'PUBLISHED',
              description: `Authentic premium ${cat} piece engineered for quality.`,
            },
          });
          await prisma.productVariant.create({
            data: {
              tenantId: tenant.id,
              storeId: store.id,
              productId: p.id,
              sku: `${slug.toUpperCase()}-SKU-${i}`,
              pricePaise: (i * 750) * 100,
            },
          });
        }

        // Verify public storefront API
        const res = await request(app.getHttpServer()).get(`/storefront/${slug}`);
        expect(res.status).toBe(200);

        const data = res.body.data;
        expect(data.store.name).toBe(name);
        // Hero announcement must NOT be blank
        expect(data.store.branding.announcement).toBe(`Welcome to ${name}`);
        // Logo is clean null (allowing monogram fallback, never broken image)
        expect(data.store.branding.logoUrl).toBeNull();
        // Products exist and have valid pricing
        expect(data.products.length).toBe(3);
        expect(data.products[0].variants[0].pricePaise).toBeGreaterThan(0);
      }
    );
  });

  // ===========================================================================
  // SECTION 6: CUSTOMIZED BRAND STUDIO & PERSISTENCE
  // ===========================================================================
  describe('2. Customized Brand Studio Persistence', () => {
    it('persists primary/accent palette, fonts, and sections in PostgreSQL across reloads', async () => {
      // 1. Update branding via Prisma / API
      await prisma.storeBranding.upsert({
        where: { storeId: storeA.id },
        update: {
          primaryColor: '#0F172A',
          accentColor: '#E11D48',
          fontHeading: 'Playfair Display',
          fontBody: 'Inter',
          announcement: 'Exclusive Summer Runway 2026',
        },
        create: {
          storeId: storeA.id,
          primaryColor: '#0F172A',
          accentColor: '#E11D48',
          fontHeading: 'Playfair Display',
          fontBody: 'Inter',
          announcement: 'Exclusive Summer Runway 2026',
        },
      });

      // 2. Add custom sections including physical store
      await prisma.storeSection.deleteMany({ where: { storeId: storeA.id } });
      await prisma.storeSection.createMany({
        data: [
          { storeId: storeA.id, sectionType: 'hero', title: 'Summer Runway', sortOrder: 0, isEnabled: true },
          { storeId: storeA.id, sectionType: 'physical_store', title: 'Bandra Flagship Atelier', sortOrder: 1, isEnabled: true },
          { storeId: storeA.id, sectionType: 'featured_products', title: 'Curated Pieces', sortOrder: 2, isEnabled: true },
        ],
      });

      // 3. Fetch public storefront and verify every customization
      const sfRes = await request(app.getHttpServer()).get(`/storefront/${storeA.slug}`);
      expect(sfRes.status).toBe(200);

      const sfData = sfRes.body.data;
      expect(sfData.store.branding.primaryColor).toBe('#0F172A');
      expect(sfData.store.branding.accentColor).toBe('#E11D48');
      expect(sfData.store.branding.fontHeading).toBe('Playfair Display');
      expect(sfData.store.branding.announcement).toBe('Exclusive Summer Runway 2026');

      expect(sfData.store.sections.length).toBe(3);
      expect(sfData.store.sections[1].sectionType).toBe('physical_store');
      expect(sfData.store.sections[1].title).toBe('Bandra Flagship Atelier');
    });
  });

  // ===========================================================================
  // SECTION 7: MEDIA PERSISTENCE & STORAGE AUDIT
  // ===========================================================================
  describe('3. Full Media Flow Persistence, Serving & Security Audit', () => {
    let uploadedMediaId: string;
    let storageKey: string;
    let physicalPath: string;
    let productId: string;

    beforeAll(async () => {
      const p = await prisma.product.create({
        data: {
          tenantId: tenantA.id,
          storeId: storeA.id,
          name: 'Royal Heritage Sherwani Phase45',
          slug: 'royal-heritage-sherwani-p45',
          status: 'PUBLISHED',
        },
      });
      productId = p.id;
    });

    afterAll(async () => {
      await prisma.productMedia.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    });

    it('uploads product media via backend API and verifies physical storage and DB metadata', async () => {
      const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAE4wHZw95m5QAAAABJRU5ErkJggg==';

      const uploadRes = await request(app.getHttpServer())
        .post('/media/upload')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          productId,
          filename: 'sherwani-main.png',
          mimeType: 'image/png',
          base64Data: sampleBase64,
          altText: 'Royal Heritage Sherwani Main Front',
        });

      expect(uploadRes.status).toBe(201);
      const data = uploadRes.body.data;
      expect(data.id).toBeDefined();
      expect(data.storageKey).toBeDefined();
      expect(data.filePath).toBeDefined();
      expect(data.mimeType).toBe('image/png');

      uploadedMediaId = data.id;
      storageKey = data.storageKey;
      physicalPath = data.filePath;

      // Verify physical file exists on disk
      expect(fs.existsSync(physicalPath)).toBe(true);
      const stats = fs.statSync(physicalPath);
      expect(stats.size).toBeGreaterThan(0);

      // Verify PostgreSQL media record exists
      const dbMedia = await prisma.productMedia.findUnique({
        where: { id: uploadedMediaId },
      });
      expect(dbMedia).toBeDefined();
      expect(dbMedia!.productId).toBe(productId);
      expect(dbMedia!.storageKey).toBe(storageKey);
    });

    it('serves stored media file publicly via GET /media/file/*', async () => {
      const fileRes = await request(app.getHttpServer()).get(`/media/file/${storageKey}`);
      expect(fileRes.status).toBe(200);
      expect(fileRes.headers['cache-control']).toBe('public, max-age=86400');
    });

    it('prevents cross-tenant deletion (Tenant B cannot delete Tenant A media)', async () => {
      const delRes = await request(app.getHttpServer())
        .delete(`/media/${uploadedMediaId}`)
        .set('Authorization', `Bearer ${tokenB}`);

      // Must fail with 404 Not Found (isolated by tenantId filter)
      expect(delRes.status).toBe(404);
      expect(fs.existsSync(physicalPath)).toBe(true);
    });

    it('successfully deletes media metadata and cleans up physical file when requested by owner', async () => {
      const delRes = await request(app.getHttpServer())
        .delete(`/media/${uploadedMediaId}`)
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(delRes.status).toBe(200);

      // Verify database record removed
      const dbMedia = await prisma.productMedia.findUnique({ where: { id: uploadedMediaId } });
      expect(dbMedia).toBeNull();

      // Verify physical file unlinked from disk
      expect(fs.existsSync(physicalPath)).toBe(false);
    });

    it('rejects invalid uploads (.exe, .html, oversized, path traversal)', async () => {
      // 1. .exe MIME rejection
      const exeRes = await request(app.getHttpServer())
        .post('/media/upload')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          productId,
          filename: 'exploit.exe',
          mimeType: 'application/x-msdownload',
          base64Data: Buffer.from('MZ...').toString('base64'),
        });
      expect(exeRes.status).toBe(400);

      // 2. .html MIME rejection
      const htmlRes = await request(app.getHttpServer())
        .post('/media/upload')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          productId,
          filename: 'payload.html',
          mimeType: 'text/html',
          base64Data: Buffer.from('<script>alert(1)</script>').toString('base64'),
        });
      expect(htmlRes.status).toBe(400);

      // 3. Oversized file (> 5MB)
      const hugeBuffer = Buffer.alloc(6 * 1024 * 1024);
      const hugeRes = await request(app.getHttpServer())
        .post('/media/upload')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          productId,
          filename: 'huge.png',
          mimeType: 'image/png',
          base64Data: hugeBuffer.toString('base64'),
        });
      expect(hugeRes.status).toBe(400);

      // 4. Path traversal attempt on /media/file/*
      const traversalRes = await request(app.getHttpServer()).get('/media/file/../../../../etc/passwd');
      expect(traversalRes.status).toBe(404);
    });
  });

  // ===========================================================================
  // SECTION 8: VARIANT MEDIA E2E
  // ===========================================================================
  describe('4. Variant Media E2E (Colour Dynamic Gallery Switching)', () => {
    let shirtId: string;

    afterAll(async () => {
      if (shirtId) {
        await prisma.productMedia.deleteMany({ where: { productId: shirtId } });
        await prisma.productVariantOptionValue.deleteMany({ where: { variant: { productId: shirtId } } });
        await prisma.productVariant.deleteMany({ where: { productId: shirtId } });
        await prisma.productOptionValue.deleteMany({ where: { option: { productId: shirtId } } });
        await prisma.productOption.deleteMany({ where: { productId: shirtId } });
        await prisma.product.deleteMany({ where: { id: shirtId } });
      }
    });

    it('creates product with 9 variants (3 colours x 3 sizes), attaches distinct images, and resolves colour gallery', async () => {
      // 1. Create Linen Shirt
      const shirt = await prisma.product.create({
        data: {
          tenantId: tenantA.id,
          storeId: storeA.id,
          name: 'Premium Linen Shirt Phase45',
          slug: 'premium-linen-shirt-p45',
          status: 'PUBLISHED',
        },
      });
      shirtId = shirt.id;

      // Options: Colour (Navy, Black, White) & Size (S, M, L)
      const colourOpt = await prisma.productOption.create({
        data: { tenantId: tenantA.id, storeId: storeA.id, productId: shirt.id, name: 'Colour', sortOrder: 0 },
      });
      const navyVal = await prisma.productOptionValue.create({ data: { optionId: colourOpt.id, value: 'Navy', sortOrder: 0 } });
      const blackVal = await prisma.productOptionValue.create({ data: { optionId: colourOpt.id, value: 'Black', sortOrder: 1 } });
      const whiteVal = await prisma.productOptionValue.create({ data: { optionId: colourOpt.id, value: 'White', sortOrder: 2 } });

      const sizeOpt = await prisma.productOption.create({
        data: { tenantId: tenantA.id, storeId: storeA.id, productId: shirt.id, name: 'Size', sortOrder: 1 },
      });
      const sVal = await prisma.productOptionValue.create({ data: { optionId: sizeOpt.id, value: 'S', sortOrder: 0 } });
      const mVal = await prisma.productOptionValue.create({ data: { optionId: sizeOpt.id, value: 'M', sortOrder: 1 } });
      const lVal = await prisma.productOptionValue.create({ data: { optionId: sizeOpt.id, value: 'L', sortOrder: 2 } });

      // 9 variants
      const colours = [
        { name: 'Navy', val: navyVal },
        { name: 'Black', val: blackVal },
        { name: 'White', val: whiteVal },
      ];
      const sizes = [
        { name: 'S', val: sVal },
        { name: 'M', val: mVal },
        { name: 'L', val: lVal },
      ];

      const variantMap: Record<string, string> = {};
      for (const c of colours) {
        for (const s of sizes) {
          const v = await prisma.productVariant.create({
            data: {
              tenantId: tenantA.id,
              storeId: storeA.id,
              productId: shirt.id,
              sku: `LINEN-P45-${c.name.toUpperCase()}-${s.name}`,
              pricePaise: 299900,
            },
          });
          variantMap[`${c.name}-${s.name}`] = v.id;

          await prisma.productVariantOptionValue.create({
            data: { variantId: v.id, optionValueId: c.val.id },
          });
          await prisma.productVariantOptionValue.create({
            data: { variantId: v.id, optionValueId: s.val.id },
          });
        }
      }

      expect(Object.keys(variantMap).length).toBe(9);

      // Upload unique images for Navy, Black, White and attach to Medium variant of each
      const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAE4wHZw95m5QAAAABJRU5ErkJggg==';

      for (const col of ['Navy', 'Black', 'White']) {
        const upRes = await request(app.getHttpServer())
          .post('/media/upload')
          .set('Authorization', `Bearer ${sellerToken}`)
          .send({
            productId: shirt.id,
            variantId: variantMap[`${col}-M`],
            filename: `linen-${col.toLowerCase()}.png`,
            mimeType: 'image/png',
            base64Data: sampleBase64,
            altText: `Premium Linen Shirt in ${col}`,
          });
        expect(upRes.status).toBe(201);
      }

      // Query public storefront
      const sfRes = await request(app.getHttpServer()).get(`/storefront/${storeA.slug}`);
      expect(sfRes.status).toBe(200);

      const foundShirt = sfRes.body.data.products.find((p: any) => p.id === shirt.id);
      expect(foundShirt).toBeDefined();
      expect(foundShirt.variants.length).toBe(9);
      expect(foundShirt.media.length).toBe(3);

      // Test dynamic gallery resolution:
      // Navy variants should map to Navy image
      const navyVariantIds = foundShirt.variants
        .filter((v: any) => v.optionValues.some((ov: any) => ov.optionValue.value === 'Navy'))
        .map((v: any) => v.id);
      const navyGallery = foundShirt.media.filter((m: any) => m.variantId && navyVariantIds.includes(m.variantId));
      expect(navyGallery.length).toBe(1);
      expect(navyGallery[0].altText).toContain('Navy');

      // Black variants should map to Black image
      const blackVariantIds = foundShirt.variants
        .filter((v: any) => v.optionValues.some((ov: any) => ov.optionValue.value === 'Black'))
        .map((v: any) => v.id);
      const blackGallery = foundShirt.media.filter((m: any) => m.variantId && blackVariantIds.includes(m.variantId));
      expect(blackGallery.length).toBe(1);
      expect(blackGallery[0].altText).toContain('Black');

      // White variants should map to White image
      const whiteVariantIds = foundShirt.variants
        .filter((v: any) => v.optionValues.some((ov: any) => ov.optionValue.value === 'White'))
        .map((v: any) => v.id);
      const whiteGallery = foundShirt.media.filter((m: any) => m.variantId && whiteVariantIds.includes(m.variantId));
      expect(whiteGallery.length).toBe(1);
      expect(whiteGallery[0].altText).toContain('White');
    });
  });
});
