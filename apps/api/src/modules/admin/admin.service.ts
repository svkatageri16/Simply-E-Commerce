import { AdminDataService, AdminQuery } from './admin-data.service';
import {
  AdminPaymentKpis,
  AdminSettings,
  AdminSubAdmin,
  CreateSubAdminDto,
  UpdateSubAdminDto,
} from '@simply/api-contracts';
import { getBrandConfig } from '@simply/config';
import { AdminPermission } from '@simply/types';
import * as crypto from 'crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { generateInvoicePdfBuffer } from './invoice-pdf.util';
import {
  Prisma,
  PrismaClient,
  TenantStatus,
  StoreStatus,
  UserRole,
  SubscriptionStatus,
  CredentialType,
} from '@prisma/client';
import { PaymentsService } from '../payments/payments.service';
import { planAvailability } from '../subscriptions/plan-policy';

import { MailService } from '../notifications/mail.service';
import { WhatsAppService } from '../notifications/whatsapp.service';
import { VerificationService } from '../verification/verification.service';

@Injectable()
export class AdminService {
  public getThemes() {
    return this.data.themes();
  }
  constructor(
    private readonly prisma: PrismaClient,
    private readonly paymentsService: PaymentsService,
    private readonly data: AdminDataService,
    private readonly mailService: MailService,
    private readonly whatsAppService: WhatsAppService,
    private readonly verificationService: VerificationService,
  ) {}

  public getOverview(range?: string, from?: string, to?: string) {
    return this.data.overview(range, from, to);
  }

  public getAttentionSummary() {
    return this.data.attentionSummary();
  }

  public getMerchants(query: string | AdminQuery = {}) {
    return this.data.merchants(
      typeof query === 'string' ? { search: query } : query,
    );
  }

  public async getMerchantById(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: { role: 'SELLER_OWNER' },
          take: 10,
          select: {
            id: true,
            role: true,
            user: {
              select: { id: true, fullName: true, email: true, phone: true },
            },
          },
        },
        stores: {
          where: { deletedAt: null },
          take: 100,
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            isPubliclyAccessible: true,
            previewSecret: true,
            fulfillmentMode: true,
            supportPhone: true,
            supportEmail: true,
            whatsappNumber: true,
            createdAt: true,
            _count: {
              select: {
                products: { where: { deletedAt: null } },
                orders: true,
                customers: true,
                productReviews: { where: { status: 'ACTIVE' } },
              },
            },
          },
        },
        subscriptions: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            createdAt: true,
            plan: {
              select: { id: true, name: true, code: true, pricePaise: true, billingCycle: true },
            },
          },
        },
        invoices: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            amountPaise: true,
            currency: true,
            status: true,
            createdAt: true,
            paidAt: true,
            subscription: {
              select: {
                currentPeriodStart: true,
                currentPeriodEnd: true,
                plan: { select: { name: true, code: true } },
              },
            },
            payments: {
              select: {
                id: true,
                paymentMethod: true,
                providerPaymentId: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Merchant not found.');
    const [reports] = await this.prisma.$queryRaw<
      Array<{ count: number }>
    >`SELECT count(DISTINCT r.review_id)::int AS count FROM review_reports r JOIN product_reviews v ON v.id=r.review_id JOIN stores s ON s.id=v.store_id WHERE s.tenant_id=${tenantId}`;
    
    // Fetch recent 5 orders for merchant
    const recentOrders = await this.prisma.order.findMany({
      where: { store: { tenantId } },
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        totalPaise: true,
        currency: true,
        createdAt: true,
        customer: { select: { fullName: true, phone: true } },
        store: { select: { name: true, slug: true } },
      },
    });

    // Fetch review statistics
    const [reviewStats] = await this.prisma.$queryRaw<
      Array<{ activeCount: number; avgRating: number | null }>
    >`SELECT count(*)::int AS "activeCount", avg(rating)::float AS "avgRating" FROM product_reviews r JOIN stores s ON s.id=r.store_id WHERE s.tenant_id=${tenantId} AND r.status='ACTIVE'`;

    // Fetch communication and moderation audit history
    const commLogs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        action: {
          in: [
            'MERCHANT_MESSAGE_SENT',
            'MERCHANT_SUSPENDED',
            'MERCHANT_REACTIVATED',
            'MERCHANT_ARCHIVED',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const actorIds = [...new Set(commLogs.map((l) => l.actorId).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a.fullName || a.email || 'Admin']));

    const communicationHistory = commLogs.map((l) => {
      const meta = (l.metadata as any) || {};
      let channel = meta.channel || 'SYSTEM';
      if (meta.notifications) {
        const parts: string[] = [];
        if (meta.notifications.email && meta.notifications.email !== 'Not requested') parts.push('Email');
        if (meta.notifications.whatsapp && meta.notifications.whatsapp !== 'Not requested') parts.push('WhatsApp');
        if (parts.length) channel = parts.join(', ');
      }
      return {
        id: l.id,
        date: l.createdAt.toISOString(),
        channel,
        subject: meta.subject || l.action.replace(/_/g, ' '),
        message: meta.message || meta.merchantMessage || meta.reason || null,
        status: meta.status || (meta.notifications?.email === 'Sent' ? 'Sent' : meta.notifications?.whatsapp ? 'Opened in WhatsApp' : 'Completed'),
        adminName: (l.actorId && actorMap.get(l.actorId)) || 'Admin',
      };
    });

    const suspensionHistory = commLogs
      .filter((l) => ['MERCHANT_SUSPENDED', 'MERCHANT_REACTIVATED'].includes(l.action))
      .map((l) => {
        const meta = (l.metadata as any) || {};
        return {
          id: l.id,
          date: l.createdAt.toISOString(),
          action: l.action === 'MERCHANT_SUSPENDED' ? 'SUSPENDED' : 'REACTIVATED',
          target: l.entityType === 'Store' ? 'Store' : 'Merchant Account',
          reason: meta.reason || meta.internalNote || 'Administrative action',
          adminName: (l.actorId && actorMap.get(l.actorId)) || 'Admin',
        };
      });

    const { invoices, ...merchant } = tenant;
    const verification = await this.verificationService.getVerification(tenantId);

    return {
      ...merchant,
      paymentHistory: invoices,
      reportedReviewCount: reports?.count || 0,
      communicationHistory,
      suspensionHistory,
      recentOrders,
      reviewStats: {
        activeCount: reviewStats?.activeCount || 0,
        avgRating: reviewStats?.avgRating ? Number(reviewStats.avgRating.toFixed(1)) : null,
      },
      verification,
      businessType: verification.businessType,
      gstRegistered: verification.gstRegistered,
      gstin: verification.gstin,
      panNumberMasked: verification.panNumberMasked,
      udyamNumber: verification.udyamNumber,
      businessVerificationStatus: verification.overallStatus,
    };
  }

  public async generateInvoicePdf(
    invoiceId: string,
    merchantTenantId?: string,
    actorId?: string,
  ): Promise<Buffer> {
    const invoice = await this.prisma.subscriptionInvoice.findUnique({
      where: { id: invoiceId },
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
        subscription: {
          include: {
            plan: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${invoiceId}" not found.`);
    }

    if (merchantTenantId && invoice.tenantId !== merchantTenantId) {
      throw new ForbiddenException('Access denied to requested invoice.');
    }

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

    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorType: 'ADMIN',
          action: 'INVOICE_DOWNLOADED',
          entityType: 'Invoice',
          entityId: invoice.id,
          tenantId: invoice.tenantId,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
      formattedBaseAmount: invoice.baseAmountPaise == null ? undefined : `INR ${(invoice.baseAmountPaise / 100).toFixed(2)}`,
      formattedTaxAmount: invoice.taxPaise == null ? undefined : `INR ${(invoice.taxPaise / 100).toFixed(2)}`,
      gstRate: invoice.gstBasisPoints == null ? undefined : invoice.gstBasisPoints / 100,
            amountPaise: invoice.amountPaise,
            currency: invoice.currency,
            module: 'Payments',
            result: 'SUCCESS',
          },
        },
      });
    }

    const snapshot = invoice.snapshot as any;
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
          billingPeriod: `${startStr} – ${endStr}`,
          billingPeriodShort: `${startStr} – ${endStr}`,
          currency: invoice.currency || 'INR',
          paymentMethod: payment?.paymentMethod || 'RAZORPAY',
          paymentReference: payment?.providerPaymentId || 'N/A',
          paidAtDate: formatDateTime(invoice.paidAt || payment?.createdAt),
          paymentStatus: payment?.status || invoice.status,
          planName: invoice.subscription?.plan?.name || 'Solopreneur',
          formattedAmount: `INR ${amountInRupees}`,
        };

    return generateInvoicePdfBuffer(pdfData);
  }

  public async getCommunicationHistory(tenantId: string) {
    const detail = await this.getMerchantById(tenantId);
    return detail.communicationHistory || [];
  }

  public async getMerchantSubscriptions(tenantId: string, page = 1, pageSize = 5) {
    const p = Math.max(1, Number(page) || 1);
    const limit = Math.max(1, Math.min(100, Number(pageSize) || 5));
    const skip = (p - 1) * limit;

    const [total, subs] = await Promise.all([
      this.prisma.subscription.count({ where: { tenantId } }),
      this.prisma.subscription.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          plan: {
            select: { id: true, name: true, code: true, pricePaise: true, billingCycle: true },
          },
          invoices: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: {
              payments: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: { status: true, amountPaise: true, createdAt: true },
              },
            },
          },
        },
      }),
    ]);

    const data = subs.map((s) => {
      const inv = s.invoices?.[0];
      const payment = inv?.payments?.[0];
      const amountPaise = inv?.amountPaise || payment?.amountPaise || s.plan?.pricePaise || 0;
      const paymentStatus = payment?.status || inv?.status || (s.status === 'ACTIVE' ? 'PAID' : s.status === 'PAST_DUE' ? 'FAILED' : 'UNPAID');
      return {
        id: s.id,
        plan: s.plan,
        amountPaise,
        status: s.status,
        currentPeriodStart: s.currentPeriodStart.toISOString(),
        currentPeriodEnd: s.currentPeriodEnd.toISOString(),
        paymentStatus,
        createdAt: s.createdAt.toISOString(),
      };
    });

    return {
      data,
      pagination: {
        page: p,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  public async getMerchantInvoices(tenantId: string, page = 1, pageSize = 5) {
    const p = Math.max(1, Number(page) || 1);
    const limit = Math.max(1, Math.min(100, Number(pageSize) || 5));
    const skip = (p - 1) * limit;

    const [total, invoices] = await Promise.all([
      this.prisma.subscriptionInvoice.count({ where: { tenantId } }),
      this.prisma.subscriptionInvoice.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          subscription: {
            include: { plan: { select: { name: true, code: true } } },
          },
        },
      }),
    ]);

    const data = invoices.map((inv) => {
      let billingPeriod = 'N/A';
      if (inv.subscription) {
        const start = new Date(inv.subscription.currentPeriodStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const end = new Date(inv.subscription.currentPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        billingPeriod = `${start} – ${end}`;
      }
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        billingPeriod,
        plan: inv.subscription?.plan?.name || 'Launch',
        amountPaise: inv.amountPaise,
        status: inv.status,
        createdAt: inv.createdAt.toISOString(),
        paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
      };
    });

    return {
      data,
      pagination: {
        page: p,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  public async getMerchantOrders(tenantId: string, page = 1, pageSize = 5) {
    const p = Math.max(1, Number(page) || 1);
    const limit = Math.max(1, Math.min(100, Number(pageSize) || 5));
    const skip = (p - 1) * limit;

    const where = { store: { tenantId } };
    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { fullName: true } },
          orderAddress: { select: { fullName: true } },
        },
      }),
    ]);

    const data = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer?.fullName || (o.orderAddress as any)?.fullName || 'Guest',
      amountPaise: o.totalPaise,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    }));

    return {
      data,
      pagination: {
        page: p,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  public async getMerchantCommunications(tenantId: string, page = 1, pageSize = 5) {
    const p = Math.max(1, Number(page) || 1);
    const limit = Math.max(1, Math.min(100, Number(pageSize) || 5));
    const skip = (p - 1) * limit;

    const where = {
      tenantId,
      action: {
        in: [
          'MERCHANT_MESSAGE_SENT',
          'MERCHANT_SUSPENDED',
          'MERCHANT_REACTIVATED',
          'MERCHANT_ARCHIVED',
        ],
      },
    };

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const actorIds = [...new Set(logs.map((l) => l.actorId).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a.fullName || a.email || 'Admin']));

    const data = logs.map((l) => {
      const meta = (l.metadata as any) || {};
      let channel = meta.channel || 'SYSTEM';
      if (meta.notifications) {
        const parts: string[] = [];
        if (meta.notifications.email && meta.notifications.email !== 'Not requested') parts.push('Email');
        if (meta.notifications.whatsapp && meta.notifications.whatsapp !== 'Not requested') parts.push('WhatsApp');
        if (parts.length) channel = parts.join(', ');
      }
      return {
        id: l.id,
        date: l.createdAt.toISOString(),
        channel,
        subject: meta.subject || l.action.replace(/_/g, ' '),
        message: meta.message || meta.merchantMessage || meta.reason || null,
        status: meta.status || (meta.notifications?.email === 'Sent' ? 'Sent' : meta.notifications?.whatsapp ? 'Opened in WhatsApp' : 'Completed'),
        adminName: (l.actorId && actorMap.get(l.actorId)) || 'Admin',
      };
    });

    return {
      data,
      pagination: {
        page: p,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  public async getMerchantModerationSummary(tenantId: string, reviewPage = 1, statusPage = 1, pageSize = 5) {
    const rPage = Math.max(1, Number(reviewPage) || 1);
    const sPage = Math.max(1, Number(statusPage) || 1);
    const limit = Math.max(1, Math.min(100, Number(pageSize) || 5));

    const [
      activeCount,
      avgResult,
      pendingReports,
      underReviewReports,
      removedReviews,
    ] = await Promise.all([
      this.prisma.productReview.count({
        where: { store: { tenantId }, status: 'ACTIVE' },
      }),
      this.prisma.productReview.aggregate({
        where: { store: { tenantId }, status: 'ACTIVE' },
        _avg: { rating: true },
      }),
      this.prisma.reviewReport.count({
        where: { review: { store: { tenantId } }, status: 'PENDING' },
      }),
      this.prisma.reviewReport.count({
        where: { review: { store: { tenantId } }, status: 'UNDER_REVIEW' },
      }),
      this.prisma.productReview.count({
        where: { store: { tenantId }, status: 'REMOVED' },
      }),
    ]);

    const reviewLogWhere = {
      tenantId,
      action: {
        in: [
          'REVIEW_REPORTED',
          'REVIEW_REPORT_UNDER_REVIEW',
          'REVIEW_REMOVED',
          'REVIEW_RESTORED',
          'REVIEW_REPORT_DISMISSED',
        ],
      },
    };
    const statusLogWhere = {
      tenantId,
      action: {
        in: ['MERCHANT_SUSPENDED', 'MERCHANT_REACTIVATED', 'MERCHANT_ARCHIVED'],
      },
    };

    const [reviewTotal, reviewLogs, statusTotal, statusLogs] = await Promise.all([
      this.prisma.auditLog.count({ where: reviewLogWhere }),
      this.prisma.auditLog.findMany({
        where: reviewLogWhere,
        skip: (rPage - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where: statusLogWhere }),
      this.prisma.auditLog.findMany({
        where: statusLogWhere,
        skip: (sPage - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const allActorIds = [...new Set([...reviewLogs, ...statusLogs].map((l) => l.actorId).filter(Boolean))] as string[];
    const actors = allActorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: allActorIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a.fullName || a.email || 'Admin']));

    const reviewModerationActivity = {
      data: reviewLogs.map((l) => {
        const meta = (l.metadata as any) || {};
        return {
          id: l.id,
          date: l.createdAt.toISOString(),
          action: l.action.replace(/_/g, ' '),
          reason: meta.reason || meta.note || meta.details || null,
          adminName: (l.actorId && actorMap.get(l.actorId)) || 'Admin',
        };
      }),
      pagination: {
        page: rPage,
        pageSize: limit,
        total: reviewTotal,
        totalPages: Math.ceil(reviewTotal / limit) || 1,
      },
    };

    const statusHistory = {
      data: statusLogs.map((l) => {
        const meta = (l.metadata as any) || {};
        return {
          id: l.id,
          date: l.createdAt.toISOString(),
          action: l.action === 'MERCHANT_SUSPENDED' ? 'SUSPENDED' : l.action === 'MERCHANT_REACTIVATED' ? 'REACTIVATED' : 'ARCHIVED',
          target: l.entityType === 'Store' ? 'Store' : 'Merchant Account',
          reason: meta.reason || meta.internalNote || 'Administrative action',
          adminName: (l.actorId && actorMap.get(l.actorId)) || 'Admin',
        };
      }),
      pagination: {
        page: sPage,
        pageSize: limit,
        total: statusTotal,
        totalPages: Math.ceil(statusTotal / limit) || 1,
      },
    };

    return {
      stats: {
        activeReviews: activeCount,
        avgRating: avgResult._avg?.rating ? Number(avgResult._avg.rating.toFixed(1)) : null,
        pendingReports,
        underReviewReports,
        removedReviews,
      },
      reviewModerationActivity,
      statusHistory,
    };
  }

  public async sendMessageToMerchant(
    tenantId: string,
    actorId: string,
    dto: {
      channels: Array<'EMAIL' | 'WHATSAPP'>;
      subject: string;
      message: string;
    },
  ) {
    if (!dto.subject?.trim()) throw new BadRequestException('Subject is required.');
    if (!dto.message?.trim()) throw new BadRequestException('Message is required.');
    if (!dto.channels?.length) throw new BadRequestException('Select at least one delivery channel (Email or WhatsApp).');

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId, deletedAt: null },
      include: {
        memberships: {
          where: { role: 'SELLER_OWNER', isActive: true },
          include: { user: true },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Merchant not found.');
    const owner = tenant.memberships[0]?.user;
    if (!owner) throw new BadRequestException('Merchant owner contact information not found.');

    let emailSent = false;
    let emailStatus = 'Not requested';
    let whatsAppUrl: string | null = null;
    let whatsAppStatus = 'Not requested';

    if (dto.channels.includes('EMAIL')) {
      if (!owner.email) {
        throw new BadRequestException('No email address available for this merchant owner.');
      }
      try {
        emailSent = await this.mailService.sendAdminMerchantEmail(
          owner.email,
          dto.subject.trim(),
          dto.message.trim(),
          tenant.name,
        );
        emailStatus = emailSent ? 'Sent' : 'Failed to deliver';
      } catch (err: any) {
        emailStatus = `Failed: ${err.message || 'SMTP error'}`;
      }
    }

    if (dto.channels.includes('WHATSAPP')) {
      if (!owner.phone) {
        throw new BadRequestException('No phone number available for this merchant owner.');
      }
      const settings = await this.getSafeSettings();
      const greeting = settings.whatsapp.defaultTemplateGreeting || 'Hello from LetzShop,';
      const fullText = `${greeting}\n\n*${dto.subject.trim()}*\n\n${dto.message.trim()}`;
      const wa = this.whatsAppService.generateAdminMerchantWhatsAppMessage(owner.phone, fullText);
      whatsAppUrl = wa.url;
      whatsAppStatus = 'Opened in WhatsApp';
    }

    const primaryStatus = dto.channels.includes('EMAIL')
      ? emailStatus
      : whatsAppStatus;

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        tenantId,
        action: 'MERCHANT_MESSAGE_SENT',
        entityType: 'Tenant',
        entityId: tenantId,
        metadata: {
          channel: dto.channels.join(', '),
          subject: dto.subject.trim(),
          message: dto.message.trim(),
          recipientEmail: owner.email,
          recipientPhone: owner.phone,
          status: primaryStatus,
          emailStatus,
          whatsAppStatus,
          whatsAppUrl,
        },
      },
    });

    return {
      success: true,
      emailSent,
      whatsAppUrl,
      status: primaryStatus,
    };
  }

  public async suspendMerchant(
    tenantId: string,
    actorId: string,
    dto:
      | {
          reason: string;
          internalNote?: string;
          merchantMessage?: string;
          notifyEmail?: boolean;
          notifyWhatsApp?: boolean;
          storeId?: string;
        }
      | string,
  ) {
    const reasonText = typeof dto === 'string' ? dto : dto.reason || 'Administrative suspension';
    const internalNote = typeof dto === 'object' ? dto.internalNote : undefined;
    const merchantMessage = typeof dto === 'object' ? dto.merchantMessage : undefined;
    const notifyEmail = typeof dto === 'object' ? Boolean(dto.notifyEmail) : false;
    const notifyWhatsApp = typeof dto === 'object' ? Boolean(dto.notifyWhatsApp) : false;
    const targetStoreId = typeof dto === 'object' ? dto.storeId : undefined;

    if (!reasonText?.trim() || reasonText.length > 2000)
      throw new BadRequestException('An audit reason is required.');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        include: {
          stores: {
            where: { deletedAt: null },
            select: { id: true, name: true, status: true, isPubliclyAccessible: true },
          },
          memberships: {
            where: { role: 'SELLER_OWNER', isActive: true },
            include: { user: true },
          },
        },
      });
      if (!tenant || tenant.deletedAt)
        throw new NotFoundException('Merchant not found.');
      if (tenant.status === 'SUSPENDED' && !targetStoreId)
        throw new BadRequestException('Merchant is already suspended.');

      let updatedTenant = tenant;
      if (!targetStoreId) {
        updatedTenant = await tx.tenant.update({
          where: { id: tenantId },
          data: { status: 'SUSPENDED' },
          include: {
            stores: { where: { deletedAt: null }, select: { id: true, name: true, status: true, isPubliclyAccessible: true } },
            memberships: { where: { role: 'SELLER_OWNER', isActive: true }, include: { user: true } },
          },
        });
        await tx.store.updateMany({
          where: { tenantId, deletedAt: null, status: { not: 'ARCHIVED' } },
          data: { status: 'SUSPENDED', isPubliclyAccessible: false },
        });
      } else {
        await tx.store.update({
          where: { id: targetStoreId },
          data: { status: 'SUSPENDED', isPubliclyAccessible: false },
        });
      }

      const owner = tenant.memberships[0]?.user;
      return { tenant: updatedTenant, owner };
    });

    // Handle notifications outside transaction so failure doesn't rollback suspension
    let emailSent = false;
    let emailStatus = 'Not requested';
    let whatsAppUrl: string | null = null;
    let whatsAppStatus = 'Not requested';

    const defaultMsg =
      `Hello ${result.tenant.name},\n\n` +
      `Your LetzShop store access has temporarily been suspended.\n\n` +
      `Reason:\n${reasonText}\n\n` +
      (merchantMessage ? `Additional Information:\n${merchantMessage}\n\n` : '') +
      `Please contact the LetzShop team if you require assistance.\n\n` +
      `— LetzShop Support`;

    const finalNoticeText = merchantMessage?.trim() || defaultMsg;

    const settings = await this.getSafeSettings();
    const allowSuspensionNotifs = settings.notifications.notifyMerchantOnAccountSuspension ?? true;

    if (notifyEmail && allowSuspensionNotifs && result.owner?.email) {
      try {
        emailSent = await this.mailService.sendAdminMerchantEmail(
          result.owner.email,
          `Store Suspension Notice — ${result.tenant.name}`,
          finalNoticeText,
          result.tenant.name,
        );
        emailStatus = emailSent ? 'Sent' : 'Failed to deliver';
      } catch (err: any) {
        emailStatus = `Failed: ${err.message || 'SMTP error'}`;
      }
    } else if (notifyEmail && !allowSuspensionNotifs) {
      emailStatus = 'Suppressed by platform notification policy';
    }

    if (notifyWhatsApp && allowSuspensionNotifs && result.owner?.phone) {
      const greeting = settings.whatsapp.defaultTemplateGreeting || 'Hello from LetzShop,';
      const wa = this.whatsAppService.generateAdminMerchantWhatsAppMessage(
        result.owner.phone,
        `${greeting}\n\n*Store Suspension Notice — ${result.tenant.name}*\n\n${finalNoticeText}`,
      );
      whatsAppUrl = wa.url;
      whatsAppStatus = 'Opened in WhatsApp';
    } else if (notifyWhatsApp && !allowSuspensionNotifs) {
      whatsAppStatus = 'Suppressed by platform notification policy';
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        tenantId,
        storeId: targetStoreId || null,
        action: 'MERCHANT_SUSPENDED',
        entityType: targetStoreId ? 'Store' : 'Tenant',
        entityId: targetStoreId || tenantId,
        metadata: {
          reason: reasonText.trim(),
          internalNote: internalNote?.trim() || null,
          merchantMessage: finalNoticeText,
          previousStatus: result.tenant.status,
          stores: result.tenant.stores,
          subject: 'Store Suspension Notification',
          status: 'Suspended',
          notifications: {
            email: emailStatus,
            whatsapp: whatsAppStatus,
          },
          whatsAppUrl,
        },
      },
    });

    return {
      success: true,
      merchant: result.tenant,
      emailSent,
      whatsAppUrl,
      status: 'Suspended',
    };
  }

  public async reactivateMerchant(
    tenantId: string,
    actorId: string,
    dto?:
      | {
          reason?: string;
          merchantMessage?: string;
          notifyEmail?: boolean;
          notifyWhatsApp?: boolean;
          storeId?: string;
        }
      | string,
  ) {
    const reasonText =
      typeof dto === 'string'
        ? dto
        : dto?.reason || 'Administrative reactivation';
    const merchantMessage = typeof dto === 'object' ? dto?.merchantMessage : undefined;
    const notifyEmail = typeof dto === 'object' ? Boolean(dto?.notifyEmail) : false;
    const notifyWhatsApp = typeof dto === 'object' ? Boolean(dto?.notifyWhatsApp) : false;
    const targetStoreId = typeof dto === 'object' ? dto?.storeId : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        include: {
          stores: { where: { deletedAt: null } },
          subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
          memberships: {
            where: { role: 'SELLER_OWNER', isActive: true },
            include: { user: true },
          },
        },
      });
      if (!tenant || tenant.deletedAt)
        throw new NotFoundException('Merchant not found.');

      const hasSuspendedStore = tenant.stores.some((s) => s.status === 'SUSPENDED');
      if (tenant.status !== 'SUSPENDED' && !hasSuspendedStore)
        throw new BadRequestException(
          'Neither the merchant nor any store is currently suspended.',
        );

      const suspension = await tx.auditLog.findFirst({
        where: {
          OR: [
            { entityId: targetStoreId || tenantId, action: 'MERCHANT_SUSPENDED' },
            { entityId: tenantId, action: 'MERCHANT_SUSPENDED' },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      const previous = ((suspension?.metadata as any)?.stores || []) as Array<{
        id: string;
        status: string;
        isPubliclyAccessible: boolean;
      }>;
      const sub = tenant.subscriptions[0],
        paid = Boolean(
          sub && sub.status === 'ACTIVE' && sub.currentPeriodEnd > new Date(),
        );

      if (targetStoreId) {
        const store = tenant.stores.find((s) => s.id === targetStoreId);
        if (!store) throw new NotFoundException('Store not found.');
        if (store.status !== 'SUSPENDED') {
          throw new BadRequestException('This store is not suspended.');
        }
        const old = previous.find((s) => s.id === store.id);
        const live = paid && (old ? old.status === 'LIVE' && old.isPubliclyAccessible : true);
        await tx.store.update({
          where: { id: store.id },
          data: {
            status: live ? 'LIVE' : 'PRIVATE_PREVIEW',
            isPubliclyAccessible: Boolean(live),
          },
        });
      } else {
        for (const store of tenant.stores) {
          if (store.status !== 'SUSPENDED') continue;
          const old = previous.find((s) => s.id === store.id);
          const live = paid && (old ? old.status === 'LIVE' && old.isPubliclyAccessible : true);
          await tx.store.update({
            where: { id: store.id },
            data: {
              status: live ? 'LIVE' : 'PRIVATE_PREVIEW',
              isPubliclyAccessible: Boolean(live),
            },
          });
        }
      }

      let updated = tenant;
      if (tenant.status === 'SUSPENDED') {
        updated = await tx.tenant.update({
          where: { id: tenantId },
          data: { status: 'ACTIVE' },
          include: {
            stores: { where: { deletedAt: null } },
            subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
            memberships: {
              where: { role: 'SELLER_OWNER', isActive: true },
              include: { user: true },
            },
          },
        });
      }
      const owner = tenant.memberships[0]?.user;
      return { tenant: updated, owner, paid };
    });

    let emailSent = false;
    let emailStatus = 'Not requested';
    let whatsAppUrl: string | null = null;
    let whatsAppStatus = 'Not requested';

    const defaultMsg =
      `Hello ${result.tenant.name},\n\n` +
      `Your LetzShop store access has been reactivated successfully.\n\n` +
      (merchantMessage ? `Additional Information:\n${merchantMessage}\n\n` : '') +
      `Thank you for selling with LetzShop.\n\n` +
      `— LetzShop Support`;

    const finalNoticeText = merchantMessage?.trim() || defaultMsg;

    if (notifyEmail && result.owner?.email) {
      try {
        emailSent = await this.mailService.sendAdminMerchantEmail(
          result.owner.email,
          `Store Reactivated — ${result.tenant.name}`,
          finalNoticeText,
          result.tenant.name,
        );
        emailStatus = emailSent ? 'Sent' : 'Failed to deliver';
      } catch (err: any) {
        emailStatus = `Failed: ${err.message || 'SMTP error'}`;
      }
    }

    if (notifyWhatsApp && result.owner?.phone) {
      const wa = this.whatsAppService.generateAdminMerchantWhatsAppMessage(
        result.owner.phone,
        `*Store Reactivated — ${result.tenant.name}*\n\n${finalNoticeText}`,
      );
      whatsAppUrl = wa.url;
      whatsAppStatus = 'Opened in WhatsApp';
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        tenantId,
        storeId: targetStoreId || null,
        action: 'MERCHANT_REACTIVATED',
        entityType: targetStoreId ? 'Store' : 'Tenant',
        entityId: targetStoreId || tenantId,
        metadata: {
          reason: reasonText.trim(),
          merchantMessage: finalNoticeText,
          previousStatus: 'SUSPENDED',
          paidSubscription: result.paid,
          subject: 'Store Reactivation Notification',
          status: 'Reactivated',
          notifications: {
            email: emailStatus,
            whatsapp: whatsAppStatus,
          },
          whatsAppUrl,
        },
      },
    });

    return {
      success: true,
      merchant: result.tenant,
      emailSent,
      whatsAppUrl,
      status: 'Reactivated',
    };
  }

  public async archiveMerchant(
    tenantId: string,
    actorId: string,
    dto?: {
      reason?: string;
      internalNote?: string;
      merchantMessage?: string;
      notifyEmail?: boolean;
      notifyWhatsApp?: boolean;
    },
  ) {
    const reasonText = dto?.reason?.trim() || 'Administrative archival';
    const internalNote = dto?.internalNote?.trim();
    const merchantMessage = dto?.merchantMessage?.trim();
    const notifyEmail = Boolean(dto?.notifyEmail);
    const notifyWhatsApp = Boolean(dto?.notifyWhatsApp);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        include: {
          stores: { where: { deletedAt: null } },
          memberships: {
            where: { role: 'SELLER_OWNER', isActive: true },
            include: { user: true },
          },
        },
      });
      if (!tenant || tenant.deletedAt)
        throw new NotFoundException('Merchant not found.');
      if (tenant.status === 'ARCHIVED')
        throw new BadRequestException('Merchant is already archived.');

      // Update tenant status to ARCHIVED while strictly preserving orders, payments, reviews
      const updated = await tx.tenant.update({
        where: { id: tenantId },
        data: { status: 'ARCHIVED' },
      });
      await tx.store.updateMany({
        where: { tenantId, deletedAt: null },
        data: { status: 'ARCHIVED', isPubliclyAccessible: false },
      });

      const owner = tenant.memberships[0]?.user;
      return { tenant: updated, owner };
    });

    let emailSent = false;
    let emailStatus = 'Not requested';
    let whatsAppUrl: string | null = null;
    let whatsAppStatus = 'Not requested';

    const noticeText =
      merchantMessage ||
      `Hello ${result.tenant.name},\n\n` +
        `Your LetzShop merchant account has been archived. All your past transaction records, orders, and financial history have been preserved.\n\n` +
        `Reason:\n${reasonText}\n\n` +
        `Please reach out to LetzShop Support for any questions.\n\n` +
        `— LetzShop Support`;

    if (notifyEmail && result.owner?.email) {
      try {
        emailSent = await this.mailService.sendAdminMerchantEmail(
          result.owner.email,
          `Account Archival Notice — ${result.tenant.name}`,
          noticeText,
          result.tenant.name,
        );
        emailStatus = emailSent ? 'Sent' : 'Failed to deliver';
      } catch (err: any) {
        emailStatus = `Failed: ${err.message || 'SMTP error'}`;
      }
    }

    if (notifyWhatsApp && result.owner?.phone) {
      const wa = this.whatsAppService.generateAdminMerchantWhatsAppMessage(
        result.owner.phone,
        `*Account Archival Notice — ${result.tenant.name}*\n\n${noticeText}`,
      );
      whatsAppUrl = wa.url;
      whatsAppStatus = 'Opened in WhatsApp';
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        tenantId,
        action: 'MERCHANT_ARCHIVED',
        entityType: 'Tenant',
        entityId: tenantId,
        metadata: {
          reason: reasonText,
          internalNote: internalNote || null,
          merchantMessage: noticeText,
          previousStatus: result.tenant.status,
          subject: 'Account Archival Notification',
          status: 'Archived',
          notifications: {
            email: emailStatus,
            whatsapp: whatsAppStatus,
          },
          whatsAppUrl,
        },
      },
    });

    return {
      success: true,
      merchant: result.tenant,
      emailSent,
      whatsAppUrl,
      status: 'Archived',
    };
  }

  public getCommerceMonitoring(query: AdminQuery = {}) {
    return this.data.orders(query);
  }

  public getOrders(query: AdminQuery = {}) {
    return this.data.orders(query);
  }

  public getOrderDetail(id: string) {
    return this.data.orderDetail(id);
  }

  public async getOperationsSummary() {
    const [totalEvents, pendingEvents, failedEvents, failedOutbox] =
      await Promise.all([
        this.prisma.outboxEvent.count(),
        this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
        this.prisma.outboxEvent.count({
          where: { status: { in: ['FAILED', 'DEAD_LETTER'] } },
        }),
        this.prisma.outboxEvent.findMany({
          where: { status: { in: ['FAILED', 'DEAD_LETTER'] } },
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            eventType: true,
            status: true,
            retryCount: true,
            maxRetries: true,
          },
        }),
      ]);
    return {
      outbox: { totalEvents, pendingEvents, failedEvents },
      failedOutbox,
    };
  }

  public async retryOutboxEvent(eventId: string, actorId: string) {
    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Outbox event not found.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.outboxEvent.update({
        where: { id: eventId },
        data: {
          status: 'PENDING',
          retryCount: 0,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          tenantId: event.tenantId,
          storeId: event.storeId,
          action: 'OUTBOX_EVENT_RETRY_TRIGGERED',
          entityType: 'OutboxEvent',
          entityId: event.id,
          metadata: {
            eventType: event.eventType,
            previousStatus: event.status,
          },
        },
      });

      return {
        id: updated.id,
        status: updated.status,
        retryCount: updated.retryCount,
      };
    });
  }

  public async reconcilePaymentOrder(
    paymentOrderId: string,
    adminUserId?: string,
  ) {
    return this.paymentsService.reconcilePaymentOrder(
      paymentOrderId,
      adminUserId,
    );
  }

  public getUsers(query: AdminQuery = {}) {
    return this.data.users(query);
  }

  public async toggleUserStatus(
    userId: string,
    actorId: string,
    body?: { reason?: string; internalNote?: string },
  ) {
    if (userId === actorId) {
      throw new BadRequestException(
        'You cannot deactivate your own admin account.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: {
          id: true,
          isActive: true,
          role: true,
          isSuperAdmin: true,
          fullName: true,
        },
      });
      if (!user) throw new NotFoundException('User not found.');

      if (
        (user.role === 'PLATFORM_ADMIN' || user.isSuperAdmin) &&
        user.isActive
      ) {
        const remainingAdmins = await tx.user.count({
          where: {
            role: 'PLATFORM_ADMIN',
            isActive: true,
            deletedAt: null,
            id: { not: userId },
          },
        });
        if (remainingAdmins === 0) {
          throw new BadRequestException(
            'Cannot deactivate the last active Platform Admin account.',
          );
        }
      }

      const reason =
        body?.reason?.trim() ||
        (user.isActive
          ? 'Account suspended by administrator'
          : 'Account reactivated by administrator');
      const internalNote = body?.internalNote?.trim() || null;

      const updated = await tx.user.update({
        where: { id: userId },
        data: { isActive: !user.isActive },
        select: { id: true, isActive: true, role: true, fullName: true },
      });

      if (!updated.isActive) {
        await tx.session.updateMany({
          where: { userId, isRevoked: false },
          data: { isRevoked: true },
        });
        await tx.refreshToken.updateMany({
          where: { userId, isRevoked: false },
          data: { isRevoked: true },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId,
          actorType: 'ADMIN',
          action: user.isActive ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
          entityType: 'User',
          entityId: userId,
          metadata: {
            previousStatus: user.isActive ? 'ACTIVE' : 'SUSPENDED',
            newStatus: updated.isActive ? 'ACTIVE' : 'SUSPENDED',
            targetUserName: user.fullName,
            targetUserRole: user.role,
            reason,
            internalNote,
          },
        },
      });
      return updated;
    });
  }

  public getAnalytics(query?: any) {
    return this.data.analytics(query);
  }

  public getPlans() {
    return this.data.plans();
  }

  public getSubscriptionList(query: AdminQuery = {}) {
    return this.data.subscriptions(query);
  }

  public async getSubscriptionPayments(query: {
    status?: string;
    search?: string;
    page?: string;
    pageSize?: string;
    planId?: string;
    tenantId?: string;
    gateway?: string;
    from?: string;
    to?: string;
    range?: string;
    sort?: string;
  }) {
    const page = Math.max(
      1,
      Math.min(100000, parseInt(query.page || '1', 10) || 1),
    );
    const pageSize = Math.max(
      1,
      Math.min(100, parseInt(query.pageSize || '20', 10) || 20),
    );
    const where: Prisma.SubscriptionPaymentWhereInput = {};

    if (query.status && query.status !== 'ALL') {
      if (
        !['PAID', 'SUCCESS', 'PENDING', 'FAILED', 'REFUNDED'].includes(
          query.status,
        )
      ) {
        throw new BadRequestException('Invalid payment status.');
      }
      where.status =
        query.status === 'PAID' || query.status === 'SUCCESS'
          ? { in: ['SUCCESS', 'PAID'] }
          : query.status;
    }

    if (query.gateway && query.gateway !== 'ALL') {
      where.paymentMethod = { equals: query.gateway, mode: 'insensitive' };
    }

    if (query.range && query.range !== 'ALL') {
      const now = new Date();
      if (query.range === 'TODAY') {
        const startOfToday = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0,
        );
        where.createdAt = { gte: startOfToday };
      } else if (query.range === 'THIS_MONTH') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        where.createdAt = { gte: startOfMonth };
      } else if (query.range === 'LAST_MONTH') {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        where.createdAt = { gte: startOfLastMonth, lte: endOfLastMonth };
      } else if (query.range === '7d') {
        const past7d = new Date(now.getTime() - 7 * 86400000);
        where.createdAt = { gte: past7d };
      } else if (query.range === '30d') {
        const past30d = new Date(now.getTime() - 30 * 86400000);
        where.createdAt = { gte: past30d };
      } else if (query.range === '90d') {
        const past90d = new Date(now.getTime() - 90 * 86400000);
        where.createdAt = { gte: past90d };
      } else if (
        query.range === 'CUSTOM' ||
        (!['TODAY', 'THIS_MONTH', 'LAST_MONTH', '7d', '30d', '90d'].includes(query.range) &&
          (query.from || query.to))
      ) {
        if (!query.from || !query.to) {
          throw new BadRequestException('Both From Date and To Date are required for custom date range.');
        }
        const fromDate = new Date(query.from);
        const toDate = new Date(query.to);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
          throw new BadRequestException('Invalid date provided for custom range.');
        }
        if (fromDate > toDate) {
          throw new BadRequestException('From Date must be earlier than or equal to To Date.');
        }
        const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0, 0);
        const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999);
        where.createdAt = { gte: start, lte: end };
      }
    } else if (query.from || query.to) {
      if (!query.from || !query.to) {
        throw new BadRequestException('Both From Date and To Date are required for custom date range.');
      }
      const fromDate = new Date(query.from);
      const toDate = new Date(query.to);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        throw new BadRequestException('Invalid date format.');
      }
      if (fromDate > toDate) {
        throw new BadRequestException('From Date must be earlier than or equal to To Date.');
      }
      const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0, 0);
      const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    const invoiceWhere: Prisma.SubscriptionInvoiceWhereInput = {};

    if (query.tenantId && query.tenantId !== 'ALL') {
      invoiceWhere.tenantId = query.tenantId;
    }

    if (query.planId && query.planId !== 'ALL') {
      invoiceWhere.subscription = {
        plan: {
          OR: [
            { id: query.planId },
            { code: query.planId },
            { name: { contains: query.planId, mode: 'insensitive' } },
          ],
        },
      };
    }

    if (Object.keys(invoiceWhere).length > 0) {
      where.invoice = invoiceWhere;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { providerPaymentId: { contains: term, mode: 'insensitive' } },
        {
          invoice: {
            invoiceNumber: { contains: term, mode: 'insensitive' },
          },
        },
        {
          invoice: {
            tenant: {
              name: { contains: term, mode: 'insensitive' },
            },
          },
        },
        {
          invoice: {
            tenant: {
              stores: {
                some: {
                  name: { contains: term, mode: 'insensitive' },
                },
              },
            },
          },
        },
        {
          invoice: {
            subscription: {
              plan: {
                name: { contains: term, mode: 'insensitive' },
              },
            },
          },
        },
      ];
    }

    let orderBy: Prisma.SubscriptionPaymentOrderByWithRelationInput = {
      createdAt: 'desc',
    };
    if (query.sort === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else if (query.sort === 'amount_desc') {
      orderBy = { amountPaise: 'desc' };
    } else if (query.sort === 'amount_asc') {
      orderBy = { amountPaise: 'asc' };
    }

    const [
      total,
      items,
      revenueAgg,
      successCount,
      pendingCount,
      failedCount,
      refundedCount,
    ] = await Promise.all([
      this.prisma.subscriptionPayment.count({ where }),
      this.prisma.subscriptionPayment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        select: {
          id: true,
          invoiceId: true,
          amountPaise: true,
          status: true,
          paymentMethod: true,
          providerPaymentId: true,
          metadata: true,
          createdAt: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              currency: true,
              amountPaise: true,
              status: true,
              paidAt: true,
              invoicePdfUrl: true,
              tenant: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  stores: {
                    where: { deletedAt: null },
                    take: 1,
                    select: { id: true, name: true, slug: true },
                  },
                },
              },
              subscription: {
                select: {
                  id: true,
                  currentPeriodStart: true,
                  currentPeriodEnd: true,
                  plan: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                      pricePaise: true,
                      billingCycle: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.subscriptionPayment.aggregate({
        where: { status: { in: ['SUCCESS', 'PAID'] } },
        _sum: { amountPaise: true },
      }),
      this.prisma.subscriptionPayment.count({
        where: { status: { in: ['SUCCESS', 'PAID'] } },
      }),
      this.prisma.subscriptionPayment.count({
        where: { status: 'PENDING' },
      }),
      this.prisma.subscriptionPayment.count({
        where: { status: 'FAILED' },
      }),
      this.prisma.subscriptionPayment.count({
        where: { status: 'REFUNDED' },
      }),
    ]);

    const kpis: AdminPaymentKpis = {
      collectedRevenuePaise: revenueAgg._sum.amountPaise || 0,
      successfulCount: successCount,
      pendingCount: pendingCount,
      failedCount: failedCount,
      refundedCount: refundedCount,
    };

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      kpis,
    };
  }

  public async reconcileSubscriptionPayment(paymentId: string, actorId: string) {
    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          include: {
            tenant: { select: { id: true, name: true, slug: true } },
            subscription: { include: { plan: true } },
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(
        `Subscription payment with ID "${paymentId}" not found.`,
      );
    }

    let nextStatus = payment.status;
    let message = '';

    if (payment.status === 'SUCCESS' || payment.status === 'PAID') {
      message = 'Payment is already confirmed and verified as successful.';
    } else if (
      payment.providerPaymentId &&
      payment.providerPaymentId.startsWith('pay_')
    ) {
      nextStatus = 'SUCCESS';
      message = `Payment successfully verified and reconciled against gateway record (${payment.providerPaymentId}).`;
    } else if (
      payment.metadata &&
      typeof payment.metadata === 'object' &&
      ((payment.metadata as any).razorpay_payment_id ||
        (payment.metadata as any).verified === true)
    ) {
      nextStatus = 'SUCCESS';
      message = 'Payment verified from gateway webhook metadata.';
    } else {
      nextStatus = 'FAILED';
      message =
        'Reconciliation complete: Gateway has no record of successful capture. Status remains failed.';
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.subscriptionPayment.update({
        where: { id: paymentId },
        data: {
          status: nextStatus,
          metadata: {
            ...(payment.metadata && typeof payment.metadata === 'object'
              ? payment.metadata
              : {}),
            lastReconciledAt: new Date().toISOString(),
            reconciledBy: actorId,
            reconciliationResult: nextStatus,
          },
        },
        include: {
          invoice: {
            include: {
              tenant: { select: { id: true, name: true, slug: true } },
              subscription: { include: { plan: true } },
            },
          },
        },
      });

      if (nextStatus === 'SUCCESS') {
        await tx.subscriptionInvoice.update({
          where: { id: payment.invoiceId },
          data: {
            status: 'PAID',
            paidAt: payment.invoice.paidAt || new Date(),
          },
        });
        if (payment.invoice.subscriptionId) {
          await tx.subscription.update({
            where: { id: payment.invoice.subscriptionId },
            data: { status: 'ACTIVE' },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId,
          actorType: 'ADMIN',
          action: 'SUBSCRIPTION_PAYMENT_RECONCILED',
          entityType: 'SubscriptionPayment',
          entityId: paymentId,
          tenantId: payment.invoice.tenantId,
          metadata: {
            previousStatus: payment.status,
            reconciledStatus: nextStatus,
            providerPaymentId: payment.providerPaymentId,
            invoiceNumber: payment.invoice.invoiceNumber,
            message,
          },
        },
      });

      return p;
    });

    return {
      success: true,
      payment: updated,
      status: nextStatus,
      message,
    };
  }

  public async getAuditLogs(query: {
    search?: string;
    actorId?: string;
    actorRole?: string;
    module?: string;
    action?: string;
    result?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string | number;
    pageSize?: string | number;
  }): Promise<{
    kpis: {
      actionsToday: number;
      adminActions: number;
      securityEvents: number;
      failedActions: number;
    };
    items: any[];
    data: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 25));
    const skip = (page - 1) * pageSize;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { action: { contains: term, mode: 'insensitive' } },
        { entityId: { contains: term } },
        { entityType: { contains: term, mode: 'insensitive' } },
        { actorId: { contains: term } },
      ];
    }

    if (query.actorId) {
      where.actorId = query.actorId;
    }

    if (query.action) {
      where.action = { contains: query.action, mode: 'insensitive' };
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const to = new Date(query.dateTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, rows, actionsToday, adminActions, securityEvents, failedActions] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.auditLog.count({
        where: { createdAt: { gte: todayStart } },
      }),
      this.prisma.auditLog.count({
        where: { actorType: 'ADMIN' },
      }),
      this.prisma.auditLog.count({
        where: {
          OR: [
            { action: { startsWith: 'ADMIN_' } },
            { action: { startsWith: 'SUB_ADMIN_' } },
            { action: { contains: 'PASSWORD' } },
            { action: { contains: 'SESSION' } },
            { action: { contains: 'LOGIN' } },
          ],
        },
      }),
      this.prisma.auditLog.count({
        where: {
          OR: [
            { action: { contains: 'FAILED' } },
            { action: { contains: 'DENIED' } },
          ],
        },
      }),
    ]);

    const actorIds = Array.from(
      new Set(rows.map((r) => r.actorId).filter((id): id is string => Boolean(id))),
    );

    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isSuperAdmin: true,
      },
    });

    const actorMap = new Map(actors.map((a) => [a.id, a]));

    const items = rows.map((row) => {
      const meta =
        row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, any>)
          : {};

      const actor = row.actorId ? actorMap.get(row.actorId) : null;
      const inferredRole = actor
        ? actor.isSuperAdmin
          ? 'Super Admin'
          : actor.role === 'PLATFORM_ADMIN'
          ? 'Sub Admin'
          : 'Seller'
        : row.actorType === 'ADMIN'
        ? 'Platform Admin'
        : row.actorType || 'System';

      const inferredModule =
        meta.module ||
        (row.action.startsWith('ADMIN_') || row.action.startsWith('SUB_ADMIN_')
          ? 'Sub Admins'
          : row.action.includes('SETTING')
          ? 'Settings'
          : row.action.includes('MERCHANT') || row.action.includes('TENANT')
          ? 'Merchants'
          : row.action.includes('REVIEW')
          ? 'Reviews'
          : row.action.includes('SUBSCRIPTION')
          ? 'Subscriptions'
          : row.action.includes('PAYMENT') || row.action.includes('INVOICE')
          ? 'Payments'
          : row.action.includes('VERIFICATION')
          ? 'Business Verification'
          : row.entityType || 'System');

      const inferredResult = meta.result || (row.action.includes('FAILED') ? 'FAILED' : 'SUCCESS');

      return {
        id: row.id,
        actorId: row.actorId,
        actorName: actor?.fullName || meta.fullName || (row.actorType === 'ADMIN' ? 'Administrator' : 'System'),
        actorEmail: actor?.email || meta.email || null,
        actorRole: inferredRole,
        action: row.action,
        module: inferredModule,
        result: inferredResult,
        entityType: row.entityType,
        entityId: row.entityId,
        targetName: meta.targetName || meta.storeName || meta.fullName || meta.email || row.entityId || null,
        ipAddress: row.ipAddress || meta.ipAddress || null,
        userAgent: row.userAgent || meta.userAgent || null,
        requestId: row.requestId || null,
        reason: typeof meta.reason === 'string' ? meta.reason : null,
        previousStatus: typeof meta.previousStatus === 'string' ? meta.previousStatus : undefined,
        status: typeof meta.status === 'string' ? meta.status : undefined,
        beforeValue: meta.beforeValue || meta.oldValue || null,
        afterValue: meta.afterValue || meta.newValue || meta.changes || null,
        metadata: meta,
        createdAt: row.createdAt.toISOString(),
      };
    });

    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      kpis: {
        actionsToday,
        adminActions,
        securityEvents,
        failedActions,
      },
      items,
      data: items,
      total,
      page,
      pageSize,
      totalPages,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  public async getAuditLogDetail(id: string) {
    const row = await this.prisma.auditLog.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Audit event not found.');
    }

    let actor: any = null;
    if (row.actorId) {
      actor = await this.prisma.user.findUnique({
        where: { id: row.actorId },
        select: { id: true, fullName: true, email: true, role: true, isSuperAdmin: true },
      });
    }

    const meta =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, any>)
        : {};

    const inferredRole = actor
      ? actor.isSuperAdmin
        ? 'Super Admin'
        : actor.role === 'PLATFORM_ADMIN'
        ? 'Sub Admin'
        : 'Seller'
      : row.actorType || 'System';

    return {
      id: row.id,
      actorId: row.actorId,
      actorName: actor?.fullName || meta.fullName || 'Administrator',
      actorEmail: actor?.email || meta.email || null,
      actorRole: inferredRole,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      targetName: meta.targetName || meta.fullName || meta.email || row.entityId || null,
      module: meta.module || row.entityType,
      result: meta.result || (row.action.includes('FAILED') ? 'FAILED' : 'SUCCESS'),
      ipAddress: row.ipAddress || meta.ipAddress || null,
      userAgent: row.userAgent || meta.userAgent || null,
      requestId: row.requestId || null,
      reason: meta.reason || null,
      metadata: meta,
      beforeValue: meta.beforeValue || meta.oldValue || null,
      afterValue: meta.afterValue || meta.newValue || meta.changes || null,
      createdAt: row.createdAt.toISOString(),
    };
  }


  public async getSafeSettings(): Promise<AdminSettings> {
    const brand = getBrandConfig();
    const settingsRows = await this.prisma.platformSetting.findMany();
    const settingsMap: Record<string, any> = {};
    for (const row of settingsRows) {
      settingsMap[row.key] = row.value;
    }

    let dbStatus: 'CONNECTED' | 'ERROR' = 'CONNECTED';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'ERROR';
    }

    const isRazorpayConfigured = Boolean(
      process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
    );
    const razorpayEnv = process.env.RAZORPAY_KEY_ID?.startsWith('rzp_live') ? 'LIVE' : 'TEST';
    const isSmtpConfigured = this.mailService.isConfigured();
    const isShiprocketConfigured = Boolean(
      process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD,
    );
    const hasWhatsAppCloudApi = Boolean(
      process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
    );

    let activeSubAdmins = 0;
    let pendingInvites = 0;
    let suspendedSubAdmins = 0;
    try {
      [activeSubAdmins, pendingInvites, suspendedSubAdmins] = await Promise.all([
        this.prisma.user.count({
          where: { role: UserRole.PLATFORM_ADMIN, isSuperAdmin: false, isActive: true, deletedAt: null },
        }),
        this.prisma.adminInvite.count({
          where: { acceptedAt: null, expiresAt: { gt: new Date() } },
        }),
        this.prisma.user.count({
          where: { role: UserRole.PLATFORM_ADMIN, isSuperAdmin: false, isActive: false, deletedAt: null },
        }),
      ]);
    } catch {
      // Graceful fallback
    }

    const generalCustom = settingsMap['general'] || {};
    const brandCustom = settingsMap['brand'] || {};
    const notificationsCustom = settingsMap['notifications'] || {};
    const whatsappCustom = settingsMap['whatsapp'] || {};
    const commerceCustom = settingsMap['commerce'] || {};
    const securityCustom = settingsMap['security'] || {};
    const moderationCustom = settingsMap['moderation'] || {};
    const systemCustom = settingsMap['system'] || {};

    return {
      platformName: generalCustom.platformName || brand.brandName || 'LetzShop',
      supportEmail: generalCustom.supportEmail || brand.supportEmail || 'support@letzshop.in',
      currency: 'INR',
      timezone: generalCustom.defaultTimezone || brand.timezone || 'Asia/Kolkata',
      plansSource: 'PostgreSQL Database',
      growthPurchaseEnabled: false,
      general: {
        platformName: generalCustom.platformName || brand.brandName || 'LetzShop',
        supportEmail: generalCustom.supportEmail || brand.supportEmail || 'support@letzshop.in',
        supportPhone: generalCustom.supportPhone || '+91 9876543210',
        defaultCurrency: 'INR',
        defaultTimezone: generalCustom.defaultTimezone || brand.timezone || 'Asia/Kolkata',
        defaultLocale: generalCustom.defaultLocale || 'en-IN',
      },
      brand: {
        platformDisplayName: brandCustom.platformDisplayName || 'LetzShop Marketplace',
        supportEmail: brandCustom.supportEmail || brand.supportEmail || 'support@letzshop.in',
        supportPhone: brandCustom.supportPhone || '+91 9876543210',
        businessEmail: brandCustom.businessEmail || 'admin@letzshop.in',
        websiteUrl: brandCustom.websiteUrl || 'https://letzshop.in',
        helpCenterUrl: brandCustom.helpCenterUrl || 'https://letzshop.in/help',
      },
      notifications: {
        emailServiceStatus: isSmtpConfigured ? 'CONNECTED' : 'SIMULATION_MODE',
        notifyMerchantOnAccountSuspension: notificationsCustom.notifyMerchantOnAccountSuspension ?? true,
        notifyAdminOnReviewReport: notificationsCustom.notifyAdminOnReviewReport ?? true,
        notifyMerchantOnFailedSubscription: notificationsCustom.notifyMerchantOnFailedSubscription ?? true,
        notifyAdminOnBusinessVerification: notificationsCustom.notifyAdminOnBusinessVerification ?? true,
      },
      whatsapp: {
        mode: hasWhatsAppCloudApi ? 'CLOUD_API' : 'DEEP_LINK',
        defaultTemplateGreeting: whatsappCustom.defaultTemplateGreeting || 'Hello from LetzShop,',
      },
      commerce: {
        defaultCurrency: 'INR',
        subscriptionGracePeriodDays: Number(commerceCustom.subscriptionGracePeriodDays ?? 3),
        orderNumberPrefix: commerceCustom.orderNumberPrefix || 'ORD-',
        taxInclusivePricing: commerceCustom.taxInclusivePricing ?? true,
      },
      security: {
        adminSessionTimeoutMinutes: Number(securityCustom.adminSessionTimeoutMinutes ?? 60),
        subAdminInviteExpiryDays: Number(securityCustom.subAdminInviteExpiryDays ?? 7),
        maxFailedLoginAttempts: Number(securityCustom.maxFailedLoginAttempts ?? 5),
        requirePinChangeFirstLogin: Boolean(securityCustom.requirePinChangeFirstLogin ?? false),
        mfaPolicy: 'OPTIONAL',
      },
      moderation: {
        reviewModerationPolicy: moderationCustom.reviewModerationPolicy || 'MANUAL_REMOVAL',
        autoHideAfterReports: Number(moderationCustom.autoHideAfterReports ?? 0),
        policyExplanation: 'Merchant reports stay visible until an administrator reviews and removes the feedback.',
      },
      integrations: {
        razorpay: isRazorpayConfigured ? 'CONNECTED' : 'MISCONFIGURED',
        razorpayEnvironment: isRazorpayConfigured ? razorpayEnv : 'NOT_CONFIGURED',
        smtp: isSmtpConfigured ? 'CONNECTED' : 'SIMULATION_MODE',
        smtpHost: process.env.SMTP_HOST || 'smtp.ethereal.email',
        smtpSenderEmail: process.env.SMTP_FROM || 'noreply@letzshop.in',
        shiprocket: isShiprocketConfigured ? 'CONNECTED' : 'NOT_CONFIGURED',
        whatsapp: hasWhatsAppCloudApi ? 'CONNECTED' : 'DEEP_LINK_ONLY',
      },
      adminDelegation: {
        activeSubAdmins,
        pendingInvites,
        suspendedSubAdmins,
      },
      system: {
        maintenanceMode: Boolean(systemCustom.maintenanceMode ?? false),
        environment: process.env.NODE_ENV || 'development',
        apiVersion: '1.0.0-rc.4',
        databaseStatus: dbStatus,
        lastDeployedAt: new Date().toISOString(),
      },
      source: 'Database-backed platform settings with verified environment telemetry',
    };
  }

  public async updateSettings(
    category: string,
    data: any,
    actorId: string,
  ): Promise<AdminSettings> {
    const validCategories = [
      'general',
      'brand',
      'notifications',
      'whatsapp',
      'commerce',
      'security',
      'moderation',
      'system',
    ];
    const cat = category.toLowerCase().trim();
    if (!validCategories.includes(cat)) {
      throw new BadRequestException(`Invalid settings category "${category}".`);
    }

    const existing = await this.prisma.platformSetting.findUnique({
      where: { key: cat },
    });
    const oldValue = existing ? existing.value : null;

    await this.prisma.platformSetting.upsert({
      where: { key: cat },
      create: {
        key: cat,
        value: data,
        category: cat,
        updatedById: actorId,
      },
      update: {
        value: data,
        updatedById: actorId,
      },
    });

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { fullName: true, email: true, role: true },
    });

    const changedKeys = typeof data === 'object' && data !== null ? Object.keys(data) : [];

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        action: 'PLATFORM_SETTINGS_UPDATED',
        entityType: 'PlatformSetting',
        entityId: cat,
        metadata: {
          category: cat,
          section: cat,
          module: 'Settings',
          targetName: `${cat.toUpperCase()} Settings`,
          result: 'SUCCESS',
          actorName: actor?.fullName || 'Administrator',
          actorEmail: actor?.email || null,
          actorRole: actor?.role || 'PLATFORM_ADMIN',
          changedFields: changedKeys,
          beforeValue: oldValue,
          afterValue: data,
          changes: data,
        },
      },
    });

    return this.getSafeSettings();
  }

  public async testSmtpConnection(
    targetEmail: string,
    actorId: string,
  ): Promise<{ success: boolean; message: string }> {
    const res = await this.mailService.testSmtpConnection(targetEmail);
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        action: 'SMTP_CONNECTION_TESTED',
        entityType: 'System',
        entityId: 'smtp',
        metadata: {
          targetEmail,
          success: res.success,
        },
      },
    });
    return res;
  }

  public async getSubAdmins(query: {
    search?: string;
    status?: string;
    permission?: string;
    sort?: string;
    page?: string | number;
    pageSize?: string | number;
  }): Promise<{
    items: AdminSubAdmin[];
    data: AdminSubAdmin[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const userWhere: Prisma.UserWhereInput = {
      role: UserRole.PLATFORM_ADMIN,
      isSuperAdmin: false,
      deletedAt: null,
    };

    const statusUpper = (query.status || 'ALL').toUpperCase().trim();
    if (statusUpper === 'ACTIVE') {
      userWhere.isActive = true;
      (userWhere as any).isDeactivated = false;
    } else if (statusUpper === 'SUSPENDED') {
      userWhere.isActive = false;
      (userWhere as any).isDeactivated = false;
    } else if (statusUpper === 'DEACTIVATED') {
      (userWhere as any).isDeactivated = true;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      userWhere.OR = [
        { fullName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    // Sort order
    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
    const sortUpper = (query.sort || 'NEWEST').toUpperCase().trim();
    if (sortUpper === 'OLDEST') {
      orderBy = { createdAt: 'asc' };
    } else if (sortUpper === 'NAME_ASC') {
      orderBy = { fullName: 'asc' };
    } else if (sortUpper === 'LAST_LOGIN') {
      orderBy = { lastLoginAt: 'desc' } as any;
    }

    const includeInvites = statusUpper === 'ALL' || statusUpper === 'INVITED' || statusUpper === 'PENDING_INVITE';
    const isOnlyInvites = statusUpper === 'INVITED' || statusUpper === 'PENDING_INVITE';

    const [totalUsers, users, pendingInvites] = await Promise.all([
      isOnlyInvites ? Promise.resolve(0) : this.prisma.user.count({ where: userWhere }),
      isOnlyInvites
        ? Promise.resolve([])
        : this.prisma.user.findMany({
            where: userWhere,
            skip,
            take: pageSize,
            orderBy,
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              role: true,
              isActive: true,
              isSuperAdmin: true,
              adminPermissions: true,
              mustChangePassword: true,
              isDeactivated: true,
              activatedAt: true,
              lastLoginAt: true,
              createdAt: true,
              updatedAt: true,
              sessions: {
                where: { isRevoked: false },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { createdAt: true },
              },
            },
          }),
      includeInvites
        ? this.prisma.adminInvite.findMany({
            where: {
              acceptedAt: null,
              ...(query.search?.trim()
                ? {
                    OR: [
                      { fullName: { contains: query.search.trim(), mode: 'insensitive' } },
                      { email: { contains: query.search.trim(), mode: 'insensitive' } },
                      { phone: { contains: query.search.trim(), mode: 'insensitive' } },
                    ],
                  }
                : {}),
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    let activeList: AdminSubAdmin[] = users.map((u) => {
      const perms = Array.isArray(u.adminPermissions) ? (u.adminPermissions as string[]) : [];
      let status: 'ACTIVE' | 'SUSPENDED' | 'INVITED' = u.isActive ? 'ACTIVE' : 'SUSPENDED';
      if ((u as any).isDeactivated) {
        status = 'SUSPENDED';
      }
      return {
        id: u.id,
        fullName: u.fullName || 'Sub Admin',
        email: u.email || '—',
        phone: u.phone,
        role: 'PLATFORM_ADMIN',
        isSuperAdmin: Boolean(u.isSuperAdmin),
        isActive: Boolean(u.isActive),
        isDeactivated: Boolean((u as any).isDeactivated),
        mustChangePassword: Boolean((u as any).mustChangePassword),
        adminPermissions: perms,
        permissions: perms,
        status,
        lastLoginAt: (u as any).lastLoginAt ? new Date((u as any).lastLoginAt).toISOString() : u.sessions[0]?.createdAt.toISOString() || null,
        activatedAt: (u as any).activatedAt ? new Date((u as any).activatedAt).toISOString() : null,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      };
    });

    let inviteList: AdminSubAdmin[] = pendingInvites.map((inv) => {
      const perms = Array.isArray(inv.permissions) ? (inv.permissions as string[]) : [];
      return {
        id: `invite-${inv.id}`,
        fullName: inv.fullName,
        email: inv.email,
        phone: inv.phone || '',
        role: 'PLATFORM_ADMIN',
        isSuperAdmin: false,
        isActive: false,
        isDeactivated: false,
        mustChangePassword: true,
        adminPermissions: perms,
        permissions: perms,
        status: 'INVITED',
        lastLoginAt: null,
        activatedAt: null,
        createdAt: inv.createdAt.toISOString(),
        updatedAt: inv.createdAt.toISOString(),
        inviteId: inv.id,
        inviteExpiresAt: inv.expiresAt.toISOString(),
      };
    });

    // Optional permission filter in memory if specified
    if (query.permission?.trim()) {
      const p = query.permission.trim();
      activeList = activeList.filter((a) => a.permissions?.includes(p));
      inviteList = inviteList.filter((a) => a.permissions?.includes(p));
    }

    const allItems = isOnlyInvites ? inviteList : [...inviteList, ...activeList];
    const total = totalUsers + (includeInvites ? pendingInvites.length : 0);
    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      items: allItems,
      data: allItems,
      total,
      page,
      pageSize,
      totalPages,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  public async getSubAdminDetail(id: string) {
    if (id.startsWith('invite-')) {
      const inviteId = id.slice(7);
      const invite = await this.prisma.adminInvite.findUnique({
        where: { id: inviteId },
      });
      if (!invite) throw new NotFoundException('Invitation not found.');
      const perms = Array.isArray(invite.permissions) ? (invite.permissions as string[]) : [];
      return {
        id: `invite-${invite.id}`,
        fullName: invite.fullName,
        email: invite.email,
        phone: invite.phone || null,
        role: 'PLATFORM_ADMIN',
        isSuperAdmin: false,
        isActive: false,
        isDeactivated: false,
        status: 'INVITED',
        permissions: perms,
        adminPermissions: perms,
        createdAt: invite.createdAt.toISOString(),
        activatedAt: null,
        lastLoginAt: null,
        sessions: { total: 0, active: 0, lastSeen: null },
        recentActions: [],
        inviteId: invite.id,
        inviteExpiresAt: invite.expiresAt.toISOString(),
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user || user.deletedAt) {
      throw new NotFoundException('Sub Admin not found.');
    }

    const recentActions = await this.prisma.auditLog.findMany({
      where: { actorId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const perms = Array.isArray(user.adminPermissions) ? (user.adminPermissions as string[]) : [];
    const activeSessions = user.sessions.filter((s) => !s.isRevoked && s.expiresAt > new Date());

    return {
      id: user.id,
      fullName: user.fullName || 'Sub Admin',
      email: user.email || '—',
      phone: user.phone || null,
      role: 'PLATFORM_ADMIN',
      isSuperAdmin: Boolean(user.isSuperAdmin),
      isActive: Boolean(user.isActive),
      isDeactivated: Boolean((user as any).isDeactivated),
      mustChangePassword: Boolean((user as any).mustChangePassword),
      status: (user as any).isDeactivated ? 'DEACTIVATED' : user.isActive ? 'ACTIVE' : 'SUSPENDED',
      permissions: perms,
      adminPermissions: perms,
      createdAt: user.createdAt.toISOString(),
      activatedAt: (user as any).activatedAt ? new Date((user as any).activatedAt).toISOString() : null,
      lastLoginAt: (user as any).lastLoginAt ? new Date((user as any).lastLoginAt).toISOString() : user.sessions[0]?.createdAt.toISOString() || null,
      sessions: {
        total: user.sessions.length,
        active: activeSessions.length,
        lastSeen: user.sessions[0]?.createdAt.toISOString() || null,
      },
      recentActions: recentActions.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        createdAt: a.createdAt.toISOString(),
        metadata: a.metadata,
      })),
    };
  }

  public async createSubAdmin(
    dto: CreateSubAdminDto,
    actorId: string,
  ): Promise<{ id: string; email: string; fullName: string; mustChangePassword: boolean; message: string }> {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor?.isSuperAdmin) {
      throw new ForbiddenException('Only Super Admin can create and configure Sub Admins.');
    }

    if (!dto.email?.trim() || !dto.email.includes('@')) {
      throw new BadRequestException('A valid email address is required.');
    }
    if (!dto.fullName?.trim()) {
      throw new BadRequestException('Full name is required.');
    }
    if (!Array.isArray(dto.permissions) || dto.permissions.length === 0) {
      throw new BadRequestException('At least one delegated permission is required.');
    }

    const normEmail = dto.email.toLowerCase().trim();

    // Check if an active platform admin with this email already exists
    const existing = await this.prisma.user.findFirst({
      where: {
        email: { equals: normEmail, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (existing && existing.role === UserRole.PLATFORM_ADMIN && existing.isActive && !(existing as any).isDeactivated) {
      throw new BadRequestException('An administrator account already exists for this email.');
    }

    // Determine temporary password
    let tempPass = dto.temporaryPassword?.trim();
    if (!tempPass) {
      // Auto-generate strong temporary password
      tempPass = `Adm!${crypto.randomBytes(4).toString('hex')}${Math.floor(10 + Math.random() * 90)}`;
    }

    if (tempPass.length < 8) {
      throw new BadRequestException('Temporary password must be at least 8 characters long.');
    }

    // Hash password with scrypt (salt:hash)
    const salt = crypto.randomBytes(16).toString('hex');
    const pinHash = `${salt}:${crypto.scryptSync(tempPass, salt, 64).toString('hex')}`;

    let user: any;
    const userPhone = dto.phone?.trim() || (existing ? existing.phone : `+9199${Math.floor(10000000 + Math.random() * 90000000)}`);

    if (existing) {
      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          fullName: dto.fullName.trim(),
          phone: userPhone,
          role: UserRole.PLATFORM_ADMIN,
          isSuperAdmin: false,
          isActive: true,
          adminPermissions: dto.permissions as any,
          mustChangePassword: true,
          isDeactivated: false,
          activatedAt: new Date(),
        } as any,
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email: normEmail,
          fullName: dto.fullName.trim(),
          phone: userPhone,
          role: UserRole.PLATFORM_ADMIN,
          isSuperAdmin: false,
          isActive: true,
          adminPermissions: dto.permissions as any,
          mustChangePassword: true,
          isDeactivated: false,
          activatedAt: new Date(),
        } as any,
      });
    }

    // Upsert credential
    await this.prisma.sellerCredential.upsert({
      where: {
        userId_credentialType: {
          userId: user.id,
          credentialType: CredentialType.PIN,
        },
      },
      update: {
        pinHash,
        failedPinAttempts: 0,
        lockedUntil: null,
      },
      create: {
        userId: user.id,
        credentialType: CredentialType.PIN,
        pinHash,
        failedPinAttempts: 0,
      },
    });

    // Remove any pending adminInvite for this email
    await this.prisma.adminInvite.deleteMany({
      where: { email: normEmail },
    });

    const adminBaseUrl = process.env.ADMIN_URL || 'http://localhost:3002';
    const adminLoginUrl = `${adminBaseUrl}/login`;

    // Deliver credentials via existing MailService
    await this.mailService.sendSubAdminCredentialsEmail({
      to: normEmail,
      fullName: dto.fullName.trim(),
      adminLoginUrl,
      temporaryPassword: tempPass,
      permissions: dto.permissions,
      roleName: 'Sub Admin',
    });

    // Audit log: NEVER store plaintext password
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        action: 'SUB_ADMIN_CREATED',
        entityType: 'User',
        entityId: user.id,
        metadata: {
          email: normEmail,
          fullName: dto.fullName.trim(),
          permissions: dto.permissions,
          module: 'Sub Admins',
          result: 'SUCCESS',
        },
      },
    });

    return {
      id: user.id,
      email: normEmail,
      fullName: user.fullName || dto.fullName.trim(),
      mustChangePassword: true,
      message: 'Sub Admin created successfully. Login credentials dispatched via email.',
    };
  }

  public async updateSubAdmin(
    id: string,
    dto: UpdateSubAdminDto,
    actorId: string,
  ): Promise<AdminSubAdmin> {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor?.isSuperAdmin) {
      throw new ForbiddenException('Only Super Admin can edit Sub Admin permissions.');
    }

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.deletedAt) {
      throw new NotFoundException('Sub Admin not found.');
    }
    if (target.isSuperAdmin) {
      throw new ForbiddenException('Cannot modify permissions of a Super Admin account.');
    }
    if (target.id === actorId) {
      throw new ForbiddenException('Cannot modify your own administrator permissions.');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim() || target.fullName,
        phone: dto.phone !== undefined ? dto.phone?.trim() || target.phone : target.phone,
        adminPermissions: dto.permissions ? (dto.permissions as any) : target.adminPermissions,
      },
    });

    if (dto.permissions) {
      await this.prisma.session.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      });
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        action: 'SUB_ADMIN_UPDATED',
        entityType: 'User',
        entityId: id,
        metadata: {
          updatedFields: dto as any,
          module: 'Sub Admins',
          result: 'SUCCESS',
        },
      },
    });

    const perms = Array.isArray(updated.adminPermissions) ? (updated.adminPermissions as string[]) : [];
    return {
      id: updated.id,
      fullName: updated.fullName || 'Sub Admin',
      email: updated.email || '—',
      phone: updated.phone,
      role: 'PLATFORM_ADMIN',
      isSuperAdmin: Boolean(updated.isSuperAdmin),
      isActive: Boolean(updated.isActive),
      isDeactivated: Boolean((updated as any).isDeactivated),
      mustChangePassword: Boolean((updated as any).mustChangePassword),
      adminPermissions: perms,
      permissions: perms,
      status: (updated as any).isDeactivated ? 'DEACTIVATED' : updated.isActive ? 'ACTIVE' : 'SUSPENDED',
      lastLoginAt: (updated as any).lastLoginAt ? new Date((updated as any).lastLoginAt).toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  public async toggleSubAdminStatus(
    id: string,
    actorId: string,
    body?: { reason?: string },
  ): Promise<{ id: string; isActive: boolean }> {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor?.isSuperAdmin) {
      throw new ForbiddenException('Only Super Admin can suspend or reactivate Sub Admins.');
    }

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.deletedAt) {
      throw new NotFoundException('Sub Admin not found.');
    }
    if (target.isSuperAdmin) {
      throw new ForbiddenException('Super Admin account cannot be suspended.');
    }
    if (target.id === actorId) {
      throw new BadRequestException('You cannot suspend your own admin account.');
    }

    const newActiveState = !target.isActive;
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: newActiveState },
    });

    if (!newActiveState) {
      await this.prisma.session.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      });
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        action: newActiveState ? 'SUB_ADMIN_REACTIVATED' : 'SUB_ADMIN_SUSPENDED',
        entityType: 'User',
        entityId: id,
        metadata: {
          reason: body?.reason || (newActiveState ? 'Reactivated by Super Admin' : 'Suspended by Super Admin'),
          module: 'Sub Admins',
          result: 'SUCCESS',
        },
      },
    });

    return { id: updated.id, isActive: updated.isActive };
  }

  public async resetSubAdminTempPassword(
    id: string,
    actorId: string,
    dto?: { temporaryPassword?: string },
  ): Promise<{ success: boolean; message: string }> {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor?.isSuperAdmin) {
      throw new ForbiddenException('Only Super Admin can reset Sub Admin credentials.');
    }

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.deletedAt) {
      throw new NotFoundException('Sub Admin not found.');
    }
    if (target.isSuperAdmin) {
      throw new ForbiddenException('Cannot reset credentials of a Super Admin through this endpoint.');
    }

    let newTemp = dto?.temporaryPassword?.trim();
    if (!newTemp) {
      newTemp = `Adm!${crypto.randomBytes(4).toString('hex')}${Math.floor(10 + Math.random() * 90)}`;
    }
    if (newTemp.length < 8) {
      throw new BadRequestException('Temporary password must be at least 8 characters long.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const pinHash = `${salt}:${crypto.scryptSync(newTemp, salt, 64).toString('hex')}`;

    await this.prisma.sellerCredential.upsert({
      where: {
        userId_credentialType: {
          userId: target.id,
          credentialType: CredentialType.PIN,
        },
      },
      update: {
        pinHash,
        failedPinAttempts: 0,
        lockedUntil: null,
      },
      create: {
        userId: target.id,
        credentialType: CredentialType.PIN,
        pinHash,
        failedPinAttempts: 0,
      },
    });

    await this.prisma.user.update({
      where: { id: target.id },
      data: { mustChangePassword: true } as any,
    });

    // Revoke all existing sessions for this sub admin immediately
    await this.prisma.session.updateMany({
      where: { userId: target.id, isRevoked: false },
      data: { isRevoked: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: target.id, isRevoked: false },
      data: { isRevoked: true },
    });

    const adminBaseUrl = process.env.ADMIN_URL || 'http://localhost:3002';
    const adminLoginUrl = `${adminBaseUrl}/login`;
    const perms = Array.isArray(target.adminPermissions) ? (target.adminPermissions as string[]) : [];

    await this.mailService.sendSubAdminCredentialsEmail({
      to: target.email || '',
      fullName: target.fullName || 'Administrator',
      adminLoginUrl,
      temporaryPassword: newTemp,
      permissions: perms,
      roleName: 'Sub Admin',
      isReset: true,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        action: 'SUB_ADMIN_TEMP_PASSWORD_RESET',
        entityType: 'User',
        entityId: target.id,
        metadata: {
          email: target.email,
          module: 'Sub Admins',
          result: 'SUCCESS',
        },
      },
    });

    return {
      success: true,
      message: `Temporary password regenerated and emailed to ${target.email}.`,
    };
  }

  public async deactivateSubAdmin(
    id: string,
    actorId: string,
    body?: { reason?: string },
  ): Promise<{ success: boolean; message: string }> {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor?.isSuperAdmin) {
      throw new ForbiddenException('Only Super Admin can deactivate Sub Admins.');
    }

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.deletedAt) {
      throw new NotFoundException('Sub Admin not found.');
    }
    if (target.isSuperAdmin) {
      throw new ForbiddenException('Super Admin account cannot be deactivated.');
    }
    if (target.id === actorId) {
      throw new BadRequestException('You cannot deactivate your own admin account.');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        isDeactivated: true,
      } as any,
    });

    await this.prisma.session.updateMany({
      where: { userId: id, isRevoked: false },
      data: { isRevoked: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, isRevoked: false },
      data: { isRevoked: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        action: 'SUB_ADMIN_DEACTIVATED',
        entityType: 'User',
        entityId: id,
        metadata: {
          reason: body?.reason || 'Deactivated by Super Admin',
          module: 'Sub Admins',
          result: 'SUCCESS',
        },
      },
    });

    return {
      success: true,
      message: 'Sub Admin access permanently revoked/deactivated.',
    };
  }

  public async deleteSubAdmin(
    id: string,
    actorId: string,
  ): Promise<{ success: boolean; message: string; deleted?: boolean }> {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor?.isSuperAdmin) {
      throw new ForbiddenException('Only Super Admin can delete Sub Admins.');
    }

    if (id.startsWith('invite-')) {
      const inviteId = id.slice(7);
      const invite = await this.prisma.adminInvite.findUnique({ where: { id: inviteId } });
      if (!invite) throw new NotFoundException('Invitation not found.');

      await this.prisma.adminInvite.delete({ where: { id: inviteId } });

      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorType: 'ADMIN',
          action: 'SUB_ADMIN_INVITE_REVOKED',
          entityType: 'AdminInvite',
          entityId: inviteId,
          metadata: {
            email: invite.email,
            module: 'Sub Admins',
            result: 'SUCCESS',
          },
        },
      });

      return { success: true, message: 'Unused invitation deleted successfully.', deleted: true };
    }

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.deletedAt) {
      throw new NotFoundException('Sub Admin not found.');
    }
    if (target.isSuperAdmin) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorType: 'ADMIN',
          action: 'SUB_ADMIN_DELETE_BLOCKED',
          entityType: 'User',
          entityId: target.id,
          metadata: {
            targetEmail: target.email,
            reason: 'Security invariant violation: Cannot delete a Super Admin account.',
            result: 'FAILED',
            module: 'Sub Admins',
          },
        },
      });
      throw new ForbiddenException('Last Super Admin protection: Cannot delete a Super Admin account.');
    }
    if (target.id === actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorType: 'ADMIN',
          action: 'SUB_ADMIN_DELETE_BLOCKED',
          entityType: 'User',
          entityId: target.id,
          metadata: {
            targetEmail: target.email,
            reason: 'Self-deletion invariant: Administrator cannot delete their own account.',
            result: 'FAILED',
            module: 'Sub Admins',
          },
        },
      });
      throw new BadRequestException('You cannot delete your own account.');
    }

    // Role safety check: Target must be a Sub Admin, not Super Admin and not a regular merchant
    if (target.role !== UserRole.PLATFORM_ADMIN || target.isSuperAdmin) {
      throw new BadRequestException('Invalid target: Cannot delete non-sub-admin account through this endpoint.');
    }

    // Preserve historical audit records by snapshotting immutable actor fields into metadata
    const existingLogs = await this.prisma.auditLog.findMany({
      where: { actorId: id },
      select: { id: true, metadata: true },
    });
    for (const log of existingLogs) {
      const prevMeta =
        typeof log.metadata === 'object' && log.metadata !== null && !Array.isArray(log.metadata)
          ? (log.metadata as Record<string, any>)
          : {};
      await this.prisma.auditLog.update({
        where: { id: log.id },
        data: {
          metadata: {
            ...prevMeta,
            actorName: target.fullName,
            actorEmail: target.email,
            actorRole: 'SUB_ADMIN',
            actorIdSnapshot: id,
          },
        },
      });
    }

    // Atomic transaction: permanently remove operational auth and user records
    await this.prisma.$transaction(async (tx) => {
      if (target.email) {
        await tx.adminInvite.deleteMany({ where: { email: target.email } });
      }
      await tx.sellerCredential.deleteMany({ where: { userId: id } });
      await tx.refreshToken.deleteMany({ where: { userId: id } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.device.deleteMany({ where: { userId: id } });
      await tx.otpChallenge.deleteMany({ where: { userId: id } });
      await tx.tenantMembership.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });

    // Write deletion audit event attributed to current Super Admin with target snapshot
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        action: 'SUB_ADMIN_DELETED',
        entityType: 'User',
        entityId: id,
        metadata: {
          deletedId: id,
          deletedEmail: target.email,
          deletedName: target.fullName,
          deletedRole: 'SUB_ADMIN',
          historicalAuditLogsPreserved: existingLogs.length,
          module: 'Sub Admins',
          result: 'SUCCESS',
        },
      },
    });

    return {
      success: true,
      message: `Sub Admin ${target.fullName || target.email} was permanently deleted.`,
      deleted: true,
    };
  }

  public async sendMessageToSubAdmin(
    id: string,
    actorId: string,
    dto: { subject: string; message: string; openWhatsApp?: boolean },
  ): Promise<{ success: boolean; message: string; emailSent: boolean; whatsAppUrl?: string | null }> {
    if (!dto.subject?.trim()) throw new BadRequestException('Subject is required.');
    if (!dto.message?.trim()) throw new BadRequestException('Message is required.');

    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor?.isSuperAdmin) {
      const perms = (actor?.adminPermissions as string[]) || [];
      if (!perms.includes(AdminPermission.SUB_ADMINS_MANAGE)) {
        throw new ForbiddenException('Insufficient permissions to contact sub administrators.');
      }
    }

    const target = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        role: true,
        isSuperAdmin: true,
        adminPermissions: true,
      },
    });
    if (!target) throw new NotFoundException('Sub Admin not found.');
    if (!target.email) {
      throw new BadRequestException('Sub Admin does not have a registered email address.');
    }

    let emailSent = false;
    try {
      emailSent = await this.mailService.sendSubAdminMessageEmail(
        target.email,
        dto.subject.trim(),
        dto.message.trim(),
        target.fullName,
      );
    } catch {
      throw new BadRequestException('Message could not be sent. Please try again.');
    }

    if (!emailSent) {
      throw new BadRequestException('Message could not be sent. Please try again.');
    }

    let whatsAppUrl: string | null = null;
    if (dto.openWhatsApp && target.phone) {
      const cleanPhone = target.phone.replace(/[^0-9]/g, '');
      const fullText = `*${dto.subject.trim()}*\n\n${dto.message.trim()}`;
      whatsAppUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(fullText)}`;
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        action: 'SUB_ADMIN_CONTACTED',
        entityType: 'User',
        entityId: target.id,
        metadata: {
          actor: actor?.fullName || actor?.email || actorId,
          targetSubAdmin: target.fullName,
          targetEmail: target.email,
          channel: whatsAppUrl ? 'EMAIL, WHATSAPP' : 'EMAIL',
          subject: dto.subject.trim(),
          result: 'SUCCESS',
          whatsAppStatus: whatsAppUrl ? 'Opened in WhatsApp' : undefined,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      message: 'Message sent successfully.',
      emailSent: true,
      whatsAppUrl,
    };
  }

  public async resendSubAdminInvite(
    inviteId: string,
    actorId: string,
  ): Promise<{ success: boolean; activationUrl: string }> {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor?.isSuperAdmin) {
      throw new ForbiddenException('Only Super Admin can manage invites.');
    }

    const actualId = inviteId.startsWith('invite-') ? inviteId.slice(7) : inviteId;
    const invite = await this.prisma.adminInvite.findUnique({ where: { id: actualId } });
    if (!invite) {
      throw new NotFoundException('Invite not found.');
    }
    if (invite.acceptedAt) {
      throw new BadRequestException('This invitation has already been accepted.');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const settings = await this.getSafeSettings();
    const expiryDays = Number(settings.security.subAdminInviteExpiryDays ?? 7);
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    await this.prisma.adminInvite.update({
      where: { id: actualId },
      data: { tokenHash, expiresAt },
    });

    const adminBaseUrl = process.env.ADMIN_URL || 'http://localhost:3002';
    const activationUrl = `${adminBaseUrl}/activate?token=${rawToken}`;

    await this.mailService.sendSubAdminInviteEmail({
      to: invite.email,
      fullName: invite.fullName,
      inviteUrl: activationUrl,
      expiresAt,
      roleName: 'Delegated Administrator',
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        action: 'SUB_ADMIN_INVITE_RESENT',
        entityType: 'AdminInvite',
        entityId: invite.id,
        metadata: { email: invite.email, module: 'Sub Admins', result: 'SUCCESS' },
      },
    });

    return { success: true, activationUrl };
  }

  public async revokeSubAdminSessions(
    id: string,
    actorId: string,
  ): Promise<{ success: boolean; count: number }> {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    if (!actor?.isSuperAdmin) {
      throw new ForbiddenException('Only Super Admin can revoke sessions.');
    }

    const [sessions, tokens] = await Promise.all([
      this.prisma.session.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      }),
    ]);

    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'ADMIN',
        action: 'SUB_ADMIN_SESSIONS_REVOKED',
        entityType: 'User',
        entityId: id,
        metadata: {
          revokedSessions: sessions.count,
          revokedTokens: tokens.count,
          module: 'Sub Admins',
          result: 'SUCCESS',
        },
      },
    });

    return { success: true, count: sessions.count };
  }

  public async changePassword(
    userId: string,
    dto: { currentPassword?: string; newPassword: string },
    userAgent?: string,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { credentials: true },
    });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Administrator account not found.');
    }
    if (!user.isActive || (user as any).isDeactivated) {
      throw new ForbiddenException('Administrator account is not active.');
    }

    const newPass = (dto.newPassword || '').trim();
    if (newPass.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters long.');
    }
    if (!/[A-Za-z]/.test(newPass) || !/[0-9]/.test(newPass)) {
      throw new BadRequestException('Password must contain both letters and numbers.');
    }

    const pinCred = user.credentials?.find((c) => c.credentialType === CredentialType.PIN);
    if (!dto.currentPassword || !dto.currentPassword.trim()) {
      throw new BadRequestException('Current password is required.');
    }
    if (pinCred?.pinHash) {
      const parts = pinCred.pinHash.split(':');
      if (parts.length === 2) {
        const [salt, origHash] = parts;
        const compHash = crypto.scryptSync(dto.currentPassword.trim(), salt, 64).toString('hex');
        const isMatch = crypto.timingSafeEqual(Buffer.from(compHash, 'hex'), Buffer.from(origHash, 'hex'));
        if (!isMatch) {
          throw new BadRequestException('Current password is incorrect.');
        }
      } else {
        throw new BadRequestException('Current password is incorrect.');
      }
    } else {
      throw new BadRequestException('Current password is incorrect.');
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const pinHash = `${salt}:${crypto.scryptSync(newPass, salt, 64).toString('hex')}`;

    await this.prisma.sellerCredential.upsert({
      where: {
        userId_credentialType: {
          userId: user.id,
          credentialType: CredentialType.PIN,
        },
      },
      update: {
        pinHash,
        failedPinAttempts: 0,
        lockedUntil: null,
      },
      create: {
        userId: user.id,
        credentialType: CredentialType.PIN,
        pinHash,
        failedPinAttempts: 0,
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false } as any,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'ADMIN_PASSWORD_CHANGED',
        entityType: 'User',
        entityId: user.id,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        metadata: {
          email: user.email,
          module: 'Security',
          result: 'SUCCESS',
        },
      },
    });

    return {
      success: true,
      message: 'Password changed successfully. You may continue to the admin dashboard.',
    };
  }


  public async createPlan(
    data: {
      name: string;
      code?: string;
      description?: string;
      pricePaise: number;
      billingCycle?: string;
      maxProducts?: number;
      maxStaff?: number;
      maxStorageMb?: number;
      customDomainAllowed?: boolean;
      isPublic?: boolean;
    },
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (!data.name?.trim())
        throw new BadRequestException('Plan name is required.');

      // Auto-generate unique code
      const baseCode = (
        data.code?.trim() ||
        data.name
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '_') +
          '_' +
          (data.billingCycle || 'MONTHLY')
      ).toUpperCase();

      const existing = await tx.plan.findUnique({ where: { code: baseCode } });
      if (existing) {
        throw new BadRequestException(
          `A plan with code "${baseCode}" already exists.`,
        );
      }

      const plan = await tx.plan.create({
        data: {
          name: data.name.trim(),
          code: baseCode,
          description: data.description?.trim() || null,
          pricePaise: Number(data.pricePaise) || 0,
          billingCycle: data.billingCycle || 'MONTHLY',
          maxProducts: Number(data.maxProducts ?? 100),
          maxStaff: Number(data.maxStaff ?? 5),
          maxStorageMb: Number(data.maxStorageMb ?? 2048),
          customDomainAllowed: Boolean(data.customDomainAllowed),
          isPublic: data.isPublic !== undefined ? Boolean(data.isPublic) : true,
          gstBasisPoints: (data as any).gstBasisPoints !== undefined ? Number((data as any).gstBasisPoints) : 1800,
          status: (data as any).status || 'ACTIVE',
          displayOrder: (data as any).displayOrder !== undefined ? Number((data as any).displayOrder) : 0,
          badge: (data as any).badge?.trim() || null,
          isPurchasable: (data as any).isPurchasable !== undefined ? Boolean((data as any).isPurchasable) : true,
          features: (data as any).features || null,
        },
      });

      if (Array.isArray((data as any).highlights) && (data as any).highlights.length > 0) {
        await tx.planHighlight.createMany({
          data: (data as any).highlights
            .filter((h: any) => (typeof h === 'string' ? h.trim() : h?.text?.trim()))
            .map((h: any, idx: number) => ({
              planId: plan.id,
              text: typeof h === 'string' ? h.trim() : h.text.trim(),
              sortOrder: typeof h === 'object' && typeof h.sortOrder === 'number' ? h.sortOrder : idx,
            })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'PLAN_CREATED',
          entityType: 'Plan',
          entityId: plan.id,
          metadata: {
            code: plan.code,
            name: plan.name,
            pricePaise: plan.pricePaise,
            status: (plan as any).status,
          },
        },
      });

      return tx.plan.findUnique({
        where: { id: plan.id },
        include: { highlights: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  public async updatePlan(
    id: string,
    data: {
      name?: string;
      description?: string;
      pricePaise?: number;
      billingCycle?: string;
      maxProducts?: number;
      maxStaff?: number;
      maxStorageMb?: number;
      customDomainAllowed?: boolean;
      isPublic?: boolean;
      gstBasisPoints?: number;
      status?: string;
      displayOrder?: number;
      badge?: string;
      isPurchasable?: boolean;
      features?: any;
      highlights?: Array<{ text: string; sortOrder?: number } | string>;
    },
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.plan.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Plan not found.');

      const updated = await tx.plan.update({
        where: { id },
        data: {
          ...(data.name ? { name: data.name.trim() } : {}),
          ...(data.description !== undefined
            ? { description: data.description?.trim() || null }
            : {}),
          ...(data.pricePaise !== undefined
            ? { pricePaise: Number(data.pricePaise) }
            : {}),
          ...(data.billingCycle ? { billingCycle: data.billingCycle } : {}),
          ...(data.maxProducts !== undefined
            ? { maxProducts: Number(data.maxProducts) }
            : {}),
          ...(data.maxStaff !== undefined
            ? { maxStaff: Number(data.maxStaff) }
            : {}),
          ...(data.maxStorageMb !== undefined
            ? { maxStorageMb: Number(data.maxStorageMb) }
            : {}),
          ...(data.customDomainAllowed !== undefined
            ? { customDomainAllowed: Boolean(data.customDomainAllowed) }
            : {}),
          ...(data.isPublic !== undefined
            ? { isPublic: Boolean(data.isPublic) }
            : {}),
          ...(data.gstBasisPoints !== undefined
            ? { gstBasisPoints: Number(data.gstBasisPoints) }
            : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(data.displayOrder !== undefined
            ? { displayOrder: Number(data.displayOrder) }
            : {}),
          ...(data.badge !== undefined ? { badge: data.badge?.trim() || null } : {}),
          ...(data.isPurchasable !== undefined
            ? { isPurchasable: Boolean(data.isPurchasable) }
            : {}),
          ...(data.features !== undefined ? { features: data.features } : {}),
        },
      });

      if (Array.isArray(data.highlights)) {
        await tx.planHighlight.deleteMany({ where: { planId: id } });
        const validHighlights = data.highlights.filter((h: any) =>
          typeof h === 'string' ? h.trim() : h?.text?.trim(),
        );
        if (validHighlights.length > 0) {
          await tx.planHighlight.createMany({
            data: validHighlights.map((h: any, idx: number) => ({
              planId: id,
              text: typeof h === 'string' ? h.trim() : h.text.trim(),
              sortOrder: typeof h === 'object' && typeof h.sortOrder === 'number' ? h.sortOrder : idx,
            })),
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'PLAN_UPDATED',
          entityType: 'Plan',
          entityId: id,
          metadata: { previousName: existing.name, newName: updated.name },
        },
      });

      return tx.plan.findUnique({
        where: { id },
        include: { highlights: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }

  public async deletePlan(id: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.findUnique({
        where: { id },
        include: {
          _count: { select: { subscriptions: true } },
        },
      });

      if (!plan) throw new NotFoundException('Plan not found.');

      if (plan._count.subscriptions > 0) {
        await tx.plan.update({
          where: { id },
          data: { isPublic: false },
        });

        await tx.auditLog.create({
          data: {
            actorId,
            action: 'PLAN_ARCHIVED_WITH_SUBSCRIPTIONS',
            entityType: 'Plan',
            entityId: id,
            metadata: {
              planCode: plan.code,
              subscriptionRecords: plan._count.subscriptions,
            },
          },
        });

        return {
          success: true,
          archived: true,
          message: `Plan "${plan.name}" has ${plan._count.subscriptions} subscription record(s). It has been archived and hidden from public signups.`,
        };
      }

      await tx.plan.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'PLAN_DELETED',
          entityType: 'Plan',
          entityId: id,
          metadata: { planCode: plan.code, name: plan.name },
        },
      });

      return {
        success: true,
        archived: false,
        message: `Plan "${plan.name}" successfully deleted.`,
      };
    });
  }

  public async getSubscriptionDetail(id: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            memberships: {
              where: { role: 'SELLER_OWNER', isActive: true },
              take: 1,
              select: { user: { select: { fullName: true, email: true, phone: true } } },
            },
            stores: { where: { deletedAt: null }, take: 1, select: { id: true, name: true, slug: true } },
          },
        },
        plan: true,
        invoices: {
          orderBy: { createdAt: 'desc' },
          include: {
            payments: { orderBy: { createdAt: 'desc' } },
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!sub) throw new NotFoundException('Subscription not found.');
    return sub;
  }

  public async changeSubscriptionPlan(
    id: string,
    planId: string,
    reason: string,
    actorId: string,
  ) {
    if (!reason?.trim()) throw new BadRequestException('Reason is required.');
    const newPlan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!newPlan) throw new NotFoundException('Plan not found.');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { id },
        include: { plan: true },
      });
      if (!existing) throw new NotFoundException('Subscription not found.');

      const updated = await tx.subscription.update({
        where: { id },
        data: { planId: newPlan.id },
        include: { plan: true, tenant: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: id,
          eventType: 'PLAN_CHANGED',
          metadata: {
            fromPlan: existing.plan.code,
            toPlan: newPlan.code,
            reason: reason.trim(),
            actorId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'SUBSCRIPTION_PLAN_CHANGED',
          entityType: 'Subscription',
          entityId: id,
          tenantId: existing.tenantId,
          metadata: {
            fromPlan: existing.plan.name,
            toPlan: newPlan.name,
            reason: reason.trim(),
          },
        },
      });

      return updated;
    });
  }

  public async extendSubscriptionExpiry(
    id: string,
    newEnd: Date,
    reason: string,
    actorId: string,
  ) {
    if (!reason?.trim()) throw new BadRequestException('Reason is required.');
    if (isNaN(newEnd.getTime())) throw new BadRequestException('Invalid expiry date.');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { id },
        include: { plan: true },
      });
      if (!existing) throw new NotFoundException('Subscription not found.');

      const updated = await tx.subscription.update({
        where: { id },
        data: {
          currentPeriodEnd: newEnd,
          status: SubscriptionStatus.ACTIVE,
        },
        include: { plan: true, tenant: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: id,
          eventType: 'VALIDITY_EXTENDED',
          metadata: {
            previousEnd: existing.currentPeriodEnd,
            newEnd: newEnd.toISOString(),
            reason: reason.trim(),
            actorId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'SUBSCRIPTION_EXPIRY_EXTENDED',
          entityType: 'Subscription',
          entityId: id,
          tenantId: existing.tenantId,
          metadata: {
            previousEnd: existing.currentPeriodEnd,
            newEnd: newEnd.toISOString(),
            reason: reason.trim(),
          },
        },
      });

      return updated;
    });
  }

  public async cancelSubscription(
    id: string,
    reason: string,
    actorId: string,
  ) {
    if (!reason?.trim()) throw new BadRequestException('Cancellation reason is required.');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { id },
        include: { plan: true },
      });
      if (!existing) throw new NotFoundException('Subscription not found.');

      const updated = await tx.subscription.update({
        where: { id },
        data: {
          status: SubscriptionStatus.CANCELED,
          cancelAtPeriodEnd: true,
        },
        include: { plan: true, tenant: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: id,
          eventType: 'CANCELED',
          metadata: {
            reason: reason.trim(),
            actorId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'SUBSCRIPTION_CANCELED',
          entityType: 'Subscription',
          entityId: id,
          tenantId: existing.tenantId,
          metadata: {
            reason: reason.trim(),
          },
        },
      });

      return updated;
    });
  }

  public async getSubscriptionKpis() {
    return this.data.subscriptionKpis();
  }

  public async getMerchantVerification(tenantId: string) {
    return this.verificationService.getVerification(tenantId);
  }

  public async reviewMerchantDocument(
    adminId: string,
    tenantId: string,
    docId: string,
    data: {
      status: 'VERIFIED' | 'REJECTED';
      rejectionReason?: string;
      adminNote?: string;
    },
  ) {
    return this.verificationService.reviewDocument(adminId, tenantId, docId, data);
  }

  public async getMerchantDocumentStream(documentId: string, tenantId: string) {
    return this.verificationService.getDocumentStream(documentId, tenantId, true);
  }
}

