import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/modules/auth/auth.service';
import { SEED_IDS } from '@simply/db';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

describe('Merchant Flow 02A — Product Creation End-to-End Integration Suite', () => {
  let app: NestFastifyApplication;
  let sellerTokenA: string;
  let sellerTokenB: string;
  let createdProductId: string;
  let uploadedMediaAssetId: string;
  let uploadedPublicUrl: string;

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
      })
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    async function getSellerToken(phone: string): Promise<string> {
      let pinLogin = await request(app.getHttpServer())
        .post('/auth/pin/login')
        .send({ phone, pin: '123456' });
      if (pinLogin.body.data?.accessToken) {
        return pinLogin.body.data.accessToken;
      }
      pinLogin = await request(app.getHttpServer())
        .post('/auth/pin/login')
        .send({ phone, pin: '654321' });
      if (pinLogin.body.data?.accessToken) {
        return pinLogin.body.data.accessToken;
      }

      await request(app.getHttpServer()).post('/auth/register/request-otp').send({ phone });
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/register/verify-otp')
        .send({ phone, code: '123456' });
      const vToken = verifyRes.body.data?.verificationToken;

      const setupRes = await request(app.getHttpServer())
        .post('/auth/pin/setup')
        .send({ phone, pin: '654321', verificationToken: vToken });
      const setupToken = setupRes.body.data?.accessToken;

      const onboardRes = await request(app.getHttpServer())
        .post('/stores/onboard')
        .set('Authorization', `Bearer ${setupToken}`)
        .send({
          businessName: `Store for ${phone}`,
          category: 'Fashion',
          contactPhone: phone,
          address: 'Mumbai, Maharashtra',
        });

      return onboardRes.body.data?.accessToken || setupToken;
    }

    sellerTokenA = await getSellerToken('+919876543210');
    const authService = app.get<AuthService>(AuthService);
    const prisma = app.get<PrismaClient>(PrismaClient);
    const userB = await prisma.user.findUnique({ where: { id: SEED_IDS.tenantBOwner } });
    const bTokens = await (authService as any).createSessionAndIssueTokens(userB, SEED_IDS.tenantB, SEED_IDS.storeB);
    sellerTokenB = bTokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Rejects unauthenticated product creation with 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer())
      .post('/catalog/products')
      .send({
        name: 'Unauthenticated Shirt',
        mode: 'SELL_ONLINE',
        pricePaise: 79900,
      });

    expect(res.status).toBe(401);
  });

  it('2. Rejects legacy non-whitelisted property "title" with 400 Bad Request', async () => {
    const res = await request(app.getHttpServer())
      .post('/catalog/products')
      .set('Authorization', `Bearer ${sellerTokenA}`)
      .send({
        title: 'Classic Cotton Shirt', // Non-whitelisted field
        mode: 'SELL_ONLINE',
        pricePaise: 79900,
      });

    expect(res.status).toBe(400);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).toContain('property title should not exist');
  });

  it('3. Rejects missing product name with 400 Bad Request', async () => {
    const res = await request(app.getHttpServer())
      .post('/catalog/products')
      .set('Authorization', `Bearer ${sellerTokenA}`)
      .send({
        mode: 'SELL_ONLINE',
        pricePaise: 79900,
      });

    expect(res.status).toBe(400);
  });

  it('4. Rejects negative price with 400 Bad Request', async () => {
    const res = await request(app.getHttpServer())
      .post('/catalog/products')
      .set('Authorization', `Bearer ${sellerTokenA}`)
      .send({
        name: 'Negative Price Shirt',
        mode: 'SELL_ONLINE',
        pricePaise: -500,
      });

    expect(res.status).toBe(400);
  });

  it('5. Uploads one product image via POST /media/asset and receives MediaAsset', async () => {
    // 1x1 transparent PNG in base64
    const samplePngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const uploadRes = await request(app.getHttpServer())
      .post('/media/asset')
      .set('Authorization', `Bearer ${sellerTokenA}`)
      .send({
        filename: 'classic-cotton-shirt.png',
        mimeType: 'image/png',
        base64Data: samplePngBase64,
        altText: 'Classic Cotton Shirt photo',
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data).toBeDefined();
    expect(uploadRes.body.data.id).toBeDefined();
    expect(uploadRes.body.data.publicUrl).toBeDefined();
    expect(uploadRes.body.data.publicUrl).toContain('/media/');

    uploadedMediaAssetId = uploadRes.body.data.id;
    uploadedPublicUrl = uploadRes.body.data.publicUrl;
  });

  it('6. Creates ONE product end-to-end with details and uploaded image', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/catalog/products')
      .set('Authorization', `Bearer ${sellerTokenA}`)
      .send({
        name: 'Classic Cotton Shirt',
        description: 'Comfortable everyday cotton shirt.',
        mode: 'SELL_ONLINE',
        pricePaise: 79900,
        stock: 10,
        mediaAssetIds: [uploadedMediaAssetId],
      });

    expect(createRes.status).toBe(201);
    const product = createRes.body.data;
    expect(product).toBeDefined();
    expect(product.id).toBeDefined();
    expect(product.name).toBe('Classic Cotton Shirt');
    expect(product.mode).toBe('SELL_ONLINE');
    expect(product.description).toBe('Comfortable everyday cotton shirt.');

    // Verify variants and price
    expect(product.variants).toBeDefined();
    expect(product.variants.length).toBeGreaterThanOrEqual(1);
    expect(product.variants[0].pricePaise).toBe(79900);
    expect(product.variants[0].inventory?.stockOnHand).toBe(10);

    // Verify media attachment
    expect(product.media).toBeDefined();
    expect(product.media.length).toBeGreaterThanOrEqual(1);
    expect(product.media[0].publicUrl).toBe(uploadedPublicUrl);
    expect(product.media[0].mediaAssetId).toBe(uploadedMediaAssetId);

    createdProductId = product.id;
  });

  it('7. Product persists and is retrievable via GET /catalog/products/:id', async () => {
    const fetchRes = await request(app.getHttpServer())
      .get(`/catalog/products/${createdProductId}`)
      .set('Authorization', `Bearer ${sellerTokenA}`);

    expect(fetchRes.status).toBe(200);
    const product = fetchRes.body.data;
    expect(product.id).toBe(createdProductId);
    expect(product.name).toBe('Classic Cotton Shirt');
    expect(product.media.length).toBeGreaterThanOrEqual(1);
    expect(product.media[0].publicUrl).toBe(uploadedPublicUrl);
    expect(product.variants[0].pricePaise).toBe(79900);
    expect(product.variants[0].inventory?.stockOnHand).toBe(10);
  });

  it('8. Product appears in Products List via GET /catalog/products', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/catalog/products')
      .set('Authorization', `Bearer ${sellerTokenA}`);

    expect(listRes.status).toBe(200);
    const items = listRes.body.data.items;
    const found = items.find((p: any) => p.id === createdProductId);
    expect(found).toBeDefined();
    expect(found.name).toBe('Classic Cotton Shirt');
    expect(found.media.length).toBeGreaterThanOrEqual(1);
    expect(found.media[0].publicUrl).toBe(uploadedPublicUrl);
  });

  it('9. Tenant Isolation: Seller B cannot view Seller A product', async () => {
    const res = await request(app.getHttpServer())
      .get(`/catalog/products/${createdProductId}`)
      .set('Authorization', `Bearer ${sellerTokenB}`);

    expect([403, 404]).toContain(res.status);
  });

  it('10. Mode Validation: ENQUIRY_ONLY succeeds without requiring price', async () => {
    const res = await request(app.getHttpServer())
      .post('/catalog/products')
      .set('Authorization', `Bearer ${sellerTokenA}`)
      .send({
        name: 'Bespoke Architectural Fitting',
        description: 'Made to order based on blueprints.',
        mode: 'ENQUIRY_ONLY',
        enquiryCtaText: 'Request Blueprint Quote',
        mediaAssetIds: [uploadedMediaAssetId],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Bespoke Architectural Fitting');
    expect(res.body.data.mode).toBe('ENQUIRY_ONLY');
  });

  it('11. Mode Validation: SELL_ONLINE rejects creation when price is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/catalog/products')
      .set('Authorization', `Bearer ${sellerTokenA}`)
      .send({
        name: 'Online Shirt Without Price',
        mode: 'SELL_ONLINE',
        mediaAssetIds: [uploadedMediaAssetId],
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Price is required');
  });
});
