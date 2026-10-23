import {
  buildOrderAcceptedMessage, buildOrderReadyMessage, buildOrderDispatchedBuyerMessage,
  buildOrderOutForDeliveryMessage, buildOrderDeliveredMessage, buildOrderCancelledMessage,
  buildPublicReviewUrl, buildPublicTrackingUrl, buildWhatsAppDeepLink, sanitizeWhatsAppOrderMessage,
} from '@simply/api-contracts';
import { WhatsAppService } from '../../src/modules/notifications/whatsapp.service';
import { generateWhatsAppMessage } from '../../src/modules/orders/whatsapp-messages.util';

const trackingUrl = 'https://shop.example/track/ORD-123?t=private-token';
const reviewUrl = buildPublicReviewUrl('bakery', 'ORD-123', 'review-token', 'https://shop.example');
const ctx = {
  orderNumber: 'ORD-123', storeName: 'Artisan Bakery', customerName: 'Aarav',
  customerPhone: '9876543210', totalPaise: 117882, itemsSummary: '2x Cake',
  paymentMethod: 'COD', trackingUrl, reviewUrl, courierName: 'Blue Dart',
  deliveryMode: 'SHIPROCKET' as const, awbNumber: 'AWB-9988',
};
const stages = [
  ['CONFIRMED', buildOrderAcceptedMessage, 'confirmed'],
  ['READY_TO_SHIP', buildOrderReadyMessage, 'ready for dispatch'],
  ['SHIPPED', buildOrderDispatchedBuyerMessage, 'on its way'],
  ['OUT_FOR_DELIVERY', buildOrderOutForDeliveryMessage, 'out for delivery'],
  ['DELIVERED', buildOrderDeliveredMessage, 'delivered successfully'],
  ['CANCELLED', buildOrderCancelledMessage, 'cancelled'],
] as const;

describe('WhatsApp drafts retain stage wording without order/product/tracking links', () => {
  const service = new WhatsAppService();
  it.each(stages)('%s: shared text, API text, encoded link and legacy helper', (stage, build, wording) => {
    const text = build(ctx);
    const api = service.generateOrderStatusUpdateMessage({ ...ctx, status: stage }, stage);
    expect(api.text).toBe(text);
    expect(text).toContain(wording);
    for (const value of [text, api.text, new URL(api.url).searchParams.get('text')!,
      generateWhatsAppMessage({ ...ctx, trackingNumber: ctx.awbNumber }, { name: ctx.storeName, slug: 'bakery' }, stage)]) {
      expect(value).toContain(ctx.orderNumber);
      expect(value).toContain(ctx.storeName);
      expect(value).toContain(ctx.customerName);
      expect(value).not.toMatch(/https?:\/\/\S+\/(?:track|tracking|orders?|products?|status)(?:\/|\?)/i);
      expect(value).not.toContain(trackingUrl);
    }
    expect(new URL(api.url).pathname).toBe('/919876543210');
    expect(new URL(buildWhatsAppDeepLink(ctx.customerPhone, text)).searchParams.get('text')).toBe(text);
    expect(text.match(/https?:\/\/\S+/g) || []).toEqual(stage === 'DELIVERED' ? [reviewUrl] : []);
  });

  it('retains courier/AWB, amount and self-delivery rider details', () => {
    const shipped = buildOrderDispatchedBuyerMessage(ctx);
    expect(shipped).toContain('Blue Dart');
    expect(shipped).toContain('AWB-9988');
    expect(shipped).toContain('₹1178.82');
    const self = buildOrderDispatchedBuyerMessage({ ...ctx, deliveryMode: 'SELF_DELIVERY', riderName: 'Rider', riderPhone: '9876543211' });
    expect(self).toContain('Rider');
    expect(self).toContain('9876543211');
    expect(self).not.toContain(trackingUrl);
  });

  it.each([trackingUrl, 'https://shop.example/store/bakery/review/ORD-123', 'https://bakery.letzshop.store/order/ORD-123/review', 'javascript:alert(1)'])('omits invalid review CTA %s', review => {
    expect(buildOrderDeliveredMessage({ ...ctx, reviewUrl: review })).not.toContain(review);
    expect(buildOrderDeliveredMessage({ ...ctx, reviewUrl: review })).not.toContain('Share your experience');
  });

  it('cleans old copied text and deeplink payloads while keeping valid review links', () => {
    const saved = `Hello Aarav, #ORD-123 from Artisan Bakery\nTrack your order:\n${trackingUrl}\nProduct: https://shop.example/store/bakery/product/cake\nStatus: https://courier.example/anything\n${reviewUrl}`;
    const oldHref = buildWhatsAppDeepLink(ctx.customerPhone, saved);
    const cleaned = sanitizeWhatsAppOrderMessage(new URL(oldHref).searchParams.get('text')!);
    expect(cleaned.match(/https?:\/\/\S+/g)).toEqual([reviewUrl]);
    expect(cleaned).toContain('#ORD-123');
    expect(cleaned).not.toContain('Track your order');
    expect(new URL(buildWhatsAppDeepLink(ctx.customerPhone, cleaned)).searchParams.get('text')).toBe(cleaned);
  });

  it('keeps the canonical token-protected URL builder available to emails', () => {
    expect(buildPublicTrackingUrl('ORD-123', 'private-token', 'https://shop.example')).toBe(trackingUrl);
  });
});
