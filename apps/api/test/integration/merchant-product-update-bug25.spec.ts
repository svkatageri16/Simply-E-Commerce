import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { GlobalHttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import request from 'supertest';
import { SEED_IDS } from '@simply/db';

describe('Merchant Product Update Bug 25 E2E Suite', () => {
  let app: NestFastifyApplication;
  let sellerToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );
    app.useGlobalFilters(new GlobalHttpExceptionFilter());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Login with seeded seller
    const loginRes = await request(app.getHttpServer())
      .post('/auth/pin/login')
      .send({ phone: '+919876543210', pin: '123456' });

    if (loginRes.body.data?.accessToken) {
      sellerToken = loginRes.body.data.accessToken;
    } else {
      console.log('Login response:', loginRes.body);
      throw new Error('Failed to login seller');
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('Replicate ProductEditorDrawer.tsx update call on an existing product', async () => {
    // 1. List products to get an existing product
    const listRes = await request(app.getHttpServer())
      .get('/catalog/products')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(listRes.status).toBe(200);
    const products = listRes.body.data.items;
    expect(products.length).toBeGreaterThan(0);
    const targetProduct = products[0];
    console.log(`Testing target product: ${targetProduct.name} (${targetProduct.id})`);

    // 2. Fetch product by ID like ProductEditorDrawer loads it
    const getRes = await request(app.getHttpServer())
      .get(`/catalog/products/${targetProduct.id}`)
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(getRes.status).toBe(200);
    const loadedProduct = getRes.body.data;

    // 3. Construct the exact payload that ProductEditorDrawer submits
    const mediaAssetIds = (loadedProduct.media || []).map((m: any) => m.mediaAssetId).filter(Boolean);
    const media = (loadedProduct.media || []).map((m: any, idx: number) => ({
      mediaAssetId: m.mediaAssetId,
      optionValue: m.optionValue?.value || undefined,
      optionValueId: m.optionValueId || undefined,
      sortOrder: idx,
    }));

    const firstVar = loadedProduct.variants?.[0];
    const basePaise = firstVar?.pricePaise ?? loadedProduct.pricePaise ?? 0;
    const compPaise = firstVar?.compareAtPricePaise ?? loadedProduct.compareAtPricePaise;
    const stock = firstVar?.inventory?.stockOnHand ?? 0;
    const sku = firstVar?.sku || '';

    const payload: any = {
      name: loadedProduct.name,
      description: loadedProduct.description || undefined,
      categoryId: loadedProduct.categoryId ? loadedProduct.categoryId : null,
      mode: loadedProduct.mode,
      status: loadedProduct.status,
      pricePaise: basePaise,
      compareAtPricePaise: compPaise,
      stock: Number(stock) || 0,
      sku: sku.trim() || undefined,
      ...(mediaAssetIds.length > 0 ? { mediaAssetIds, media } : { media: [] }),
    };

    if (loadedProduct.options && loadedProduct.options.length > 0) {
      payload.options = loadedProduct.options.map((o: any, idx: number) => ({
        id: o.id,
        name: o.name,
        sortOrder: idx,
        values: o.values.map((v: any, vIdx: number) => ({ value: v.value || v, sortOrder: vIdx })),
      }));
      payload.variants = loadedProduct.variants.map((v: any) => ({
        id: v.id,
        sku: v.sku,
        pricePaise: v.pricePaise,
        compareAtPricePaise: v.compareAtPricePaise,
        stock: v.inventory?.stockOnHand ?? 0,
        initialStock: v.inventory?.stockOnHand ?? 0,
        optionValues: v.optionValues ? v.optionValues.map((ov: any) => ov.optionValue?.value || ov) : [],
        status: v.status,
      }));
    } else {
      payload.options = [];
      payload.variants = [
        {
          sku: sku.trim() || `TEST-001`,
          pricePaise: basePaise || 0,
          compareAtPricePaise: compPaise,
          stock: Number(stock) || 0,
          initialStock: Number(stock) || 0,
          optionValues: [],
          status: 'ACTIVE',
        },
      ];
    }

    console.log('Sending PUT /catalog/products/' + targetProduct.id);
    const updateRes = await request(app.getHttpServer())
      .put(`/catalog/products/${targetProduct.id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send(payload);

    console.log('Update response status:', updateRes.status);
    console.log('Update response body:', JSON.stringify(updateRes.body, null, 2));

    if (updateRes.status !== 200) {
      console.error('FAILED BODY:', updateRes.body);
    }
    expect(updateRes.status).toBe(200);
  });
});
