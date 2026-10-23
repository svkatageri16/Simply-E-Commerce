import { Test, TestingModule } from '@nestjs/testing';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { resolveMediaUrl } from '@simply/validation';

describe('Product Image Rendering & Media Serving Integration Suite', () => {
  let app: NestFastifyApplication;
  let sellerToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const adapter = new FastifyAdapter();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(adapter);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Authenticate seller
    const phone = '+919876543210';
    const pin = '123456';
    const pinLogin = await request(app.getHttpServer())
      .post('/auth/pin/login')
      .send({ phone, pin });

    if (pinLogin.body?.accessToken || pinLogin.body?.data?.accessToken) {
      sellerToken = pinLogin.body?.accessToken || pinLogin.body?.data?.accessToken;
    } else {
      await request(app.getHttpServer()).post('/auth/register/request-otp').send({ phone });
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/register/verify-otp')
        .send({ phone, code: '123456' });
      const vToken = verifyRes.body.data?.verificationToken;
      const setupRes = await request(app.getHttpServer())
        .post('/auth/pin/setup')
        .send({ phone, pin, verificationToken: vToken });
      const setupToken = setupRes.body.data?.accessToken;
      const onboardRes = await request(app.getHttpServer())
        .post('/stores/onboard')
        .set('Authorization', `Bearer ${setupToken}`)
        .send({
          businessName: 'Image Test Boutique',
          category: 'Fashion',
          contactPhone: phone,
          address: 'Colaba, Mumbai, Maharashtra',
        });
      sellerToken = onboardRes.body.data?.accessToken || setupToken;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Uploads real PNG, JPEG, and WebP images and verifies MediaAsset creation', async () => {
    // 1x1 PNG
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const pngRes = await request(app.getHttpServer())
      .post('/media/asset')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        filename: 'sample.png',
        mimeType: 'image/png',
        base64Data: pngBase64,
        altText: 'Sample PNG test',
      });
    expect(pngRes.status).toBe(201);
    expect(pngRes.body.data.publicUrl).toBeDefined();
    expect(pngRes.body.data.mimeType).toBe('image/png');

    // Sample JPEG
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]);
    const jpegRes = await request(app.getHttpServer())
      .post('/media/asset')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        filename: 'sample.jpg',
        mimeType: 'image/jpeg',
        base64Data: jpegBuffer.toString('base64'),
        altText: 'Sample JPEG test',
      });
    expect(jpegRes.status).toBe(201);
    expect(jpegRes.body.data.mimeType).toBe('image/jpeg');

    // Sample WebP
    const webpBuffer = Buffer.from('RIFF2000WEBPVP8X', 'utf-8');
    const webpRes = await request(app.getHttpServer())
      .post('/media/asset')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        filename: 'sample.webp',
        mimeType: 'image/webp',
        base64Data: webpBuffer.toString('base64'),
        altText: 'Sample WebP test',
      });
    expect(webpRes.status).toBe(201);
    expect(webpRes.body.data.mimeType).toBe('image/webp');
  });

  it('2. GET resolved media URL returns HTTP 200, correct Content-Type, and actual bytes', async () => {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const uploadRes = await request(app.getHttpServer())
      .post('/media/asset')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        filename: 'render-test.png',
        mimeType: 'image/png',
        base64Data: pngBase64,
        altText: 'Render test image',
      });

    const publicUrl = uploadRes.body.data.publicUrl;
    // Extract path after origin
    const urlObj = new URL(publicUrl);
    const mediaPath = urlObj.pathname;

    const serveRes = await request(app.getHttpServer()).get(mediaPath);
    expect(serveRes.status).toBe(200);
    expect(serveRes.headers['content-type']).toContain('image/png');
    expect(serveRes.body.length).toBeGreaterThan(0);
  });

  it('3. Prevents path traversal attempts and returns 404 NotFound', async () => {
    const maliciousPaths = [
      '/media/../../../../package.json',
      '/media/file/../../package.json',
      '/media/file/%2e%2e%2f%2e%2e%2fpackage.json',
    ];

    for (const p of maliciousPaths) {
      const res = await request(app.getHttpServer()).get(p);
      expect(res.status).toBe(404);
    }
  });

  it('4. Creates product and verifies Product API returns real media data (no manufactured placeholders)', async () => {
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const uploadRes = await request(app.getHttpServer())
      .post('/media/asset')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        filename: 'dress.png',
        mimeType: 'image/png',
        base64Data: pngBase64,
        altText: 'Pure Silk Anarkali Dress',
      });

    const mediaAsset = uploadRes.body.data;

    const prodRes = await request(app.getHttpServer())
      .post('/catalog/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Pure Silk Anarkali Dress',
        description: 'Hand-woven pure silk.',
        mode: 'SELL_ONLINE',
        pricePaise: 249900,
        stock: 5,
        mediaAssetIds: [mediaAsset.id],
      });

    expect(prodRes.status).toBe(201);
    const product = prodRes.body.data;
    expect(product.media).toBeDefined();
    expect(product.media.length).toBe(1);
    expect(product.media[0].mediaAssetId).toBe(mediaAsset.id);
    expect(product.media[0].publicUrl).toBe(mediaAsset.publicUrl);

    // Verify resolveMediaUrl produces a fully qualified, loadable URL
    const resolvedUrl = resolveMediaUrl(product.media[0].publicUrl);
    expect(resolvedUrl).toMatch(/^http:\/\/localhost:4000\/media\//);

    // Verify GET request on the resolved URL returns 200 image/png
    const pathname = new URL(resolvedUrl).pathname;
    const fetchImg = await request(app.getHttpServer()).get(pathname);
    expect(fetchImg.status).toBe(200);
    expect(fetchImg.headers['content-type']).toContain('image/png');
  });
});
