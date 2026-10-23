import {
  Controller,
  Get,
  Post,
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

    const amountInRupees = (invoice.amountPaise / 100).toFixed(2);
    const startStr = formatDate(invoice.subscription?.currentPeriodStart);
    const endStr = formatDate(invoice.subscription?.currentPeriodEnd);

    const pdf = generateInvoicePdfBuffer({
      invoiceNumber: invoice.invoiceNumber,
      formattedBaseAmount: invoice.baseAmountPaise == null ? undefined : `INR ${(invoice.baseAmountPaise / 100).toFixed(2)}`,
      formattedTaxAmount: invoice.taxPaise == null ? undefined : `INR ${(invoice.taxPaise / 100).toFixed(2)}`,
      gstRate: invoice.gstBasisPoints == null ? undefined : invoice.gstBasisPoints / 100,
      status: invoice.status,
      tenantName: invoice.tenant.name,
      tenantSlug: store?.slug || invoice.tenant.slug,
      ownerName: owner?.fullName || 'Merchant Seller',
      ownerPhone: owner?.phone || store?.supportPhone || store?.whatsappNumber || 'Not provided',
      ownerEmail: owner?.email || store?.supportEmail || 'Not provided',
      invoiceDate: formatDate(invoice.createdAt),
      billingPeriod: `${startStr} – ${endStr}`,
      billingPeriodShort: `${startStr} – ${endStr}`,
      currency: invoice.currency || 'INR',
      paymentMethod: payment?.paymentMethod || 'RAZORPAY',
      paymentReference: payment?.providerPaymentId || 'N/A',
      paidAtDate: formatDateTime(invoice.paidAt || payment?.createdAt),
      paymentStatus: payment?.status || invoice.status,
      planName: invoice.subscription?.plan?.name || 'Launch',
      formattedAmount: `INR ${amountInRupees}`,
    });

    res.header('Content-Type', 'application/pdf');
    res.header('Content-Disposition', `inline; filename="invoice-${id}.pdf"`);
    res.header('Cache-Control', 'no-store');
    return res.send(pdf);
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
      false
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
    return this.paymentsService.verifyAndCapturePayment(body);
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
    if (plan.code.toUpperCase().includes('GROWTH')) {
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
      if (!verifiedOrder || verifiedOrder.status !== PaymentStatus.PAID) {
        throw new ForbiddenException(
          'Direct subscription activation without verified payment is forbidden in production.'
        );
      }
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
