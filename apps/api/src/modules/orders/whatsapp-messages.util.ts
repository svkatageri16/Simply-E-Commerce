import { buildPublicReviewUrl } from '@simply/api-contracts';

export function normalizePhoneForWhatsApp(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}

export function generateWhatsAppMessage(
  order: any,
  store: any,
  status: string
): string {
  const storeName = store?.name || 'Our Store';
  const buyerName = order?.customerName || 'Customer';
  const orderNum = order?.orderNumber || order?.id?.slice(-8) || '';
  const total = order?.totalPaise != null ? `₹${(Number(order.totalPaise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';

  switch (status) {
    case 'CONFIRMED':
      return `Hello ${buyerName},\nYour order #${orderNum} from ${storeName} has been confirmed.\nOrder Total: ${total}\nWe will notify you when your order is ready for dispatch.\nThank you for shopping with us.`;
    case 'READY':
    case 'READY_TO_SHIP':
      return `Hello ${buyerName},\nYour order #${orderNum} from ${storeName} is packed and ready to ship.\nWe will share the dispatch/tracking update once it is shipped.`;
    case 'DISPATCHED':
    case 'SHIPPED': {
      const tracking = order?.trackingNumber
        ? `Tracking: ${order.trackingNumber}`
        : '';
      return `Hello ${buyerName},\nYour order #${orderNum} from ${storeName} has been shipped.\n${tracking}\nThank you.`.trim();
    }
    case 'OUT_FOR_DELIVERY':
      return `Hello ${buyerName},\nYour order #${orderNum} from ${storeName} is out for delivery.\nPlease keep your phone available for the delivery partner.`;
    case 'DELIVERED': {
      const token = order?.reviewToken || order?.trackingToken;
      const reviewLink = store?.slug && token ? buildPublicReviewUrl(store.slug, orderNum, token) : '';
      const reviewCta = reviewLink ? `\nWe would appreciate your review: ${reviewLink}` : '';
      return `Hello ${buyerName},\nYour order #${orderNum} from ${storeName} has been delivered.\nThank you for shopping with us.${reviewCta}`;
    }
    case 'CANCELLED':
      return `Hello ${buyerName},\nYour order #${orderNum} from ${storeName} has been cancelled.\nPlease contact us if you need any assistance.`;
    default:
      return `Hello ${buyerName},\nYour order #${orderNum} from ${storeName} status is now ${status}.`;
  }
}
