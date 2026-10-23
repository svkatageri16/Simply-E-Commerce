import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { CartService } from '../../src/modules/cart/cart.service';
import { PaymentsService } from '../../src/modules/payments/payments.service';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { AppModule } from '../../src/app.module';
import { SEED_IDS } from '@simply/db';
import { ProductMode, ProductStatus, OrderStatus, PaymentStatus } from '@simply/types';
import crypto from 'crypto';

describe('Orders Checkout Concurrency & Payment Recovery Suite', () => {
  let prisma: PrismaClient;
  let ordersService: OrdersService;
  let cartService: CartService;
  let paymentsService: PaymentsService;
  let catalogService: CatalogService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleFixture.get<PrismaClient>(PrismaClient);
    ordersService = moduleFixture.get<OrdersService>(OrdersService);
    cartService = moduleFixture.get<CartService>(CartService);
    paymentsService = moduleFixture.get<PaymentsService>(PaymentsService);
    catalogService = moduleFixture.get<CatalogService>(CatalogService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Buyer Checkout with checkoutKey: Advisory lock executes cleanly without void error', async () => {
    const cart = await cartService.getOrCreateCart(SEED_IDS.storeA);
    await cartService.addItem(cart.id, SEED_IDS.variantA1NavyS, 1);

    const checkoutKey = `chk_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const order = await ordersService.createGuestOrder({
      storeId: SEED_IDS.storeA,
      cartId: cart.id,
      fullName: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      phone: '+919876543210',
      paymentMethod: 'COD',
      checkoutKey,
      deliveryAddress: {
        addressLine1: '402, Sunshine Heights',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400050',
      },
    });

    expect(order).toBeDefined();
    expect(order.id).toBeDefined();
    expect(order.orderNumber).toBeDefined();
    expect(order.paymentMethod).toBe('COD');
    expect(order.status).toBe(OrderStatus.NEW);
  });

  it('2. Concurrency: Two simultaneous checkout requests for 1 limited-stock item', async () => {
    // Create a product with stock = 1
    const testAsset = await prisma.mediaAsset.findFirst({ where: { storeId: SEED_IDS.storeA } });
    const product = await catalogService.createProduct(
      { tenantId: SEED_IDS.tenantA, storeId: SEED_IDS.storeA },
      {
        name: `Limited Edition Jacket ${Date.now()}`,
        mode: ProductMode.SELL_ONLINE,
        pricePaise: 499900,
        stock: 1,
        sku: `LTD-JKT-${Date.now()}`,
        mediaAssetIds: testAsset ? [testAsset.id] : [],
        status: ProductStatus.PUBLISHED,
      }
    );
    const variantId = product!.variants[0].id;

    // Create 2 carts for 2 buyers, each wanting 1 item
    const cart1 = await cartService.getOrCreateCart(SEED_IDS.storeA);
    await cartService.addItem(cart1.id, variantId, 1);

    const cart2 = await cartService.getOrCreateCart(SEED_IDS.storeA);
    await cartService.addItem(cart2.id, variantId, 1);

    const key1 = `chk_c1_${Date.now()}`;
    const key2 = `chk_c2_${Date.now()}`;

    // Execute simultaneously
    const [result1, result2] = await Promise.allSettled([
      ordersService.createGuestOrder({
        storeId: SEED_IDS.storeA,
        cartId: cart1.id,
        fullName: 'Buyer One',
        email: 'buyer1@example.com',
        phone: '+919876543211',
        paymentMethod: 'COD',
        checkoutKey: key1,
        deliveryAddress: {
          addressLine1: 'Address 1',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400050',
        },
      }),
      ordersService.createGuestOrder({
        storeId: SEED_IDS.storeA,
        cartId: cart2.id,
        fullName: 'Buyer Two',
        email: 'buyer2@example.com',
        phone: '+919876543212',
        paymentMethod: 'COD',
        checkoutKey: key2,
        deliveryAddress: {
          addressLine1: 'Address 2',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400050',
        },
      }),
    ]);

    // Exactly one should succeed, and one should fail with insufficient stock
    const fulfilled = [result1, result2].filter((r) => r.status === 'fulfilled');
    const rejected = [result1, result2].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Verify inventory integrity: stockOnHand must be 0, reserved must not be negative
    const finalInv = await prisma.inventory.findUnique({ where: { variantId } });
    expect(finalInv!.stockOnHand).toBe(0);
    expect(finalInv!.stockReserved).toBeGreaterThanOrEqual(0);

    // Cleanup test product
    await prisma.product.delete({ where: { id: product!.id } });
  });

  it('3. Online payment initiation -> dismiss/fail -> switch to COD recovery', async () => {
    const cart = await cartService.getOrCreateCart(SEED_IDS.storeA);
    await cartService.addItem(cart.id, SEED_IDS.variantA1NavyM, 1);

    const checkoutKey = `chk_recovery_${Date.now()}`;
    const buyerEmail = 'priya.patel@example.com';
    const buyerPhone = '+919822334455';
    const deliveryAddress = {
      addressLine1: 'B-104, Royal Palms',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
    };

    // Step A: Initiate with RAZORPAY
    const onlineOrder = await ordersService.createGuestOrder({
      storeId: SEED_IDS.storeA,
      cartId: cart.id,
      fullName: 'Priya Patel',
      email: buyerEmail,
      phone: buyerPhone,
      paymentMethod: 'RAZORPAY',
      checkoutKey,
      deliveryAddress,
    });

    expect(onlineOrder).toBeDefined();
    expect(onlineOrder.paymentMethod).toBe('RAZORPAY');
    expect(onlineOrder.status).toBe(OrderStatus.NEW);
    expect(onlineOrder.paymentStatus).toBe(PaymentStatus.PENDING);

    // Create payment order (paise integer amount)
    const paymentOrder: any = await paymentsService.createPaymentOrder(onlineOrder.id);
    expect(paymentOrder).toBeDefined();
    expect(paymentOrder.amountPaise).toBe(onlineOrder.totalPaise);
    expect(Number.isInteger(paymentOrder.amountPaise)).toBe(true);

    // Step B: User dismisses gateway / gateway fails, switches to COD with same checkoutKey
    const codOrder = await ordersService.createGuestOrder({
      storeId: SEED_IDS.storeA,
      cartId: cart.id,
      fullName: 'Priya Patel',
      email: buyerEmail,
      phone: buyerPhone,
      paymentMethod: 'COD',
      checkoutKey,
      deliveryAddress,
    });

    // Expect: Same order updated to COD, NOT a duplicate order
    expect(codOrder.id).toBe(onlineOrder.id);
    expect(codOrder.orderNumber).toBe(onlineOrder.orderNumber);
    expect(codOrder.paymentMethod).toBe('COD');

    // Verify previously pending payment order was marked FAILED
    const prevPayment = await prisma.paymentOrder.findUnique({ where: { id: paymentOrder.paymentOrderId } });
    expect(prevPayment!.status).toBe('FAILED');
  });
});
