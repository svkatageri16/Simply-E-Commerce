import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { EnquiriesService } from '../../src/modules/enquiries/enquiries.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { SubscriptionVisibilityService } from '../../src/modules/subscriptions/subscription-visibility.service';
import { TenantGuard } from '../../src/common/guards/tenant.guard';
import { TenantAccessDeniedException } from '../../src/common/exceptions/domain.exceptions';
import { SEED_IDS } from '@simply/db';
import { TenantContext, UserRole } from '@simply/types';
import { ShippingService } from '../../src/modules/shipping/shipping.service';
import { MailService } from '../../src/modules/notifications/mail.service';
import { WhatsAppService } from '../../src/modules/notifications/whatsapp.service';

describe('Multi-Tenancy Security & Tenant Isolation Tests', () => {
  let prisma: PrismaClient;
  let catalogService: CatalogService;
  let ordersService: OrdersService;
  let enquiriesService: EnquiriesService;
  let tenantGuard: TenantGuard;

  // Tenant A: Aurelia Atelier (Paid & Active)
  const tenantContextA: TenantContext = {
    tenantId: SEED_IDS.tenantA,
    storeId: SEED_IDS.storeA,
  };

  // Tenant B: Patil Engineering (Unpaid & Private)
  const tenantContextB: TenantContext = {
    tenantId: SEED_IDS.tenantB,
    storeId: SEED_IDS.storeB,
  };

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.TEST_DATABASE_URL ||
            'postgresql://postgres:postgres@localhost:5432/simply_ecommerce_test?schema=public',
        },
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        OrdersService,
        EnquiriesService,
        InventoryService,
        SubscriptionVisibilityService,
        TenantGuard,
        { provide: ShippingService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: PrismaClient, useValue: prisma },
      ],
    }).compile();

    catalogService = module.get<CatalogService>(CatalogService);
    ordersService = module.get<OrdersService>(OrdersService);
    enquiriesService = module.get<EnquiriesService>(EnquiriesService);
    tenantGuard = module.get<TenantGuard>(TenantGuard);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Tenant A CAN read their own products', async () => {
    const productA = await catalogService.getProductById(
      tenantContextA,
      SEED_IDS.productA1
    );
    expect(productA).toBeDefined();
    expect(productA.id).toBe(SEED_IDS.productA1);
    expect(productA.tenantId).toBe(SEED_IDS.tenantA);
  });

  it('2. Tenant A CANNOT read Tenant B products by ID (Attack: Guessed ID)', async () => {
    // Attempting to read Tenant B's product using Tenant A's authenticated context
    await expect(
      catalogService.getProductById(tenantContextA, SEED_IDS.productB1)
    ).rejects.toThrow();
  });

  it('3. Tenant A CANNOT delete Tenant B products (Attack: Unauthorized Modification)', async () => {
    await expect(
      catalogService.deleteProduct(
        tenantContextA,
        SEED_IDS.productB1,
        SEED_IDS.tenantAOwner
      )
    ).rejects.toThrow();

    // Verify Tenant B's product remains untouched and undeleted
    const prodB = await prisma.product.findUnique({
      where: { id: SEED_IDS.productB1 },
    });
    expect(prodB).toBeDefined();
    expect(prodB?.deletedAt).toBeNull();
  });

  it('4. Tenant A order queries return ZERO orders belonging to Tenant B', async () => {
    const ordersA = await ordersService.getOrders(tenantContextA);
    expect(ordersA.items.length).toBeGreaterThan(0);
    // Every single order returned MUST strictly belong to Tenant A
    for (const order of ordersA.items) {
      expect(order.tenantId).toBe(SEED_IDS.tenantA);
      expect(order.storeId).toBe(SEED_IDS.storeA);
    }

    // Tenant B has 0 orders
    const ordersB = await ordersService.getOrders(tenantContextB);
    expect(ordersB.items.length).toBe(0);
  });

  it('5. Tenant A CANNOT access Tenant B B2B enquiries', async () => {
    const enquiriesA = await enquiriesService.getEnquiries(tenantContextA);
    expect(enquiriesA.length).toBe(0);

    const enquiriesB = await enquiriesService.getEnquiries(tenantContextB);
    expect(enquiriesB.length).toBeGreaterThan(0);
    expect(enquiriesB[0].tenantId).toBe(SEED_IDS.tenantB);

    // Tenant A attempts to respond or view Tenant B enquiry
    await expect(
      enquiriesService.respondToEnquiry(
        tenantContextA,
        SEED_IDS.enquiryB1,
        10000
      )
    ).rejects.toThrow();
  });

  it('6. TenantGuard prevents cross-tenant parameter tampering in routes', () => {
    // Simulating attacker logged in as Tenant A sending request with /stores/:tenantId targeting Tenant B
    const mockContextMismatch: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            userId: 'user-a',
            role: UserRole.SELLER_OWNER,
            tenantId: SEED_IDS.tenantA,
            storeId: SEED_IDS.storeA,
          },
          params: {
            tenantId: SEED_IDS.tenantB, // Attacker forged Tenant B's ID in URL!
          },
        }),
      }),
    };

    expect(() => tenantGuard.canActivate(mockContextMismatch)).toThrow(
      TenantAccessDeniedException
    );

    // Valid matching tenant context passes
    const mockContextValid: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            userId: 'user-a',
            role: UserRole.SELLER_OWNER,
            tenantId: SEED_IDS.tenantA,
            storeId: SEED_IDS.storeA,
          },
          params: {
            tenantId: SEED_IDS.tenantA,
          },
        }),
      }),
    };

    expect(tenantGuard.canActivate(mockContextValid)).toBe(true);
  });
});
