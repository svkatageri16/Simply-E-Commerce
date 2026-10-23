import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

const formatPaise = (paise: number) => {
  if (typeof paise !== 'number') return '₹0.00';
  return '₹' + (paise / 100).toFixed(2);
};

export function smtpDeliveryEvidence(result: any, to: string) {
  const address = (entry: any) => String(typeof entry === 'string' ? entry : entry?.address || '').trim().toLowerCase();
  return {
    accepted: (result.accepted || []).some((entry: any) => address(entry) === to.trim().toLowerCase()),
    rejected: (result.rejected || []).some((entry: any) => address(entry) === to.trim().toLowerCase()),
    messageIdExists: Boolean(result.messageId),
    responseClass: /^[245]\d\d/.exec(String(result.response || ''))?.[0]?.slice(0, 1).concat('xx') || 'UNKNOWN',
  };
}

export interface OrderEmailContext {
  eventId?: string;
  order: any;
  store: {
    id: string;
    name: string;
    supportEmail?: string;
    supportPhone?: string;
  };
  customer: {
    fullName: string;
    email: string;
    phone?: string;
  };
  trackingUrl?: string;
  reviewUrl?: string;
  courierName?: string;
  awbNumber?: string;
  riderName?: string;
  riderPhone?: string;
  deliveryMode?: 'SHIPROCKET' | 'SELF_DELIVERY';
  customMessage?: string;
}

export interface DeliveryPartnerEmailContext {
  order: any;
  store: {
    id: string;
    name: string;
    address?: string;
    supportEmail?: string;
    supportPhone?: string;
  };
  customer: {
    fullName: string;
    email?: string;
    phone?: string;
    address?: any;
  };
  rider: {
    name: string;
    phone: string;
    email: string;
  };
  customMessage?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromAddress: string;
  private verificationReady: Promise<boolean> | null = null;
  public lastVerificationDelivery: { accepted: boolean; rejected: boolean; messageIdExists: boolean; responseClass: string } | null = null;

  constructor() {
    const host = process.env.SMTP_HOST || 'smtp.letzshop.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '';
    this.fromAddress = process.env.SMTP_FROM || `"LetzShop" <${user}>`;

    if (user && pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
          requireTLS: port === 587,
          auth: { user, pass },
          connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        });
        this.logger.log(`[SMTP] Transporter configured for host: ${host}:${port}`);
      } catch (err: any) {
        this.logger.warn('[SMTP] Unable to initialize mail transport.');
      }
    } else {
      this.logger.log('[SMTP] Transporter not configured. Running in development simulation mode (logging outgoing emails).');
    }
  }

  public async verifyTransport(): Promise<boolean> {
    if (!this.transporter) return false;
    if (!this.verificationReady) {
      this.verificationReady = this.transporter.verify().then(() => true).catch(() => {
        this.logger.error('[SMTP] Connection/authentication verification failed.');
        this.verificationReady = null;
        return false;
      });
    }
    return this.verificationReady;
  }

  public async sendVerificationOtp(to: string, code: string, minutes: number): Promise<boolean> {
    this.lastVerificationDelivery = null;
    if (!this.transporter || !await this.verifyTransport()) return false;
    try {
      const result = await this.transporter.sendMail({
        from: this.fromAddress, to, subject: 'Your LetzShop verification code',
        text: `Your verification code is ${code}. It expires in ${minutes} minutes. If you did not request this, ignore the email.`,
        html: `<p>Your LetzShop verification code is <strong>${code}</strong>.</p><p>It expires in ${minutes} minutes.</p><p>If you did not request this, ignore the email.</p>`,
      });
      this.lastVerificationDelivery = smtpDeliveryEvidence(result, to);
      this.logger.log(`[SMTP] Verification delivery ${JSON.stringify(this.lastVerificationDelivery)}`);
      return this.lastVerificationDelivery.accepted && !this.lastVerificationDelivery.rejected;
    } catch {
      this.verificationReady = null;
      this.logger.error('[SMTP] Unable to send verification email.'); return false;
    }
  }

  private async sendEmail(to: string, subject: string, html: string, eventId?: string): Promise<boolean> {
    if (!to || !to.includes('@')) {
      this.logger.warn(`[SMTP] Skipped sending email: Invalid recipient address "${to}"`);
      return false;
    }

    if (this.transporter) {
      try {
        const result = await this.transporter.sendMail({
          from: this.fromAddress,
          to,
          subject,
          html,
          ...(eventId ? { messageId: `<${Buffer.from(eventId).toString('hex')}@notifications.letzshop.store>` } : {}),
        });
        const evidence = smtpDeliveryEvidence(result, to);
        this.logger.log(`[SMTP] Notification delivery ${JSON.stringify(evidence)}`);
        return evidence.accepted && !evidence.rejected;
      } catch (err: any) {
        this.logger.error('[SMTP] Unable to send notification email.');
        return false;
      }
    } else {
      // Simulation mode
      this.logger.log(
        `[SMTP SIMULATION] To: ${to} | From: ${this.fromAddress} | Subject: "${subject}"`
      );
      return true;
    }
  }

  /**
   * Platform Admin email notification to Merchant
   */
  public async sendAdminMerchantEmail(
    to: string,
    subject: string,
    messageText: string,
    merchantName?: string,
  ): Promise<boolean> {
    const formattedHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px;">
          <h2 style="color: #0f172a; margin-top: 0;">LetzShop Platform Notice</h2>
          <div style="color: #475569; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${messageText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">This email was sent by the LetzShop Platform Administration team regarding ${merchantName || 'your merchant account'}.</p>
        </div>
      </body>
      </html>
    `;
    return this.sendEmail(to, subject, formattedHtml);
  }

  /**
   * Platform Admin email notification to Sub Admin
   */
  public async sendSubAdminMessageEmail(
    to: string,
    subject: string,
    messageText: string,
    subAdminName?: string,
  ): Promise<boolean> {
    const formattedHtml = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 32px;">
          <h2 style="color: #0f172a; margin-top: 0;">Notice for Administrator${subAdminName ? ' ' + subAdminName.replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</h2>
          <div style="color: #475569; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${messageText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">This communication was dispatched via LetzShop Platform Administration.</p>
        </div>
      </body>
      </html>
    `;
    return this.sendEmail(to, subject, formattedHtml);
  }

  /**
   * Order Placed Email to Buyer (Order Confirmation)
   */
  public async sendOrderPlacedEmail(ctx: OrderEmailContext): Promise<boolean> {
    const { order, store, customer, trackingUrl } = ctx;
    const recipient = customer.email;
    const subject = `Order Confirmed: #${order.orderNumber} - ${store.name}`;

    const itemsHtml = (order.items || [])
      .map(
        (it: any) => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px 0;">
            <strong style="color: #1e293b; font-size: 14px;">${it.productName}</strong>
            ${it.variantTitle && it.variantTitle !== 'Standard / Default' ? `<br/><span style="color: #64748b; font-size: 12px;">${it.variantTitle}</span>` : ''}
          </td>
          <td style="padding: 12px; text-align: center; color: #475569; font-size: 13px;">${it.quantity}</td>
          <td style="padding: 12px 0; text-align: right; color: #0f172a; font-weight: 600; font-size: 14px;">${formatPaise(it.totalPaise || it.unitPricePaise * it.quantity)}</td>
        </tr>`
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; }
          .header { background: #0f172a; padding: 28px 24px; text-align: center; color: #ffffff; }
          .content { padding: 28px 24px; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; background: #ecfdf5; color: #059669; }
          .btn { display: inline-block; padding: 12px 24px; background: #059669; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 13px; text-align: center; }
          .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">${store.name}</h1>
            <p style="margin: 6px 0 0; color: #94a3b8; font-size: 13px;">Thank you for your order!</p>
          </div>
          <div class="content">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
              <div>
                <span style="font-size: 12px; color: #64748b;">Order Number</span>
                <h3 style="margin: 2px 0 0; font-family: monospace; font-size: 16px; color: #0f172a;">#${order.orderNumber}</h3>
              </div>
              <span class="badge">CONFIRMED</span>
            </div>

            <p style="font-size: 14px; line-height: 1.5; color: #334155;">
              Hi <strong>${customer.fullName}</strong>,<br/>
              We have received your order and are currently preparing it. You do not need to sign in to check your order details — everything is documented in this confirmation.
            </p>

            <table style="width: 100%; border-collapse: collapse; margin: 24px 0 16px;">
              <thead>
                <tr style="border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 11px; text-transform: uppercase;">
                  <th style="padding: 8px 0; text-align: left;">Item</th>
                  <th style="padding: 8px; text-align: center;">Qty</th>
                  <th style="padding: 8px 0; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin: 20px 0;">
              <div style="display: flex; justify-content: space-between; font-size: 13px; color: #64748b; margin-bottom: 6px;">
                <span>Subtotal</span>
                <span>${formatPaise(order.subtotalPaise)}</span>
              </div>
              ${order.shippingPaise > 0 ? `
              <div style="display: flex; justify-content: space-between; font-size: 13px; color: #64748b; margin-bottom: 6px;">
                <span>Delivery</span>
                <span>${formatPaise(order.shippingPaise)}</span>
              </div>` : ''}
              ${order.discountPaise > 0 ? `
              <div style="display: flex; justify-content: space-between; font-size: 13px; color: #059669; margin-bottom: 6px;">
                <span>Discount</span>
                <span>-${formatPaise(order.discountPaise)}</span>
              </div>` : ''}
              <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; color: #0f172a; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 4px;">
                <span>Total Amount</span>
                <span>${formatPaise(order.totalPaise)}</span>
              </div>
            </div>

            ${(() => {
              const addr = order.orderAddress || (order.deliveryAddress as any) || {};
              const phone = customer.phone || addr.phone || addr.phoneNumber;
              return `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; font-size: 13px;">
              <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 6px;">📍 Shipping Destination</div>
              <div style="font-weight: 700; color: #0f172a; font-size: 14px;">${customer.fullName}</div>
              <div style="color: #334155; margin-top: 2px;">${addr.addressLine1 || 'Delivery Address'}${addr.addressLine2 ? ', ' + addr.addressLine2 : ''}</div>
              ${addr.landmark ? `<div style="color: #64748b; font-size: 12px;">Landmark: ${addr.landmark}</div>` : ''}
              <div style="color: #334155; margin-top: 2px;">${addr.city ? addr.city + ', ' : ''}${addr.state ? addr.state + ' - ' : ''}<span style="font-family: monospace; font-weight: 600;">${addr.pincode || addr.postalCode || ''}</span></div>
              ${phone ? `<div style="color: #475569; margin-top: 6px; font-family: monospace; font-size: 12.5px;">📞 Mobile: ${phone}</div>` : ''}
            </div>`;
            })()}

            ${trackingUrl ? `
            <div style="text-align: center; margin: 28px 0;">
              <a href="${trackingUrl}" class="btn" style="color: #ffffff;">Track Order Live</a>
            </div>` : ''}
          </div>
          <div class="footer">
            <p style="margin: 0;">Need help with your purchase? Contact <strong>${store.name}</strong> at ${store.supportEmail || 'store support'}.</p>
            <p style="margin: 6px 0 0; color: #94a3b8;">Powered by Letzshop Commerce</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(recipient, subject, html, ctx.eventId);
  }

  /**
   * Order Dispatched Email to Buyer
   */
  public async sendOrderDispatchedEmail(ctx: OrderEmailContext): Promise<boolean> {
    const { order, store, customer, trackingUrl, deliveryMode, courierName, awbNumber, riderName, riderPhone } = ctx;
    const recipient = customer.email;
    const subject = `Your Order #${order.orderNumber} Has Been Dispatched! - ${store.name}`;

    const isSelf = deliveryMode === 'SELF_DELIVERY';
    const deliveryDetailHtml = isSelf
      ? `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px; margin: 20px 0;">
          <h4 style="margin: 0 0 6px; color: #166534; font-size: 14px;">🛵 Out For Delivery via Store Team</h4>
          <p style="margin: 0; font-size: 13px; color: #15803d;">
            Delivered directly by our in-house delivery partner: <strong>${riderName || 'Store Team'}</strong>
            ${riderPhone ? `<br/>Contact Number: <strong>${riderPhone}</strong>` : ''}
          </p>
        </div>`
      : `
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin: 20px 0;">
          <h4 style="margin: 0 0 6px; color: #1e40af; font-size: 14px;">🚚 Shipped via ${courierName || 'Shiprocket Logistics'}</h4>
          <p style="margin: 0; font-size: 13px; color: #1d4ed8;">
            AWB Tracking Number: <strong style="font-family: monospace;">${awbNumber || 'Assigned'}</strong>
          </p>
        </div>`;

    const customMessageHtml = ctx.customMessage ? `
      <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 18px 0; border-radius: 4px; border: 1px solid #e2e8f0; border-left-width: 4px; border-left-color: #2563eb;">
        <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #2563eb; display: block; margin-bottom: 4px;">Personal Note from ${store.name}</span>
        <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #1e293b; font-style: italic;">"${ctx.customMessage}"</p>
      </div>` : '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; }
          .header { background: #0f172a; padding: 28px 24px; text-align: center; color: #ffffff; }
          .content { padding: 28px 24px; }
          .btn { display: inline-block; padding: 12px 24px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 13px; text-align: center; }
          .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">${store.name}</h1>
            <p style="margin: 6px 0 0; color: #94a3b8; font-size: 13px;">Package on its way!</p>
          </div>
          <div class="content">
            <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Your Order is Out for Delivery 🚀</h2>
            <p style="font-size: 14px; line-height: 1.5; color: #334155;">
              Hi <strong>${customer.fullName}</strong>,<br/>
              Your order <strong>#${order.orderNumber}</strong> has been packed and dispatched from our store.
            </p>

            ${deliveryDetailHtml}
            ${customMessageHtml}

            ${trackingUrl ? `
            <div style="text-align: center; margin: 24px 0;">
              <a href="${trackingUrl}" class="btn" style="color: #ffffff;">View Live Order Status</a>
            </div>` : ''}

            <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
              Please ensure someone is available at your address to receive the delivery.
            </p>
          </div>
          <div class="footer">
            <p style="margin: 0;">Questions about your order? Reach out to ${store.name} at ${store.supportPhone || store.supportEmail || 'support'}.</p>
            <p style="margin: 6px 0 0; color: #94a3b8;">Powered by Letzshop Commerce</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(recipient, subject, html, ctx.eventId);
  }

  /**
   * Order Delivered Email to Buyer
   */
  public async sendOrderDeliveredEmail(ctx: OrderEmailContext): Promise<boolean> {
    const { order, store, customer, trackingUrl } = ctx;
    const recipient = customer.email;
    const subject = `Order Delivered! #${order.orderNumber} - ${store.name}`;

    const customMessageHtml = ctx.customMessage ? `
      <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; margin: 18px 0; border-radius: 4px; border: 1px solid #bbf7d0; border-left-width: 4px; border-left-color: #16a34a;">
        <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #16a34a; display: block; margin-bottom: 4px;">Personal Note from ${store.name}</span>
        <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #166534; font-style: italic;">"${ctx.customMessage}"</p>
      </div>` : '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; }
          .header { background: #065f46; padding: 28px 24px; text-align: center; color: #ffffff; }
          .content { padding: 28px 24px; }
          .btn { display: inline-block; padding: 12px 24px; background: #059669; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 13px; text-align: center; }
          .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 22px; font-weight: 800;">Package Delivered 🎉</h1>
            <p style="margin: 6px 0 0; color: #a7f3d0; font-size: 13px;">${store.name}</p>
          </div>
          <div class="content">
            <p style="font-size: 14px; line-height: 1.5; color: #334155;">
              Hi <strong>${customer.fullName}</strong>,<br/>
              Your order <strong>#${order.orderNumber}</strong> has been successfully delivered. We hope you enjoy your purchase!
            </p>

            ${customMessageHtml}

            <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin: 20px 0; border: 1px solid #e2e8f0;">
              <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; color: #0f172a;">
                <span>Total Paid:</span>
                <span>${formatPaise(order.totalPaise)}</span>
              </div>
            </div>

            ${order.reviewUrl || ctx.reviewUrl ? `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 22px 20px; text-align: center; margin: 24px 0;">
              <h3 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: #166534;">How was your purchase?</h3>
              <p style="margin: 0 0 16px 0; font-size: 13.5px; color: #15803d; line-height: 1.4;">Your feedback helps ${store.name} improve and helps other customers make confident choices.</p>
              <a href="${order.reviewUrl || ctx.reviewUrl}" class="btn" style="background: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; font-size: 13.5px; display: inline-block;">Write a Review</a>
            </div>` : ''}

            ${trackingUrl ? `
            <div style="text-align: center; margin: 20px 0;">
              <a href="${trackingUrl}" style="display: inline-block; padding: 10px 20px; background: #f1f5f9; color: #334155; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 13px;">View Order Receipt</a>
            </div>` : ''}

            <p style="font-size: 13px; color: #64748b;">
              Have questions or need assistance? Reply directly to this email or contact us anytime.
            </p>
          </div>
          <div class="footer">
            <p style="margin: 0;">Thank you for supporting <strong>${store.name}</strong>!</p>
            <p style="margin: 6px 0 0; color: #94a3b8;">Powered by Letzshop Commerce</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(recipient, subject, html, ctx.eventId);
  }

  /**
   * Order Status Update Email to Buyer (CONFIRMED, ACCEPTED, READY, CANCELLED)
   */
  public async sendOrderStatusUpdateEmail(ctx: OrderEmailContext, status: string): Promise<boolean> {
    const { order, store, customer, trackingUrl } = ctx;
    const recipient = customer.email;

    let statusTitle = 'Order Update';
    let statusBadgeText = status;
    let badgeBg = '#eff6ff';
    let badgeColor = '#2563eb';
    let headerBg = '#0f172a';
    let bodyIntro = `Your order <strong>#${order.orderNumber}</strong> has been updated to <strong>${status}</strong>.`;

    if (status === 'ACCEPTED' || status === 'CONFIRMED') {
      statusTitle = 'Order Accepted & Preparing';
      statusBadgeText = 'ACCEPTED';
      badgeBg = '#ecfeff';
      badgeColor = '#0891b2';
      headerBg = '#0e7490';
      bodyIntro = `Good news! Your order <strong>#${order.orderNumber}</strong> has been accepted by <strong>${store.name}</strong> and is currently being prepared with care.`;
    } else if (status === 'READY') {
      statusTitle = 'Order Packed & Ready';
      statusBadgeText = 'READY TO SHIP';
      badgeBg = '#fef3c7';
      badgeColor = '#d97706';
      headerBg = '#b45309';
      bodyIntro = `Your order <strong>#${order.orderNumber}</strong> has been carefully packed and is ready for pickup/dispatch.`;
    } else if (status === 'OUT_FOR_DELIVERY') {
      statusTitle = 'Out For Delivery';
      statusBadgeText = 'OUT FOR DELIVERY';
      badgeBg = '#f0fdf4';
      badgeColor = '#16a34a';
      headerBg = '#15803d';
      bodyIntro = `Your order <strong>#${order.orderNumber}</strong> from <strong>${store.name}</strong> is out for delivery! Please keep your phone reachable for the delivery partner.`;
    } else if (status === 'CANCELLED') {
      statusTitle = 'Order Cancelled';
      statusBadgeText = 'CANCELLED';
      badgeBg = '#ffe4e6';
      badgeColor = '#e11d48';
      headerBg = '#881337';
      bodyIntro = `Your order <strong>#${order.orderNumber}</strong> has been cancelled. Any pre-payments or reservations are being reconciled.`;
    }

    const subject = `${statusTitle}: #${order.orderNumber} - ${store.name}`;

    const customMessageHtml = ctx.customMessage ? `
      <div style="background: #f8fafc; border-left: 4px solid #0284c7; padding: 12px 16px; margin: 18px 0; border-radius: 4px; border: 1px solid #e2e8f0; border-left-width: 4px; border-left-color: #0284c7;">
        <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #0284c7; display: block; margin-bottom: 4px;">Note from ${store.name}</span>
        <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #1e293b; font-style: italic;">"${ctx.customMessage}"</p>
      </div>` : '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; }
          .header { background: ${headerBg}; padding: 28px 24px; text-align: center; color: #ffffff; }
          .content { padding: 28px 24px; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; background: ${badgeBg}; color: ${badgeColor}; }
          .btn { display: inline-block; padding: 12px 24px; background: #0284c7; color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 13px; text-align: center; }
          .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 22px; font-weight: 800;">${store.name}</h1>
            <p style="margin: 6px 0 0; color: #e2e8f0; font-size: 13px;">${statusTitle}</p>
          </div>
          <div class="content">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <div>
                <span style="font-size: 12px; color: #64748b;">Order Number</span>
                <h3 style="margin: 2px 0 0; font-family: monospace; font-size: 16px; color: #0f172a;">#${order.orderNumber}</h3>
              </div>
              <span class="badge">${statusBadgeText}</span>
            </div>

            <p style="font-size: 14px; line-height: 1.5; color: #334155;">
              Hi <strong>${customer.fullName}</strong>,<br/>
              ${bodyIntro}
            </p>

            ${customMessageHtml}

            <div style="background: #f8fafc; border-radius: 12px; padding: 14px; margin: 18px 0; border: 1px solid #e2e8f0;">
              <div style="display: flex; justify-content: space-between; font-size: 13px; color: #475569;">
                <span>Total Amount:</span>
                <strong style="color: #0f172a;">${formatPaise(order.totalPaise)}</strong>
              </div>
            </div>

            ${trackingUrl ? `
            <div style="text-align: center; margin: 24px 0;">
              <a href="${trackingUrl}" class="btn" style="color: #ffffff;">Check Live Status</a>
            </div>` : ''}
          </div>
          <div class="footer">
            <p style="margin: 0;">Need help? Contact ${store.name} at ${store.supportPhone || store.supportEmail || 'support'}.</p>
            <p style="margin: 6px 0 0; color: #94a3b8;">Powered by Letzshop Commerce</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(recipient, subject, html, ctx.eventId);
  }

  /**
   * New Order Alert Email to Merchant / Vendor
   */
  public async sendVendorNewOrderAlert(ctx: OrderEmailContext, vendorEmail?: string): Promise<boolean> {
    const { order, store, customer } = ctx;
    const recipient = vendorEmail || store.supportEmail;
    if (!recipient) return false;

    const subject = `🎉 New Order Received: #${order.orderNumber} (${formatPaise(order.totalPaise)})`;
    const html = `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
        <h2>New Order Placed on ${store.name}!</h2>
        <p><strong>Order Number:</strong> #${order.orderNumber}</p>
        <p><strong>Customer:</strong> ${customer.fullName} (${customer.phone || 'No phone'}) - ${customer.email || 'No email'}</p>
        <p><strong>Total Amount:</strong> ${formatPaise(order.totalPaise)}</p>
        <p>Please open your merchant portal to accept and dispatch this order.</p>
      </div>
    `;

    return this.sendEmail(recipient, subject, html);
  }

  /**
   * Order Dispatched Notification Email to Delivery Partner
   */
  public async sendDeliveryPartnerDispatchedEmail(ctx: DeliveryPartnerEmailContext): Promise<boolean> {
    const recipient = ctx.rider.email;
    if (!recipient) return false;

    const { order, store, customer, rider, customMessage } = ctx;
    const subject = `New Delivery Task 🛵: Order #${order.orderNumber} - ${store.name}`;

    const isCod = order.paymentMethod === 'COD' || order.paymentStatus === 'PENDING';
    const itemsSummaryHtml = (order.items || [])
      .map((it: any) => `<li style="margin-bottom: 4px;"><strong>${it.quantity}x</strong> ${it.productName}</li>`)
      .join('');

    const addr = customer.address || {};
    const addressStr = [
      addr.addressLine1 || addr.address1 || addr.street,
      addr.addressLine2 || addr.address2,
      addr.city,
      addr.state,
      addr.pincode || addr.postalCode,
    ].filter(Boolean).join(', ');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; }
          .header { background: #0f172a; padding: 24px; text-align: center; color: #ffffff; }
          .content { padding: 24px; }
          .footer { background: #f8fafc; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 20px; font-weight: 800;">New Delivery Assignment 🛵</h1>
            <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">${store.name}</p>
          </div>
          <div class="content">
            <p style="font-size: 14px; margin-top: 0;">
              Hi <strong>${rider.name}</strong>,<br/>
              You have been assigned to deliver order <strong>#${order.orderNumber}</strong>.
            </p>

            <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin: 16px 0; border: 1px solid #e2e8f0;">
              <h4 style="margin: 0 0 8px; color: #0f172a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">📍 Store / Pickup Location:</h4>
              <p style="margin: 0; font-size: 13px; color: #334155;">
                <strong>${store.name}</strong><br/>
                ${store.address ? `${store.address}<br/>` : ''}
                📞 Contact: ${store.supportPhone || store.supportEmail || 'Store Manager'}
              </p>
            </div>

            <div style="background: #f0fdf4; border-radius: 12px; padding: 16px; margin: 16px 0; border: 1px solid #bbf7d0;">
              <h4 style="margin: 0 0 8px; color: #166534; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">🏠 Customer / Delivery Destination:</h4>
              <p style="margin: 0; font-size: 13px; color: #15803d;">
                <strong>${customer.fullName}</strong><br/>
                ${addressStr || 'Address provided in order details'}<br/>
                📞 Mobile: <strong>${customer.phone || 'N/A'}</strong>
              </p>
            </div>

            <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin: 16px 0; border: 1px solid #e2e8f0;">
              <h4 style="margin: 0 0 8px; color: #0f172a; font-size: 13px;">📦 Items to Deliver:</h4>
              <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155;">
                ${itemsSummaryHtml}
              </ul>
            </div>

            <div style="background: ${isCod ? '#fffbeb' : '#eff6ff'}; border: 1px solid ${isCod ? '#fde68a' : '#bfdbfe'}; border-radius: 12px; padding: 14px 16px; margin: 16px 0;">
              <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: ${isCod ? '#b45309' : '#1d4ed8'}; display: block; margin-bottom: 4px;">Payment Instructions</span>
              <p style="margin: 0; font-size: 14px; font-weight: bold; color: ${isCod ? '#92400e' : '#1e40af'};">
                ${isCod ? `💵 COD Order: Collect ${formatPaise(order.totalPaise)} upon delivery.` : `💳 Prepaid Order: ${formatPaise(order.totalPaise)} paid online. Do NOT collect cash.`}
              </p>
            </div>

            ${customMessage ? `
            <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 10px 14px; margin: 16px 0; border-radius: 4px; border: 1px solid #e2e8f0; border-left-width: 4px; border-left-color: #3b82f6;">
              <span style="font-size: 11px; font-weight: bold; color: #3b82f6; display: block;">Note from Merchant:</span>
              <p style="margin: 4px 0 0; font-size: 13px; color: #1e293b; font-style: italic;">"${customMessage}"</p>
            </div>` : ''}

            <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
              Please collect the package from the store and ensure prompt delivery.
            </p>
          </div>
          <div class="footer">
            <p style="margin: 0;">Dispatched by <strong>${store.name}</strong></p>
            <p style="margin: 4px 0 0; color: #94a3b8;">Powered by Letzshop Commerce</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(recipient, subject, html);
  }

  /**
   * Order Delivered Confirmation Email to Delivery Partner
   */
  public async sendDeliveryPartnerDeliveredEmail(ctx: DeliveryPartnerEmailContext): Promise<boolean> {
    const recipient = ctx.rider.email;
    if (!recipient) return false;

    const { order, store, customer, rider } = ctx;
    const subject = `Delivery Complete 🎉: Order #${order.orderNumber} - ${store.name}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; }
          .header { background: #065f46; padding: 24px; text-align: center; color: #ffffff; }
          .content { padding: 24px; }
          .footer { background: #f8fafc; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 20px; font-weight: 800;">Delivery Completed 🎉</h1>
            <p style="margin: 4px 0 0; color: #a7f3d0; font-size: 13px;">${store.name}</p>
          </div>
          <div class="content">
            <p style="font-size: 14px; margin-top: 0;">
              Hi <strong>${rider.name}</strong>,<br/>
              Order <strong>#${order.orderNumber}</strong> for <strong>${customer.fullName}</strong> has been marked as successfully delivered and settled.
            </p>

            <div style="background: #f0fdf4; border-radius: 12px; padding: 16px; margin: 16px 0; border: 1px solid #bbf7d0;">
              <div style="display: flex; justify-content: space-between; font-size: 14px; color: #166534; font-weight: bold;">
                <span>Total Settled:</span>
                <span>${formatPaise(order.totalPaise)}</span>
              </div>
            </div>

            <p style="font-size: 13px; color: #334155;">
              Thank you for delivering with <strong>${store.name}</strong>!
            </p>
          </div>
          <div class="footer">
            <p style="margin: 0;">Powered by Letzshop Commerce</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(recipient, subject, html);
  }

  /**
   * Merchant Reported Review Email sent to designated emails:
   * letzshop@aikyamaisystems.com, business@aikyamaisystems.com, and platform admin
   */
  public async sendReviewReportModerationEmail(report: {
    storeName: string;
    storeId: string;
    productName: string;
    productId: string;
    orderNumber: string;
    reviewId: string;
    reviewerName: string;
    rating: number;
    title?: string | null;
    body: string;
    reason: string;
    details?: string | null;
    merchantIdentifier: string;
  }): Promise<boolean> {
    const recipients = [
      'letzshop@aikyamaisystems.com',
      'business@aikyamaisystems.com',
    ];
    const adminEmail = process.env.ADMIN_ALERT_EMAIL || process.env.SUPPORT_EMAIL || 'admin@shopongo.com';
    if (adminEmail && !recipients.includes(adminEmail)) {
      recipients.push(adminEmail);
    }

    const subject = `[Review Moderation Request] Store "${report.storeName}" reported review for "${report.productName}"`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
          .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          .header { background: #0f172a; padding: 22px 24px; color: #ffffff; }
          .content { padding: 24px; font-size: 14px; line-height: 1.6; }
          .alert { background: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 16px; border-radius: 8px; margin-bottom: 20px; }
          .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
          .meta-table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
          .review-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
          .footer { padding: 16px 24px; background: #f1f5f9; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #ffffff;">Merchant Review Moderation Request</h2>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8;">A seller has flagged customer feedback for administrator review</p>
          </div>
          <div class="content">
            <div class="alert">
              <p style="margin: 0; font-weight: 700; color: #991b1b; font-size: 14px;">Reason: ${report.reason}</p>
              ${report.details ? `<p style="margin: 6px 0 0 0; font-size: 13px; color: #7f1d1d;"><strong>Additional Details:</strong> ${report.details}</p>` : ''}
            </div>

            <h3 style="font-size: 12px; text-transform: uppercase; color: #64748b; margin: 0 0 10px 0; letter-spacing: 0.05em; font-weight: 700;">Store & Transaction Details</h3>
            <table class="meta-table">
              <tr><td style="color: #64748b; width: 140px;">Store Name:</td><td style="font-weight: 600;">${report.storeName}</td></tr>
              <tr><td style="color: #64748b;">Store ID:</td><td style="font-family: monospace; font-size: 12px;">${report.storeId}</td></tr>
              <tr><td style="color: #64748b;">Reported By:</td><td>${report.merchantIdentifier}</td></tr>
              <tr><td style="color: #64748b;">Order Number:</td><td style="font-family: monospace; font-weight: 700; color: #0284c7;">#${report.orderNumber}</td></tr>
              <tr><td style="color: #64748b;">Product:</td><td><strong>${report.productName}</strong> <span style="font-size: 11px; color: #94a3b8;">(ID: ${report.productId})</span></td></tr>
            </table>

            <h3 style="font-size: 12px; text-transform: uppercase; color: #64748b; margin: 0 0 10px 0; letter-spacing: 0.05em; font-weight: 700;">Reported Review Content</h3>
            <div class="review-box">
              <div style="margin-bottom: 8px;">
                <span style="font-weight: 700; color: #f59e0b; font-size: 15px;">${'★'.repeat(Math.max(1, Math.min(5, report.rating)))}${'☆'.repeat(Math.max(0, 5 - Math.max(1, Math.min(5, report.rating))))}</span>
                <span style="font-weight: 700; color: #0f172a; margin-left: 6px;">${report.rating}.0 / 5</span>
                <span style="color: #64748b; font-size: 13px;">by <strong>${report.reviewerName}</strong></span>
              </div>
              ${report.title ? `<div style="font-weight: 700; color: #1e293b; margin-bottom: 6px; font-size: 14px;">"${report.title}"</div>` : ''}
              <div style="color: #334155; white-space: pre-line; font-size: 13px; line-height: 1.5;">${report.body}</div>
              <div style="margin-top: 10px; font-size: 11px; color: #94a3b8; font-family: monospace;">Review ID: ${report.reviewId}</div>
            </div>

            <p style="font-size: 13px; color: #475569; margin: 0;">
              To inspect and moderate this review, log in to the <strong>Platform SuperAdmin Portal &rarr; Review Moderation</strong>.
            </p>
          </div>
          <div class="footer">
            <p style="margin: 0;">LetzShop Merchant Operations &bull; Automated Moderation Notification</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const sendPromises = recipients.map((r) => this.sendEmail(r, subject, html));
    await Promise.allSettled(sendPromises);
    return true;
  }

  /**
   * Buyer notification when their review is removed following moderation.
   * Never exposes merchant complaint text or admin internal notes.
   */
  public async sendReviewRemovedBuyerEmail(ctx: {
    recipientEmail: string;
    buyerName: string;
    productName: string;
    storeName: string;
    buyerFacingReason: string;
  }): Promise<boolean> {
    if (!ctx.recipientEmail || !ctx.recipientEmail.includes('@')) return false;
    const subject = `Notice regarding your review for ${ctx.productName} at ${ctx.storeName}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"/></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px;">
          <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">Review Moderation Notice</h2>
          <p style="font-size: 14px; margin: 0 0 12px 0;">Hello <strong>${ctx.buyerName}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
            Your review for <strong>${ctx.productName}</strong> at <strong>${ctx.storeName}</strong> has been removed following a LetzShop moderation review.
          </p>
          <div style="background: #f1f5f9; border-left: 4px solid #64748b; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; color: #1e293b;">
            <strong>Reason:</strong> ${ctx.buyerFacingReason}
          </div>
          <p style="font-size: 13px; color: #64748b; margin: 0;">
            If you believe this was incorrect, please contact LetzShop Support.
          </p>
        </div>
      </body>
      </html>
    `;
    return this.sendEmail(ctx.recipientEmail, subject, html);
  }

  /**
   * Merchant notification regarding review moderation outcome.
   * Result: 'Review removed' or 'Complaint dismissed'.
   */
  public async sendReviewModeratedMerchantEmail(ctx: {
    recipientEmail: string;
    storeName: string;
    productName: string;
    orderNumber: string;
    result: 'Review removed' | 'Complaint dismissed';
    safeReason: string;
  }): Promise<boolean> {
    if (!ctx.recipientEmail || !ctx.recipientEmail.includes('@')) return false;
    const subject = `[Review Moderation] ${ctx.result} for Order #${ctx.orderNumber} - ${ctx.storeName}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"/></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px;">
          <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">Review Moderation Decision</h2>
          <p style="font-size: 14px; margin: 0 0 12px 0;">Hello <strong>${ctx.storeName}</strong> Team,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
            The reported review for <strong>${ctx.productName}</strong> (Order #${ctx.orderNumber}) has been reviewed by LetzShop platform administrators.
          </p>
          <div style="background: #f8fafc; border-left: 4px solid #0284c7; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; color: #1e293b;">
            <p style="margin: 0 0 6px 0;"><strong>Result:</strong> ${ctx.result}</p>
            <p style="margin: 0; color: #475569;"><strong>Notes / Status:</strong> ${ctx.safeReason}</p>
          </div>
          <p style="font-size: 13px; color: #64748b; margin: 0;">
            Thank you for helping maintain quality feedback on LetzShop.
          </p>
        </div>
      </body>
      </html>
    `;
    return this.sendEmail(ctx.recipientEmail, subject, html);
  }

  /**
   * Merchant notification when a review is restored.
   */
  public async sendReviewRestoredMerchantEmail(ctx: {
    recipientEmail: string;
    storeName: string;
    productName: string;
    orderNumber: string;
  }): Promise<boolean> {
    if (!ctx.recipientEmail || !ctx.recipientEmail.includes('@')) return false;
    const subject = `[Review Moderation] Review restored for Order #${ctx.orderNumber} - ${ctx.storeName}`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"/></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px;">
          <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">Review Status Update</h2>
          <p style="font-size: 14px; margin: 0 0 12px 0;">Hello <strong>${ctx.storeName}</strong> Team,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
            A previously removed customer review for <strong>${ctx.productName}</strong> (Order #${ctx.orderNumber}) has been restored to active visibility.
          </p>
        </div>
      </body>
      </html>
    `;
    return this.sendEmail(ctx.recipientEmail, subject, html);
  }

  public isConfigured(): boolean {
    return Boolean(this.transporter);
  }

  public async testSmtpConnection(targetEmail: string): Promise<{ success: boolean; message: string }> {
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail.trim())) {
      throw new Error('Valid target email is required for SMTP test.');
    }
    if (!await this.verifyTransport()) return { success: false, message: 'SMTP connection/authentication failed. Check server configuration.' };
    const html = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>LetzShop SMTP Test</h2>
        <p>This is a test email sent from LetzShop Platform Administration.</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      </div>
    `;
    const sent = await this.sendEmail(targetEmail, 'LetzShop SMTP Test Connection', html);
    if (!sent) {
      return { success: false, message: 'Failed to deliver test email. Check server SMTP configuration.' };
    }
    return { success: true, message: 'SMTP provider accepted the test destination. Confirm receipt in Inbox or Spam.' };
  }

  public async sendSubAdminInviteEmail(params: {
    to: string;
    fullName: string;
    inviteUrl: string;
    expiresAt: Date;
    roleName: string;
  }): Promise<boolean> {
    const formattedExpiry = new Date(params.expiresAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const subject = `You're invited to LetzShop Admin`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"/></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="margin-bottom: 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">LetzShop Admin</h1>
            <p style="margin: 6px 0 0 0; font-size: 14px; color: #64748b;">Delegated Administrator Invitation</p>
          </div>
          <p style="font-size: 15px; margin: 0 0 16px 0;">Hello <strong>${params.fullName}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 16px 0;">
            You have been invited to join <strong>LetzShop Platform Administration</strong> as <strong>${params.roleName}</strong>.
          </p>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 24px 0;">
            To set up your account and choose your security PIN, please click the secure button below:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${params.inviteUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">
              Activate Account
            </a>
          </div>
          <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 24px 0 0 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            This invitation link is valid until <strong>${formattedExpiry}</strong>.<br/>
            If you did not expect this invitation, you can safely ignore this email.
          </p>
        </div>
      </body>
      </html>
    `;
    return this.sendEmail(params.to, subject, html);
  }

  public async sendSubAdminCredentialsEmail(params: {
    to: string;
    fullName: string;
    adminLoginUrl: string;
    temporaryPassword: string;
    permissions: string[];
    roleName?: string;
    isReset?: boolean;
  }): Promise<boolean> {
    const role = params.roleName || 'Sub Admin';
    const actionDesc = params.isReset
      ? 'Your temporary administrator password has been reset by the Super Admin.'
      : `You have been granted access to LetzShop Admin as a <strong>${role}</strong>.`;

    const formattedPermissions = params.permissions && params.permissions.length > 0
      ? params.permissions.map(p => p.replace(/_/g, ' ')).join(', ')
      : 'Standard delegated authorities';

    const subject = params.isReset
      ? 'Your LetzShop Admin Temporary Password Reset'
      : 'Your LetzShop Admin Access';

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"/></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
        <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="margin-bottom: 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">LetzShop Admin</h1>
            <p style="margin: 6px 0 0 0; font-size: 14px; color: #64748b;">Administrator Credentials</p>
          </div>
          <p style="font-size: 15px; margin: 0 0 16px 0;">Hello <strong>${params.fullName}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
            ${actionDesc}
          </p>

          <div style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">Login Credentials</p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e293b;"><strong>Login URL:</strong> <a href="${params.adminLoginUrl}" style="color: #2563eb; text-decoration: underline;">${params.adminLoginUrl}</a></p>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #1e293b;"><strong>Email:</strong> ${params.to}</p>
            <p style="margin: 0 0 0 0; font-size: 14px; color: #1e293b;"><strong>Temporary Password:</strong> <span style="font-family: monospace; background: #ffffff; padding: 3px 8px; border-radius: 4px; border: 1px solid #cbd5e1; font-weight: 700; letter-spacing: 0.5px;">${params.temporaryPassword}</span></p>
          </div>

          <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #1e40af;">
              <strong>Security Notice:</strong> For security, you will be asked to create a new password after your first login before accessing administrative features.
            </p>
          </div>

          <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 0 0 20px 0;">
            <strong>Granted Permissions:</strong><br/>
            ${formattedPermissions}
          </p>

          <div style="text-align: center; margin: 28px 0 16px 0;">
            <a href="${params.adminLoginUrl}" style="background-color: #0f172a; color: #ffffff; padding: 12px 28px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">
              Log in to Admin Portal
            </a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 24px 0 0 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
            — LetzShop Platform Administration
          </p>
        </div>
      </body>
      </html>
    `;
    return this.sendEmail(params.to, subject, html);
  }
}


