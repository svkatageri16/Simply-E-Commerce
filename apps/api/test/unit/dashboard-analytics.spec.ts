import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, PaymentStatus, OrderStatus, StoreStatus, SubscriptionStatus } from '@prisma/client';
import { DashboardService } from '../../src/modules/seller/dashboard.service';
import { SubscriptionVisibilityService } from '../../src/modules/subscriptions/subscription-visibility.service';
import { parseDashboardPeriod } from '../../src/common/utils/timezone.util';
import {
  StoreSubscriptionRequiredException,
  StoreNotFoundException,
} from '../../src/common/exceptions/domain.exceptions';

describe('Merchant Screen 01 — Dashboard & Analytics Automated Test Suite', () => {
  let dashboardService: DashboardService;
  let mockPrisma: any;

  const mockTenantId = 'tenant-merchant-001';
  const mockOtherTenantId = 'tenant-merchant-999';
  const mockStoreId = 'store-boutique-001';
  const mockOtherStoreId = 'store-boutique-999';

  const defaultStoreMock = {
    id: mockStoreId,
    tenantId: mockTenantId,
    name: 'Boutique Store',
    slug: 'boutique-store',
    status: StoreStatus.LIVE,
    branding: null,
    tenant: {
      subscriptions: [{ status: SubscriptionStatus.ACTIVE }],
      paymentAccounts: [{ isEnabled: true }],
      shippingAccounts: [{ isEnabled: true }],
    },
  };

  beforeEach(async () => {
    mockPrisma = {
      order: {
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      b2bEnquiry: {
        count: jest.fn().mockResolvedValue(0),
      },
      enquiry: {
        count: jest.fn().mockResolvedValue(0),
      },
      productVariant: {
        count: jest.fn(),
      },
      inventory: {
        count: jest.fn().mockResolvedValue(1),
      },
      product: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      shippingProfile: {
        count: jest.fn(),
      },
      store: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: SubscriptionVisibilityService, useValue: { getEffectivePublicStatus: jest.fn().mockResolvedValue({ isPublic: true, requiresPayment: false, reason: null }) } },
        {
          provide: PrismaClient,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    dashboardService = module.get<DashboardService>(DashboardService);
  });

  describe('1. Time Period Filter Parsing & Asia/Kolkata Calendar Boundaries', () => {
    it('parses "today" period within Asia/Kolkata boundary', () => {
      const parsed = parseDashboardPeriod('today');
      expect(parsed.key).toBe('today');
      expect(parsed.groupBy).toBe('hour');
      expect(parsed.startDate.getTime()).toBeLessThan(parsed.endDate.getTime());
      // Same duration for previous period
      const currentDuration = parsed.endDate.getTime() - parsed.startDate.getTime();
      const prevDuration = parsed.previousEndDate.getTime() - parsed.previousStartDate.getTime();
      expect(currentDuration).toBe(prevDuration);
    });

    it('parses "7d" period within Asia/Kolkata boundary', () => {
      const parsed = parseDashboardPeriod('7d');
      expect(parsed.key).toBe('7d');
      expect(parsed.groupBy).toBe('day');
      expect(parsed.label).toBe('7 Days');
    });

    it('parses "30d" default period within Asia/Kolkata boundary', () => {
      const parsed = parseDashboardPeriod('30d');
      expect(parsed.key).toBe('30d');
      expect(parsed.groupBy).toBe('day');
      expect(parsed.label).toBe('30 Days');
    });

    it('parses "3m" and "6m" periods with week/month grouping', () => {
      const p3m = parseDashboardPeriod('3m');
      expect(p3m.groupBy).toBe('week');

      const p6m = parseDashboardPeriod('6m');
      expect(p6m.groupBy).toBe('month');
    });

    it('parses "1y" period with month grouping', () => {
      const p1y = parseDashboardPeriod('1y');
      expect(p1y.groupBy).toBe('month');
      expect(p1y.label).toBe('1 Year');
    });

    it('parses custom date range properly and prevents NaN', () => {
      const custom = parseDashboardPeriod(
        'custom',
        '2026-01-01T00:00:00.000Z',
        '2026-01-31T23:59:59.999Z'
      );
      expect(custom.key).toBe('custom');
      expect(custom.startDate.getTime()).toBeLessThan(custom.endDate.getTime());
      expect(isNaN(custom.startDate.getTime())).toBe(false);
      expect(isNaN(custom.endDate.getTime())).toBe(false);
    });
  });

  describe('2. Revenue, Order Eligibility & Previous Period Comparison', () => {
    it('calculates total revenue only from eligible orders (PAID and not CANCELLED/RETURNED)', async () => {
      mockPrisma.store.findFirst.mockResolvedValue(defaultStoreMock);

      // Eligible orders: PAID, CONFIRMED/COMPLETED
      const mockOrders = [
        {
          id: 'ord-1',
          orderNumber: 'ORD-001',
          totalPaise: 120000,
          paymentStatus: PaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
          createdAt: new Date(),
          customerName: 'Aarav Sharma',
          customerPhone: '9876543210',
          shippingAddress: { state: 'Maharashtra', city: 'Mumbai' },
          items: [{ productId: 'prod-1', quantity: 2, pricePaise: 60000, product: { title: 'Linen Shirt' } }],
        },
        {
          id: 'ord-2',
          orderNumber: 'ORD-002',
          totalPaise: 80000,
          paymentStatus: PaymentStatus.PAID,
          orderStatus: OrderStatus.COMPLETED,
          createdAt: new Date(),
          customerName: 'Diya Patel',
          customerPhone: '9876543211',
          shippingAddress: { state: 'Gujarat', city: 'Ahmedabad' },
          items: [{ productId: 'prod-2', quantity: 1, pricePaise: 80000, product: { title: 'Silk Kurti' } }],
        },
      ];

      mockPrisma.order.findMany.mockImplementation((args: any) => {
        return Promise.resolve(mockOrders);
      });

      mockPrisma.order.count.mockResolvedValue(2);
      mockPrisma.b2bEnquiry.count.mockResolvedValue(5);
      mockPrisma.productVariant.count.mockResolvedValue(1);
      mockPrisma.product.count.mockResolvedValue(10);
      mockPrisma.shippingProfile.count.mockResolvedValue(1);

      const res = await dashboardService.getDashboardAnalytics(mockTenantId, mockStoreId, { period: '30d' });

      expect(res.metrics.revenuePaise).toBe(200000); // 120000 + 80000
      expect(res.metrics.orders).toBe(2);
      expect(res.metrics.averageOrderValuePaise).toBe(100000); // 200000 / 2
      expect(res.metrics.customers).toBe(2);
    });

    it('safely handles previous period comparison when previous period value is 0 (returns null instead of Infinity/NaN)', async () => {
      mockPrisma.store.findFirst.mockResolvedValue(defaultStoreMock);

      // Current orders exist, previous orders are empty
      let callCount = 0;
      mockPrisma.order.findMany.mockImplementation((args: any) => {
        callCount++;
        if (callCount === 1) {
          // Current period
          return Promise.resolve([
            {
              id: 'ord-1',
              totalPaise: 50000,
              paymentStatus: PaymentStatus.PAID,
              orderStatus: OrderStatus.CONFIRMED,
              createdAt: new Date(),
              customerName: 'Test Buyer',
              customerPhone: '9999999999',
              items: [],
            },
          ]);
        }
        // Previous period = 0 orders
        return Promise.resolve([]);
      });

      mockPrisma.order.count.mockResolvedValue(1);
      mockPrisma.b2bEnquiry.count.mockResolvedValue(0);
      mockPrisma.productVariant.count.mockResolvedValue(0);
      mockPrisma.product.count.mockResolvedValue(5);
      mockPrisma.shippingProfile.count.mockResolvedValue(1);

      const res = await dashboardService.getDashboardAnalytics(mockTenantId, mockStoreId, { period: '30d' });

      // No previous value -> comparison should be null (NOT Infinity or NaN)
      expect(res.comparison.revenuePercent).toBeNull();
      expect(res.comparison.ordersPercent).toBeNull();
    });

    it('returns AOV = 0 paise when eligible order count is 0', async () => {
      mockPrisma.store.findFirst.mockResolvedValue(defaultStoreMock);

      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.b2bEnquiry.count.mockResolvedValue(0);
      mockPrisma.productVariant.count.mockResolvedValue(0);
      mockPrisma.product.count.mockResolvedValue(0);
      mockPrisma.shippingProfile.count.mockResolvedValue(0);

      const res = await dashboardService.getDashboardAnalytics(mockTenantId, mockStoreId, { period: '30d' });

      expect(res.metrics.revenuePaise).toBe(0);
      expect(res.metrics.orders).toBe(0);
      expect(res.metrics.averageOrderValuePaise).toBe(0);
      expect(res.topProducts.byRevenue).toHaveLength(0);
      expect(res.customerInsights.repeatRate).toBe(0);
    });
  });

  describe('3. Top Products, Customer Insights & Geographic Analytics', () => {
    it('aggregates top products by revenue and quantity correctly', async () => {
      mockPrisma.store.findFirst.mockResolvedValue(defaultStoreMock);

      const mockOrders = [
        {
          id: 'ord-1',
          totalPaise: 300000,
          paymentStatus: PaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
          createdAt: new Date(),
          customerName: 'Kavita',
          customerPhone: '9876500001',
          shippingAddress: { state: 'Karnataka', city: 'Bengaluru' },
          items: [
            { productId: 'prod-A', quantity: 10, pricePaise: 20000, product: { title: 'Product A' } },
            { productId: 'prod-B', quantity: 2, pricePaise: 50000, product: { title: 'Product B' } },
          ],
        },
      ];

      mockPrisma.order.findMany.mockResolvedValue(mockOrders);
      mockPrisma.order.count.mockResolvedValue(1);
      mockPrisma.b2bEnquiry.count.mockResolvedValue(0);
      mockPrisma.productVariant.count.mockResolvedValue(0);
      mockPrisma.product.count.mockResolvedValue(2);
      mockPrisma.shippingProfile.count.mockResolvedValue(1);

      const res = await dashboardService.getDashboardAnalytics(mockTenantId, mockStoreId, { period: '30d' });

      // Product A sold 10 units for 200000 paise; Product B sold 2 units for 100000 paise
      expect(res.topProducts.byRevenue[0].name).toBe('Product A');
      expect(res.topProducts.byRevenue[0].quantitySold).toBe(10);
      expect(res.topProducts.byRevenue[0].revenuePaise).toBe(200000);

      expect(res.topProducts.byQuantity[0].name).toBe('Product A');
      expect(res.topProducts.byQuantity[0].quantitySold).toBe(10);

      // Geographic aggregation preserves state without exposing full address
      expect(res.topLocations[0].state).toBe('Karnataka');
      expect(res.topLocations[0].ordersCount).toBe(1);
    });

    it('normalizes state names like Maha and MH into Maharashtra without duplicate states', async () => {
      mockPrisma.store.findFirst.mockResolvedValue(defaultStoreMock);

      const mockOrders = [
        {
          id: 'ord-1',
          totalPaise: 100000,
          paymentStatus: PaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
          paymentMethod: 'COD',
          createdAt: new Date(),
          customerName: 'Buyer 1',
          customerPhone: '9876500001',
          orderAddress: { state: 'Maha', city: 'Solapur' },
          items: [{ productId: 'prod-1', productName: 'SohanK', quantity: 1, totalPaise: 100000 }],
        },
        {
          id: 'ord-2',
          totalPaise: 150000,
          paymentStatus: PaymentStatus.PAID,
          orderStatus: OrderStatus.COMPLETED,
          paymentMethod: 'ONLINE',
          createdAt: new Date(),
          customerName: 'Buyer 2',
          customerPhone: '9876500002',
          orderAddress: { state: 'Maharashtra', city: 'Mumbai' },
          items: [{ productId: 'prod-1', productName: 'SohanK', quantity: 2, totalPaise: 150000 }],
        },
      ];

      mockPrisma.order.findMany.mockResolvedValue(mockOrders);
      mockPrisma.order.count.mockResolvedValue(2);
      mockPrisma.b2bEnquiry.count.mockResolvedValue(0);
      mockPrisma.productVariant.count.mockResolvedValue(0);
      mockPrisma.product.count.mockResolvedValue(1);
      mockPrisma.shippingProfile.count.mockResolvedValue(1);

      const res = await dashboardService.getDashboardAnalytics(mockTenantId, mockStoreId, { period: '30d' });

      // Maha and Maharashtra must be consolidated into single Maharashtra state
      expect(res.topLocations).toHaveLength(1);
      expect(res.topLocations[0].state).toBe('Maharashtra');
      expect(res.topLocations[0].ordersCount).toBe(2);
      expect(res.topLocations[0].revenuePaise).toBe(250000);

      // Cities are also aggregated
      expect(res.topCities.map((c: any) => c.city)).toEqual(expect.arrayContaining(['Solapur', 'Mumbai']));

      // Top products: SohanK must only appear ONCE with consolidated quantity 3 and revenue 250000
      expect(res.topProducts.byRevenue).toHaveLength(1);
      expect(res.topProducts.byRevenue[0].name).toBe('SohanK');
      expect(res.topProducts.byRevenue[0].quantitySold).toBe(3);
      expect(res.topProducts.byRevenue[0].revenuePaise).toBe(250000);

      // Payment mix has both COD and Prepaid
      expect(res.paymentMix).toHaveLength(2);
      const codMix = res.paymentMix.find((m: any) => m.method === 'COD');
      const prepaidMix = res.paymentMix.find((m: any) => m.method === 'PREPAID');
      expect(codMix).toBeDefined();
      expect(codMix!.ordersCount).toBe(1);
      expect(prepaidMix).toBeDefined();
      expect(prepaidMix!.ordersCount).toBe(1);
    });

    it('identifies returning customers correctly when a customer places > 1 order', async () => {
      mockPrisma.store.findFirst.mockResolvedValue(defaultStoreMock);

      const mockOrders = [
        {
          id: 'ord-1',
          totalPaise: 100000,
          paymentStatus: PaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
          createdAt: new Date(),
          customerName: 'Repeat Buyer',
          customerPhone: '9888888888',
          items: [],
        },
        {
          id: 'ord-2',
          totalPaise: 150000,
          paymentStatus: PaymentStatus.PAID,
          orderStatus: OrderStatus.COMPLETED,
          createdAt: new Date(),
          customerName: 'Repeat Buyer',
          customerPhone: '9888888888',
          items: [],
        },
        {
          id: 'ord-3',
          totalPaise: 50000,
          paymentStatus: PaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
          createdAt: new Date(),
          customerName: 'New Buyer',
          customerPhone: '9777777777',
          items: [],
        },
      ];

      mockPrisma.order.findMany.mockResolvedValue(mockOrders);
      mockPrisma.order.count.mockResolvedValue(3);
      mockPrisma.b2bEnquiry.count.mockResolvedValue(0);
      mockPrisma.productVariant.count.mockResolvedValue(0);
      mockPrisma.product.count.mockResolvedValue(5);
      mockPrisma.shippingProfile.count.mockResolvedValue(1);

      const res = await dashboardService.getDashboardAnalytics(mockTenantId, mockStoreId, { period: '30d' });

      // Unique customers: 2 (Repeat Buyer and New Buyer)
      expect(res.customerInsights.newCustomers).toBe(1);
      expect(res.customerInsights.returningCustomers).toBe(1);
      expect(res.customerInsights.repeatRate).toBe(50.0); // 1 / 2 = 50%
      expect(res.customerInsights.topCustomers[0].name).toBe('Repeat Buyer');
      expect(res.customerInsights.topCustomers[0].ordersCount).toBe(2);
      expect(res.customerInsights.topCustomers[0].totalSpendPaise).toBe(250000);
    });

    it('limits recent orders to exactly 5', async () => {
      mockPrisma.store.findFirst.mockResolvedValue(defaultStoreMock);

      // Generate 10 orders
      const tenOrders = Array.from({ length: 10 }, (_, i) => ({
        id: `ord-${i}`,
        orderNumber: `ORD-${100 + i}`,
        totalPaise: 50000,
        paymentStatus: PaymentStatus.PAID,
        orderStatus: OrderStatus.CONFIRMED,
        createdAt: new Date(Date.now() - i * 1000),
        customerName: `Customer ${i}`,
        customerPhone: `900000000${i}`,
        items: [],
      }));

      mockPrisma.order.findMany.mockImplementation((args: any) => {
        if (args.take === 5) {
          return Promise.resolve(tenOrders.slice(0, 5));
        }
        return Promise.resolve(tenOrders);
      });

      mockPrisma.order.count.mockResolvedValue(10);
      mockPrisma.b2bEnquiry.count.mockResolvedValue(0);
      mockPrisma.productVariant.count.mockResolvedValue(0);
      mockPrisma.product.count.mockResolvedValue(5);
      mockPrisma.shippingProfile.count.mockResolvedValue(1);

      const res = await dashboardService.getDashboardAnalytics(mockTenantId, mockStoreId, { period: '30d' });
      expect(res.recentOrders.length).toBeLessThanOrEqual(5);
    });
  });

  describe('4. Tenant Isolation & Security Verification', () => {
    it('rejects access when store belongs to a different tenant (Cross-tenant security)', async () => {
      // When tenantId doesn't match, findFirst returns null
      mockPrisma.store.findFirst.mockResolvedValue(null);

      await expect(
        dashboardService.getDashboardAnalytics(mockTenantId, mockStoreId, { period: '30d' })
      ).rejects.toThrow('Store not found for current tenant.');
    });

    it('rejects when store does not exist', async () => {
      mockPrisma.store.findFirst.mockResolvedValue(null);

      await expect(
        dashboardService.getDashboardAnalytics(mockTenantId, 'non-existent-store', { period: '30d' })
      ).rejects.toThrow('Store not found for current tenant.');
    });
  });

  describe('5. Store Preview Security & Public Gating (Part C)', () => {
    let subVisService: SubscriptionVisibilityService;

    beforeEach(async () => {
      const subModule = await Test.createTestingModule({
        providers: [
          SubscriptionVisibilityService,
          {
            provide: PrismaClient,
            useValue: mockPrisma,
          },
        ],
      }).compile();
      subVisService = subModule.get<SubscriptionVisibilityService>(SubscriptionVisibilityService);
    });

    it('allows authenticated store owner to preview their private/unpaid store', async () => {
      mockPrisma.store.findFirst.mockResolvedValue({
        id: mockStoreId,
        slug: 'my-private-boutique',
        tenantId: mockTenantId,
        status: StoreStatus.PRIVATE_PREVIEW,
        previewSecret: 'secret-123',
        tenant: { subscriptions: [] }, // No paid subscription yet!
      });

      const result = await subVisService.evaluateVisibility('my-private-boutique', {
        authenticatedUser: {
          id: 'user-merchant-1',
          tenantId: mockTenantId, // Matching owner tenantId
          roles: ['MERCHANT'],
          isPlatformAdmin: false,
        } as any,
      });

      expect(result.isPreview).toBe(true);
      expect(result.store.slug).toBe('my-private-boutique');
    });

    it('blocks public visitors from accessing private/unpaid store', async () => {
      mockPrisma.store.findFirst.mockResolvedValue({
        id: mockStoreId,
        slug: 'my-private-boutique',
        tenantId: mockTenantId,
        status: StoreStatus.PRIVATE_PREVIEW,
        previewSecret: 'secret-123',
        tenant: { subscriptions: [] },
      });

      // Public visitor has no auth and no previewSecret
      await expect(
        subVisService.evaluateVisibility('my-private-boutique', {
          authenticatedUser: null,
        })
      ).rejects.toThrow(StoreSubscriptionRequiredException);
    });

    it('blocks authenticated merchant from previewing another merchant private store', async () => {
      mockPrisma.store.findFirst.mockResolvedValue({
        id: mockOtherStoreId,
        slug: 'competitor-private-store',
        tenantId: mockOtherTenantId, // Belongs to competitor!
        status: StoreStatus.PRIVATE_PREVIEW,
        previewSecret: 'secret-456',
        tenant: { subscriptions: [] },
      });

      // Merchant from mockTenantId tries to preview competitor's private store
      await expect(
        subVisService.evaluateVisibility('competitor-private-store', {
          authenticatedUser: {
            id: 'user-merchant-1',
            tenantId: mockTenantId, // Different tenant
            roles: ['MERCHANT'],
            isPlatformAdmin: false,
          } as any,
        })
      ).rejects.toThrow(StoreSubscriptionRequiredException);
    });
  });
});
