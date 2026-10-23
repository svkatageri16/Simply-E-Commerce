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
      status: 'ok',
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
    let dbConnected = false;
    try {
      await this.prisma.$queryRaw`SELECT 1;`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    const storageConfigured = Boolean(this.storageProvider);
    const smtpConfigured = Boolean(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      (process.env.SMTP_PASSWORD || process.env.SMTP_PASS)
    );
    const razorpayConfigured = Boolean(
      this.razorpayProvider.platformKeyId &&
      this.razorpayProvider.platformKeySecret
    );

    const isReady = dbConnected && storageConfigured;
    const statusCode = isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

    return res.status(statusCode).send({
      status: isReady ? 'ok' : 'unavailable',
      database: dbConnected ? 'connected' : 'disconnected',
      storage: storageConfigured ? 'configured' : 'unconfigured',
      checks: {
        database: dbConnected ? 'connected' : 'disconnected',
        storage: storageConfigured ? 'configured' : 'unconfigured',
        smtp: smtpConfigured ? 'configured' : 'unconfigured',
        razorpay: razorpayConfigured ? 'configured' : 'unconfigured',
      },
      timestamp: new Date().toISOString(),
    });
  }
}
