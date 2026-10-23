import { Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionVisibilityService } from '../subscriptions/subscription-visibility.service';
import { PrismaClient, OrderStatus, PaymentStatus, ProductStatus, StoreStatus, VariantStatus } from '@prisma/client';
import { normalizeIndianState, normalizeCityName } from '@simply/validation';
import {
  parseDashboardPeriod,
  formatIstDate,
  formatIstHour,
  formatIstMonth,
} from '../../common/utils/timezone.util';

export interface DashboardQueryParams {
  period?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaClient, private readonly visibility: SubscriptionVisibilityService) {}

  public async getDashboardAnalytics(
    tenantId: string,
    storeId: string,
    params: DashboardQueryParams = {}
  ) {
    // 1. Resolve period boundaries in Asia/Kolkata timezone
    const period = parseDashboardPeriod(params.period, params.startDate, params.endDate);

    // 2. Fetch Store, Branding, Subscription & Integration Posture
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId, deletedAt: null },
      include: {
        branding: true,
        themeConfigs: true,
        tenant: {
          include: {
            subscriptions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { plan: true },
            },
            paymentAccounts: {
              where: { isEnabled: true },
              take: 1,
            },
            shippingAccounts: {
              where: { isEnabled: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!store) {
      throw new NotFoundException('Store not found for current tenant.');
    }

    // 3. Parallel Database Aggregations for Performance
    const [
      currentOrders,
      previousOrders,
      currentEnquiriesCount,
      previousEnquiriesCount,
      currentEnquiriesRaw,
      pendingOrdersCount,
      lowStockCount,
      activeProductsCount,
      shippingProfilesCount,
      recentOrdersRaw,
    ] = await Promise.all([
      // Current period orders
      this.prisma.order.findMany({
        where: {
          tenantId,
          storeId,
          createdAt: { gte: period.startDate, lte: period.endDate },
        },
        select: {
          id: true,
          orderNumber: true,
          totalPaise: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          orderAddress: {
            select: {
              state: true,
              city: true,
            },
          },
          shipmentStatus: true,
          fulfillmentStatus: true,
          customerId: true,
          deliveryAddress: true,
          createdAt: true,
          customer: {
            select: {
              id: true,
              fullName: true,
              phone: true,
            },
          },
          items: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              productName: true,
              quantity: true,
              unitPricePaise: true,
              totalPaise: true,
              variant: {
                select: {
                  productId: true,
                  sku: true,
                  product: {
                    select: {
                      id: true,
                      name: true,
                      media: {
                        take: 1,
                        orderBy: { sortOrder: 'asc' },
                        select: { publicUrl: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Previous period orders (for comparative percentages)
      this.prisma.order.findMany({
        where: {
          tenantId,
          storeId,
          createdAt: { gte: period.previousStartDate, lte: period.previousEndDate },
        },
        select: {
          id: true,
          totalPaise: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          customerId: true,
          createdAt: true,
          customer: {
            select: {
              id: true,
              fullName: true,
              phone: true,
            },
          },
        },
      }),

      // Enquiries in current period (return 0 honestly if enquiry persistence not yet in schema)
      (this.prisma as any).enquiry?.count
        ? (this.prisma as any).enquiry.count({
            where: {
              tenantId,
              storeId,
              createdAt: { gte: period.startDate, lte: period.endDate },
            },
          })
        : Promise.resolve(0),

      // Enquiries in previous period
      (this.prisma as any).enquiry?.count
        ? (this.prisma as any).enquiry.count({
            where: {
              tenantId,
              storeId,
              createdAt: { gte: period.previousStartDate, lte: period.previousEndDate },
            },
          })
        : Promise.resolve(0),

      // Enquiries list for current period time-series sparkline
      (this.prisma as any).enquiry?.findMany
        ? (this.prisma as any).enquiry.findMany({
            where: {
              tenantId,
              storeId,
              createdAt: { gte: period.startDate, lte: period.endDate },
            },
            select: {
              id: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),

      // Pending seller action orders
      this.prisma.order.count({
        where: {
          tenantId,
          storeId,
          status: { in: [OrderStatus.NEW, OrderStatus.CONFIRMED, OrderStatus.ACCEPTED] },
        },
      }),

      // Low stock variants (canonical threshold <= 5, excluding deleted/inactive variants and deleted products)
      this.prisma.inventory?.count
        ? this.prisma.inventory.count({
            where: {
              tenantId,
              storeId,
              stockOnHand: { lte: 5 },
              variant: {
                deletedAt: null,
                status: VariantStatus.ACTIVE,
                product: {
                  deletedAt: null,
                },
              },
            },
          })
        : Promise.resolve(0),

      // Active seller products
      this.prisma.product.count({
        where: {
          tenantId,
          storeId,
          status: ProductStatus.PUBLISHED,
          deletedAt: null,
        },
      }),

      // Shipping profiles count
      this.prisma.shippingProfile.count({
        where: {
          tenantId,
          storeId,
        },
      }),

      // Recent 5 orders for dashboard list
      this.prisma.order.findMany({
        where: {
          tenantId,
          storeId,
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          totalPaise: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          createdAt: true,
          customer: {
            select: {
              fullName: true,
              phone: true,
            },
          },
        },
      }),
    ]);

    // 4. Calculate Core Metrics with Strict Domain Semantics
    // Eligible orders for revenue: PaymentStatus.PAID and status NOT CANCELLED or RETURNED
    const eligibleCurrentOrders = currentOrders.filter(
      (o) =>
        o.paymentStatus === PaymentStatus.PAID &&
        o.status !== OrderStatus.CANCELLED &&
        o.status !== OrderStatus.RETURNED
    );

    const eligiblePrevOrders = previousOrders.filter(
      (o) =>
        o.paymentStatus === PaymentStatus.PAID &&
        o.status !== OrderStatus.CANCELLED &&
        o.status !== OrderStatus.RETURNED
    );

    const revenuePaise = eligibleCurrentOrders.reduce((sum, o) => sum + o.totalPaise, 0);
    const prevRevenuePaise = eligiblePrevOrders.reduce((sum, o) => sum + o.totalPaise, 0);

    // Eligible order count (all created non-cancelled orders)
    const validCurrentOrders = currentOrders.filter((o) => o.status !== OrderStatus.CANCELLED);
    const validPrevOrders = previousOrders.filter((o) => o.status !== OrderStatus.CANCELLED);
    const ordersCount = validCurrentOrders.length;
    const prevOrdersCount = validPrevOrders.length;

    // Unique customers in current period
    const getOrderBuyerKey = (o: any): string =>
      o.customerId || o.customerPhone || o.customer?.phone || o.customerName || o.id;

    const currentCustomerIds = new Set(
      eligibleCurrentOrders.map(getOrderBuyerKey).filter(Boolean)
    );
    const customersCount = currentCustomerIds.size;
    const prevCustomerIds = new Set(
      eligiblePrevOrders.map(getOrderBuyerKey).filter(Boolean)
    );
    const prevCustomersCount = prevCustomerIds.size;

    // Average Order Value
    const averageOrderValuePaise =
      eligibleCurrentOrders.length > 0
        ? Math.round(revenuePaise / eligibleCurrentOrders.length)
        : 0;

    const prevAverageOrderValuePaise =
      eligiblePrevOrders.length > 0
        ? Math.round(prevRevenuePaise / eligiblePrevOrders.length)
        : 0;

    // Helper for safe percentage calculation (handle 0 safely; return null if no prior data)
    const calcPercent = (current: number, previous: number): number | null => {
      if (previous <= 0) return null;
      const pct = ((current - previous) / previous) * 100;
      if (!isFinite(pct) || isNaN(pct)) return null;
      return Number(pct.toFixed(1));
    };

    // Customer Insights (New vs Returning & Top Buyers)
    const customerInsights = await this.buildCustomerInsights(
      tenantId,
      storeId,
      eligibleCurrentOrders,
      period.startDate
    );

    const prevCustomerInsights = await this.buildCustomerInsights(
      tenantId,
      storeId,
      eligiblePrevOrders,
      period.previousStartDate
    );

    const comparison = {
      revenuePercent: calcPercent(revenuePaise, prevRevenuePaise),
      ordersPercent: calcPercent(ordersCount, prevOrdersCount),
      aovPercent: calcPercent(averageOrderValuePaise, prevAverageOrderValuePaise),
      repeatRatePercent: calcPercent(customerInsights.repeatRate, prevCustomerInsights.repeatRate),
      repeatRateDelta: Number((customerInsights.repeatRate - prevCustomerInsights.repeatRate).toFixed(1)),
      enquiriesPercent: calcPercent(currentEnquiriesCount, previousEnquiriesCount),
      customersPercent: calcPercent(customersCount, prevCustomersCount),
    };

    // 5. Generate Pre-Aggregated Time-Series Sales Data
    const salesSeries = this.buildSalesSeries(eligibleCurrentOrders, period, currentEnquiriesRaw);

    // 6. Top 5 Products by Revenue and Quantity
    const topProducts = this.buildTopProducts(eligibleCurrentOrders);

    // 7. Geographic Analytics (Sales by Location)
    const { states: topLocations, cities: topCities } = this.buildTopLocations(eligibleCurrentOrders, revenuePaise);

    // 8. Order / Payment Mix
    const paymentMix = this.buildPaymentMix(eligibleCurrentOrders, revenuePaise);

    // 9. Format Recent Orders
    const recentOrders = recentOrdersRaw.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customer?.fullName || 'Guest Buyer',
      customerPhone: o.customer?.phone || '',
      totalPaise: o.totalPaise,
      paymentStatus: o.paymentStatus,
      status: o.status,
      fulfillmentStatus: o.fulfillmentStatus,
      createdAt: o.createdAt.toISOString(),
    }));

    // 10. Needs Attention genuine actionable posture
    const activeSub = store.tenant.subscriptions[0];
    const publicVisibility = await this.visibility.getEffectivePublicStatus(store.id);
    const isSubscriptionValid = !publicVisibility.requiresPayment;

    const attention = {
      pendingOrders: pendingOrdersCount,
      lowStock: lowStockCount,
      shippingSetupIncomplete:
        shippingProfilesCount === 0 || store.tenant.shippingAccounts.length === 0,
      paymentSetupIncomplete: store.tenant.paymentAccounts.length === 0,
      subscriptionRequiresAction: !isSubscriptionValid,
      publicStoreUnavailable: !publicVisibility.isPublic,
    };

    // Store state
    let effectiveStoreStatus: string = store.status;
    if (store.status === StoreStatus.LIVE && !isSubscriptionValid) {
      effectiveStoreStatus = 'EXPIRED';
    }

    return {
      period: {
        key: period.key,
        label: period.label,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
      },
      metrics: {
        revenuePaise,
        orders: ordersCount,
        enquiries: currentEnquiriesCount,
        customers: customersCount,
        pendingOrders: pendingOrdersCount,
        lowStock: lowStockCount,
        activeProducts: activeProductsCount,
        averageOrderValuePaise,
      },
      comparison,
      salesSeries,
      topProducts,
      customerInsights,
      topLocations,
      topCities,
      paymentMix,
      recentOrders,
      attention,
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        status: effectiveStoreStatus,
        isPubliclyAccessible: store.isPubliclyAccessible,
        previewSecret: store.previewSecret,
        timezone: store.timezone,
        branding: store.branding,
        themeConfigs: store.themeConfigs,
        subscription: activeSub ? {
          id: activeSub.id,
          status: activeSub.status,
          currentPeriodStart: activeSub.currentPeriodStart,
          currentPeriodEnd: activeSub.currentPeriodEnd,
          plan: activeSub.plan ? {
            id: activeSub.plan.id,
            code: activeSub.plan.code,
            name: activeSub.plan.name,
            pricePaise: activeSub.plan.pricePaise,
          } : null,
        } : null,
        publicVisibility,
      },
    };
  }

  /**
   * Builds smooth, pre-aggregated, zero-filled time series buckets in Asia/Kolkata
   */
  private buildSalesSeries(
    eligibleOrders: any[],
    period: { key: string; groupBy: 'hour' | 'day' | 'week' | 'month'; startDate: Date; endDate: Date },
    enquiries: any[] = []
  ) {
    interface Bucket {
      date: string;
      label: string;
      revenuePaise: number;
      orders: number;
      customers?: number;
      aovPaise?: number;
      enquiries?: number;
    }

    const bucketMap = new Map<string, Bucket>();
    const customerBucketMap = new Map<string, Set<string>>();

    const recordOrder = (bucketKey: string, order: any) => {
      const bucket = bucketMap.get(bucketKey);
      if (bucket) {
        bucket.revenuePaise += order.totalPaise;
        bucket.orders += 1;
        const buyerKey = order.customerId || order.customerPhone || order.customer?.phone || order.customer?.fullName || order.id;
        if (buyerKey) {
          if (!customerBucketMap.has(bucketKey)) {
            customerBucketMap.set(bucketKey, new Set());
          }
          customerBucketMap.get(bucketKey)!.add(buyerKey);
        }
      }
    };

    const recordEnquiry = (bucketKey: string) => {
      const bucket = bucketMap.get(bucketKey);
      if (bucket) {
        bucket.enquiries = (bucket.enquiries || 0) + 1;
      }
    };

    if (period.groupBy === 'hour') {
      // 24 hours: 00:00 to 23:00
      for (let h = 0; h < 24; h++) {
        const hourStr = `${String(h).padStart(2, '0')}:00`;
        bucketMap.set(hourStr, {
          date: hourStr,
          label: hourStr,
          revenuePaise: 0,
          orders: 0,
          enquiries: 0,
        });
      }

      for (const order of eligibleOrders) {
        const hourKey = formatIstHour(order.createdAt);
        recordOrder(hourKey, order);
      }

      for (const enq of enquiries) {
        const hourKey = formatIstHour(enq.createdAt);
        recordEnquiry(hourKey);
      }
    } else if (period.groupBy === 'day') {
      // Continuous days from startDate to endDate
      const cur = new Date(period.startDate);
      while (cur <= period.endDate) {
        const dateKey = formatIstDate(cur);
        if (!bucketMap.has(dateKey)) {
          // Label like "12 Oct"
          const istCur = new Date(cur.getTime() + (5 * 60 + 30) * 60 * 1000);
          const monthShort = istCur.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
          const dayNum = istCur.getUTCDate();
          bucketMap.set(dateKey, {
            date: dateKey,
            label: `${dayNum} ${monthShort}`,
            revenuePaise: 0,
            orders: 0,
            enquiries: 0,
          });
        }
        cur.setDate(cur.getDate() + 1);
      }

      for (const order of eligibleOrders) {
        const dateKey = formatIstDate(order.createdAt);
        recordOrder(dateKey, order);
      }

      for (const enq of enquiries) {
        const dateKey = formatIstDate(enq.createdAt);
        recordEnquiry(dateKey);
      }
    } else if (period.groupBy === 'month') {
      // Month buckets from start month to end month (inclusive in Asia/Kolkata timezone)
      const istStart = new Date(period.startDate.getTime() + (5 * 60 + 30) * 60 * 1000);
      const istEnd = new Date(period.endDate.getTime() + (5 * 60 + 30) * 60 * 1000);
      let curYear = istStart.getUTCFullYear();
      let curMonth = istStart.getUTCMonth();
      const endYear = istEnd.getUTCFullYear();
      const endMonth = istEnd.getUTCMonth();

      while (curYear < endYear || (curYear === endYear && curMonth <= endMonth)) {
        const monthKey = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
        const tempDate = new Date(Date.UTC(curYear, curMonth, 1));
        const monthLabel = tempDate.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
        bucketMap.set(monthKey, {
          date: monthKey,
          label: monthLabel,
          revenuePaise: 0,
          orders: 0,
          enquiries: 0,
        });

        curMonth++;
        if (curMonth > 11) {
          curMonth = 0;
          curYear++;
        }
      }

      for (const order of eligibleOrders) {
        const monthKey = formatIstMonth(order.createdAt);
        if (bucketMap.has(monthKey)) {
          recordOrder(monthKey, order);
        } else {
          const lastKey = Array.from(bucketMap.keys()).pop();
          if (lastKey) recordOrder(lastKey, order);
        }
      }

      for (const enq of enquiries) {
        const monthKey = formatIstMonth(enq.createdAt);
        if (bucketMap.has(monthKey)) {
          recordEnquiry(monthKey);
        } else {
          const lastKey = Array.from(bucketMap.keys()).pop();
          if (lastKey) recordEnquiry(lastKey);
        }
      }
    } else {
      // Weekly buckets
      const cur = new Date(period.startDate);
      let weekNum = 1;
      while (cur <= period.endDate) {
        const weekKey = formatIstDate(cur);
        bucketMap.set(weekKey, {
          date: weekKey,
          label: `W${weekNum}`,
          revenuePaise: 0,
          orders: 0,
          enquiries: 0,
        });
        cur.setDate(cur.getDate() + 7);
        weekNum++;
      }

      for (const order of eligibleOrders) {
        // Find closest week bucket
        let matchedKey = Array.from(bucketMap.keys())[0];
        for (const key of bucketMap.keys()) {
          if (new Date(key) <= order.createdAt) {
            matchedKey = key;
          }
        }
        recordOrder(matchedKey, order);
      }

      for (const enq of enquiries) {
        let matchedKey = Array.from(bucketMap.keys())[0];
        for (const key of bucketMap.keys()) {
          if (new Date(key) <= enq.createdAt) {
            matchedKey = key;
          }
        }
        recordEnquiry(matchedKey);
      }
    }

    return Array.from(bucketMap.values()).map((b) => {
      const customerSet = customerBucketMap.get(b.date);
      const customers = customerSet ? customerSet.size : 0;
      const aovPaise = b.orders > 0 ? Math.round(b.revenuePaise / b.orders) : 0;
      return {
        ...b,
        customers,
        aovPaise,
        enquiries: b.enquiries || 0,
      };
    });
  }

  /**
   * Aggregates Top 5 Products by Revenue and Quantity from actual order items
   */
  private buildTopProducts(eligibleOrders: any[]) {
    interface ProductAgg {
      id: string;
      name: string;
      sku: string;
      quantitySold: number;
      revenuePaise: number;
      imageUrl: string | null;
    }

    const prodMap = new Map<string, ProductAgg>();

    for (const order of eligibleOrders) {
      for (const item of order.items || []) {
        const rawName = (item.variant?.product?.name || item.productName || item.product?.title || item.product?.name || 'Item').trim();
        // Canonical grouping key to ensure identical products consolidate rather than repeating rows
        const productId = item.productId || item.variant?.productId || item.variant?.product?.id || rawName.toLowerCase();
        const name = rawName;
        const sku = item.variant?.sku || item.sku || 'SKU';
        const img = item.variant?.product?.media?.[0]?.publicUrl || null;
        const itemPrice = item.totalPaise ?? ((item.unitPricePaise || item.pricePaise || 0) * (item.quantity || 1));

        const existing = prodMap.get(productId);
        if (existing) {
          existing.quantitySold += item.quantity || 1;
          existing.revenuePaise += itemPrice;
          if (!existing.imageUrl && img) existing.imageUrl = img;
        } else {
          prodMap.set(productId, {
            id: productId,
            name,
            sku,
            quantitySold: item.quantity || 1,
            revenuePaise: itemPrice,
            imageUrl: img,
          });
        }
      }
    }

    const all = Array.from(prodMap.values());
    const byRevenue = [...all].sort((a, b) => b.revenuePaise - a.revenuePaise).slice(0, 5);
    const byQuantity = [...all].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 5);

    return {
      byRevenue,
      byQuantity,
    };
  }

  /**
   * Computes New vs Returning customers and top high-value frequent buyers
   */
  private async buildCustomerInsights(
    tenantId: string,
    storeId: string,
    eligibleOrders: any[],
    periodStartDate: Date
  ) {
    const customerOrderCounts = new Map<string, { name: string; phone: string; count: number; spend: number }>();

    for (const o of eligibleOrders) {
      const cKey = o.customerId || o.customerPhone || o.customer?.phone || o.customerName || o.customer?.fullName || o.id;
      if (!cKey) continue;
      const existing = customerOrderCounts.get(cKey);
      const name = o.customer?.fullName || o.customerName || 'Guest Customer';
      const phone = o.customer?.phone || o.customerPhone || '';

      if (existing) {
        existing.count += 1;
        existing.spend += o.totalPaise;
      } else {
        customerOrderCounts.set(cKey, {
          name,
          phone,
          count: 1,
          spend: o.totalPaise,
        });
      }
    }

    const customerIds = Array.from(customerOrderCounts.keys());

    // Check for prior eligible orders before this period to distinguish New vs Returning
    let priorOrderCustomerIds = new Set<string>();
    const dbCustomerIds = eligibleOrders.map((o) => o.customerId).filter(Boolean);
    if (dbCustomerIds.length > 0) {
      const priorOrders = await this.prisma.order.findMany({
        where: {
          tenantId,
          storeId,
          createdAt: { lt: periodStartDate },
          paymentStatus: PaymentStatus.PAID,
          status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
          customerId: { in: dbCustomerIds },
        },
        select: { customerId: true },
        distinct: ['customerId'],
      });
      priorOrderCustomerIds = new Set(priorOrders.map((p) => p.customerId));
    }

    let returningCustomers = 0;
    let newCustomers = 0;

    for (const cId of customerIds) {
      const stats = customerOrderCounts.get(cId)!;
      if (priorOrderCustomerIds.has(cId) || stats.count > 1) {
        returningCustomers++;
      } else {
        newCustomers++;
      }
    }

    const totalPeriodBuyers = customerIds.length;
    const repeatRate =
      totalPeriodBuyers > 0
        ? Number(((returningCustomers / totalPeriodBuyers) * 100).toFixed(1))
        : 0;

    // Top 5 customers by spend
    const topCustomers = Array.from(customerOrderCounts.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        phone: data.phone ? data.phone.replace(/(\+91)(\d{5})(\d{5})/, '$1 $2-*****') : '',
        ordersCount: data.count,
        totalSpendPaise: data.spend,
      }))
      .sort((a, b) => b.totalSpendPaise - a.totalSpendPaise)
      .slice(0, 5);

    return {
      newCustomers,
      returningCustomers,
      repeatRate,
      topCustomers,
    };
  }

  /**
   * Aggregates Order Payment Mix (COD vs Prepaid/Online)
   */
  private buildPaymentMix(eligibleOrders: any[], totalRevenuePaise: number) {
    interface MixItem {
      method: string;
      label: string;
      ordersCount: number;
      revenuePaise: number;
      percentage: number;
    }

    const counts: Record<string, { label: string; count: number; revenue: number }> = {
      PREPAID: { label: 'Prepaid / Online', count: 0, revenue: 0 },
      COD: { label: 'Cash on Delivery (COD)', count: 0, revenue: 0 },
    };

    for (const order of eligibleOrders) {
      const rawMethod = String(order.paymentMethod || '').toUpperCase().trim();
      const isCod = rawMethod === 'COD' || rawMethod.includes('CASH');
      const key = isCod ? 'COD' : 'PREPAID';
      counts[key].count += 1;
      counts[key].revenue += order.totalPaise;
    }

    const totalOrders = eligibleOrders.length || 1;
    const mix: MixItem[] = Object.entries(counts)
      .filter(([_, data]) => data.count > 0)
      .map(([method, data]) => ({
        method,
        label: data.label,
        ordersCount: data.count,
        revenuePaise: data.revenue,
        percentage: Number(((data.count / totalOrders) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.ordersCount - a.ordersCount);

    return mix;
  }

  /**
   * Aggregates Top States and Cities from structured and normalized order address data
   */
  private buildTopLocations(eligibleOrders: any[], totalRevenuePaise: number) {
    interface LocationAgg {
      state: string;
      city?: string;
      ordersCount: number;
      revenuePaise: number;
      percentage: number;
    }

    const stateMap = new Map<string, { count: number; revenuePaise: number }>();
    const cityMap = new Map<string, { count: number; revenuePaise: number; state: string }>();

    for (const order of eligibleOrders) {
      const addr = (order.deliveryAddress || order.shippingAddress || (order as any).address) as any;
      const rawState = order.orderAddress?.state || addr?.state || null;
      const rawCity = order.orderAddress?.city || addr?.city || null;

      const state = normalizeIndianState(rawState);
      const city = normalizeCityName(rawCity);

      const existingState = stateMap.get(state) || { count: 0, revenuePaise: 0 };
      existingState.count += 1;
      existingState.revenuePaise += order.totalPaise;
      stateMap.set(state, existingState);

      if (city && city !== 'Other') {
        const cityKey = `${city}|${state}`;
        const existingCity = cityMap.get(cityKey) || { count: 0, revenuePaise: 0, state };
        existingCity.count += 1;
        existingCity.revenuePaise += order.totalPaise;
        cityMap.set(cityKey, existingCity);
      }
    }

    const totalOrders = eligibleOrders.length || 1;

    const states: LocationAgg[] = Array.from(stateMap.entries())
      .map(([state, data]) => ({
        state,
        ordersCount: data.count,
        revenuePaise: data.revenuePaise,
        percentage: Number(((data.count / totalOrders) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.revenuePaise - a.revenuePaise)
      .slice(0, 5);

    const cities: LocationAgg[] = Array.from(cityMap.entries())
      .map(([key, data]) => {
        const [cityName] = key.split('|');
        return {
          state: data.state,
          city: cityName,
          ordersCount: data.count,
          revenuePaise: data.revenuePaise,
          percentage: Number(((data.count / totalOrders) * 100).toFixed(1)),
        };
      })
      .sort((a, b) => b.revenuePaise - a.revenuePaise)
      .slice(0, 5);

    return { states, cities };
  }
}
