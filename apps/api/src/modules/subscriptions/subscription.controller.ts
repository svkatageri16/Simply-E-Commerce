import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { isEmail } from 'class-validator';
import { planAvailability } from './plan-policy';
import { generateInvoicePdfBuffer } from '../admin/invoice-pdf.util';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionService, MONTHLY_SUBSCRIPTION_DAYS } from './subscription.service';
import { PaymentsService } from '../payments/payments.service';
import { CurrentUser, CurrentTenant, Roles, Public } from '../../common/decorators';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser, TenantContext, UserRole } from '@simply/types';
import { PrismaClient, PaymentStatus } from '@prisma/client';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaClient
  ) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'Get available subscription plans' })
  async getPlans() {
    return this.subscriptionService.getAvailablePlans();
  }

  @UseGuards(TenantGuard)
  @Get('current')
  @ApiOperation({ summary: 'Get subscription status for current authenticated merchant' })
  async getCurrentSubscription(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionService.getTenantSubscription(tenant.tenantId);
  }

  @UseGuards(TenantGuard)
  @Get('billing-profile')
  @ApiOperation({ summary: 'Get merchant billing profile for GST tax invoicing' })
  async getBillingProfile(@CurrentTenant() tenant: TenantContext) {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenant.tenantId },
      select: {
        id: true,
        name: true,
        billingName: true,
        gstin: true,
        gstRegistered: true,
        billingAddress: true,
        billingState: true,
        billingPincode: true,
        billingEmail: true,
      },
    });
    if (!t) throw new NotFoundException('Merchant tenant not found.');
    return {
      legalName: t.billingName || t.name,
      gstin: t.gstin || '',
      gstRegistered: Boolean(t.gstRegistered || t.gstin),
      billingAddress: t.billingAddress || '',
      state: t.billingState || '',
      pincode: t.billingPincode || '',
      billingEmail: t.billingEmail || '',
    };
  }

  @UseGuards(TenantGuard)
  @Put('billing-profile')
  @ApiOperation({ summary: 'Update merchant billing profile and GSTIN' })
  async updateBillingProfile(
    @CurrentTenant() tenant: TenantContext,
    @Body()
    body: {
      legalName?: string;
      gstin?: string;
      billingAddress?: string;
      state?: string;
      pincode?: string;
      billingEmail?: string;
    }
  ) {
    for (const [key, value] of Object.entries(body || {})) {
      if (!['legalName', 'gstin', 'billingAddress', 'state', 'pincode', 'billingEmail'].includes(key) || typeof value !== 'string' || value.length > 2000) {
        throw new BadRequestException('Invalid billing profile field.');
      }
    }
    if (body.pincode && !/^[1-9][0-9]{5}$/.test(body.pincode.trim())) throw new BadRequestException('Enter a valid six-digit PIN code.');
    let cleanGstin: string | null = null;
    if (body.gstin && body.gstin.trim()) {
      cleanGstin = body.gstin.trim().toUpperCase();
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(cleanGstin)) {
        throw new BadRequestException('Invalid GSTIN format. Must be a valid 15-character Indian GSTIN (e.g. 27AAAAA0000A1Z5).');
      }
    }

    if (body.billingEmail && body.billingEmail.trim()) {
      if (!isEmail(body.billingEmail.trim())) {
        throw new BadRequestException('Invalid billing email address.');
      }
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenant.tenantId },
      data: {
        ...(body.legalName ? { billingName: body.legalName.trim() } : {}),
        ...(body.gstin !== undefined ? { gstin: cleanGstin, gstRegistered: Boolean(cleanGstin) } : {}),
        ...(body.billingAddress !== undefined ? { billingAddress: body.billingAddress.trim() || null } : {}),
        ...(body.state !== undefined ? { billingState: body.state.trim() || null } : {}),
        ...(body.pincode !== undefined ? { billingPincode: body.pincode.trim() || null } : {}),
        ...(body.billingEmail !== undefined ? { billingEmail: body.billingEmail.trim().toLowerCase() || null } : {}),
      },
    });

    return {
      success: true,
      data: {
        legalName: updated.billingName || updated.name,
        gstin: updated.gstin || '',
        gstRegistered: Boolean(updated.gstin),
        billingAddress: updated.billingAddress || '',
        state: updated.billingState || '',
        pincode: updated.billingPincode || '',
        billingEmail: updated.billingEmail || '',
      },
    };
  }

  @UseGuards(TenantGuard)
  @Get('invoices/:id/pdf')
  @ApiOperation({ summary: 'Download merchant own subscription invoice PDF' })
  async getInvoicePdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res() res: any
  ) {
    const invoice = await this.prisma.subscriptionInvoice.findFirst({
      where: { id, tenantId: tenant.tenantId },
      include: {
        tenant: {
          include: {
            memberships: {
              where: { role: 'SELLER_OWNER', isActive: true },
              include: { user: true },
            },
            stores: { where: { deletedAt: null }, take: 1 },
          },
        },
        subscription: { include: { plan: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found.');

    const snapshot = invoice.snapshot as any;
    const owner = invoice.tenant.memberships[0]?.user;
    const store = invoice.tenant.stores[0];
    const payment = invoice.payments[0];

    const formatDate = (d: Date | string | null | undefined) => {
      if (!d) return '—';
      return new Date(d).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    };

    const formatDateTime = (d: Date | string | null | undefined) => {
      if (!d) return '—';
      return new Date(d).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const pdfData = snapshot
      ? {
          invoiceNumber: snapshot.invoiceNumber || invoice.invoiceNumber,
          status: snapshot.payment?.status || invoice.status,
          tenantName: snapshot.merchant?.businessName || 'Not recorded',
          tenantSlug: snapshot.merchant?.storeSlug || 'Not recorded',
          ownerName: snapshot.merchant?.contactName || 'Not recorded',
          ownerPhone: snapshot.merchant?.contactPhone || 'Not recorded',
          ownerEmail: snapshot.merchant?.billingEmail || 'Not recorded',
          merchantGstin: snapshot.merchant?.gstin || null,
          billingAddress: snapshot.merchant?.billingAddress || null,
          billingState: snapshot.merchant?.state || null,
          issuerName: snapshot.issuer?.legalName,
          issuerGstin: snapshot.issuer?.gstin,
          issuerAddress: snapshot.issuer?.address,
          issuerWebsite: snapshot.issuer?.website,
          invoiceDate: formatDate(snapshot.invoiceDate || invoice.createdAt),
          billingPeriod: `${formatDate(snapshot.package?.billingPeriodStart || invoice.subscription?.currentPeriodStart)} – ${formatDate(snapshot.package?.billingPeriodEnd || invoice.subscription?.currentPeriodEnd)}`,
          billingPeriodShort: snapshot.package?.billingPeriod || '30 Days',
          currency: snapshot.financials?.currency || invoice.currency || 'INR',
          paymentMethod: snapshot.payment?.method || payment?.paymentMethod || 'RAZORPAY',
          paymentReference: snapshot.payment?.reference || payment?.providerPaymentId || 'N/A',
          paidAtDate: formatDateTime(snapshot.payment?.paidAt || invoice.paidAt || payment?.createdAt),
          paymentStatus: snapshot.payment?.status || payment?.status || invoice.status,
          planName: snapshot.package?.name || invoice.subscription?.plan?.name || 'Solopreneur',
          formattedAmount: `INR ${(Number(snapshot.financials?.totalPaise ?? invoice.amountPaise) / 100).toFixed(2)}`,
          formattedBaseAmount: `INR ${(Number(snapshot.financials?.baseAmountPaise ?? invoice.baseAmountPaise ?? invoice.amountPaise) / 100).toFixed(2)}`,
          formattedTaxAmount: `INR ${(Number(snapshot.financials?.taxPaise ?? invoice.taxPaise ?? 0) / 100).toFixed(2)}`,
          gstRate: snapshot.financials?.gstRatePercent ?? (invoice.gstBasisPoints == null ? undefined : invoice.gstBasisPoints / 100),
        }
      : {
          invoiceNumber: invoice.invoiceNumber,
          formattedBaseAmount: invoice.baseAmountPaise == null ? undefined : `INR ${(invoice.baseAmountPaise / 100).toFixed(2)}`,
          formattedTaxAmount: invoice.taxPaise == null ? undefined : `INR ${(invoice.taxPaise / 100).toFixed(2)}`,
          gstRate: invoice.gstBasisPoints == null ? undefined : invoice.gstBasisPoints / 100,
          status: invoice.status,
          tenantName: invoice.tenant.billingName || invoice.tenant.name,
          tenantSlug: store?.slug || invoice.tenant.slug,
          ownerName: owner?.fullName || 'Merchant Seller',
          ownerPhone: owner?.phone || store?.supportPhone || store?.whatsappNumber || 'Not provided',
          ownerEmail: invoice.tenant.billingEmail || owner?.email || store?.supportEmail || 'Not provided',
          merchantGstin: invoice.tenant.gstin || null,
          billingAddress: invoice.tenant.billingAddress || null,
          billingState: invoice.tenant.billingState || null,
          invoiceDate: formatDate(invoice.createdAt),
          billingPeriod: `${formatDate(invoice.subscription?.currentPeriodStart)} – ${formatDate(invoice.subscription?.currentPeriodEnd)}`,
          billingPeriodShort: `${formatDate(invoice.subscription?.currentPeriodStart)} – ${formatDate(invoice.subscription?.currentPeriodEnd)}`,
          currency: invoice.currency || 'INR',
          paymentMethod: payment?.paymentMethod || 'RAZORPAY',
          paymentReference: payment?.providerPaymentId || 'N/A',
          paidAtDate: formatDateTime(invoice.paidAt || payment?.createdAt),
          paymentStatus: payment?.status || invoice.status,
          planName: invoice.subscription?.plan?.name || 'Solopreneur',
          formattedAmount: `INR ${(invoice.amountPaise / 100).toFixed(2)}`,
        };

    const pdf = generateInvoicePdfBuffer(pdfData);

    res.header('Content-Type', 'application/pdf');
    res.header('Content-Disposition', `inline; filename="invoice-${id}.pdf"`);
    res.header('Cache-Control', 'no-store');
    return res.send(pdf);
  }

  @UseGuards(TenantGuard)
  @Post('autopay')
  async createAutoPay(@CurrentTenant() tenant: TenantContext, @Body() body: { planId: string }) {
    return this.paymentsService.createAutoPay(tenant.tenantId, body.planId);
  }

  @UseGuards(TenantGuard)
  @Post('autopay/verify')
  async verifyAutoPay(@CurrentTenant() tenant: TenantContext, @Body() body: { razorpay_subscription_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
    return this.paymentsService.verifyAutoPay(tenant.tenantId, body.razorpay_subscription_id, body.razorpay_payment_id, body.razorpay_signature);
  }

  @UseGuards(TenantGuard)
  @Post('create-order')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create Razorpay Test Mode Order for subscription checkout' })
  async createSubscriptionOrder(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: { planId: string; billingCycle?: string },
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    if (!body?.planId) {
      throw new BadRequestException('planId is required.');
    }

    return this.paymentsService.createPlatformSubscriptionPaymentOrder(
      tenant.tenantId,
      body.planId,
      body.billingCycle || 'MONTHLY',
      idempotencyKey,
      true
    );
  }

  @UseGuards(TenantGuard)
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Razorpay subscription payment and activate store' })
  async verifySubscriptionPayment(
    @CurrentTenant() tenant: TenantContext,
    @Body()
    body: {
      paymentOrderId?: string;
      providerPaymentId?: string;
      providerOrderId?: string;
      providerSignature?: string;
      razorpay_payment_id?: string;
      razorpay_order_id?: string;
      razorpay_signature?: string;
    }
  ) {
    const payment = await this.prisma.paymentOrder.findFirst({
      where: { tenantId: tenant.tenantId, purpose: 'PLATFORM_SUBSCRIPTION', ...(body.paymentOrderId ? { id: body.paymentOrderId } : { providerOrderId: body.providerOrderId || body.razorpay_order_id || '' }) },
    });
    if (!payment) throw new NotFoundException('Subscription payment not found.');
    return this.paymentsService.verifyAndCapturePayment({ paymentOrderId: payment.id, providerPaymentId: body.providerPaymentId || body.razorpay_payment_id, providerOrderId: body.providerOrderId || body.razorpay_order_id, providerSignature: body.providerSignature || body.razorpay_signature });
  }

  @UseGuards(TenantGuard)
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate or renew merchant subscription (rejects unverified activation in production)' })
  async activateSubscription(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { planId: string; durationDays?: number; paymentOrderId?: string; providerSignature?: string }
  ) {
    const plan = await this.prisma.plan.findUnique({ where: { id: body.planId } });
    if (!plan) throw new NotFoundException('Subscription plan not found.');
    if (!planAvailability(plan).purchasable) {
      throw new BadRequestException('The Growth plan is coming soon and cannot be activated at this time.');
    }

    if (process.env.NODE_ENV === 'production') {
      if (!body.paymentOrderId) {
        throw new ForbiddenException(
          'Direct subscription activation without verified payment is forbidden in production. Please initiate checkout or submit valid payment credentials.'
        );
      }
      const verifiedOrder = await this.prisma.paymentOrder.findUnique({
        where: { id: body.paymentOrderId },
      });
      if (!verifiedOrder || verifiedOrder.status !== PaymentStatus.PAID || verifiedOrder.tenantId !== tenant.tenantId || verifiedOrder.purpose !== 'PLATFORM_SUBSCRIPTION' || verifiedOrder.subscriptionId !== plan.id) {
        throw new ForbiddenException(
          'Direct subscription activation without verified payment is forbidden in production.'
        );
      }
      // Verification already activated access atomically. Replays must not extend it again.
      return this.subscriptionService.getTenantSubscription(tenant.tenantId);
    }

    return this.subscriptionService.activateOrRenewSubscription(
      tenant.tenantId,
      body.planId,
      body.durationDays ?? MONTHLY_SUBSCRIPTION_DAYS,
      user.userId
    );
  }

  @UseGuards(TenantGuard)
  @Post('dev-activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Development-only direct subscription activation (strictly rejected in production)' })
  async devActivateSubscription(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { planId: string; durationDays?: number }
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Development subscription activation is strictly disabled in production environments.'
      );
    }

    const plan = await this.prisma.plan.findUnique({ where: { id: body.planId } });
    if (!plan) throw new NotFoundException('Subscription plan not found.');
    if (plan.code.toUpperCase().includes('GROWTH')) {
      throw new BadRequestException('The Growth plan is coming soon and cannot be activated at this time.');
    }

    return this.subscriptionService.devActivateSubscription(
      tenant.tenantId,
      body.planId,
      body.durationDays ?? MONTHLY_SUBSCRIPTION_DAYS,
      user.userId
    );
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN)
  @Post('admin/override')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SuperAdmin force override for store visibility with mandatory audit trail' })
  async adminOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { storeId: string; forceLive: boolean; reason: string }
  ) {
    return this.subscriptionService.adminOverrideStoreVisibility(
      body.storeId,
      body.forceLive,
      user.userId,
      body.reason
    );
  }
}
