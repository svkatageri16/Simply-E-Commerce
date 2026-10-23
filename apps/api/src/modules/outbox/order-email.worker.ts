import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MailService, OrderEmailContext } from '../notifications/mail.service';
import { OutboxService } from './outbox.service';
import { buildPublicTrackingUrl, buildPublicReviewUrl } from '@simply/api-contracts';

@Injectable()
export class OrderEmailWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(private readonly db: PrismaClient, private readonly mail: MailService, private readonly outbox: OutboxService) {}
  onModuleInit() {
    this.outbox.registerHandler('ORDER_EMAIL', event => this.deliver(event));
    if (process.env.NOTIFICATION_WORKER_ENABLED === 'false' || process.env.NODE_ENV === 'test') return;
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !(process.env.SMTP_PASSWORD || process.env.SMTP_PASS)) throw new Error('Production order email requires SMTP_HOST, SMTP_USER and SMTP_PASSWORD.');
      const origin = process.env.STOREFRONT_PUBLIC_URL || process.env.STOREFRONT_BASE_URL || process.env.STOREFRONT_URL;
      if (!origin || new URL(origin).protocol !== 'https:') throw new Error('Production email requires an HTTPS STOREFRONT_PUBLIC_URL.');
    }
    this.timer = setInterval(() => void this.tick(), 5000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try { await this.outbox.processPendingEvents(10); } catch { /* Retained durable records are retried next tick. */ }
    finally { this.busy = false; }
  }
  public async deliver(event: any) {
    const { orderId, status } = event.payload || {};
    const order = await this.db.order.findFirst({ where: { id: orderId, tenantId: event.tenantId, storeId: event.storeId }, include: { store: true, customer: true, items: true, orderAddress: true, shipments: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!order) return; // Deleted owned order: no recipient remains.
    const snapshot = order.deliveryAddress as any;
    const email = order.buyerEmail || snapshot?.email || order.customer?.email;
    if (!email || !await this.mail.verifyTransport()) throw new Error('Order email delivery unavailable.');
    const origin = process.env.STOREFRONT_PUBLIC_URL || process.env.STOREFRONT_BASE_URL || process.env.STOREFRONT_URL || 'http://localhost:3000';
    const ctx: OrderEmailContext = {
      eventId: event.id,
      courierName: order.shipments[0]?.courierName || undefined,
      awbNumber: order.shipments[0]?.awbNumber || undefined,
      deliveryMode: order.shipments[0]?.provider === 'SELF_DELIVERY' ? 'SELF_DELIVERY' : 'SHIPROCKET',
      order: { ...order, status }, store: { id: order.storeId, name: order.store.name, supportEmail: order.store.supportEmail || undefined, supportPhone: order.store.supportPhone || undefined },
      customer: { email, fullName: order.buyerName || snapshot?.fullName || order.customer.fullName, phone: snapshot?.phone || order.customer.phone },
      trackingUrl: buildPublicTrackingUrl(order.orderNumber, order.trackingToken, origin),
      reviewUrl: status === 'COMPLETED' ? buildPublicReviewUrl(order.store.slug, order.orderNumber, order.reviewToken, origin) : undefined,
      customMessage: typeof event.payload.customMessage === 'string' ? event.payload.customMessage : undefined,
    };
    const accepted =
      status === 'NEW' || status === 'CONFIRMED' || status === 'ACCEPTED' || status === 'ORDER_CONFIRMED'
        ? await this.mail.sendOrderPlacedEmail(ctx)
        : status === 'COMPLETED' || status === 'DELIVERED'
        ? await this.mail.sendOrderDeliveredEmail(ctx)
        : status === 'DISPATCHED' || status === 'SHIPPED'
        ? await this.mail.sendOrderDispatchedEmail(ctx)
        : await this.mail.sendOrderStatusUpdateEmail(ctx, status);
    if (!accepted) throw new Error('Order email provider did not accept the recipient.');
  }
}
