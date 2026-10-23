import { Injectable, Logger } from '@nestjs/common';
import {
  buildOrderAcceptedMessage,
  buildOrderReadyMessage,
  buildOrderDispatchedBuyerMessage,
  buildOrderDeliveredMessage,
  buildOrderCancelledMessage,
  buildOrderOutForDeliveryMessage,
  buildRiderAssignmentMessage,
  buildWhatsAppDeepLink,
  normalizeIndianPhone,
} from '@simply/api-contracts';

const formatPaise = (paise: number) => {
  if (typeof paise !== 'number') return '₹0.00';
  return '₹' + (paise / 100).toFixed(2);
};

export interface WhatsAppOrderContext {
  orderNumber: string;
  storeName: string;
  storePhone?: string;
  customerName: string;
  customerPhone: string;
  totalPaise: number;
  itemsSummary: string;
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
  codCollectionMethod?: string;
  trackingUrl?: string;
  reviewUrl?: string;
  deliveryMode?: 'SHIPROCKET' | 'SELF_DELIVERY';
  courierName?: string;
  awbNumber?: string;
  riderName?: string;
  riderPhone?: string;
  customMessage?: string;
}

export interface DeliveryPartnerWhatsAppContext {
  orderNumber: string;
  storeName: string;
  storePhone?: string;
  storeAddress?: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddressStr?: string;
  address?: any;
  totalPaise: number;
  itemsSummary: string;
  paymentMethod?: string;
  paymentStatus?: string;
  codCollectionMethod?: string;
  isCod?: boolean;
  riderName: string;
  riderPhone: string;
  customMessage?: string;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  public cleanPhone(phone?: string): string {
    return normalizeIndianPhone(phone);
  }

  /**
   * Generates a pre-filled WhatsApp deep link for Admin -> Merchant communication.
   */
  public generateAdminMerchantWhatsAppMessage(phone: string, text: string): { url: string; text: string; phone: string } {
    const clean = this.cleanPhone(phone);
    const url = buildWhatsAppDeepLink(clean, text);
    return { url, text, phone: clean };
  }

  /**
   * Generates a pre-filled WhatsApp link for Buyer -> Vendor when order is placed.
   */
  public generateBuyerToVendorOrderMessage(ctx: WhatsAppOrderContext): { url: string; text: string } {
    const text =
      `*New Order Alert — #${ctx.orderNumber}*\n\n` +
      `Hello *${ctx.storeName}*,\n\n` +
      `I have just placed an order on your store!\n\n` +
      `*Items:* ${ctx.itemsSummary}\n` +
      `*Total Amount:* ${formatPaise(ctx.totalPaise)}\n` +
      `*Customer:* ${ctx.customerName} (${ctx.customerPhone})\n\n` +
      `Please confirm once my order is accepted & dispatched. Thank you!`;

    const targetPhone = this.cleanPhone(ctx.storePhone || process.env.SUPPORT_WHATSAPP || '');
    const url = buildWhatsAppDeepLink(targetPhone, text);
    return { url, text };
  }

  /**
   * Generates a pre-filled WhatsApp update for Vendor -> Buyer when order is dispatched.
   */
  public generateOrderDispatchedMessage(ctx: WhatsAppOrderContext): { url: string; text: string } {
    const text = buildOrderDispatchedBuyerMessage({
      orderNumber: ctx.orderNumber,
      storeName: ctx.storeName,
      customerName: ctx.customerName,
      customerPhone: ctx.customerPhone,
      totalPaise: ctx.totalPaise,
      itemsSummary: ctx.itemsSummary,
      paymentMethod: ctx.paymentMethod,
      paymentStatus: ctx.paymentStatus,
      codCollectionMethod: ctx.codCollectionMethod,
      trackingUrl: ctx.trackingUrl,
      deliveryMode: ctx.deliveryMode,
      courierName: ctx.courierName,
      awbNumber: ctx.awbNumber,
      riderName: ctx.riderName,
      riderPhone: ctx.riderPhone,
      customMessage: ctx.customMessage,
    });

    const buyerPhone = this.cleanPhone(ctx.customerPhone);
    const url = buildWhatsAppDeepLink(buyerPhone, text);
    return { url, text };
  }

  /**
   * Generates a pre-filled WhatsApp update for Vendor -> Buyer when order is delivered.
   */
  public generateOrderDeliveredMessage(ctx: WhatsAppOrderContext): { url: string; text: string } {
    const text = buildOrderDeliveredMessage({
      orderNumber: ctx.orderNumber,
      storeName: ctx.storeName,
      customerName: ctx.customerName,
      customerPhone: ctx.customerPhone,
      totalPaise: ctx.totalPaise,
      itemsSummary: ctx.itemsSummary,
      paymentMethod: ctx.paymentMethod,
      paymentStatus: ctx.paymentStatus,
      codCollectionMethod: ctx.codCollectionMethod,
      trackingUrl: ctx.trackingUrl,
      reviewUrl: ctx.reviewUrl,
      customMessage: ctx.customMessage,
    });

    const buyerPhone = this.cleanPhone(ctx.customerPhone);
    const url = buildWhatsAppDeepLink(buyerPhone, text);
    return { url, text };
  }

  /**
   * Generates a pre-filled WhatsApp update for Vendor -> Buyer for ANY status milestone.
   */
  public generateOrderStatusUpdateMessage(ctx: WhatsAppOrderContext, status: string): { url: string; text: string } {
    let text = '';
    if (status === 'DISPATCHED' || status === 'SHIPPED') {
      return this.generateOrderDispatchedMessage(ctx);
    }
    if (status === 'COMPLETED' || status === 'DELIVERED') {
      return this.generateOrderDeliveredMessage(ctx);
    }
    if (status === 'ACCEPTED' || status === 'CONFIRMED') {
      text = buildOrderAcceptedMessage({
        orderNumber: ctx.orderNumber,
        storeName: ctx.storeName,
        customerName: ctx.customerName,
        customerPhone: ctx.customerPhone,
        totalPaise: ctx.totalPaise,
        itemsSummary: ctx.itemsSummary,
        paymentMethod: ctx.paymentMethod,
        paymentStatus: ctx.paymentStatus,
        codCollectionMethod: ctx.codCollectionMethod,
        trackingUrl: ctx.trackingUrl,
        customMessage: ctx.customMessage,
      });
    } else if (status === 'READY' || status === 'READY_TO_SHIP') {
      text = buildOrderReadyMessage({
        orderNumber: ctx.orderNumber,
        storeName: ctx.storeName,
        customerName: ctx.customerName,
        customerPhone: ctx.customerPhone,
        totalPaise: ctx.totalPaise,
        itemsSummary: ctx.itemsSummary,
        paymentMethod: ctx.paymentMethod,
        paymentStatus: ctx.paymentStatus,
        codCollectionMethod: ctx.codCollectionMethod,
        trackingUrl: ctx.trackingUrl,
        customMessage: ctx.customMessage,
      });
    } else if (status === 'OUT_FOR_DELIVERY') {
      text = buildOrderOutForDeliveryMessage(ctx);
    } else if (status === 'CANCELLED') {
      text = buildOrderCancelledMessage({
        orderNumber: ctx.orderNumber,
        storeName: ctx.storeName,
        customerName: ctx.customerName,
        customerPhone: ctx.customerPhone,
        totalPaise: ctx.totalPaise,
        itemsSummary: ctx.itemsSummary,
        cancellationReason: ctx.customMessage,
      });
    } else {
      text = buildOrderAcceptedMessage({
        orderNumber: ctx.orderNumber,
        storeName: ctx.storeName,
        customerName: ctx.customerName,
        customerPhone: ctx.customerPhone,
        totalPaise: ctx.totalPaise,
        itemsSummary: ctx.itemsSummary,
        paymentMethod: ctx.paymentMethod,
        paymentStatus: ctx.paymentStatus,
        codCollectionMethod: ctx.codCollectionMethod,
        trackingUrl: ctx.trackingUrl,
        customMessage: ctx.customMessage,
      });
    }

    const buyerPhone = this.cleanPhone(ctx.customerPhone);
    const url = buildWhatsAppDeepLink(buyerPhone, text);
    return { url, text };
  }

  /**
   * Directly sends a WhatsApp message from the server without redirecting the user or opening WhatsApp Web.
   * If Meta WhatsApp Cloud API credentials or a custom gateway URL are configured in the environment,
   * performs direct API dispatch. Otherwise, performs automated server-side logging without client redirection.
   */
  public async sendDirectWhatsApp(recipientPhone: string, text: string): Promise<boolean> {
    const cleanTo = this.cleanPhone(recipientPhone);
    if (!cleanTo || cleanTo.length < 10) {
      this.logger.warn(`[WHATSAPP] Skipped direct send: invalid recipient phone "${recipientPhone}"`);
      return false;
    }

    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL;

    // Option 1: Official Meta WhatsApp Cloud API
    if (token && phoneId) {
      try {
        const response = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: cleanTo,
            type: 'text',
            text: { preview_url: true, body: text },
          }),
        });

        if (response.ok) {
          this.logger.log(`[WHATSAPP CLOUD API] Message accepted by provider`);
          return true;
        } else {
          const errData = await response.text();
          this.logger.error(`[WHATSAPP CLOUD API ERROR] Status ${response.status}: ${errData}`);
          return false;
        }
      } catch (err: any) {
        this.logger.error(`[WHATSAPP CLOUD API EXCEPTION] ${err.message}`);
        return false;
      }
    }

    // Option 2: Configured Webhook / Gateway
    if (gatewayUrl) {
      try {
        const response = await fetch(gatewayUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: cleanTo, message: text }),
        });
        if (response.ok) {
          this.logger.log(`[WHATSAPP GATEWAY] Message dispatched to +${cleanTo}`);
          return true;
        }
      } catch (err: any) {
        this.logger.error(`[WHATSAPP GATEWAY EXCEPTION] ${err.message}`);
      }
    }

    this.logger.log('[WHATSAPP] No automatic messaging provider configured; use the explicit deep link.');
    return false;
  }

  /**
   * Sends automated direct WhatsApp update for any order lifecycle event (placed, confirmed, ready, dispatched, delivered, cancelled).
   */
  public async sendDirectOrderStatusUpdate(ctx: WhatsAppOrderContext, status: string): Promise<boolean> {
    const { text } = this.generateOrderStatusUpdateMessage(ctx, status);
    return this.sendDirectWhatsApp(ctx.customerPhone, text);
  }

  /**
   * Generates a pre-filled WhatsApp task assignment message for Delivery Partner.
   */
  public generateDeliveryPartnerAssignmentMessage(ctx: DeliveryPartnerWhatsAppContext): { url: string; text: string } {
    const text = buildRiderAssignmentMessage({
      orderNumber: ctx.orderNumber,
      storeName: ctx.storeName,
      storePhone: ctx.storePhone,
      riderName: ctx.riderName,
      riderPhone: ctx.riderPhone,
      customerName: ctx.customerName,
      customerPhone: ctx.customerPhone || '',
      address: ctx.address || {
        addressLine1: ctx.deliveryAddressStr,
      },
      itemsSummary: ctx.itemsSummary,
      totalPaise: ctx.totalPaise,
      paymentMethod: ctx.paymentMethod || (ctx.isCod ? 'COD' : 'ONLINE'),
      paymentStatus: ctx.paymentStatus || (ctx.isCod ? 'PENDING' : 'PAID'),
      codCollectionMethod: ctx.codCollectionMethod,
      deliveryNote: ctx.customMessage,
    });

    const url = buildWhatsAppDeepLink(ctx.riderPhone, text);
    return { url, text };
  }

  /**
   * Directly sends WhatsApp task assignment to Delivery Partner.
   */
  public async sendDirectDeliveryPartnerAssignment(ctx: DeliveryPartnerWhatsAppContext): Promise<boolean> {
    const { text } = this.generateDeliveryPartnerAssignmentMessage(ctx);
    return this.sendDirectWhatsApp(ctx.riderPhone, text);
  }

  /**
   * Generates a pre-filled WhatsApp delivery completion message for Delivery Partner.
   */
  public generateDeliveryPartnerCompletedMessage(ctx: DeliveryPartnerWhatsAppContext): { url: string; text: string } {
    const text =
      `*Delivery Completed Successfully! 🎉 - Order #${ctx.orderNumber}*\n\n` +
      `Hello *${ctx.riderName}*,\n` +
      `Order *#${ctx.orderNumber}* for *${ctx.customerName}* has been marked successfully delivered and settled.\n\n` +
      `Store: *${ctx.storeName}*\n` +
      `Total Settled: ${formatPaise(ctx.totalPaise)}\n\n` +
      `Thank you for your service!`;

    const riderCleanPhone = this.cleanPhone(ctx.riderPhone);
    const url = `https://wa.me/${riderCleanPhone}?text=${encodeURIComponent(text)}`;
    return { url, text };
  }

  /**
   * Directly sends WhatsApp delivery completion confirmation to Delivery Partner.
   */
  public async sendDirectDeliveryPartnerCompleted(ctx: DeliveryPartnerWhatsAppContext): Promise<boolean> {
    const { text } = this.generateDeliveryPartnerCompletedMessage(ctx);
    return this.sendDirectWhatsApp(ctx.riderPhone, text);
  }
}
