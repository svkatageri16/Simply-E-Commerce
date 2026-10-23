import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { subscriptionPrice } from './subscription-price';
import { planAvailability } from './plan-policy';
import {
  PrismaClient,
  Prisma,
  SubscriptionStatus,
  StoreStatus,
} from '@prisma/client';

export const MONTHLY_SUBSCRIPTION_DAYS = 30;

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaClient) {}

  public async getTenantSubscription(tenantId: string) {
    return this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { 
        plan: true, 
        invoices: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' } }
      },
    });
  }

  public async getAvailablePlans() {
    const plans = await this.prisma.plan.findMany({
      include: {
        highlights: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Canonical sort: displayOrder first, then numeric prices ascending, Contact/Custom placed strictly last
    const sorted = [...plans].sort((a, b) => {
      const aOrder = (a as any).displayOrder || 0;
      const bOrder = (b as any).displayOrder || 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const isCustomA = (a.code || '').toUpperCase().includes('CUSTOM') || a.pricePaise <= 0;
      const isCustomB = (b.code || '').toUpperCase().includes('CUSTOM') || b.pricePaise <= 0;
      if (isCustomA && !isCustomB) return 1;
      if (!isCustomA && isCustomB) return -1;
      return a.pricePaise - b.pricePaise;
    });

    return sorted
      .filter((p) => p.isPublic && planAvailability(p).availability !== 'HIDDEN')
      .map((p) => ({
        ...p,
        ...subscriptionPrice(p.pricePaise, String(p.gstBasisPoints / 100)),
        // Current subscription activation and renewal use a 30-day monthly period.
        billingPeriodDays: p.billingCycle === 'MONTHLY' ? MONTHLY_SUBSCRIPTION_DAYS : null,
        availability: planAvailability(p).availability === 'AVAILABLE' ? 'PURCHASABLE' : planAvailability(p).availability === 'CONTACT_SALES' ? 'CONTACT' : planAvailability(p).availability,
        purchasable: planAvailability(p).purchasable,
        isComingSoon: planAvailability(p).availability === 'COMING_SOON',
      }));
  }

  /**
   * Activates or renews a merchant's subscription.
   * Restores public store access immediately.
   */
  public async activateOrRenewSubscription(
    tenantId: string,
    planId: string,
    durationDays = MONTHLY_SUBSCRIPTION_DAYS,
    actorId?: string,
    transaction?: Prisma.TransactionClient
  ) {
    const db = transaction || this.prisma;
    const plan = await db.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Subscription plan not found.');

    const now = new Date();
    let currentPeriodStart = now;
    const currentPeriodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const activate = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
      // 1. Upsert or create subscription
      const existing = await tx.subscription.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });

      let subscription;
      // A paid renewal extends remaining access rather than discarding it.
      if (existing?.status === SubscriptionStatus.ACTIVE && existing.currentPeriodEnd > now) {
        currentPeriodStart = new Date(existing.currentPeriodEnd);
        currentPeriodEnd.setTime(existing.currentPeriodEnd.getTime() + durationDays * 86400000);
      }
      if (existing) {
        subscription = await tx.subscription.update({
          where: { id: existing.id },
          data: {
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart,
            currentPeriodEnd,
          },
        });
      } else {
        subscription = await tx.subscription.create({
          data: {
            tenantId,
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart,
            currentPeriodEnd,
          },
        });
      }

      // 2. Record subscription event
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: existing ? 'RENEWED' : 'ACTIVATED',
          metadata: { planCode: plan.code, durationDays, pricePaise: plan.pricePaise },
        },
      });

      // 3. Mark stores LIVE and publicly accessible
      await tx.store.updateMany({
        where: { tenantId, deletedAt: null },
        data: {
          status: StoreStatus.LIVE,
          isPubliclyAccessible: true,
        },
      });

      // 4. Record Audit Log
      await tx.auditLog.create({
        data: {
          actorId: actorId || 'SYSTEM',
          actorType: actorId ? 'USER' : 'SYSTEM',
          tenantId,
          action: existing ? 'SUBSCRIPTION_RENEWED' : 'SUBSCRIPTION_ACTIVATED',
          entityType: 'Subscription',
          entityId: subscription.id,
          metadata: { planCode: plan.code, currentPeriodEnd: currentPeriodEnd.toISOString() },
        },
      });

      return subscription;
    };

    const result = transaction ? await activate(transaction) : await this.prisma.$transaction(activate);

    return result;
  }

  /**
   * Development-only direct activation endpoint.
   * Produces explicit audit log indicating DEV activation.
   */
  public async devActivateSubscription(
    tenantId: string,
    planId: string,
    durationDays = MONTHLY_SUBSCRIPTION_DAYS,
    actorId?: string
  ) {
    const result = await this.activateOrRenewSubscription(tenantId, planId, durationDays, actorId);
    
    // Explicit DEV audit log entry
    await this.prisma.auditLog.create({
      data: {
        actorId: actorId || 'DEV_USER',
        actorType: 'USER',
        tenantId,
        action: 'DEV_SUBSCRIPTION_ACTIVATED',
        entityType: 'Subscription',
        entityId: result.id,
        metadata: {
          mode: 'DEVELOPMENT_SIMULATION',
          planId,
          durationDays,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return result;
  }

  /**
   * Immediately marks subscription CANCELED and restricts merchant store to PRIVATE_PREVIEW
   * following a full SaaS subscription refund.
   * Disables public checkout/share access, preserves all seller products, media, branding, and data.
   * Writes an immutable audit log.
   */
  public async refundAndDeactivateSubscription(
    tenantId: string,
    reason = 'Full subscription refund processed',
    actorId = 'SYSTEM',
    metadata?: Record<string, any>
  ) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return this.prisma.$transaction(async (tx) => {
      let updatedSub = null;
      if (sub) {
        updatedSub = await tx.subscription.update({
          where: { id: sub.id },
          data: { status: SubscriptionStatus.CANCELED },
        });

        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: sub.id,
            eventType: 'CANCELLED_REFUNDED',
            metadata: { reason, ...metadata },
          },
        });
      }

      // Immediately set merchant stores to PRIVATE_PREVIEW and isPubliclyAccessible = false
      // Preserves all seller products, media, branding, and data intact (never deleted)
      await tx.store.updateMany({
        where: { tenantId, deletedAt: null },
        data: {
          status: StoreStatus.PRIVATE_PREVIEW,
          isPubliclyAccessible: false,
        },
      });

      // Write immutable audit log
      await tx.auditLog.create({
        data: {
          actorId,
          actorType: 'SYSTEM',
          tenantId,
          action: 'SUBSCRIPTION_REFUNDED_STORE_DEACTIVATED',
          entityType: 'Subscription',
          entityId: sub?.id || tenantId,
          metadata: {
            reason,
            previousStatus: sub?.status,
            storeStatus: StoreStatus.PRIVATE_PREVIEW,
            isPubliclyAccessible: false,
            dataPreserved: true,
            ...metadata,
          },
        },
      });

      return updatedSub;
    });
  }

  /**
   * Immediately marks subscription EXPIRED and pauses public store access without deleting data.
   */
  public async expireSubscription(subscriptionId: string, reason = 'Billing cycle expired') {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { tenant: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found.');

    return this.prisma.$transaction(async (tx) => {
      const updatedSub = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.EXPIRED },
      });

      // Pause public store access immediately; NEVER delete merchant data
      await tx.store.updateMany({
        where: { tenantId: sub.tenantId },
        data: {
          status: StoreStatus.PRIVATE_PREVIEW,
          isPubliclyAccessible: false,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          eventType: 'EXPIRED',
          metadata: { reason },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: 'SYSTEM',
          actorType: 'SYSTEM',
          tenantId: sub.tenantId,
          action: 'SUBSCRIPTION_EXPIRED',
          entityType: 'Subscription',
          entityId: subscriptionId,
          metadata: { reason },
        },
      });

      return updatedSub;
    });
  }

  /**
   * SuperAdmin action: Force overrides store visibility status and logs security audit trail.
   */
  public async adminOverrideStoreVisibility(
    storeId: string,
    forceLive: boolean,
    adminUserId: string,
    reason: string
  ) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('A descriptive audit reason is required for administrative overrides.');
    }

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('Store not found.');

    return this.prisma.$transaction(async (tx) => {
      const updatedStore = await tx.store.update({
        where: { id: storeId },
        data: {
          status: forceLive ? StoreStatus.LIVE : StoreStatus.SUSPENDED,
          isPubliclyAccessible: forceLive,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminUserId,
          actorType: 'ADMIN',
          tenantId: store.tenantId,
          storeId: store.id,
          action: forceLive ? 'ADMIN_OVERRIDE_STORE_LIVE' : 'ADMIN_STORE_SUSPENDED',
          entityType: 'Store',
          entityId: store.id,
          metadata: { reason, previousStatus: store.status, newStatus: updatedStore.status },
        },
      });

      return updatedStore;
    });
  }
}
