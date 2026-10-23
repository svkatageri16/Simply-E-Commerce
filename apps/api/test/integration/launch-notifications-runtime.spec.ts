import { PrismaClient, OrderStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { SubscriptionVisibilityService } from '../../src/modules/subscriptions/subscription-visibility.service';
import { MailService } from '../../src/modules/notifications/mail.service';
import { OrderEmailWorker } from '../../src/modules/outbox/order-email.worker';
import { OutboxService } from '../../src/modules/outbox/outbox.service';

describe('Order stage lifecycle and durable email: real DB, isolated SMTP transport', () => {
  const db = new PrismaClient();
  const run = randomUUID();
  const topic = `OWNED_MAIL_${run}`;
  let tenant: any, store: any, plan: any, product: any;
  let orders: OrdersService, worker: OrderEmailWorker, outbox: OutboxService;
  const messages: any[] = [];
  let failNext = false;

  beforeAll(async () => {
    tenant = await db.tenant.create({ data: { name: 'Notification fixture', slug: `mail-${run}` } });
    store = await db.store.create({ data: { tenantId: tenant.id, name: 'Notification fixture', slug: `mail-${run}`, status: 'LIVE', isPubliclyAccessible: true } });
    plan = await db.plan.create({ data: { name: 'Owned notification plan', code: `MAIL_${run}`, pricePaise: 99900 } });
    await db.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, status: 'ACTIVE', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 86400000) } });
    const asset = await db.mediaAsset.create({ data: { tenantId: tenant.id, storeId: store.id, storageKey: `owned/${run}.jpg`, publicUrl: 'https://example.test/owned.jpg', fileName: 'owned.jpg', mimeType: 'image/jpeg', sizeBytes: 100 } });
    product = await new CatalogService(db).createProduct({ tenantId: tenant.id, storeId: store.id }, { name: 'Owned lifecycle product', pricePaise: 25000, stock: 5, mode: 'SELL_ONLINE' as any, status: 'PUBLISHED' as any, mediaAssetIds: [asset.id] });
    const mail = new MailService();
    (mail as any).transporter = {
      verify: async () => true,
      sendMail: async (message: any) => {
        if (failNext) { failNext = false; throw new Error('isolated temporary SMTP failure'); }
        messages.push(message);
        return { accepted: [message.to], rejected: [], messageId: message.messageId || 'isolated-message', response: '250 Accepted' };
      },
    };
    outbox = new OutboxService(db);
    worker = new OrderEmailWorker(db, mail, outbox);
    outbox.registerHandler(topic, event => worker.deliver(event));
    const noop = { sendVendorNewOrderAlert: async () => false, sendDirectOrderStatusUpdate: async () => false };
    orders = new OrdersService(db, new SubscriptionVisibilityService(db), new InventoryService(db), {} as any, noop as any, noop as any);
  });

  afterAll(async () => {
    if (tenant) {
      await db.outboxEvent.deleteMany({ where: { tenantId: tenant.id } });
      await db.tenant.delete({ where: { id: tenant.id } });
    }
    if (plan) await db.plan.delete({ where: { id: plan.id } });
    await db.$disconnect();
  });

  const context = () => ({ tenantId: tenant.id, storeId: store.id });
  const flush = async () => {
    await db.outboxEvent.updateMany({ where: { tenantId: tenant.id, eventType: 'ORDER_EMAIL' }, data: { eventType: topic } });
    await outbox.processPendingEvents(50);
  };
  const checkout = () => orders.createGuestOrder({ storeId: store.id, directItems: [{ productId: product.id, variantId: product.variants[0].id, quantity: 1 }], fullName: 'Original Buyer', email: 'original@example.test', phone: '+919876500123', paymentMethod: 'COD', fulfillmentMode: 'PICKUP' as any, checkoutKey: `notify_${randomUUID()}` });

  it('persists every stage during SMTP outage, retries once, and sends no duplicate on repeated status or worker restart', async () => {
    const order = await checkout();
    await flush();
    expect(messages).toHaveLength(1);
    await db.customer.update({ where: { id: order.customerId }, data: { email: 'changed@example.test', fullName: 'Changed Buyer' } });
    failNext = true;
    await Promise.all([orders.updateOrderStatus(order.id, OrderStatus.CONFIRMED, context()), orders.updateOrderStatus(order.id, OrderStatus.CONFIRMED, context())]);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('CONFIRMED');
    await flush();
    const failed = await db.outboxEvent.findUniqueOrThrow({ where: { id: `order-email:${order.id}:CONFIRMED` } });
    expect(failed.status).toBe('PENDING');
    expect(failed.retryCount).toBe(1);
    await db.outboxEvent.update({ where: { id: failed.id }, data: { nextRetryAt: new Date(0) } });
    await flush();
    expect(messages).toHaveLength(2);
    for (const status of [OrderStatus.READY, OrderStatus.DISPATCHED]) {
      await orders.updateOrderStatus(order.id, status, context());
      await flush();
    }
    await Promise.all([orders.markOutForDelivery(order.id, context()), orders.markOutForDelivery(order.id, context())]);
    await flush();
    await orders.updateOrderStatus(order.id, OrderStatus.COMPLETED, context());
    await flush();
    await orders.updateOrderStatus(order.id, OrderStatus.COMPLETED, context());
    const restarted = new OutboxService(db);
    restarted.registerHandler(topic, event => worker.deliver(event));
    await restarted.processPendingEvents(50);
    expect(messages).toHaveLength(6);
    expect(messages.every(m => m.to === 'original@example.test')).toBe(true);
    expect(new Set(messages.map(m => m.messageId)).size).toBe(6);
    expect(messages.some(m => /Out For Delivery/i.test(m.subject))).toBe(true);
    expect(messages.filter(m => /Delivered!/i.test(m.subject))).toHaveLength(1);
    expect(messages.every(m => m.html.includes('Notification fixture') && m.html.includes(order.orderNumber))).toBe(true);
    await expect(orders.markOutForDelivery(order.id, { tenantId: randomUUID(), storeId: randomUUID() })).rejects.toThrow(/not found/i);
    await db.store.update({ where: { id: store.id }, data: { isPubliclyAccessible: false } });
    try {
      await expect(orders.createGuestOrder({ storeId: store.id, directItems: [{ productId: product.id, variantId: product.variants[0].id, quantity: 1 }], fullName: 'Original Buyer', email: 'original@example.test', phone: '+919876500123', paymentMethod: 'COD', fulfillmentMode: 'PICKUP' as any, checkoutKey: order.checkoutKey!.slice(store.id.length + 1) })).rejects.toThrow(/private/i);
    } finally { await db.store.update({ where: { id: store.id }, data: { isPubliclyAccessible: true } }); }
  });

  it('cancellation queues once and returns reserved stock exactly once', async () => {
    const order = await checkout();
    await flush();
    const stock = await db.inventory.findUniqueOrThrow({ where: { variantId: product.variants[0].id } });
    await Promise.all([orders.updateOrderStatus(order.id, OrderStatus.CANCELLED, context()), orders.updateOrderStatus(order.id, OrderStatus.CANCELLED, context())]);
    await flush();
    const after = await db.inventory.findUniqueOrThrow({ where: { variantId: product.variants[0].id } });
    expect(after.stockOnHand).toBe(stock.stockOnHand + 1);
    expect(messages.filter(m => /Cancelled/i.test(m.subject))).toHaveLength(1);
    expect(await db.outboxEvent.count({ where: { id: `order-email:${order.id}:CANCELLED` } })).toBe(1);
  });
});
