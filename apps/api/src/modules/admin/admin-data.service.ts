import { AdminDashboardService } from './admin-dashboard.service';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, UserRole, StoreStatus } from '@prisma/client';
import { getBrandConfig } from '@simply/config';
import { planAvailability } from '../subscriptions/plan-policy';

export interface AdminQuery {
  search?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  role?: string;
  planId?: string;
  subscriptionStatus?: string;
  tenantId?: string;
  storeId?: string;
  page?: string | number;
  pageSize?: string | number;
  sort?: string;
  range?: string;
  from?: string;
  to?: string;
}
function paging(q: AdminQuery) {
  const page = Math.max(1, Math.min(100000, Math.floor(Number(q.page) || 1))),
    pageSize = Math.max(1, Math.min(100, Math.floor(Number(q.pageSize) || 20)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
function envelope<T>(
  items: T[],
  total: number,
  p: { page: number; pageSize: number },
) {
  return {
    items,
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.ceil(total / p.pageSize),
    pagination: {
      page: p.page,
      pageSize: p.pageSize,
      total,
      totalPages: Math.ceil(total / p.pageSize),
    },
  };
}
export function adminRange(range = '30d') {
  const days: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '3m': 90,
    '90d': 90,
    '6m': 180,
    '12m': 365,
  };
  if (range === 'ALL') return null;
  if (!Object.prototype.hasOwnProperty.call(days, range))
    throw new BadRequestException('Choose 7d, 30d, 90d, 3m, 6m, 12m or ALL.');
  return new Date(Date.now() - days[range] * 86400000);
}

export function parseAnalyticsRange(range = '30d', fromStr?: string, toStr?: string) {
  const now = new Date();
  if (range === 'CUSTOM' || range === 'custom' || (fromStr && toStr)) {
    if (!fromStr || !toStr) {
      throw new BadRequestException('Both From and To dates are required for custom date range.');
    }
    const fromDate = new Date(fromStr);
    const toDate = new Date(toStr);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid date provided for custom range.');
    }
    if (fromDate > toDate) {
      throw new BadRequestException('From Date must be earlier than or equal to To Date.');
    }
    const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0, 0);
    const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999);
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const interval: 'day' | 'week' | 'month' = diffDays > 120 ? 'month' : (diffDays > 45 ? 'week' : 'day');
    return { from: start, to: end, interval, range: 'custom' };
  }

  if (range === 'ALL') {
    return { from: null, to: null, interval: 'month' as const, range: 'ALL' };
  }

  const daysMap: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '3m': 90,
    '90d': 90,
    '6m': 180,
    '12m': 365,
  };
  const days = daysMap[range] ?? 30;
  const start = new Date(now.getTime() - days * 86400000);
  const interval: 'day' | 'week' | 'month' = days > 120 ? 'month' : (days > 45 ? 'week' : 'day');
  return { from: start, to: now, interval, range };
}

const orderSelect = {
  id: true,
  orderNumber: true,
  totalPaise: true,
  subtotalPaise: true,
  shippingPaise: true,
  taxPaise: true,
  discountPaise: true,
  currency: true,
  paymentMethod: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  shipmentStatus: true,
  status: true,
  createdAt: true,
  _count: { select: { items: true } },
  store: { select: { id: true, name: true, slug: true } },
  tenant: { select: { id: true, name: true, slug: true } },
  customer: { select: { id: true, fullName: true, phone: true, email: true } },
} satisfies Prisma.OrderSelect;

@Injectable()
export class AdminDataService {
  constructor(
    private readonly db: PrismaClient,
    private readonly dashboard: AdminDashboardService,
  ) {}
  async overview(range = '30d', fromStr?: string, toStr?: string) {
    let from: Date | null = null;
    let to: Date | null = null;
    if (range === 'custom') {
      if ((fromStr && !toStr) || (!fromStr && toStr)) {
        throw new BadRequestException(
          'Both "from" and "to" query parameters are required for custom date range.',
        );
      }
      if (fromStr && toStr) {
        from = new Date(fromStr);
        to = new Date(toStr);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
          throw new BadRequestException(
            'Invalid date format for custom range. Use YYYY-MM-DD.',
          );
        }
        if (from > to) {
          throw new BadRequestException(
            'From date must be on or before To date.',
          );
        }
        // Set to end of day in UTC
        to = new Date(
          Date.UTC(
            to.getUTCFullYear(),
            to.getUTCMonth(),
            to.getUTCDate(),
            23,
            59,
            59,
            999,
          ),
        );
      } else {
        from = adminRange('30d');
      }
    } else {
      from = adminRange(range);
    }
    return this.dashboard.read(from, range, to);
  }

  async attentionSummary() {
    return this.dashboard.getAttentionSummary();
  }

  async charts(from: Date | null) {
    const cutoff = from || new Date('1970-01-01T00:00:00Z');
    // Aggregate inside PostgreSQL; only actual observed dates are returned.
    const [
      merchantGrowth,
      subscriptionRevenueTrends,
      orderTrends,
      reportTrends,
    ] = await Promise.all([
      this.db.$queryRaw<
        Array<{ date: string; count: number }>
      >`SELECT to_char(date_trunc('day', t.created_at), 'YYYY-MM-DD') AS date, count(*)::int AS count FROM tenants t WHERE t.deleted_at IS NULL AND t.created_at >= ${cutoff} AND EXISTS (SELECT 1 FROM tenant_memberships m WHERE m.tenant_id=t.id AND m.role='SELLER_OWNER' AND m.is_active=true AND EXISTS (SELECT 1 FROM users u WHERE u.id=m.user_id AND u.deleted_at IS NULL)) GROUP BY 1 ORDER BY 1`,
      this.db.$queryRaw<
        Array<{ date: string; amountPaise: number }>
      >`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, sum(amount_paise)::double precision AS "amountPaise" FROM subscription_payments WHERE status IN ('SUCCESS','PAID') AND created_at >= ${cutoff} GROUP BY 1 ORDER BY 1`,
      this.db.$queryRaw<
        Array<{ date: string; count: number; gmvPaise: number }>
      >`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date, count(*)::int AS count, COALESCE(sum(total_paise) FILTER (WHERE payment_status='PAID'),0)::double precision AS "gmvPaise" FROM orders WHERE created_at >= ${cutoff} GROUP BY 1 ORDER BY 1`,
      this.db.$queryRaw<
        Array<{ date: string; count: number; resolved: number }>
      >`SELECT date, sum(created)::int AS count, sum(resolved)::int AS resolved FROM (SELECT to_char(date_trunc('day', created_at),'YYYY-MM-DD') AS date,count(*)::int AS created,0 AS resolved FROM review_reports WHERE created_at >= ${cutoff} GROUP BY 1 UNION ALL SELECT to_char(date_trunc('day', resolved_at),'YYYY-MM-DD') AS date,0 AS created,count(*)::int AS resolved FROM review_reports WHERE status='RESOLVED' AND resolved_at >= ${cutoff} GROUP BY 1) events GROUP BY date ORDER BY date`,
    ]);
    return {
      merchantGrowth,
      subscriptionRevenueTrends,
      orderTrends,
      reportTrends,
    };
  }
  async merchants(q: AdminQuery = {}) {
    const p = paging(q),
      conditions: Prisma.Sql[] = [
        Prisma.sql`t.deleted_at IS NULL`,
        Prisma.sql`EXISTS(SELECT 1 FROM tenant_memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=t.id AND m.role='SELLER_OWNER' AND m.is_active=true AND u.deleted_at IS NULL)`,
      ];
    if (q.search?.trim()) {
      const term = '%' + q.search.trim() + '%';
      conditions.push(
        Prisma.sql`(t.name ILIKE ${term} OR t.slug ILIKE ${term} OR EXISTS(SELECT 1 FROM tenant_memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=t.id AND (u."fullName" ILIKE ${term} OR u.email ILIKE ${term} OR u.phone ILIKE ${term})) OR EXISTS(SELECT 1 FROM stores st WHERE st.tenant_id=t.id AND st.deleted_at IS NULL AND (st.name ILIKE ${term} OR st.slug ILIKE ${term})))`,
      );
    }
    if (q.status && q.status !== 'ALL') {
      const s = q.status.toUpperCase();
      if (s === 'SUSPENDED') {
        conditions.push(
          Prisma.sql`(t.status='SUSPENDED' OR EXISTS(SELECT 1 FROM stores st WHERE st.tenant_id=t.id AND st.deleted_at IS NULL AND st.status='SUSPENDED'))`,
        );
      } else if (s === 'LIVE') {
        conditions.push(
          Prisma.sql`EXISTS(SELECT 1 FROM stores st WHERE st.tenant_id=t.id AND st.deleted_at IS NULL AND st.status='LIVE')`,
        );
      } else if (s === 'PRIVATE_PREVIEW' || s === 'TRIAL') {
        conditions.push(
          Prisma.sql`EXISTS(SELECT 1 FROM stores st WHERE st.tenant_id=t.id AND st.deleted_at IS NULL AND st.status='PRIVATE_PREVIEW')`,
        );
      } else if (s === 'DRAFT') {
        conditions.push(
          Prisma.sql`EXISTS(SELECT 1 FROM stores st WHERE st.tenant_id=t.id AND st.deleted_at IS NULL AND st.status='DRAFT')`,
        );
      } else if (s === 'ARCHIVED') {
        conditions.push(
          Prisma.sql`(t.status='ARCHIVED' OR EXISTS(SELECT 1 FROM stores st WHERE st.tenant_id=t.id AND st.deleted_at IS NULL AND st.status='ARCHIVED'))`,
        );
      } else if (s === 'SUBSCRIBED') {
        conditions.push(
          Prisma.sql`sub.status='ACTIVE' AND sub.current_period_end > ${new Date()}`,
        );
      } else if (s === 'EXPIRED') {
        conditions.push(
          Prisma.sql`(sub.status IN ('EXPIRED','PAST_DUE') OR sub.current_period_end <= ${new Date()})`,
        );
      } else {
        throw new BadRequestException('Invalid store status filter.');
      }
    }
    if (q.planId && q.planId !== 'ALL') {
      if (q.planId === 'NONE' || q.planId === 'NO_SUBSCRIPTION') {
        conditions.push(Prisma.sql`sub.plan_id IS NULL`);
      } else {
        conditions.push(
          Prisma.sql`(sub.plan_id=${q.planId} OR EXISTS(SELECT 1 FROM subscription_plans sp WHERE sp.id=sub.plan_id AND (sp.code ILIKE ${q.planId} OR sp.name ILIKE ${q.planId})))`,
        );
      }
    }
    if (q.subscriptionStatus && q.subscriptionStatus !== 'ALL') {
      const subStatus = q.subscriptionStatus.toUpperCase();
      if (subStatus === 'NONE' || subStatus === 'NO_SUBSCRIPTION') {
        conditions.push(Prisma.sql`sub.status IS NULL`);
      } else if (
        [
          'ACTIVE',
          'TRIALING',
          'PAST_DUE',
          'EXPIRED',
          'CANCELED',
          'UNPAID',
        ].includes(subStatus)
      ) {
        conditions.push(Prisma.sql`sub.status::text=${subStatus}`);
      } else {
        throw new BadRequestException('Invalid subscription status.');
      }
    }
    const base = Prisma.sql`FROM tenants t LEFT JOIN LATERAL(SELECT status,plan_id,current_period_end FROM subscriptions WHERE tenant_id=t.id ORDER BY created_at DESC LIMIT 1) sub ON true WHERE ${Prisma.join(conditions, ' AND ')}`;
    let orderBySql = Prisma.sql`t.created_at DESC, t.id ASC`;
    if (q.sort === 'oldest') {
      orderBySql = Prisma.sql`t.created_at ASC, t.id ASC`;
    } else if (q.sort === 'alpha_asc' || q.sort === 'name_asc') {
      orderBySql = Prisma.sql`t.name ASC, t.id ASC`;
    } else if (q.sort === 'alpha_desc' || q.sort === 'name_desc') {
      orderBySql = Prisma.sql`t.name DESC, t.id ASC`;
    }
    const [[count], ids] = await Promise.all([
      this.db.$queryRaw<Array<{ total: number }>>(
        Prisma.sql`SELECT count(*)::int AS total ${base}`,
      ),
      this.db.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT t.id ${base} ORDER BY ${orderBySql} LIMIT ${p.pageSize} OFFSET ${p.skip}`,
      ),
    ]);
    const rows = await this.db.tenant.findMany({
      where: { id: { in: ids.map((i) => i.id) } },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          where: {
            role: 'SELLER_OWNER',
            isActive: true,
            user: { deletedAt: null },
          },
          take: 1,
          select: {
            user: {
              select: { id: true, fullName: true, email: true, phone: true },
            },
          },
        },
        stores: {
          where: { deletedAt: null },
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, slug: true, status: true },
        },
        subscriptions: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            plan: {
              select: { id: true, name: true, code: true, pricePaise: true },
            },
          },
        },
      },
    });
    const items = ids
      .map((i) => rows.find((r) => r.id === i.id)!)
      .map(({ memberships, stores, subscriptions, ...tenant }) => ({
        ...tenant,
        owner: memberships[0]?.user || null,
        store: stores[0] || null,
        subscription: subscriptions[0] || null,
      }));
    return envelope(items, count.total, p);
  }

  async users(q: AdminQuery = {}) {
    const p = paging(q);
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (q.role && q.role !== 'ALL') {
      if (!Object.values(UserRole).includes(q.role as UserRole))
        throw new BadRequestException('Invalid role.');
      where.role = q.role as UserRole;
    }
    if (q.status && q.status !== 'ALL') {
      if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(q.status))
        throw new BadRequestException('Invalid user status.');
      where.isActive = q.status === 'ACTIVE';
    }
    if (q.search?.trim()) {
      const term = q.search.trim();
      where.OR = [
        { fullName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
        {
          memberships: {
            some: {
              tenant: {
                OR: [
                  { name: { contains: term, mode: 'insensitive' } },
                  { stores: { some: { name: { contains: term, mode: 'insensitive' } } } },
                ],
              },
            },
          },
        },
      ];
    }

    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
    if (q.sort === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else if (q.sort === 'name_asc') {
      orderBy = { fullName: 'asc' };
    } else if (q.sort === 'name_desc') {
      orderBy = { fullName: 'desc' };
    }

    const [total, rows, totalUsers, merchantOwners, staffUsers, platformAdmins, suspendedUsers] =
      await Promise.all([
        this.db.user.count({ where }),
        this.db.user.findMany({
          where,
          take: p.pageSize,
          skip: p.skip,
          orderBy,
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
            isSuperAdmin: true,
            createdAt: true,
            updatedAt: true,
            memberships: {
              where: { isActive: true },
              select: {
                role: true,
                tenant: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    stores: {
                      where: { deletedAt: null },
                      select: { id: true, name: true, slug: true, status: true },
                    },
                  },
                },
              },
            },
            devices: {
              take: 1,
              orderBy: { lastSeenAt: 'desc' },
              select: { lastSeenAt: true },
            },
            sessions: {
              take: 1,
              orderBy: { updatedAt: 'desc' },
              select: { createdAt: true, updatedAt: true },
            },
          },
        }),
        this.db.user.count({ where: { deletedAt: null } }),
        this.db.user.count({ where: { deletedAt: null, role: 'SELLER_OWNER' } }),
        this.db.user.count({ where: { deletedAt: null, role: 'SELLER_STAFF' } }),
        this.db.user.count({ where: { deletedAt: null, role: 'PLATFORM_ADMIN' } }),
        this.db.user.count({ where: { deletedAt: null, isActive: false } }),
      ]);

    const userIds = rows.map((u) => u.id);
    const recentAuditLogs = userIds.length
      ? await this.db.auditLog.findMany({
          where: {
            entityType: 'User',
            entityId: { in: userIds },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            action: true,
            entityId: true,
            createdAt: true,
            actorId: true,
            metadata: true,
          },
        })
      : [];

    const auditByUserId = new Map<string, any[]>();
    for (const a of recentAuditLogs) {
      if (!a.entityId) continue;
      const list = auditByUserId.get(a.entityId) || [];
      const meta =
        a.metadata && typeof a.metadata === 'object'
          ? (a.metadata as any)
          : {};
      list.push({
        id: a.id,
        action: a.action,
        date: a.createdAt.toISOString(),
        reason: meta.reason || null,
        adminName: meta.adminName || 'Admin',
      });
      auditByUserId.set(a.entityId, list);
    }

    const items = rows.map(({ memberships, devices, sessions, ...u }) => {
      const primaryMembership = memberships[0];
      const tenant = primaryMembership?.tenant || null;
      const stores = tenant?.stores || [];
      const primaryStore = stores[0] || null;

      const deviceSeen = devices[0]?.lastSeenAt;
      const sessionUpdated = sessions[0]?.updatedAt;
      let lastLoginAt: string | null = null;
      if (deviceSeen && sessionUpdated) {
        lastLoginAt = (
          deviceSeen > sessionUpdated ? deviceSeen : sessionUpdated
        ).toISOString();
      } else if (deviceSeen) {
        lastLoginAt = deviceSeen.toISOString();
      } else if (sessionUpdated) {
        lastLoginAt = sessionUpdated.toISOString();
      }

      return {
        ...u,
        tenant: tenant
          ? { id: tenant.id, name: tenant.name, slug: tenant.slug }
          : null,
        store: primaryStore,
        stores,
        lastLoginAt,
        recentActivity: auditByUserId.get(u.id) || [],
      };
    });

    const kpis = {
      totalUsers,
      merchantOwners,
      staffUsers,
      platformAdmins,
      suspendedUsers,
    };

    const result = envelope(items, total, p);
    return {
      ...result,
      kpis,
    };
  }
  async orders(q: AdminQuery = {}) {
    const p = paging(q),
      where: Prisma.OrderWhereInput = {};

    if (q.search?.trim()) {
      const term = q.search.trim();
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { store: { name: { contains: term, mode: 'insensitive' } } },
        { tenant: { name: { contains: term, mode: 'insensitive' } } },
        { customer: { fullName: { contains: term, mode: 'insensitive' } } },
        { customer: { phone: { contains: term, mode: 'insensitive' } } },
        { customer: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    if (q.status && q.status !== 'ALL') {
      where.status = q.status as any;
    }
    if (q.paymentStatus && q.paymentStatus !== 'ALL') {
      where.paymentStatus = q.paymentStatus as any;
    }
    if (q.paymentMethod && q.paymentMethod !== 'ALL') {
      where.paymentMethod = { equals: q.paymentMethod, mode: 'insensitive' };
    }
    if (q.storeId && q.storeId !== 'ALL') {
      where.storeId = q.storeId;
    }
    if (q.tenantId && q.tenantId !== 'ALL') {
      where.tenantId = q.tenantId;
    }

    if (q.from && q.to) {
      const fromDate = new Date(q.from);
      const toDate = new Date(q.to);
      if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
        const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0, 0);
        const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999);
        where.createdAt = { gte: start, lte: end };
      }
    } else if (q.range && q.range !== 'ALL') {
      const from = adminRange(q.range);
      if (from) where.createdAt = { gte: from };
    }

    let orderBy: Prisma.OrderOrderByWithRelationInput = { createdAt: 'desc' };
    if (q.sort === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else if (q.sort === 'highest_amount') {
      orderBy = { totalPaise: 'desc' };
    } else if (q.sort === 'lowest_amount') {
      orderBy = { totalPaise: 'asc' };
    }

    const summaryWhere: Prisma.OrderWhereInput = {
      ...(where.storeId ? { storeId: where.storeId } : {}),
      ...(where.tenantId ? { tenantId: where.tenantId } : {}),
      ...(where.createdAt ? { createdAt: where.createdAt } : {}),
    };

    const [total, items, newOrders, inFulfillmentOrders, completedOrders, cancelledOrders] = await Promise.all([
      this.db.order.count({ where }),
      this.db.order.findMany({
        where,
        take: p.pageSize,
        skip: p.skip,
        orderBy,
        select: orderSelect,
      }),
      this.db.order.count({ where: { ...summaryWhere, status: 'NEW' } }),
      this.db.order.count({ where: { ...summaryWhere, status: { in: ['ACCEPTED', 'CONFIRMED', 'READY', 'DISPATCHED'] } } }),
      this.db.order.count({ where: { ...summaryWhere, status: 'COMPLETED' } }),
      this.db.order.count({ where: { ...summaryWhere, status: 'CANCELLED' } }),
    ]);

    const mappedItems = items.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      totalPaise: o.totalPaise,
      subtotalPaise: (o as any).subtotalPaise,
      shippingPaise: (o as any).shippingPaise,
      taxPaise: (o as any).taxPaise,
      discountPaise: (o as any).discountPaise,
      currency: o.currency,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      shipmentStatus: o.shipmentStatus,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      itemsCount: (o as any)._count?.items ?? 0,
      store: o.store,
      tenant: (o as any).tenant,
      customer: o.customer,
    }));

    const result = envelope(mappedItems, total, p);
    return {
      ...result,
      summary: {
        totalOrders: total,
        newOrders,
        inFulfillmentOrders,
        completedOrders,
        cancelledOrders,
      },
    };
  }

  async orderDetail(id: string) {
    const order = await this.db.order.findFirst({
      where: {
        OR: [{ id }, { orderNumber: id }],
      },
      include: {
        store: { select: { id: true, name: true, slug: true } },
        tenant: { select: { id: true, name: true, slug: true } },
        customer: { select: { id: true, fullName: true, phone: true, email: true } },
        orderAddress: true,
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            productId: true,
            productName: true,
            variantId: true,
            variantTitle: true,
            sku: true,
            selectedOptions: true,
            quantity: true,
            unitPricePaise: true,
            taxPaise: true,
            totalPaise: true,
            imageUrl: true,
          },
        },
        shipments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            awbNumber: true,
            courierName: true,
            trackingUrl: true,
            status: true,
            fulfillmentStatus: true,
            createdAt: true,
          },
        },
        paymentOrders: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            provider: true,
            providerOrderId: true,
            status: true,
            amountPaise: true,
            createdAt: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            reason: true,
            actorId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    const orderAny = order as any;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      shipmentStatus: order.shipmentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      fulfillmentMode: order.fulfillmentMode,
      subtotalPaise: order.subtotalPaise,
      taxPaise: order.taxPaise,
      shippingPaise: order.shippingPaise,
      discountPaise: order.discountPaise,
      totalPaise: order.totalPaise,
      currency: order.currency,
      notes: order.notes,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      tenant: orderAny.tenant,
      store: orderAny.store,
      customer: orderAny.customer,
      orderAddress: orderAny.orderAddress,
      items: orderAny.items || [],
      shipments: (orderAny.shipments || []).map((s: any) => ({
        id: s.id,
        trackingNumber: s.awbNumber || null,
        carrier: s.courierName || null,
        status: s.status,
        awbCode: s.awbNumber || null,
        shippedAt: null,
        deliveredAt: null,
      })),
      paymentOrders: (orderAny.paymentOrders || []).map((p: any) => ({
        id: p.id,
        provider: p.provider,
        gatewayOrderId: p.providerOrderId,
        status: p.status,
        amountPaise: p.amountPaise,
        createdAt: p.createdAt ? p.createdAt.toISOString() : new Date().toISOString(),
      })),
      statusHistory: (orderAny.statusHistory || []).map((h: any) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        reason: h.reason,
        actorId: h.actorId,
        createdAt: h.createdAt ? h.createdAt.toISOString() : new Date().toISOString(),
      })),
    };
  }
  async plans() {
    const [plans, counts] = await Promise.all([
      this.db.plan.findMany({
        include: {
          highlights: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      this.db.$queryRaw<
        Array<{ planId: string; merchants: number; active: number }>
      >`SELECT plan_id AS "planId",count(DISTINCT tenant_id)::int AS merchants,count(DISTINCT tenant_id) FILTER(WHERE status='ACTIVE' AND current_period_end > ${new Date()})::int AS active FROM subscriptions GROUP BY plan_id`,
    ]);

    // Plans with numeric price sort ascending by pricePaise.
    // Plans without a fixed numeric price (0/contact) sort LAST.
    const sortedPlans = [...plans].sort((a, b) => {
      const aOrder = (a as any).displayOrder || 0;
      const bOrder = (b as any).displayOrder || 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aIsCustom = a.pricePaise <= 0 || a.code === 'CUSTOM';
      const bIsCustom = b.pricePaise <= 0 || b.code === 'CUSTOM';
      if (aIsCustom && !bIsCustom) return 1;
      if (!aIsCustom && bIsCustom) return -1;
      return a.pricePaise - b.pricePaise;
    });

    return sortedPlans.map((p) => ({
      ...p,
      ...planAvailability(p),
      merchantCount: counts.find((c) => c.planId === p.id)?.merchants || 0,
      activeSubscribersCount:
        counts.find((c) => c.planId === p.id)?.active || 0,
    }));
  }

  async subscriptionKpis() {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [activeSubscriptions, paidInvoices, expiringSoon, failedInvoices, pastDueSubscriptions] =
      await Promise.all([
        this.db.subscription.count({
          where: { status: 'ACTIVE' },
        }),
        this.db.subscriptionInvoice.aggregate({
          where: { status: 'PAID' },
          _sum: { amountPaise: true },
        }),
        this.db.subscription.count({
          where: {
            status: 'ACTIVE',
            currentPeriodEnd: { lte: sevenDaysFromNow },
          },
        }),
        this.db.subscriptionInvoice.count({
          where: { status: { in: ['FAILED', 'UNPAID'] } },
        }),
        this.db.subscription.count({
          where: { status: 'PAST_DUE' },
        }),
      ]);

    return {
      activeSubscriptions,
      paidRevenuePaise: paidInvoices._sum.amountPaise || 0,
      expiringSoon,
      failedPayments: failedInvoices + pastDueSubscriptions,
    };
  }

  async subscriptions(q: AdminQuery = {}) {
    const p = paging(q);
    const where: Prisma.SubscriptionWhereInput = {};
    if (q.tenantId) {
      where.tenantId = q.tenantId;
    }
    if (q.status && q.status !== 'ALL') {
      where.status = q.status.toUpperCase() as any;
    }
    if (q.planId && q.planId !== 'ALL') {
      where.planId = q.planId;
    }
    if (q.range === 'EXPIRING_SOON') {
      const now = new Date();
      const next7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      where.currentPeriodEnd = { gte: now, lte: next7Days };
    } else if (q.range === 'EXPIRED') {
      where.currentPeriodEnd = { lt: new Date() };
    }
    if (q.search?.trim()) {
      const term = q.search.trim();
      where.OR = [
        { tenant: { name: { contains: term, mode: 'insensitive' } } },
        { plan: { name: { contains: term, mode: 'insensitive' } } },
        { plan: { code: { contains: term, mode: 'insensitive' } } },
        { invoices: { some: { invoiceNumber: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    let orderBy: Prisma.SubscriptionOrderByWithRelationInput = { createdAt: 'desc' };
    if (q.sort === 'createdAt_asc') {
      orderBy = { createdAt: 'asc' };
    } else if (q.sort === 'expiry_asc') {
      orderBy = { currentPeriodEnd: 'asc' };
    } else if (q.sort === 'expiry_desc') {
      orderBy = { currentPeriodEnd: 'desc' };
    }

    const [total, items] = await Promise.all([
      this.db.subscription.count({ where }),
      this.db.subscription.findMany({
        where,
        take: p.pageSize,
        skip: p.skip,
        orderBy,
        select: {
          id: true,
          status: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          createdAt: true,
          tenant: { select: { id: true, name: true, slug: true } },
          plan: {
            select: { id: true, name: true, pricePaise: true, code: true },
          },
          invoices: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { id: true, invoiceNumber: true, status: true, paidAt: true, amountPaise: true, invoicePdfUrl: true },
          },
        },
      }),
    ]);
    const mappedItems = items.map((sub) => ({
      ...sub,
      invoices: sub.invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
        amountPaise: inv.amountPaise,
        pdfUrl: inv.invoicePdfUrl,
      })),
    }));
    return envelope(mappedItems, total, p);
  }
  async analytics(queryInput: any = '30d') {
    const q: {
      range?: string;
      from?: string;
      to?: string;
      storeId?: string;
      tenantId?: string;
      planId?: string;
    } = typeof queryInput === 'string' ? { range: queryInput } : (queryInput || {});

    const { from, to, interval, range } = parseAnalyticsRange(q.range, q.from, q.to);
    const dateFilter = from ? (to ? { gte: from, lte: to } : { gte: from }) : undefined;

    const orderWhere: Prisma.OrderWhereInput = {};
    if (dateFilter) orderWhere.createdAt = dateFilter;
    if (q.storeId && q.storeId !== 'ALL') orderWhere.storeId = q.storeId;
    if (q.tenantId && q.tenantId !== 'ALL') orderWhere.tenantId = q.tenantId;

    const subWhere: Prisma.SubscriptionPaymentWhereInput = {
      status: { in: ['SUCCESS', 'CAPTURED', 'PAID'] },
    };
    if (dateFilter) subWhere.createdAt = dateFilter;
    if (q.tenantId && q.tenantId !== 'ALL') {
      (subWhere as any).invoice = { ...(subWhere as any).invoice, tenantId: q.tenantId };
    }
    if (q.planId && q.planId !== 'ALL') {
      (subWhere as any).invoice = {
        ...(subWhere as any).invoice,
        subscription: { planId: q.planId },
      };
    }

    const merchantWhere: Prisma.TenantWhereInput = {
      deletedAt: null,
      memberships: {
        some: {
          role: 'SELLER_OWNER',
          isActive: true,
          user: { deletedAt: null },
        },
      },
    };
    if (dateFilter) merchantWhere.createdAt = dateFilter;

    const storeWhere: Prisma.StoreWhereInput = {
      status: 'LIVE',
      deletedAt: null,
    };
    if (q.storeId && q.storeId !== 'ALL') storeWhere.id = q.storeId;
    if (q.tenantId && q.tenantId !== 'ALL') storeWhere.tenantId = q.tenantId;

    const [paid, totalOrders, subscriptionRevenue, merchantsCreated, activeStores] = await Promise.all([
      this.db.order.aggregate({
        where: { ...orderWhere, paymentStatus: 'PAID' },
        _sum: { totalPaise: true },
        _count: true,
      }),
      this.db.order.count({ where: orderWhere }),
      this.db.subscriptionPayment.aggregate({
        where: subWhere,
        _sum: { amountPaise: true },
      }),
      this.db.tenant.count({ where: merchantWhere }),
      this.db.store.count({ where: storeWhere }),
    ]);

    const totalGmvPaise = paid._sum.totalPaise || 0;
    const paidOrdersCount = paid._count || 0;
    const averageOrderValuePaise = paidOrdersCount > 0 ? Math.round(totalGmvPaise / paidOrdersCount) : 0;
    const subscriptionRevenuePaise = subscriptionRevenue._sum.amountPaise || 0;

    // Time-series bucketing
    const cutoff = from || new Date('1970-01-01T00:00:00Z');
    const endCutoff = to || new Date();
    const dateFormat = interval === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
    const truncInterval = interval === 'month' ? 'month' : (interval === 'week' ? 'week' : 'day');

    const [
      rawOrderTrends,
      rawSubTrends,
      rawMerchantTrends,
      rawStatusMix,
      rawPaymentMix,
      rawTopStores,
      rawTopProducts,
      rawReviews,
      rawReports,
      rawResolved,
      rawRemoved,
      rawAvgRes,
      filterMerchants,
      filterStores,
      filterPlans,
    ] = await Promise.all([
      this.db.$queryRaw<Array<{ date: string; count: number; gmvPaise: number }>>`
        SELECT to_char(date_trunc(${truncInterval}, created_at), ${dateFormat}) AS date,
               count(*)::int AS count,
               COALESCE(sum(total_paise) FILTER (WHERE payment_status='PAID'), 0)::double precision AS "gmvPaise"
        FROM orders
        WHERE created_at >= ${cutoff} AND created_at <= ${endCutoff}
        ${q.storeId && q.storeId !== 'ALL' ? Prisma.sql`AND store_id = ${q.storeId}` : Prisma.empty}
        ${q.tenantId && q.tenantId !== 'ALL' ? Prisma.sql`AND tenant_id = ${q.tenantId}` : Prisma.empty}
        GROUP BY 1 ORDER BY 1
      `,
      this.db.$queryRaw<Array<{ date: string; amountPaise: number }>>`
        SELECT to_char(date_trunc(${truncInterval}, sp.created_at), ${dateFormat}) AS date,
               COALESCE(sum(sp.amount_paise), 0)::double precision AS "amountPaise"
        FROM subscription_payments sp
        ${q.planId && q.planId !== 'ALL' ? Prisma.sql`JOIN subscriptions s ON s.id=sp.subscription_id` : Prisma.empty}
        WHERE sp.status IN ('SUCCESS','PAID')
          AND sp.created_at >= ${cutoff} AND sp.created_at <= ${endCutoff}
          ${q.tenantId && q.tenantId !== 'ALL' ? Prisma.sql`AND sp.tenant_id = ${q.tenantId}` : Prisma.empty}
          ${q.planId && q.planId !== 'ALL' ? Prisma.sql`AND s.plan_id = ${q.planId}` : Prisma.empty}
        GROUP BY 1 ORDER BY 1
      `,
      this.db.$queryRaw<Array<{ date: string; count: number }>>`
        SELECT to_char(date_trunc(${truncInterval}, t.created_at), ${dateFormat}) AS date,
               count(*)::int AS count
        FROM tenants t
        WHERE t.deleted_at IS NULL
          AND t.created_at >= ${cutoff} AND t.created_at <= ${endCutoff}
          AND EXISTS (
            SELECT 1 FROM tenant_memberships m
            JOIN users u ON u.id=m.user_id
            WHERE m.tenant_id=t.id AND m.role='SELLER_OWNER' AND m.is_active=true AND u.deleted_at IS NULL
          )
        GROUP BY 1 ORDER BY 1
      `,
      this.db.$queryRaw<Array<{ status: string; count: number; totalPaise: number }>>`
        SELECT status, count(*)::int AS count, COALESCE(sum(total_paise), 0)::double precision AS "totalPaise"
        FROM orders
        WHERE created_at >= ${cutoff} AND created_at <= ${endCutoff}
        ${q.storeId && q.storeId !== 'ALL' ? Prisma.sql`AND store_id = ${q.storeId}` : Prisma.empty}
        ${q.tenantId && q.tenantId !== 'ALL' ? Prisma.sql`AND tenant_id = ${q.tenantId}` : Prisma.empty}
        GROUP BY status ORDER BY count DESC
      `,
      this.db.$queryRaw<Array<{ method: string; count: number; totalPaise: number }>>`
        SELECT COALESCE(payment_method, 'COD') AS method, count(*)::int AS count, COALESCE(sum(total_paise), 0)::double precision AS "totalPaise"
        FROM orders
        WHERE created_at >= ${cutoff} AND created_at <= ${endCutoff}
        ${q.storeId && q.storeId !== 'ALL' ? Prisma.sql`AND store_id = ${q.storeId}` : Prisma.empty}
        ${q.tenantId && q.tenantId !== 'ALL' ? Prisma.sql`AND tenant_id = ${q.tenantId}` : Prisma.empty}
        GROUP BY 1 ORDER BY count DESC
      `,
      this.db.$queryRaw<Array<{ store_id: string; count: number; gmv_paise: number; paid_count: number }>>`
        SELECT store_id, count(*)::int AS count,
               COALESCE(sum(total_paise) FILTER (WHERE payment_status='PAID'), 0)::double precision AS gmv_paise,
               count(*) FILTER (WHERE payment_status='PAID')::int AS paid_count
        FROM orders
        WHERE created_at >= ${cutoff} AND created_at <= ${endCutoff}
        ${q.storeId && q.storeId !== 'ALL' ? Prisma.sql`AND store_id = ${q.storeId}` : Prisma.empty}
        ${q.tenantId && q.tenantId !== 'ALL' ? Prisma.sql`AND tenant_id = ${q.tenantId}` : Prisma.empty}
        GROUP BY store_id ORDER BY count DESC LIMIT 10
      `,
      this.db.$queryRaw<Array<{ product_name: string; sku: string; product_id: string | null; store_id: string; store_name: string; units_sold: number; revenue_paise: number; orders_count: number }>>`
        SELECT oi.product_name, oi.sku, oi.product_id, o.store_id, s.name AS store_name,
               sum(oi.quantity)::int AS units_sold,
               sum(oi.total_paise)::double precision AS revenue_paise,
               count(DISTINCT oi.order_id)::int AS orders_count
        FROM order_items oi
        JOIN orders o ON o.id=oi.order_id
        JOIN stores s ON s.id=o.store_id
        WHERE o.created_at >= ${cutoff} AND o.created_at <= ${endCutoff}
        ${q.storeId && q.storeId !== 'ALL' ? Prisma.sql`AND o.store_id = ${q.storeId}` : Prisma.empty}
        ${q.tenantId && q.tenantId !== 'ALL' ? Prisma.sql`AND o.tenant_id = ${q.tenantId}` : Prisma.empty}
        GROUP BY oi.product_name, oi.sku, oi.product_id, o.store_id, s.name
        ORDER BY units_sold DESC
        LIMIT 10
      `,
      this.db.productReview.count({
        where: {
          createdAt: { gte: cutoff, lte: endCutoff },
          ...(q.storeId && q.storeId !== 'ALL' ? { storeId: q.storeId } : {}),
          ...(q.tenantId && q.tenantId !== 'ALL' ? { tenantId: q.tenantId } : {}),
        },
      }),
      this.db.reviewReport.count({
        where: {
          createdAt: { gte: cutoff, lte: endCutoff },
        },
      }),
      this.db.reviewReport.count({
        where: {
          status: 'RESOLVED',
          resolvedAt: { gte: cutoff, lte: endCutoff },
        },
      }),
      this.db.productReview.count({
        where: {
          status: 'REMOVED',
          moderatedAt: { gte: cutoff, lte: endCutoff },
          ...(q.storeId && q.storeId !== 'ALL' ? { storeId: q.storeId } : {}),
          ...(q.tenantId && q.tenantId !== 'ALL' ? { tenantId: q.tenantId } : {}),
        },
      }),
      this.db.$queryRaw<Array<{ avg_min: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))/60.0 AS avg_min
        FROM review_reports
        WHERE status='RESOLVED' AND resolved_at IS NOT NULL
          AND resolved_at >= ${cutoff} AND resolved_at <= ${endCutoff}
      `,
      this.db.tenant.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 100,
      }),
      this.db.store.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, tenantId: true },
        orderBy: { name: 'asc' },
        take: 100,
      }),
      this.db.plan.findMany({
        select: { id: true, name: true, code: true },
        orderBy: { pricePaise: 'asc' },
      }),
    ]);

    // Build unified series for Platform Performance chart
    const dateMap = new Map<string, any>();
    if (from && endCutoff) {
      const cur = new Date(from);
      cur.setHours(0, 0, 0, 0);
      const end = new Date(endCutoff);
      let iterations = 0;
      while (cur <= end && iterations < 370) {
        iterations++;
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const dStr = interval === 'month' ? `${y}-${m}` : `${y}-${m}-${d}`;
        if (!dateMap.has(dStr)) {
          dateMap.set(dStr, {
            date: dStr,
            gmvPaise: 0,
            ordersCount: 0,
            subscriptionRevenuePaise: 0,
            merchantsCount: 0,
          });
        }
        if (interval === 'month') {
          cur.setMonth(cur.getMonth() + 1);
        } else {
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
    for (const r of rawOrderTrends) {
      const existing = dateMap.get(r.date) || {
        date: r.date,
        gmvPaise: 0,
        ordersCount: 0,
        subscriptionRevenuePaise: 0,
        merchantsCount: 0,
      };
      existing.gmvPaise = Math.round(r.gmvPaise || 0);
      existing.ordersCount = r.count || 0;
      dateMap.set(r.date, existing);
    }
    for (const r of rawSubTrends) {
      const existing = dateMap.get(r.date) || {
        date: r.date,
        gmvPaise: 0,
        ordersCount: 0,
        subscriptionRevenuePaise: 0,
        merchantsCount: 0,
      };
      existing.subscriptionRevenuePaise = Math.round(r.amountPaise || 0);
      dateMap.set(r.date, existing);
    }
    for (const r of rawMerchantTrends) {
      const existing = dateMap.get(r.date) || {
        date: r.date,
        gmvPaise: 0,
        ordersCount: 0,
        subscriptionRevenuePaise: 0,
        merchantsCount: 0,
      };
      existing.merchantsCount = r.count || 0;
      dateMap.set(r.date, existing);
    }
    const series = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Order status mix
    const totalStatusCount = rawStatusMix.reduce((sum, s) => sum + s.count, 0);
    const orderStatusMix = rawStatusMix.map((s) => ({
      status: s.status,
      count: s.count,
      percentage: totalStatusCount > 0 ? Math.round((s.count / totalStatusCount) * 1000) / 10 : 0,
      totalPaise: Math.round(s.totalPaise || 0),
    }));

    // Payment mix
    const totalPaymentCount = rawPaymentMix.reduce((sum, p) => sum + p.count, 0);
    const paymentMix = rawPaymentMix.map((p) => ({
      method: p.method,
      count: p.count,
      percentage: totalPaymentCount > 0 ? Math.round((p.count / totalPaymentCount) * 1000) / 10 : 0,
      totalPaise: Math.round(p.totalPaise || 0),
    }));

    // Top stores
    const storeIds = rawTopStores.map((s) => s.store_id);
    const storeRecords = storeIds.length > 0 ? await this.db.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, name: true, slug: true, tenantId: true, tenant: { select: { id: true, name: true } } },
    }) : [];

    const topStores = rawTopStores.map((s) => {
      const store = storeRecords.find((r) => r.id === s.store_id);
      const gmv = Math.round(s.gmv_paise || 0);
      const paidCount = s.paid_count || 0;
      return {
        id: s.store_id,
        name: store?.name || 'Unknown Store',
        slug: store?.slug || '',
        tenantId: store?.tenantId || '',
        merchantName: store?.tenant?.name || 'Unknown Merchant',
        ordersCount: s.count,
        gmvPaise: gmv,
        aovPaise: paidCount > 0 ? Math.round(gmv / paidCount) : 0,
      };
    });

    // Top products
    const topProducts = rawTopProducts.map((p) => ({
      productId: p.product_id,
      productName: p.product_name,
      sku: p.sku,
      storeId: p.store_id,
      storeName: p.store_name,
      unitsSold: p.units_sold,
      revenuePaise: Math.round(p.revenue_paise || 0),
      ordersCount: p.orders_count,
    }));

    const averageResolutionMinutes = rawAvgRes?.[0]?.avg_min != null ? Math.round(Number(rawAvgRes[0].avg_min)) : null;

    return {
      range,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
      kpis: {
        totalOrders,
        paidOrdersCount,
        totalGmvPaise,
        averageOrderValuePaise,
        subscriptionRevenuePaise,
        merchantsCreated,
        activeStores,
      },
      performanceChart: {
        interval,
        series,
      },
      orderStatusMix,
      paymentMix,
      topStores,
      topProducts,
      reviewModeration: {
        reviewsCreated: rawReviews,
        reportsCreated: rawReports,
        reportsResolved: rawResolved,
        reviewsRemoved: rawRemoved,
        averageResolutionMinutes,
      },
      filterOptions: {
        merchants: filterMerchants,
        stores: filterStores,
        plans: filterPlans,
      },
      charts: await this.charts(from),
    };
  }
  async themes() {
    return this.db.theme.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        isDefault: true,
        updatedAt: true,
        _count: { select: { storeConfigs: true } },
      },
    });
  }
  async settings() {
    const brand = getBrandConfig();
    const growth = await this.db.plan.findUnique({
      where: { code: 'GROWTH_MONTHLY' },
    });
    return {
      platformName: brand.brandName,
      supportEmail: brand.supportEmail,
      currency: brand.defaultCurrency,
      timezone: brand.timezone,
      source: 'Current backend deployment configuration (read-only)',
      moderation:
        'Merchant reports stay visible until an admin removes a review.',
      plansSource: 'Canonical backend plan records',
      growthPurchaseEnabled: growth
        ? planAvailability(growth).purchasable
        : false,
    };
  }
}
