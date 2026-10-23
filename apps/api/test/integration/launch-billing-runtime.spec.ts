import { PrismaClient } from '@prisma/client';
import { randomUUID, createHmac } from 'node:crypto';
import { PaymentsService } from '../../src/modules/payments/payments.service';
import { SubscriptionService } from '../../src/modules/subscriptions/subscription.service';
import { SubscriptionController } from '../../src/modules/subscriptions/subscription.controller';
import { RazorpayPaymentProvider } from '../../src/modules/payments/providers/razorpay-payment.provider';
import { MockPaymentProvider } from '../../src/modules/payments/providers/mock-payment.provider';
import { DashboardService } from '../../src/modules/seller/dashboard.service';
import { SubscriptionVisibilityService } from '../../src/modules/subscriptions/subscription-visibility.service';

describe('Launch billing: real PostgreSQL, isolated mocked gateway', () => {
  const db = new PrismaClient();
  const run = randomUUID();
  let tenant: any, store: any, plan: any, pro: any;
  let service: PaymentsService, subscriptions: SubscriptionService, controller: SubscriptionController;
  const gateway = new RazorpayPaymentProvider();
  const payments = new Map<string, any>();
  const oldKey = process.env.RAZORPAY_PLATFORM_KEY_SECRET;

  beforeAll(async () => {
    process.env.RAZORPAY_PLATFORM_KEY_SECRET = 'isolated-gateway-secret';
    tenant = await db.tenant.create({ data: { name: 'Owned billing fixture', slug: `billing-${run}`, billingName: 'Original Legal Name', billingEmail: 'billing@example.test', billingAddress: 'Owned fixture address', billingState: 'Maharashtra', billingPincode: '411001' } });
    store = await db.store.create({ data: { tenantId: tenant.id, name: 'Owned billing fixture', slug: `billing-${run}` } });
    plan = await db.plan.create({ data: { code: `SOLO_${run}`, name: 'Solopreneur fixture', pricePaise: 99900, gstBasisPoints: 1800, status: 'ACTIVE', isPublic: true, isPurchasable: true } });
    pro = await db.plan.create({ data: { code: `PRO_${run}`, name: 'Professional fixture', pricePaise: 299900, status: 'COMING_SOON', isPublic: true } });
    jest.spyOn(gateway, 'createPaymentOrder').mockImplementation(async input => ({ providerOrderId: `order_${randomUUID()}`, amountPaise: input.amountPaise, currency: 'INR', status: 'created', keyId: 'rzp_test_fixture' }));
    jest.spyOn(gateway, 'getPayment').mockImplementation(async id => payments.get(id));
    subscriptions = new SubscriptionService(db);
    service = new PaymentsService(db, new MockPaymentProvider(), gateway, subscriptions);
    controller = new SubscriptionController(subscriptions, service, db);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (oldKey === undefined) delete process.env.RAZORPAY_PLATFORM_KEY_SECRET; else process.env.RAZORPAY_PLATFORM_KEY_SECRET = oldKey;
    if (tenant) {
      const orders = await db.paymentOrder.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
      await db.paymentTransaction.deleteMany({ where: { paymentOrderId: { in: orders.map(x => x.id) } } });
      await db.paymentOrder.deleteMany({ where: { tenantId: tenant.id } });
      await db.autoPayMandate.deleteMany({ where: { tenantId: tenant.id } });
      await db.tenant.delete({ where: { id: tenant.id } });
    }
    await db.plan.deleteMany({ where: { id: { in: [plan?.id, pro?.id].filter(Boolean) } } });
    await db.$disconnect();
  });

  it('rejects Coming Soon by status, honors configured GST, and deduplicates simultaneous verified callbacks/invoices', async () => {
    await expect(service.createPlatformSubscriptionPaymentOrder(tenant.id, pro.id)).rejects.toThrow(/coming soon/i);
    const order = await service.createPlatformSubscriptionPaymentOrder(tenant.id, plan.id, 'MONTHLY', `owned:${run}`);
    expect(order.amountPaise).toBe(117882);
    const paymentId = `pay_${run.replace(/-/g, '')}`;
    payments.set(paymentId, { id: paymentId, order_id: order.providerOrderId, amount: 117882, currency: 'INR', status: 'captured', method: 'card' });
    const signature = createHmac('sha256', 'isolated-gateway-secret').update(`${order.providerOrderId}|${paymentId}`).digest('hex');
    const callback = { paymentOrderId: order.paymentOrderId, providerPaymentId: paymentId, providerSignature: signature };
    const responses = await Promise.all([service.verifyAndCapturePayment(callback), service.verifyAndCapturePayment(callback)]);
    expect(responses[0].transactionId).toBe(responses[1].transactionId);
    expect(await db.paymentTransaction.count({ where: { paymentOrderId: order.paymentOrderId } })).toBe(1);
    const invoices = await db.subscriptionInvoice.findMany({ where: { tenantId: tenant.id } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ amountPaise: 117882, baseAmountPaise: 99900, taxPaise: 17982, gstBasisPoints: 1800 });
    const snapshot = invoices[0].snapshot as any;
    expect(snapshot.payment.method).toBe('CARD');
    expect(snapshot.merchant.businessName).toBe('Original Legal Name');
    const dashboard = await new DashboardService(db, new SubscriptionVisibilityService(db)).getDashboardAnalytics(tenant.id, store.id);
    expect(dashboard.store.publicVisibility).toMatchObject({ isPublic: true, requiresPayment: false });
    const paidSub = await db.subscription.findFirstOrThrow({ where: { tenantId: tenant.id } });
    await db.subscription.update({ where: { id: paidSub.id }, data: { currentPeriodEnd: new Date('2000-01-01') } });
    expect(await new SubscriptionVisibilityService(db).getEffectivePublicStatus(store.id)).toMatchObject({ isPublic: false, requiresPayment: true, reason: 'STORE_SUBSCRIPTION_EXPIRED' });
    await db.subscription.update({ where: { id: paidSub.id }, data: { currentPeriodEnd: paidSub.currentPeriodEnd } });
    await db.tenant.update({ where: { id: tenant.id }, data: { billingName: 'Changed Legal Name' } });
    expect((await db.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoices[0].id } })).snapshot).toEqual(snapshot);
    await db.plan.update({ where: { id: plan.id }, data: { gstBasisPoints: 500 } });
    const renewed = await service.createPlatformSubscriptionPaymentOrder(tenant.id, plan.id);
    expect(renewed.amountPaise).toBe(104895);
    await db.plan.update({ where: { id: plan.id }, data: { gstBasisPoints: 1800 } });
  });

  it('validates billing data, keeps omitted GSTIN, and rejects cross-tenant payment verification', async () => {
    const context = { tenantId: tenant.id, storeId: store.id };
    await expect(controller.updateBillingProfile(context, { gstin: 'bad' })).rejects.toThrow(/GSTIN/);
    await expect(controller.updateBillingProfile(context, { pincode: '123' })).rejects.toThrow(/PIN/);
    await expect(controller.updateBillingProfile(context, { billingEmail: 'bad' })).rejects.toThrow(/email/);
    await db.tenant.update({ where: { id: tenant.id }, data: { billingAddress: null } });
    try {
      await expect(service.createPlatformSubscriptionPaymentOrder(tenant.id, plan.id)).rejects.toThrow(/billing address/i);
      await expect(service.createAutoPay(tenant.id, plan.id)).rejects.toThrow(/billing address/i);
    } finally { await db.tenant.update({ where: { id: tenant.id }, data: { billingAddress: 'Owned fixture address' } }); }
    await controller.updateBillingProfile(context, { gstin: '27aaaaa0000a1z5', pincode: '411001', billingEmail: 'BILLING@EXAMPLE.TEST' });
    await controller.updateBillingProfile(context, { legalName: 'New Business Name' });
    expect(await controller.getBillingProfile(context)).toMatchObject({ gstin: '27AAAAA0000A1Z5', billingEmail: 'billing@example.test' });
    const invoice = await db.subscriptionInvoice.findFirstOrThrow({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'asc' } });
    const pdf = await controller.getInvoicePdf(context, invoice.id, { header: jest.fn(), send: (buffer: Buffer) => buffer });
    expect(pdf.toString()).toContain('Original Legal Name');
    expect(pdf.toString()).not.toContain('New Business Name');
    expect(pdf.toString()).not.toContain('27AAAAA0000A1Z5');
    const order = await db.paymentOrder.findFirstOrThrow({ where: { tenantId: tenant.id } });
    await expect(controller.verifySubscriptionPayment({ tenantId: randomUUID(), storeId: randomUUID() }, { paymentOrderId: order.id })).rejects.toThrow(/not found/i);
  });

  it('creates a real mandate request and renews only for a captured charge belonging to that mandate; duplicate charge renews once', async () => {
    const subscriptionId = `sub_${run.replace(/-/g, '')}`;
    const paymentId = `pay_auto${run.replace(/-/g, '')}`;
    const entity = { id: paymentId, order_id: `order_auto${run}`, invoice_id: 'inv_owned', amount: 117882, currency: 'INR', status: 'captured', method: 'upi' };
    const requests: Array<{ path: string; body: any }> = [];
    jest.spyOn(gateway, 'platformRequest').mockImplementation(async (path, body) => {
      requests.push({ path, body });
      if (path === 'plans') return { id: 'plan_owned' };
      if (path === 'subscriptions') return { id: subscriptionId };
      if (path.startsWith('subscriptions/')) return { id: subscriptionId, status: 'active' };
      if (path.startsWith('payments/')) return entity;
      if (path.startsWith('invoices/')) return { subscription_id: subscriptionId };
      throw new Error('Unexpected gateway request');
    });
    const before = await subscriptions.getTenantSubscription(tenant.id);
    const mandate = await service.createAutoPay(tenant.id, plan.id);
    expect(mandate.providerSubscriptionId).toBe(subscriptionId);
    expect(requests.find(r => r.path === 'plans')?.body.item.amount).toBe(117882);
    expect((await subscriptions.getTenantSubscription(tenant.id))?.currentPeriodEnd).toEqual(before?.currentPeriodEnd);
    payments.set(paymentId, entity);
    const signature = createHmac('sha256', 'isolated-gateway-secret').update(`${paymentId}|${subscriptionId}`).digest('hex');
    await expect(service.verifyAutoPay(tenant.id, subscriptionId, paymentId, 'forged')).rejects.toThrow();
    await Promise.all([service.verifyAutoPay(tenant.id, subscriptionId, paymentId, signature), service.verifyAutoPay(tenant.id, subscriptionId, paymentId, signature)]);
    const after = await subscriptions.getTenantSubscription(tenant.id);
    expect(after!.currentPeriodEnd.getTime() - before!.currentPeriodEnd.getTime()).toBe(30 * 86400000);
    expect(after!.currentPeriodEnd.getTime() - after!.currentPeriodStart.getTime()).toBe(30 * 86400000);
    const invoiceCount = await db.subscriptionInvoice.count({ where: { tenantId: tenant.id } });
    await service.handleWebhook('RAZORPAY', `owned-event-${run}`, 'subscription.charged', { payload: { subscription: { entity: { id: subscriptionId } }, payment: { entity } } }, 'verified-in-controller');
    await service.handleWebhook('RAZORPAY', `owned-event-${run}`, 'subscription.charged', {}, 'verified-in-controller');
    expect(await db.subscriptionInvoice.count({ where: { tenantId: tenant.id } })).toBe(invoiceCount);
    expect((await subscriptions.getTenantSubscription(tenant.id))!.currentPeriodEnd).toEqual(after!.currentPeriodEnd);
    await db.paymentWebhookEvent.deleteMany({ where: { eventId: `owned-event-${run}` } });
  });
});
