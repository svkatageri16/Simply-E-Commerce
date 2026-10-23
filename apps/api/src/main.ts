import fs from 'node:fs';
import path from 'node:path';

// Canonical Environment Bootstrap: Ensure root .env is loaded in development
const candidateRoots = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../../.env'),
];
for (const envPath of candidateRoots) {
  if (fs.existsSync(envPath) && typeof (process as any).loadEnvFile === 'function') {
    try {
      (process as any).loadEnvFile(envPath);
      break;
    } catch {}
  }
}

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, Logger, ConsoleLogger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';

import { AppModule } from './app.module';
import { getBrandConfig } from '@simply/config';
import { validateProductionSecrets } from './common/config/security-audit';
import { PrismaService } from './prisma/prisma.service';

/**
 * Clean Merchant Development Logger
 * Suppresses repetitive route mapping and initialization noise while preserving all warnings and errors.
 */
class CleanMerchantDevLogger extends ConsoleLogger {
  override log(message: any, context?: string) {
    if (
      context === 'InstanceLoader' ||
      context === 'RouterExplorer' ||
      context === 'RoutesResolver' ||
      context === 'NestFactory' ||
      context === 'NestApplication'
    ) {
      return;
    }
    super.log(message, context);
  }
}

async function bootstrap() {
  validateProductionSecrets();
  const logger = new Logger('Bootstrap');
  const brand = getBrandConfig();

  const fastifyAdapter = new FastifyAdapter({
    // Trust the local reverse proxy, never forwarded IP headers from arbitrary remote clients.
    trustProxy: 'loopback',
    // Only log warnings and errors from Fastify in development to suppress routine HTTP request noise
    logger: process.env.NODE_ENV === 'production' ? false : { level: 'warn' },
    bodyLimit: 15 * 1024 * 1024,
    rewriteUrl: (req: any) => {
      if (req.url && req.url.startsWith('/api/v1')) {
        const rewritten = req.url.replace('/api/v1', '');
        return rewritten === '' ? '/' : rewritten;
      }
      return req.url;
    },
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
    {
      rawBody: true,
      logger: new CleanMerchantDevLogger(),
    }
  );

  app.enableShutdownHooks();

  // Security Headers & Middlewares
  await app.register(fastifyHelmet as any, {
    contentSecurityPolicy: false, // Allows Swagger UI to render properly in local dev
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  const configuredOrigins = new Set<string>();
  const addOrigins = (raw?: string) => {
    if (!raw) return;
    const items = raw.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
    for (const item of items) configuredOrigins.add(item);
  };
  addOrigins(process.env.CORS_ALLOWED_ORIGINS);
  addOrigins(process.env.STOREFRONT_PUBLIC_URL);
  addOrigins(process.env.STOREFRONT_BASE_URL);
  addOrigins(process.env.STOREFRONT_URL);
  addOrigins(process.env.SELLER_PUBLIC_URL);
  addOrigins(process.env.SELLER_URL);
  addOrigins(process.env.ADMIN_URL);

  await app.register(fastifyCors as any, {
    origin: (origin: string, cb: (err: Error | null, allow: boolean) => void) => {
      if (!origin) return cb(null, true);

      // Local development and test: allow localhost and loopback on any port
      if (process.env.NODE_ENV !== 'production') {
        if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin)) {
          return cb(null, true);
        }
      }

      // Explicitly configured origins from environment
      if (configuredOrigins.has(origin)) {
        return cb(null, true);
      }

      // Recognized production and platform deployment origins
      if (
        /^https:\/\/(?:[a-zA-Z0-9-]+\.)*letzshop\.store$/i.test(origin) ||
        /^https:\/\/(?:[a-zA-Z0-9-]+\.)*railway\.app$/i.test(origin) ||
        /^https:\/\/(?:[a-zA-Z0-9-]+\.)*vercel\.app$/i.test(origin)
      ) {
        return cb(null, true);
      }

      if (process.env.NODE_ENV === 'production') {
        return cb(new Error(`CORS blocked for origin: ${origin}`), false);
      }

      return cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'x-request-id',
      'idempotency-key',
      'x-tenant-id',
      'x-store-id',
    ],
  });

  await app.register(fastifyCookie as any, {
    secret: process.env.COOKIE_SECRET || 'dev-cookie-secret-change-in-prod-32!',
  });

  // Global Input Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  );

  // OpenAPI / Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle(`${brand.brandName} API`)
    .setDescription(
      `Production-grade multi-tenant SaaS ecommerce backend foundation for Indian businesses.\n\n` +
      `Features subscription-gated storefronts, guest-first checkout, multi-carrier shipping, and DPDPA privacy compliance.`
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Input short-lived access JWT token obtained via /auth/otp/verify',
      },
      'bearer'
    )
    .addTag('Authentication', 'Seller OTP onboarding, rotating sessions, and logout')
    .addTag('Subscriptions', 'Tiered plans and store visibility controls')
    .addTag('Stores & Storefront', 'Merchant store configuration and public buyer storefront')
    .addTag('Catalog', 'Products, variants matrix, and categories')
    .addTag('Guest Cart', 'Guest-first shopping carts with no mandatory account')
    .addTag('Orders & Checkout', 'Transaction-safe order processing and state machine')
    .addTag('Payments', 'Razorpay & Mock multi-merchant payment gateways')
    .addTag('Shipping & Logistics', 'Shiprocket & Mock logistics fulfillment')
    .addTag('B2B Enquiries', 'Custom product quotation requests')
    .addTag('Privacy & DPDPA', 'Consent records, data export, and right-to-be-forgotten')
    .addTag('Observability & Health', 'Liveness and deep readiness probes')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  try {
    const prisma = app.get(PrismaService);
    await prisma.$connect();
  } catch (err: any) {
    console.error('✗ Database connection failed');
    console.error(err.message || err);
    process.exit(1);
  }

  const port = Number(process.env.PORT) || 4000;
  try {
    await app.listen(port, '0.0.0.0');
  } catch (err: any) {
    console.error('✗ API failed to start');
    console.error(err.message || err);
    process.exit(1);
  }

  logger.log(`🚀 ${brand.brandName} API running at http://localhost:${port}`);
  logger.log(`📚 Swagger OpenAPI documentation available at http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error('✗ API failed to start');
  console.error(err.message || err);
  process.exit(1);
});
