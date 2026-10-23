import { getPublicStoreUrl } from '@simply/types';
/**
 * Centralized, Unicode-safe Notification Templates and URL Builders
 * for LetzShop / Simply Multi-Merchant Platform.
 */

export interface AddressInfo {
  fullName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  landmark?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface BuyerMessageContext {
  orderNumber: string;
  storeName: string;
  customerName: string;
  customerPhone?: string;
  totalPaise: number;
  itemsSummary: string;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  codCollectionMethod?: string | null;
  trackingUrl?: string;
  reviewUrl?: string;
  deliveryMode?: 'SHIPROCKET' | 'SELF_DELIVERY' | string;
  courierName?: string | null;
  awbNumber?: string | null;
  riderName?: string | null;
  riderPhone?: string | null;
  customMessage?: string | null;
  cancellationReason?: string | null;
}

export interface RiderAssignmentContext {
  orderNumber: string;
  storeName: string;
  storePhone?: string | null;
  riderName: string;
  riderPhone: string;
  customerName: string;
  customerPhone: string;
  address: AddressInfo;
  itemsSummary: string;
  totalPaise: number;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  codCollectionMethod?: string | null;
  deliveryNote?: string | null;
}

/**
 * Normalizes any phone number into an international 91... string for WhatsApp wa.me links.
 */
export function normalizeIndianPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length > 10) return digits;
  return digits;
}

/**
 * Formats paise into ₹ amount string.
 */
export function formatPaise(paise?: number | null): string {
  if (typeof paise !== 'number' || isNaN(paise)) return '₹0.00';
  return `₹${(paise / 100).toFixed(2)}`;
}

/**
 * Builds Google Maps search/directions URL from customer address without requiring an API key.
 */
export function buildGoogleMapsUrl(address: AddressInfo): string | undefined {
  const parts = [
    address.addressLine1,
    address.addressLine2,
    address.landmark ? `Near ${address.landmark}` : undefined,
    address.city,
    address.state ? `${address.state} - ${address.pincode || ''}` : address.pincode,
    address.country || 'India',
  ].filter(Boolean);

  if (parts.length < 2) return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}

/**
 * Resolves the public storefront base URL (defaults to port 3000 in local dev, NOT seller port 3001).
 */
export function getStorefrontBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes(':3001')) {
      return origin.replace(':3001', ':3000');
    }
    return origin;
  }
  return (
    process.env.STOREFRONT_BASE_URL ||
    process.env.STOREFRONT_URL ||
    process.env.NEXT_PUBLIC_STOREFRONT_URL ||
    'http://localhost:3000'
  );
}

/**
 * Builds canonical public buyer tracking URL.
 */
export function buildPublicTrackingUrl(orderNumber: string, trackingToken?: string | null, customBaseUrl?: string): string {
  const base = customBaseUrl || getStorefrontBaseUrl();
  const tokenQuery = trackingToken ? `?t=${encodeURIComponent(trackingToken)}` : '';
  return `${base.replace(/\/+$/, '')}/track/${encodeURIComponent(orderNumber)}${tokenQuery}`;
}

/**
 * Builds canonical public review URL for a delivered order.
 */
export function buildPublicReviewUrl(storeSlug: string, orderNumber: string, reviewToken?: string | null, customBaseUrl?: string): string {
  const base = customBaseUrl || getStorefrontBaseUrl();
  const tokenQuery = reviewToken ? `?token=${encodeURIComponent(reviewToken)}` : '';
  return `${getPublicStoreUrl(storeSlug, base)}/review/${encodeURIComponent(orderNumber)}${tokenQuery}`;
}

/**
 * Resolves human-readable payment description.
 */
function resolvePaymentDisplay(
  paymentMethod?: string | null,
  paymentStatus?: string | null,
  codCollectionMethod?: string | null
): { text: string; isPrepaid: boolean; isCodPaid: boolean } {
  const m = (paymentMethod || 'COD').toUpperCase();
  const s = (paymentStatus || 'PENDING').toUpperCase();

  if (s === 'PAID') {
    if (m === 'COD') {
      const coll = codCollectionMethod ? ` (${codCollectionMethod})` : '';
      return { text: `Cash on Delivery · Paid${coll}`, isPrepaid: false, isCodPaid: true };
    }
    return { text: `${m === 'ONLINE' ? 'Online Payment' : m} · Paid`, isPrepaid: true, isCodPaid: false };
  }

  if (m === 'COD') {
    return { text: 'Cash on Delivery', isPrepaid: false, isCodPaid: false };
  }

  return { text: `${m} · Payment Pending`, isPrepaid: false, isCodPaid: false };
}

// ==============================================================================
// BUYER TEMPLATES
// ==============================================================================

/** Only the token-protected storefront review route is a valid delivered CTA. */
export function isPublicReviewUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      /^\/store\/[^/]+\/review\/[^/]+\/?$/.test(url.pathname) &&
      Boolean(url.searchParams.get('token')?.trim());
  } catch {
    return false;
  }
}

/** Cleans persisted drafts produced before order/product links were removed. */
export function sanitizeWhatsAppOrderMessage(text: string): string {
  return text.replace(/https?:\/\/[^\s<>]+/gi, (value) => {
    if (isPublicReviewUrl(value)) return value;
    return '';
  }).replace(/^\s*(?:Track(?: your order)?|Order details|You can follow your order here):?\s*$/gmi, '').trim();
}

export function buildOrderOutForDeliveryMessage(ctx: BuyerMessageContext): string {
  return `Hello ${ctx.customerName}, your order #${ctx.orderNumber} from ${ctx.storeName} is out for delivery. Please keep your phone available.`;
}

export function buildOrderAcceptedMessage(ctx: BuyerMessageContext): string {
  const pay = resolvePaymentDisplay(ctx.paymentMethod, ctx.paymentStatus, ctx.codCollectionMethod);

  return (
    `*Order Confirmed — ${ctx.storeName}*\n\n` +
    `Hello ${ctx.customerName},\n\n` +
    `Thank you for shopping with us.\n\n` +
    `Your order *#${ctx.orderNumber}* has been confirmed and is now being prepared.\n\n` +
    `*Order Summary*\n` +
    `${ctx.itemsSummary}\n\n` +
    `*Total:* ${formatPaise(ctx.totalPaise)}\n` +
    `*Payment:* ${pay.text}` +
    `\n\nWe will keep you updated as your order progresses.\n\n` +
    `Warm regards,\n` +
    `*${ctx.storeName}*\n` +
    `Powered by LetzShop`
  );
}

export function buildOrderReadyMessage(ctx: BuyerMessageContext): string {

  return (
    `*Your Order Is Ready*\n\n` +
    `Hello ${ctx.customerName},\n\n` +
    `Good news — your order *#${ctx.orderNumber}* has been packed and is ready for dispatch.\n\n` +
    `*Order Summary*\n` +
    `${ctx.itemsSummary}\n\n` +
    `*Total:* ${formatPaise(ctx.totalPaise)}` +
    `\n\nWe will notify you once it is on the way.\n\n` +
    `Warm regards,\n` +
    `*${ctx.storeName}*\n` +
    `Powered by LetzShop`
  );
}

export function buildOrderDispatchedBuyerMessage(ctx: BuyerMessageContext): string {
  const isSelf = ctx.deliveryMode === 'SELF_DELIVERY' || !ctx.courierName || ctx.courierName.startsWith('Store Team');
  const pay = resolvePaymentDisplay(ctx.paymentMethod, ctx.paymentStatus, ctx.codCollectionMethod);

  if (isSelf) {
    const riderInfo =
      `*Delivery Partner*\n` +
      `${ctx.riderName || 'Store Delivery Team'}\n` +
      `${ctx.riderPhone ? ctx.riderPhone : ''}\n\n`;

    const codDue =
      !pay.isPrepaid && !pay.isCodPaid && (ctx.paymentMethod || 'COD').toUpperCase() === 'COD'
        ? `*Amount Payable on Delivery:* ${formatPaise(ctx.totalPaise)}\n`
        : '';


    return (
      `*Your Order Is On The Way*\n\n` +
      `Hello ${ctx.customerName},\n\n` +
      `Your order *#${ctx.orderNumber}* from *${ctx.storeName}* has been dispatched.\n\n` +
      riderInfo +
      `*Order Summary*\n` +
      `${ctx.itemsSummary}\n\n` +
      `*Total:* ${formatPaise(ctx.totalPaise)}\n` +
      `*Payment:* ${pay.text}\n` +
      codDue +
      `\n` +
      `Please keep your phone reachable in case the delivery partner needs assistance locating your address.\n\n` +
      `Thank you for choosing *${ctx.storeName}*.\n` +
      `Powered by LetzShop`
    );
  }

  // Shiprocket dispatch
  return (
    `*Your Order Has Been Shipped*\n\n` +
    `Hello ${ctx.customerName},\n\n` +
    `Your order *#${ctx.orderNumber}* from *${ctx.storeName}* is on its way.\n\n` +
    `*Courier*\n` +
    `${ctx.courierName || 'Shiprocket Logistics'}\n\n` +
    (ctx.awbNumber ? `*AWB*\n${ctx.awbNumber}\n\n` : '') +
    `*Order Total*\n` +
    `${formatPaise(ctx.totalPaise)}\n\n` +
    `Thank you for shopping with *${ctx.storeName}*.\n` +
    `Powered by LetzShop`
  );
}

export function buildOrderDeliveredMessage(ctx: BuyerMessageContext): string {
  const pay = resolvePaymentDisplay(ctx.paymentMethod, ctx.paymentStatus, ctx.codCollectionMethod);
  const reviewCta = isPublicReviewUrl(ctx.reviewUrl)
    ? `\n*Share your experience:*\n${ctx.reviewUrl}\n`
    : '';

  return (
    `*Order Delivered Successfully*\n\n` +
    `Hello ${ctx.customerName},\n\n` +
    `Your order *#${ctx.orderNumber}* from *${ctx.storeName}* has been delivered successfully.\n\n` +
    `*Order Summary*\n` +
    `${ctx.itemsSummary}\n\n` +
    `*Total Paid:* ${formatPaise(ctx.totalPaise)}\n` +
    `*Payment:* ${pay.text}\n\n` +
    `We hope you had a great experience.\n\n` +
    `Your feedback helps this business improve and helps other customers make confident choices.\n` +
    reviewCta +
    `\nThank you for supporting *${ctx.storeName}*.\n\n` +
    `Powered by LetzShop`
  );
}

export function buildOrderCancelledMessage(ctx: BuyerMessageContext): string {
  const reason = ctx.cancellationReason || ctx.customMessage || 'As per store request';
  return (
    `*Order Cancelled — ${ctx.storeName}*\n\n` +
    `Hello ${ctx.customerName},\n\n` +
    `Your order *#${ctx.orderNumber}* from *${ctx.storeName}* has been cancelled.\n\n` +
    `*Reason:* ${reason}\n\n` +
    `If you have questions or require further assistance, please contact us directly.\n\n` +
    `Warm regards,\n` +
    `*${ctx.storeName}*\n` +
    `Powered by LetzShop`
  );
}

// ==============================================================================
// DELIVERY PERSON / RIDER TEMPLATE
// ==============================================================================

export function buildRiderAssignmentMessage(ctx: RiderAssignmentContext): string {
  const pay = resolvePaymentDisplay(ctx.paymentMethod, ctx.paymentStatus, ctx.codCollectionMethod);

  let paymentText = 'Cash on Delivery';
  let amountToCollect = formatPaise(ctx.totalPaise);

  if (pay.isPrepaid) {
    paymentText = 'Prepaid';
    amountToCollect = '₹0';
  } else if (pay.isCodPaid) {
    paymentText = 'COD — Already Collected';
    amountToCollect = '₹0';
  }

  const addr = ctx.address;
  const addressLines = [
    addr.addressLine1,
    addr.addressLine2,
    addr.landmark ? `Near ${addr.landmark}` : undefined,
    addr.city ? `${addr.city}, ${addr.state || ''} - ${addr.pincode || ''}` : addr.pincode,
    addr.country || 'India',
  ]
    .filter(Boolean)
    .join('\n');

  const mapLink = buildGoogleMapsUrl(addr);
  const mapSection = mapLink ? `\n*Open Delivery Location:*\n${mapLink}\n` : '';
  const noteSection = ctx.deliveryNote?.trim()
    ? `\n*Delivery Note:*\n${ctx.deliveryNote.trim()}\n`
    : '';

  return (
    `*LetzShop Delivery Assignment*\n\n` +
    `Hello ${ctx.riderName},\n\n` +
    `A new delivery has been assigned to you by *${ctx.storeName}*.\n\n` +
    `*Order:* #${ctx.orderNumber}\n\n` +
    `*Customer*\n` +
    `${ctx.customerName}\n` +
    `+${normalizeIndianPhone(ctx.customerPhone)}\n\n` +
    `*Delivery Address*\n` +
    `${addressLines}\n` +
    mapSection +
    `\n*Items*\n` +
    `${ctx.itemsSummary}\n\n` +
    `*Order Amount*\n` +
    `${formatPaise(ctx.totalPaise)}\n\n` +
    `*Payment*\n` +
    `${paymentText}\n\n` +
    `*Amount to Collect*\n` +
    `${amountToCollect}\n` +
    noteSection +
    `\nPlease contact the customer if required before reaching the delivery location.\n\n` +
    `After completing the delivery, please inform the store.\n\n` +
    `Thank you,\n` +
    `*${ctx.storeName} via LetzShop*`
  );
}

/**
 * Creates a clean wa.me deep link from text and phone number.
 * Ensures UTF-8 safety and exact single encoding.
 */
export function buildWhatsAppDeepLink(phone: string, text: string): string {
  const clean = normalizeIndianPhone(phone);
  if (!clean) return '';
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}
