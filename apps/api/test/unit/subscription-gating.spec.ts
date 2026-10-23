import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionVisibilityService } from '../../src/modules/subscriptions/subscription-visibility.service';
import { SubscriptionService } from '../../src/modules/subscriptions/subscription.service';
import { PrismaClient, StoreStatus, SubscriptionStatus } from '@prisma/client';
import {
  StoreNotFoundException,
  StoreNotLiveException,
  StoreSuspendedException,
  StoreSubscriptionRequiredException,
  StoreSubscriptionExpiredException,
} from '../../src/common/exceptions/domain.exceptions';
import { AuthenticatedUser, UserRole } from '@simply/types';

describe('Subscription-Gated Store Visibility (Unit Tests)', () => {
  let visibilityService: SubscriptionVisibilityService;
  let subscriptionService: SubscriptionService;
  let mockPrisma: any;

  const mockStore = {
    id: 'store-1',
    tenantId: 'tenant-1',
    name: 'Aurelia Atelier',
    slug: 'aurelia',
    status: StoreStatus.LIVE,
    isPubliclyAccessible: true,
    previewSecret: 'secret-123',
    tenant: {
      id: 'tenant-1',
      subscriptions: [
        {
          id: 'sub-1',
          tenantId: 'tenant-1',
          planId: 'plan-growth',
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        },
      ],
    },
  };

  beforeEach(async () => {
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }]),
      store: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      subscription: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      subscriptionEvent: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      plan: {
        findUnique: jest.fn().mockResolvedValue({ id: 'plan-1', code: 'GROWTH', pricePaise: 249900 }),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionVisibilityService,
        SubscriptionService,
        { provide: PrismaClient, useValue: mockPrisma },
      ],
    }).compile();

    visibilityService = module.get<SubscriptionVisibilityService>(SubscriptionVisibilityService);
    subscriptionService = module.get<SubscriptionService>(SubscriptionService);
  });

  it('1. Active paid store CAN be opened publicly', async () => {
    mockPrisma.store.findFirst.mockResolvedValue(mockStore);

    const result = await visibilityService.evaluateVisibility('aurelia');
    expect(result.store.slug).toBe('aurelia');
    expect(result.isPreview).toBe(false);
  });

  it('2. Unpaid store CANNOT be opened publicly', async () => {
    const unpaidStore = {
      ...mockStore,
      status: StoreStatus.PRIVATE_PREVIEW,
      isPubliclyAccessible: false,
      tenant: {
        id: 'tenant-1',
        subscriptions: [
          {
            id: 'sub-2',
            tenantId: 'tenant-1',
            status: SubscriptionStatus.UNPAID,
            currentPeriodEnd: new Date(Date.now() - 1000),
          },
        ],
      },
    };
    mockPrisma.store.findFirst.mockResolvedValue(unpaidStore);

    await expect(visibilityService.evaluateVisibility('aurelia')).rejects.toThrow(
      StoreSubscriptionRequiredException
    );
  });

  it('3. Store with NO subscription record throws StoreSubscriptionRequiredException', async () => {
    const noSubStore = {
      ...mockStore,
      tenant: { id: 'tenant-1', subscriptions: [] },
    };
    mockPrisma.store.findFirst.mockResolvedValue(noSubStore);

    await expect(visibilityService.evaluateVisibility('aurelia')).rejects.toThrow(
      StoreSubscriptionRequiredException
    );
  });

  it('4. Expired store immediately becomes unavailable publicly', async () => {
    const expiredStore = {
      ...mockStore,
      tenant: {
        id: 'tenant-1',
        subscriptions: [
          {
            id: 'sub-1',
            tenantId: 'tenant-1',
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
            currentPeriodEnd: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Expired 5 days ago
          },
        ],
      },
    };
    mockPrisma.store.findFirst.mockResolvedValue(expiredStore);

    await expect(visibilityService.evaluateVisibility('aurelia')).rejects.toThrow(
      StoreSubscriptionExpiredException
    );
  });

  it('5. Unpaid store owner CAN preview their store privately', async () => {
    const unpaidStore = {
      ...mockStore,
      status: StoreStatus.PRIVATE_PREVIEW,
      isPubliclyAccessible: false,
      tenant: { id: 'tenant-1', subscriptions: [] },
    };
    mockPrisma.store.findFirst.mockResolvedValue(unpaidStore);

    const authenticatedOwner: AuthenticatedUser = {
      userId: 'user-1',
      phone: '+919876543210',
      role: UserRole.SELLER_OWNER,
      tenantId: 'tenant-1',
      storeId: 'store-1',
    };

    const result = await visibilityService.evaluateVisibility('aurelia', {
      authenticatedUser: authenticatedOwner,
    });

    expect(result.store).toBeDefined();
    expect(result.isPreview).toBe(true);
  });

  it('6. Unpaid store CAN be previewed with valid previewSecret', async () => {
    const unpaidStore = {
      ...mockStore,
      status: StoreStatus.PRIVATE_PREVIEW,
      isPubliclyAccessible: false,
      tenant: { id: 'tenant-1', subscriptions: [] },
    };
    mockPrisma.store.findFirst.mockResolvedValue(unpaidStore);

    const result = await visibilityService.evaluateVisibility('aurelia', {
      previewSecret: 'secret-123',
    });

    expect(result.store).toBeDefined();
    expect(result.isPreview).toBe(true);
  });

  it('7. Suspended store CANNOT be opened publicly even if paid', async () => {
    const suspendedStore = {
      ...mockStore,
      status: StoreStatus.SUSPENDED,
    };
    mockPrisma.store.findFirst.mockResolvedValue(suspendedStore);

    await expect(visibilityService.evaluateVisibility('aurelia')).rejects.toThrow(
      StoreSuspendedException
    );
  });

  it('8. Renewing subscription restores store visibility and marks stores LIVE', async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({ id: 'sub-old' });
    mockPrisma.subscription.update.mockResolvedValue({ id: 'sub-old', status: SubscriptionStatus.ACTIVE });

    await subscriptionService.activateOrRenewSubscription('tenant-1', 'plan-1', 30, 'actor-1');

    // Verifies stores are updated to LIVE and isPubliclyAccessible: true
    expect(mockPrisma.store.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', deletedAt: null },
      data: { status: StoreStatus.LIVE, isPubliclyAccessible: true },
    });

    // Verifies audit log created
    expect(mockPrisma.auditLog.create).toHaveBeenCalled();
  });

  it('9. Admin override modifies store visibility and logs audit trail', async () => {
    mockPrisma.store.findUnique.mockResolvedValue(mockStore);
    mockPrisma.store.update.mockResolvedValue({ ...mockStore, status: StoreStatus.LIVE });

    await subscriptionService.adminOverrideStoreVisibility(
      'store-1',
      true,
      'admin-super',
      'Merchant KYC verified offline'
    );

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-super',
        actorType: 'ADMIN',
        action: 'ADMIN_OVERRIDE_STORE_LIVE',
        entityId: 'store-1',
        metadata: expect.objectContaining({ reason: 'Merchant KYC verified offline' }),
      }),
    });
  });
});
