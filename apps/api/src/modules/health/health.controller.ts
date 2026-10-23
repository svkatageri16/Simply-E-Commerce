import { Controller, Get, Inject, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { Public } from '../../common/decorators';
import { STORAGE_PROVIDER_TOKEN } from '../media/media.service';
import { StorageProvider } from '@simply/storage';
import { getBrandConfig } from '@simply/config';
import { RazorpayPaymentProvider } from '../payments/providers/razorpay-payment.provider';

@ApiTags('Observability & Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaClient,
    @Inject(STORAGE_PROVIDER_TOKEN) private readonly storageProvider: StorageProvider,
    private readonly razorpayProvider: RazorpayPaymentProvider
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe - checks API process status' })
  async getLiveness() {
    let platformName = 'LetzShop';
    let supportEmail = 'support@letzshop.in';
    let supportPhone = '+91 9876543210';
    let defaultTimezone = 'Asia/Kolkata';
    let defaultLocale = 'en-IN';
    let defaultCurrency = 'INR';

    try {
      const setting = await this.prisma.platformSetting.findUnique({
        where: { key: 'general' },
      });
      if (setting?.value && typeof setting.value === 'object') {
        const val = setting.value as any;
        if (val.platformName) platformName = val.platformName;
        if (val.supportEmail) supportEmail = val.supportEmail;
        if (val.supportPhone) supportPhone = val.supportPhone;
        if (val.defaultTimezone) defaultTimezone = val.defaultTimezone;
        if (val.defaultLocale) defaultLocale = val.defaultLocale;
      }
    } catch {
      // Fallback
    }

    return {
      status: 'UP',
      brand: platformName,
      platformName,
      supportEmail,
      supportPhone,
      defaultTimezone,
      defaultLocale,
      defaultCurrency,
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };
  }

  @Get('platform')
  @ApiOperation({ summary: 'Public platform configuration (safe branding, support contact, and regional defaults)' })
  async getPlatformConfig() {
    let platformName = 'LetzShop';
    let supportEmail = 'support@letzshop.in';
    let supportPhone = '+91 9876543210';
    let defaultTimezone = 'Asia/Kolkata';
    let defaultLocale = 'en-IN';
    let defaultCurrency = 'INR';

    try {
      const setting = await this.prisma.platformSetting.findUnique({
        where: { key: 'general' },
      });
      if (setting?.value && typeof setting.value === 'object') {
        const val = setting.value as any;
        if (val.platformName) platformName = val.platformName;
        if (val.supportEmail) supportEmail = val.supportEmail;
        if (val.supportPhone) supportPhone = val.supportPhone;
        if (val.defaultTimezone) defaultTimezone = val.defaultTimezone;
        if (val.defaultLocale) defaultLocale = val.defaultLocale;
      }
    } catch {
      // Fallback
    }

    return {
      platformName,
      supportEmail,
      supportPhone,
      defaultTimezone,
      defaultLocale,
      defaultCurrency,
    };
  }

  @Get('providers')
  @ApiOperation({ summary: 'Provider configuration indicator (no secrets, zero API calls)' })
  getProviderStatus() {
    const razorpayConfigured = !!(
      this.razorpayProvider.platformKeyId &&
      this.razorpayProvider.platformKeySecret
    );
    const webhookConfigured = !!this.razorpayProvider.platformWebhookSecret;

    return {
      status: 'UP',
      providers: {
        razorpay: razorpayConfigured ? 'Configured' : 'Not Configured',
        webhook: webhookConfigured ? 'Configured' : 'Not Configured',
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe - checks database, storage, and provider configurations' })
  async getReadiness(@Res() res: any) {
    const checks: Record<string, any> = {
      database: 'DOWN',
      storage: 'DOWN',
    };

    let isReady = true;

    // Check 1: PostgreSQL Connection
    try {
      await this.prisma.$queryRaw`SELECT 1;`;
      checks.database = 'UP';
    } catch (err: any) {
      checks.database = 'DOWN';
      isReady = false;
    }

    // Check 2: Storage Availability
    try {
      await this.storageProvider.exists('health/probe/products/readiness.jpg');
      checks.storage = 'UP';
    } catch (err: any) {
      checks.storage = 'DOWN';
      isReady = false;
    }

    // Check 3: Provider Configuration Status (Safe, offline)
    const razorpayConfigured = !!(
      this.razorpayProvider.platformKeyId &&
      this.razorpayProvider.platformKeySecret
    );
    const webhookConfigured = !!this.razorpayProvider.platformWebhookSecret;

    checks.providers = {
      razorpay: razorpayConfigured ? 'Configured' : 'Not Configured',
      webhook: webhookConfigured ? 'Configured' : 'Not Configured',
    };

    const statusCode = isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(statusCode).send({
      status: isReady ? 'READY' : 'NOT_READY',
      checks,
      timestamp: new Date().toISOString(),
    });
  }
}
