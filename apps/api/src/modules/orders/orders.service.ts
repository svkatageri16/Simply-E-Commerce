import { isEmail } from 'class-validator';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  PrismaClient,
  Prisma,
  OrderStatus,
  PaymentStatus,
  ShipmentStatus,
  FulfillmentStatus,
  ShippingProviderType,
} from '@prisma/client';
import { GuestCheckoutDto } from './dto/checkout.dto';
import { SubscriptionVisibilityService } from '../subscriptions/subscription-visibility.service';
import { InventoryService } from '../inventory/inventory.service';
import { ShippingService } from '../shipping/shipping.service';
import { TenantContext, BuyerSafeTrackOrderDto } from '@simply/types';
import { normalizePhone } from '@simply/validation';
import { InvalidTrackingTokenException } from '../../common/exceptions/domain.exceptions';
import * as crypto from 'crypto';
import { MailService } from '../notifications/mail.service';
import { WhatsAppService } from '../notifications/whatsapp.service';
import { buildPublicReviewUrl, buildPublicTrackingUrl, normalizeIndianPhone } from '@simply/api-contracts';
import { PAYMENT_GATEWAY_MIN_AMOUNT_PAISE, PAYMENT_GATEWAY_MIN_AMOUNT_RUPEES } from '@simply/config';

export interface CouponDefinition {
  code: string;
  type: 'PERCENTAGE' | 'FLAT';
  value: number; // percentage (e.g. 10) or flat paise
  label: string;
  minOrderPaise?: number;
  maxDiscountPaise?: number;
}

export const BUILT_IN_COUPONS: Record<string, CouponDefinition> = {
  WELCOME10: {
    code: 'WELCOME10',
    type: 'PERCENTAGE',
    value: 10,
    label: 'Welcome 10% Off',
    maxDiscountPaise: 50000, // Max ₹500
  },
  SAVE50: {
    code: 'SAVE50',
    type: 'FLAT',
    value: 5000, // ₹50 Flat
    label: 'Flat ₹50 Off',
    minOrderPaise: 49900, // Min ₹499
  },
  SUPER20: {
    code: 'SUPER20',
    type: 'PERCENTAGE',
    value: 20,
    label: 'Super Saver 20% Off',
    minOrderPaise: 99900, // Min ₹999
    maxDiscountPaise: 100000, // Max ₹1000
  },
  FREEDEL: {
    code: 'FREEDEL',
    type: 'FLAT',
    value: 4000, // ₹40 delivery waiver
    label: 'Free Delivery Credit',
    minOrderPaise: 29900,
  },
};

function resolveVariantMediaUrl(params: {
  productMedia?: any[];
  variant?: any;
  selectedOptionValues?: Record<string, string>;
}): string | null {
  const { productMedia = [], variant, selectedOptionValues = {} } = params;

  // 1. Variant specific media
  if (variant?.id) {
    if (Array.isArray(variant.media) && variant.media.length > 0) {
      const v = variant.media[0];
      return v.publicUrl || v.url || v.filePath || null;
    }
    const match = productMedia.find(
      (m: any) => m && (m.variantId === variant.id || m.variant?.id === variant.id)
    );
    if (match) return match.publicUrl || match.url || match.filePath || null;
  }

  // 2. Selected colour option value
  let colourValue: string | null = null;
  let colourOptionValueId: string | null = null;
  for (const [k, v] of Object.entries(selectedOptionValues)) {
    if (k.toLowerCase() === 'colour' || k.toLowerCase() === 'color') {
      colourValue = v;
      break;
    }
  }
  if (!colourValue && variant?.optionValues && Array.isArray(variant.optionValues)) {
    for (const ov of variant.optionValues) {
      const optName = ov.optionValue?.option?.name || ov.optionName;
      const optVal = ov.optionValue?.value || ov.value;
      const valId = ov.optionValueId || ov.optionValue?.id;
      if (optName && (optName.toLowerCase() === 'colour' || optName.toLowerCase() === 'color')) {
        colourValue = optVal;
        colourOptionValueId = valId;
        break;
      }
    }
  }

  if (colourOptionValueId || colourValue) {
    const colMatch = productMedia.find((m: any) => {
      if (!m) return false;
      if (colourOptionValueId && m.optionValueId === colourOptionValueId) return true;
      const mVal = m.optionValue?.value || m.optionValueName;
      if (colourValue && mVal && mVal.toLowerCase() === colourValue.toLowerCase()) return true;
      return false;
    });
    if (colMatch) return colMatch.publicUrl || colMatch.url || colMatch.filePath || null;
  }

  // 3. General product media
  const general = productMedia.find((m: any) => m && !m.variantId && !m.optionValueId);
  if (general) return general.publicUrl || general.url || general.filePath || null;

  // 4. First product media
  if (productMedia.length > 0 && productMedia[0]) {
    return productMedia[0].publicUrl || productMedia[0].url || productMedia[0].filePath || null;
  }

  return null;
}

/**
 * Full Domain Order Lifecycle:
 * Defines system/buyer/admin/logistics transition capabilities.
 * NOTE: COMPLETED -> RETURN_REQUESTED is preserved for future Buyer/Support returns workflow.
 * Terminal states in the domain are CANCELLED and RETURNED. COMPLETED is not terminal.
 */
export const DOMAIN_ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.NEW]: [OrderStatus.CONFIRMED, OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.ACCEPTED, OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.DISPATCHED, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.DISPATCHED]: [OrderStatus.COMPLETED, OrderStatus.RETURN_REQUESTED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [OrderStatus.RETURN_REQUESTED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURN_REQUESTED]: [OrderStatus.RETURNED, OrderStatus.COMPLETED],
  [OrderStatus.RETURNED]: [],
};

/**
 * Merchant-Allowed Status Transitions:
 * Defines actions permitted directly by the seller via merchant order management.
 * In V1:
 * - Merchants CANNOT initiate returns on COMPLETED orders (returns originate from buyer/support).
 * - Merchants CANNOT transition from terminal CANCELLED or RETURNED states.
 * - When in RETURN_REQUESTED, merchants can confirm receipt of returned items (-> RETURNED).
 */
export const SELLER_ALLOWED_ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.NEW]: [OrderStatus.CONFIRMED, OrderStatus.ACCEPTED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.ACCEPTED, OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.ACCEPTED]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.DISPATCHED, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.DISPATCHED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [], // No direct seller-initiated transition; returns must originate from buyer/support
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURN_REQUESTED]: [OrderStatus.RETURNED],
  [OrderStatus.RETURNED]: [],
};

// Maintained for backward compatibility
export const ALLOWED_ORDER_STATUS_TRANSITIONS = DOMAIN_ORDER_STATUS_TRANSITIONS;

export interface GetOrdersParams {
  page?: number;
  limit?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  orderStatus?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly visibilityService: SubscriptionVisibilityService,
    private readonly inventoryService: InventoryService,
    private readonly shippingService: ShippingService,
    private readonly mailService: MailService,
    private readonly whatsappService: WhatsAppService
  ) {}

  /**
   * Server-Side Authoritative Coupon Validation
   */
  public validateCoupon(storeId: string, code: string, subtotalPaise: number) {
    if (!code || typeof code !== 'string') {
      return { valid: false, reason: 'Please enter a coupon code' };
    }
    const normalizedCode = code.trim().toUpperCase();
    const couponDef = BUILT_IN_COUPONS[normalizedCode];
    if (!couponDef) {
      return { valid: false, reason: `Coupon "${normalizedCode}" is not valid or has expired` };
    }
    if (couponDef.minOrderPaise && subtotalPaise < couponDef.minOrderPaise) {
      const minAmount = (couponDef.minOrderPaise / 100).toFixed(0);
      return {
        valid: false,
        reason: `Minimum order value for this coupon is ₹${minAmount}`,
      };
    }
    let discountPaise = 0;
    if (couponDef.type === 'FLAT') {
      discountPaise = Math.min(couponDef.value, subtotalPaise);
    } else {
      discountPaise = Math.round((subtotalPaise * couponDef.value) / 100);
      if (couponDef.maxDiscountPaise && discountPaise > couponDef.maxDiscountPaise) {
        discountPaise = couponDef.maxDiscountPaise;
      }
      discountPaise = Math.min(discountPaise, subtotalPaise);
    }
    return {
      valid: true,
      coupon: {
        code: couponDef.code,
        type: couponDef.type,
        value: couponDef.value,
        label: couponDef.label,
        discountPaise,
        minOrderPaise: couponDef.minOrderPaise,
        maxDiscountPaise: couponDef.maxDiscountPaise,
      },
    };
  }

  /**
   * Guest-first checkout transaction:
   * 1. Enforces subscription gating on the store
   * 2. Reserves stock atomically
   * 3. Creates customer & snapshots product/variant data into OrderItem
   */
  public async createGuestOrder(dto: GuestCheckoutDto) {
    // Defense-in-depth: Reject preview simulation orders from creating persistent commerce records
    if (
      (dto as any).preview === true ||
      (dto as any).isPreview === true ||
      dto.cartId?.startsWith('preview_') ||
      dto.cartId === 'preview-cart'
    ) {
      throw new BadRequestException('Orders cannot be created in merchant preview mode.');
    }

    if (typeof dto.email !== 'string' || !isEmail(dto.email.trim())) throw new BadRequestException('A valid buyer email is required.');
    dto = { ...dto, email: dto.email.trim().toLowerCase(), fullName: dto.fullName?.trim() };
    if (!dto.fullName) throw new BadRequestException('Buyer name is required.');
    const checkoutKey = dto.checkoutKey ? `${dto.storeId}:${dto.checkoutKey}` : undefined;
    const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])) : value;
    const { paymentMethod: _method, checkoutKey: _key, discountPaise: _discount, ...selection } = dto;
    const checkoutHash = crypto.createHash('sha256').update(JSON.stringify(canonical(selection))).digest('hex');
    // Replays must pass the same current public-store gate as a new checkout.
    const { store } = await this.visibilityService.evaluateVisibility(dto.storeId);
    if (checkoutKey) {
      const existing = await this.prisma.order.findUnique({ where: { checkoutKey } });
      if (existing) return this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${existing.id} FOR UPDATE`;
        return this.replayCheckout(tx, await tx.order.findUniqueOrThrow({ where: { id: existing.id } }), dto, checkoutHash);
      });
    }

    // Direct checkout reuses the existing order transaction without a persistent cart.
    if (Boolean(dto.cartId) === Boolean(dto.directItems)) throw new BadRequestException('Provide either a cart or one direct checkout item.');
    let cart: any;
    if (dto.directItems) {
      if (dto.directItems.length !== 1) throw new BadRequestException('One direct item is required.');
      const item = dto.directItems[0];
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) throw new BadRequestException('Invalid quantity.');
      const variant = await this.prisma.productVariant.findFirst({
        where: { id: item.variantId, productId: item.productId, storeId: store.id, tenantId: store.tenantId, status: 'ACTIVE', deletedAt: null, product: { storeId: store.id, tenantId: store.tenantId, status: 'PUBLISHED', deletedAt: null, mode: { not: 'ENQUIRY_ONLY' } } },

              include: {
                product: {
                  include: {
                    media: {
                      include: { optionValue: true },
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
                optionValues: {
                  include: {
                    optionValue: {
                      include: {
                        option: true,
                      },
                    },
                  },
                },
                media: true,
              },
      });
      if (!variant || item.quantity < variant.product.minOrderQuantity) throw new BadRequestException('Product variant is unavailable or quantity is below the minimum.');
      cart = { id: `direct_${crypto.randomUUID()}`, storeId: store.id, items: [{ variantId: variant.id, quantity: item.quantity, unitPricePaise: variant.pricePaise, variant }] };
    } else {
      cart = await this.prisma.cart.findUnique({
        where: { id: dto.cartId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    media: {
                      include: { optionValue: true },
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
                optionValues: {
                  include: {
                    optionValue: {
                      include: {
                        option: true,
                      },
                    },
                  },
                },
                media: true,
              },
            },
          },
        },
      },
      });
    }

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Shopping cart is empty or not found.');
    }

    if (cart.storeId !== store.id) {
      throw new BadRequestException('Cart does not belong to this store.');
    }

    // Verify payment method eligibility
    if (dto.paymentMethod === 'COD') {
      const paymentAccount = await this.prisma.merchantPaymentAccount.findFirst({
        where: { storeId: store.id },
      });
      const paymentCaps = (paymentAccount?.capabilities as any) || {};
      if (paymentCaps.codEnabled === false) {
        throw new BadRequestException(
          'Cash on Delivery (COD) is currently disabled by this seller. Please pay online with UPI or Card.'
        );
      }
    }

    const cleanPhone = normalizePhone(dto.phone);

    // 3. Execute Transaction
    const resultOrder = await this.prisma.$transaction(async (tx) => {
      if (checkoutKey) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${checkoutKey}, 0))`;
        const existing = await tx.order.findUnique({ where: { checkoutKey } });
        if (existing) return this.replayCheckout(tx, existing, dto, checkoutHash);
      }

      // Step A: Concurrency-safe inventory reservation for every item
      for (const item of cart.items) {
        await this.inventoryService.reserveStock(
          item.variantId,
          item.quantity,
          `checkout_${cart.id}`,
          tx
        );
      }

      // Step B: Upsert Customer (Guest-First)
      let customer = await tx.customer.findFirst({
        where: {
          tenantId: store.tenantId,
          storeId: store.id,
          phone: cleanPhone,
        },
      });

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            tenantId: store.tenantId,
            storeId: store.id,
            fullName: dto.fullName,
            phone: cleanPhone,
            email: dto.email || null,
            isGuest: true,
          },
        });
      } else if (dto.fullName && (!customer.fullName || customer.fullName === 'Guest Customer' || customer.fullName !== dto.fullName)) {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            fullName: dto.fullName,
            ...(dto.email ? { email: dto.email } : {}),
          },
        });
      }

      // Step C: Record Customer Delivery Address
      if (dto.deliveryAddress) {
        await tx.customerAddress.create({
          data: {
            customerId: customer.id,
            addressLine1: dto.deliveryAddress.addressLine1,
            addressLine2: dto.deliveryAddress.addressLine2,
            landmark: dto.deliveryAddress.landmark,
            city: dto.deliveryAddress.city,
            state: dto.deliveryAddress.state,
            pincode: dto.deliveryAddress.pincode,
            country: dto.deliveryAddress.country || 'India',
            isDefault: true,
          },
        });
      }

      // Step D: Calculate Monetary Amounts (paise)
      let subtotalPaise = 0;
      for (const item of cart.items) {
        subtotalPaise += item.quantity * item.unitPricePaise;
      }

      // Shipping calculation based on default profile
      const shippingProfile = await tx.shippingProfile.findFirst({
        where: { storeId: store.id, isDefault: true },
      });

      let shippingPaise = 0;
      if (shippingProfile) {
        if (
          shippingProfile.freeShippingThresholdPaise &&
          subtotalPaise >= shippingProfile.freeShippingThresholdPaise
        ) {
          shippingPaise = 0;
        } else {
          shippingPaise = shippingProfile.flatRatePaise;
        }
      }

      // Server-Side Authoritative Coupon Validation & Recalculation
      let discountPaise = 0;
      if (dto.couponCode) {
        const valRes = this.validateCoupon(store.id, dto.couponCode, subtotalPaise);
        if (!valRes.valid) {
          throw new BadRequestException(valRes.reason || 'Invalid coupon code');
        }
        discountPaise = valRes.coupon?.discountPaise || 0;
      }

      const taxableAmount = Math.max(0, subtotalPaise - discountPaise);
      const taxPaise = Math.round(taxableAmount * 0.05); // 5% GST estimate in paise
      const totalPaise = Math.max(0, taxableAmount + shippingPaise + taxPaise);

      // Enforce Razorpay Gateway Minimum Amount Constraint
      const chosenPaymentMethod = (dto.paymentMethod || 'COD').toUpperCase();
      if (chosenPaymentMethod === 'RAZORPAY' && totalPaise > 0 && totalPaise < PAYMENT_GATEWAY_MIN_AMOUNT_PAISE) {
        throw new BadRequestException(
          `Online payment is available for orders of ₹${PAYMENT_GATEWAY_MIN_AMOUNT_RUPEES} or more. Please select Cash on Delivery.`
        );
      }

      const isZeroAmount = totalPaise === 0;
      const initialPaymentStatus = isZeroAmount ? PaymentStatus.PAID : PaymentStatus.PENDING;

      // Generate Order Number: {orderNumberPrefix}-YYYYMMDD-XXXX
      const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      let prefix = 'ORD-';
      try {
        const commerceSetting = await tx.platformSetting.findUnique({ where: { key: 'commerce' } });
        const configuredPrefix = (commerceSetting?.value as any)?.orderNumberPrefix?.trim();
        if (configuredPrefix) {
          prefix = configuredPrefix.endsWith('-') ? configuredPrefix : `${configuredPrefix}-`;
        }
      } catch {}
      const orderNumber = `${prefix}${datePrefix}-${randomSuffix}`;
      const trackingToken = crypto.randomBytes(16).toString('hex');
      const reviewToken = crypto.randomBytes(16).toString('hex');

      const fullNotes = [
        dto.notes?.trim(),
        dto.couponCode ? `Coupon applied: ${dto.couponCode}` : null,
      ].filter(Boolean).join(' | ') || null;

      // Step E: Create Order
      const order = await tx.order.create({
        data: {
          tenantId: store.tenantId,
          storeId: store.id,
          customerId: customer.id,
          orderNumber,
          trackingToken,
          reviewToken,
          checkoutKey, checkoutHash, buyerEmail: dto.email, buyerName: dto.fullName,
          status: OrderStatus.NEW,
          paymentStatus: initialPaymentStatus,
          shipmentStatus: ShipmentStatus.PENDING,
          fulfillmentMode: dto.fulfillmentMode === 'PICKUP' ? ('PICKUP' as any) : ('DELIVERY' as any),
          subtotalPaise,
          taxPaise,
          shippingPaise,
          discountPaise,
          totalPaise,
          currency: 'INR',
          notes: fullNotes,
          deliveryAddress: { ...dto.deliveryAddress, email: dto.email, fullName: dto.fullName, phone: cleanPhone },
          paymentMethod: isZeroAmount ? 'PROMOTIONAL_CREDIT' : chosenPaymentMethod,
          guestCheckout: true,
        },
      });

      await tx.outboxEvent.upsert({ where: { id: `order-email:${order.id}:NEW` }, update: {}, create: {
        id: `order-email:${order.id}:NEW`, tenantId: store.tenantId, storeId: store.id,
        eventType: 'ORDER_EMAIL', payload: { orderId: order.id, status: 'NEW' },
      } });

      // Step E2: Create OrderAddress record snapshot
      if (dto.deliveryAddress) {
        await tx.orderAddress.create({
          data: {
            orderId: order.id,
            fullName: dto.fullName,
            phone: cleanPhone,
            addressLine1: dto.deliveryAddress.addressLine1 || '',
            addressLine2: dto.deliveryAddress.addressLine2 || null,
            landmark: dto.deliveryAddress.landmark || null,
            city: dto.deliveryAddress.city || '',
            state: dto.deliveryAddress.state || '',
            pincode: dto.deliveryAddress.pincode || '',
            country: dto.deliveryAddress.country || 'India',
          },
        });
      }

      // Step F: Create OrderItem records with complete historical snapshots
      for (const item of cart.items) {
        // Deterministic ProductOption ordering (e.g. Colour (0) then Size (1) -> "Black · M")
        const sortedOptionValues = [...(item.variant.optionValues || [])].sort((a: any, b: any) => {
          const sortA = a.optionValue?.option?.sortOrder ?? 0;
          const sortB = b.optionValue?.option?.sortOrder ?? 0;
          if (sortA !== sortB) return sortA - sortB;
          const nameA = a.optionValue?.option?.name || '';
          const nameB = b.optionValue?.option?.name || '';
          return nameA.localeCompare(nameB);
        });

        const optionSnapshot: Record<string, string> = {};
        for (const optVal of sortedOptionValues) {
          const optName = optVal.optionValue?.option?.name || 'Option';
          optionSnapshot[optName] = optVal.optionValue.value;
        }

        const variantTitle =
          sortedOptionValues
            .map((ov: any) => ov.optionValue?.value)
            .filter(Boolean)
            .join(' · ') || item.variant.sku;

        const snapshotImageUrl = resolveVariantMediaUrl({
          productMedia: item.variant.product?.media || [],
          variant: item.variant,
          selectedOptionValues: optionSnapshot,
        });

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.variant.productId,
            variantId: item.variantId,
            productName: item.variant.product.name,
            variantTitle,
            sku: item.variant.sku,
            selectedOptions: optionSnapshot,
            imageUrl: snapshotImageUrl,
            quantity: item.quantity,
            unitPricePaise: item.unitPricePaise,
            taxPaise: Math.round(item.unitPricePaise * 0.05),
            totalPaise: item.quantity * item.unitPricePaise,
          },
        });
      }

      // Step G: Create OrderStatusHistory
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          toStatus: OrderStatus.NEW,
          reason: 'Guest checkout order created.',
        },
      });

      // Step H: Clear cart items
      if (!dto.directItems) await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return order;
    });

    // Auto-create order in Shiprocket when placed
    try {
      const shippingAccount = await this.prisma.merchantShippingAccount.findFirst({
        where: { storeId: store.id, isEnabled: true, provider: ShippingProviderType.SHIPROCKET },
      });

      if (shippingAccount) {
        this.shippingService
          .createShipmentForOrder(resultOrder.id, {
            tenantId: store.tenantId,
            storeId: store.id,
          })
          .catch((err) => {
            this.logger.warn(
              `[SHIPROCKET AUTO-ORDER] Order #${resultOrder.orderNumber} background manifest notice: ${err.message}`
            );
          });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to check auto-shipping for order #${resultOrder.orderNumber}: ${err.message}`);
    }

    // Trigger asynchronous notifications (Order Placed Email to Buyer + Alert to Vendor)
    try {
      const fullOrder = await this.prisma.order.findUnique({
        where: { id: resultOrder.id },
        include: { items: true, customer: true, orderAddress: true, store: true },
      });

      if (fullOrder) {
        const customerEmail = fullOrder.buyerEmail || (fullOrder.deliveryAddress as any)?.email || fullOrder.customer?.email;
        const customerPhone = fullOrder.customer?.phone || (fullOrder.deliveryAddress as any)?.phone;
        const customerName = fullOrder.buyerName || fullOrder.customer?.fullName || (fullOrder.deliveryAddress as any)?.fullName || 'Customer';
        const trackingUrl = fullOrder.trackingToken
          ? `${process.env.STOREFRONT_BASE_URL || process.env.STOREFRONT_URL || 'https://letzshop.com'}/track/${fullOrder.orderNumber}?t=${fullOrder.trackingToken}`
          : undefined;

        const emailContext = {
          order: fullOrder,
          store: {
            id: store.id,
            name: store.name,
            supportEmail: store.supportEmail || undefined,
            supportPhone: store.supportPhone || undefined,
          },
          customer: {
            fullName: customerName,
            email: customerEmail || '',
            phone: customerPhone,
          },
          trackingUrl,
        };

        // Buyer confirmation is durably queued in the order transaction.

        if (customerPhone) {
          const itemsSummary = (fullOrder.items || [])
            .map((it: any) => `${it.quantity}x ${it.productName}`)
            .join(', ');
          const waContext = {
            orderNumber: fullOrder.orderNumber,
            storeName: store.name,
            storePhone: store.supportPhone || undefined,
            customerName,
            customerPhone,
            totalPaise: fullOrder.totalPaise,
            itemsSummary,
            status: OrderStatus.NEW,
            trackingUrl,
          };
          this.whatsappService.sendDirectOrderStatusUpdate(waContext, 'NEW').catch((err) => {
            this.logger.warn(`Failed to send order placed WhatsApp: ${err.message}`);
          });
        }

        const vendorAlertEmail = store.supportEmail || process.env.ORDERS_ALERT_EMAIL;
        if (vendorAlertEmail) {
          this.mailService.sendVendorNewOrderAlert(emailContext, vendorAlertEmail).catch((err) => {
            this.logger.warn(`Failed to send vendor order alert: ${err.message}`);
          });
        }
      }
    } catch (notifErr: any) {
      this.logger.warn(`Notification trigger error on checkout: ${notifErr.message}`);
    }

    return resultOrder;
  }

  private async replayCheckout(tx: Prisma.TransactionClient, existing: any, dto: GuestCheckoutDto, hash: string) {
    if (existing.checkoutHash !== hash || existing.storeId !== dto.storeId) throw new BadRequestException('Checkout details changed. Start a new checkout attempt.');
    if (existing.paymentMethod === 'RAZORPAY' && dto.paymentMethod === 'COD' && existing.paymentStatus === 'PENDING' && existing.status === 'NEW') {
      const account = await tx.merchantPaymentAccount.findFirst({ where: { storeId: existing.storeId } });
      const settings = account?.capabilities as any;
      if (settings?.codEnabled === false) throw new BadRequestException('Cash on Delivery is disabled.');
      await tx.paymentOrder.updateMany({ where: { orderId: existing.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      return tx.order.update({ where: { id: existing.id }, data: { paymentMethod: 'COD' } });
    }
    return existing;
  }

  public async getOrderById(orderId: string, tenant?: TenantContext) {
    const where: any = { id: orderId };
    if (tenant) {
      where.tenantId = tenant.tenantId;
      where.storeId = tenant.storeId;
    }

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        customer: true,
        orderAddress: true,
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    media: {
                      take: 1,
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        paymentOrders: { include: { transactions: true } },
        shipments: { include: { events: { orderBy: { createdAt: 'desc' } } } },
        refunds: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found.');

    const deliveryAddress = (order.deliveryAddress as any) || {};
    const customerName =
      order.customer?.fullName ||
      order.orderAddress?.fullName ||
      deliveryAddress.fullName ||
      (order.customer?.email ? order.customer.email.split('@')[0] : null) ||
      'Guest Customer';

    const customerPhone =
      order.customer?.phone ||
      order.orderAddress?.phone ||
      deliveryAddress.phone ||
      null;

    const customerEmail =
      order.buyerEmail ||
      order.customer?.email ||
      deliveryAddress.email ||
      null;

    const paymentTx = order.paymentOrders?.[0]?.transactions?.[0];
    const transactionId = paymentTx?.providerPaymentId || null;
    const resolvedPaymentMethod = (order as any).paymentMethod || paymentTx?.paymentMethod || (order.notes?.includes('COD') ? 'COD' : 'ONLINE');

    return {
      ...order,
      customerName,
      customerPhone,
      customerEmail,
      transactionId,
      paymentMethod: resolvedPaymentMethod,
    };
  }

  public async getOrderByOrderNumberOrId(identifier: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ orderNumber: identifier }, { id: identifier }],
      },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
        shipments: true,
        store: { select: { id: true, name: true, slug: true, branding: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found with the provided details.');
    return order;
  }

  /**
   * Secure buyer order tracking with mandatory tracking token validation.
   * Returns a privacy-safe masked DTO preventing PII leaks to unauthenticated visitors.
   */
  public async trackOrder(identifier: string, token?: string): Promise<BuyerSafeTrackOrderDto> {
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [{ orderNumber: identifier }, { id: identifier }],
      },
      include: {
        items: true,
        shipments: { orderBy: { createdAt: 'desc' } },
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            supportPhone: true,
            supportEmail: true,
          },
        },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        orderAddress: true,
        customer: true,
        paymentOrders: { include: { transactions: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found with the provided details.');
    const fullOrder = order as any;

    // Enforce token verification if trackingToken exists on the order
    if (order.trackingToken) {
      if (!token || token !== order.trackingToken) {
        throw new InvalidTrackingTokenException(
          'Access denied: A valid tracking token is required to view order status.'
        );
      }
    }

    const deliveryAddress = (order.deliveryAddress as any) || fullOrder.orderAddress || {};
    const rawPincode = String(deliveryAddress.pincode || fullOrder.orderAddress?.pincode || '');
    const maskedPincode =
      rawPincode.length >= 6
        ? `${rawPincode.slice(0, 2)}**${rawPincode.slice(4)}`
        : '******';

    const customerName = fullOrder.customer?.fullName || fullOrder.orderAddress?.fullName || 'Customer';
    const customerPhone = fullOrder.customer?.phone || fullOrder.orderAddress?.phone || '';

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: (fullOrder as any).paymentMethod || (fullOrder as any).paymentOrders?.[0]?.transactions?.[0]?.paymentMethod || 'Online',
      transactionId: (fullOrder as any).paymentOrders?.[0]?.transactions?.[0]?.providerPaymentId || null,
      codCollectionMethod: (fullOrder as any).codCollectionMethod || null,
      codCollectedAt: (fullOrder as any).codCollectedAt || null,
      shipmentStatus: order.shipmentStatus,
      createdAt: order.createdAt,
      customerName,
      customerPhone,
      shippingAddress: {
        fullName: customerName,
        phone: customerPhone,
        addressLine1: fullOrder.orderAddress?.addressLine1 || deliveryAddress.addressLine1 || '',
        addressLine2: fullOrder.orderAddress?.addressLine2 || deliveryAddress.addressLine2 || '',
        landmark: fullOrder.orderAddress?.landmark || deliveryAddress.landmark || '',
        city: fullOrder.orderAddress?.city || deliveryAddress.city || '',
        state: fullOrder.orderAddress?.state || deliveryAddress.state || '',
        pincode: rawPincode,
        postalCode: rawPincode,
        country: fullOrder.orderAddress?.country || deliveryAddress.country || 'India',
      },
      deliveryCity: deliveryAddress.city || 'Confidential',
      deliveryState: deliveryAddress.state || 'Confidential',
      deliveryPincode: maskedPincode,
      itemCount: fullOrder.items.reduce((acc: number, it: any) => acc + it.quantity, 0),
      subtotalPaise: order.subtotalPaise,
      discountPaise: order.discountPaise,
      shippingPaise: order.shippingPaise,
      totalPaise: order.totalPaise,
      currency: order.currency,
      store: fullOrder.store,
      history: fullOrder.statusHistory?.map((h: any) => ({
        status: h.toStatus,
        reason: h.reason,
        timestamp: h.createdAt,
      })) || [],
      items: fullOrder.items.map((it: any) => ({
        productName: it.productName,
        variantTitle: it.variantTitle,
        titleSnapshot: it.productName,
        variantTitleSnapshot: it.variantTitle,
        sku: it.sku,
        imageUrl: it.imageUrl,
        quantity: it.quantity,
        unitPricePaise: it.unitPricePaise,
        totalPricePaise: it.totalPaise || it.quantity * it.unitPricePaise,
      })),
      trackingNumber: fullOrder.shipments?.[0]?.awbNumber || null,
      carrier: fullOrder.shipments?.[0]?.courierName || null,
      riderName: (() => {
        const s = fullOrder.shipments?.[0];
        if (!s) return null;
        if (s.provider === 'SELF_DELIVERY' || s.courierName?.includes('Store Team')) {
          const match = (s.courierName || '').match(/Store Team:\s*([^(]+)(?:\(([^)]+)\))?/);
          return match ? match[1]?.trim() : (s.courierName || '').replace(/^Store Team:\s*/, '').trim() || null;
        }
        return null;
      })(),
      riderPhone: (() => {
        const s = fullOrder.shipments?.[0];
        if (!s) return null;
        if (s.provider === 'SELF_DELIVERY' || s.courierName?.includes('Store Team')) {
          const match = (s.courierName || '').match(/Store Team:\s*([^(]+)(?:\(([^)]+)\))?/);
          if (match && match[2]) return match[2]?.trim();
          if (s.trackingUrl?.startsWith('tel:')) return s.trackingUrl.replace(/^tel:/, '');
        }
        return null;
      })(),
      estimatedDelivery: null,
    };
  }

  public async getOrders(tenant: TenantContext, params: GetOrdersParams = {}) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.pageSize || params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId: tenant.tenantId,
      storeId: tenant.storeId,
    };

    // 1. Search filter: order number, customer name, customer phone
    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { customer: { fullName: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
        { orderAddress: { fullName: { contains: q, mode: 'insensitive' } } },
        { orderAddress: { phone: { contains: q } } },
      ];
    }

    // 2. Order status filter
    const statusVal = params.status || params.orderStatus;
    if (statusVal && statusVal !== 'ALL') {
      if (statusVal === 'NEEDS_ACTION') {
        where.status = {
          in: [OrderStatus.NEW, OrderStatus.CONFIRMED, OrderStatus.ACCEPTED],
        };
      } else if (Object.values(OrderStatus).includes(statusVal as OrderStatus)) {
        where.status = statusVal as OrderStatus;
      }
    }

    // 3. Payment status filter
    if (
      params.paymentStatus &&
      params.paymentStatus !== 'ALL' &&
      Object.values(PaymentStatus).includes(params.paymentStatus as PaymentStatus)
    ) {
      where.paymentStatus = params.paymentStatus as PaymentStatus;
    }

    // 4. Date range filter
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) {
        where.createdAt.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        where.createdAt.lte = new Date(params.endDate);
      }
    }

    // 5. Parallel queries for list items, total, and compact summary counts
    const [items, total, allCount, needsActionCount, readyCount, dispatchedCount, completedCount, cancelledCount] =
      await Promise.all([
        this.prisma.order.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            customer: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
              },
            },
            items: {
              include: {
                variant: {
                  include: {
                    product: {
                      include: {
                        media: {
                          take: 1,
                          orderBy: { sortOrder: 'asc' },
                        },
                      },
                    },
                  },
                },
              },
            },
            orderAddress: true,
            shipments: {
              take: 1,
              select: {
                awbNumber: true,
                courierName: true,
                status: true,
              },
            },
            paymentOrders: {
              take: 1,
              select: {
                provider: true,
                status: true,
                transactions: {
                  take: 1,
                  select: {
                    paymentMethod: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.order.count({ where }),
        this.prisma.order.count({
          where: { tenantId: tenant.tenantId, storeId: tenant.storeId },
        }),
        this.prisma.order.count({
          where: {
            tenantId: tenant.tenantId,
            storeId: tenant.storeId,
            status: { in: [OrderStatus.NEW, OrderStatus.CONFIRMED, OrderStatus.ACCEPTED] },
          },
        }),
        this.prisma.order.count({
          where: {
            tenantId: tenant.tenantId,
            storeId: tenant.storeId,
            status: OrderStatus.READY,
          },
        }),
        this.prisma.order.count({
          where: {
            tenantId: tenant.tenantId,
            storeId: tenant.storeId,
            status: OrderStatus.DISPATCHED,
          },
        }),
        this.prisma.order.count({
          where: {
            tenantId: tenant.tenantId,
            storeId: tenant.storeId,
            status: OrderStatus.COMPLETED,
          },
        }),
        this.prisma.order.count({
          where: {
            tenantId: tenant.tenantId,
            storeId: tenant.storeId,
            status: OrderStatus.CANCELLED,
          },
        }),
      ]);

    const totalPages = Math.ceil(total / limit) || 1;

    const mappedItems = items.map((o) => {
      const deliveryAddress = (o.deliveryAddress as any) || {};
      const customerName =
        o.customer?.fullName ||
        o.orderAddress?.fullName ||
        deliveryAddress.fullName ||
        (o.customer?.email ? o.customer.email.split('@')[0] : null) ||
        'Guest Customer';

      const customerPhone =
        o.customer?.phone ||
        o.orderAddress?.phone ||
        deliveryAddress.phone ||
        null;

      const customerEmail =
        o.buyerEmail ||
        o.customer?.email ||
        deliveryAddress.email ||
        null;

      const itemsCount =
        o.items?.reduce((acc: number, it: any) => acc + (it.quantity || 1), 0) ||
        o.items?.length ||
        0;

      const firstItem = o.items?.[0];
      const itemsSummary = firstItem
        ? `${firstItem.productName || 'Item'}${o.items.length > 1 ? ` +${o.items.length - 1} more` : ''}`
        : 'Order items';

      return {
        ...o,
        customerName,
        customerPhone,
        customerEmail,
        itemsCount,
        itemsSummary,
      };
    });

    return {
      items: mappedItems,
      total,
      page,
      limit,
      pageSize: limit,
      totalPages,
      hasMore: skip + items.length < total,
      summaryCounts: {
        all: allCount,
        needsAction: needsActionCount,
        ready: readyCount,
        dispatched: dispatchedCount,
        completed: completedCount,
        cancelled: cancelledCount,
      },
    };
  }

  public async markOutForDelivery(orderId: string, tenant: TenantContext) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findFirst({ where: { id: orderId, tenantId: tenant.tenantId, storeId: tenant.storeId } });
      if (!order) throw new NotFoundException('Order not found.');
      if (order.status !== OrderStatus.DISPATCHED) throw new BadRequestException('Dispatch the order before marking it out for delivery.');
      const updated = await tx.order.update({ where: { id: order.id }, data: { shipmentStatus: ShipmentStatus.OUT_FOR_DELIVERY } });
      await tx.shipment.updateMany({ where: { orderId: order.id }, data: { status: ShipmentStatus.OUT_FOR_DELIVERY } });
      await tx.outboxEvent.upsert({ where: { id: `order-email:${order.id}:OUT_FOR_DELIVERY` }, update: {}, create: {
        id: `order-email:${order.id}:OUT_FOR_DELIVERY`, tenantId: tenant.tenantId, storeId: tenant.storeId, eventType: 'ORDER_EMAIL', payload: { orderId: order.id, status: 'OUT_FOR_DELIVERY' },
      } });
      return updated;
    });
  }

  public async updateOrderStatus(
    orderId: string,
    toStatus: OrderStatus,
    tenant: TenantContext,
    reason?: string,
    actorId?: string,
    isSellerContext: boolean = true,
    customMessage?: string,
    riderName?: string,
    riderPhone?: string,
    riderEmail?: string
  ) {
    const order = await this.getOrderById(orderId, tenant);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Concurrency Safety: Acquire pessimistic row-level exclusive lock on the order
      await tx.$executeRaw`SELECT 1 FROM "orders" WHERE "id" = ${order.id} FOR UPDATE;`;

      // 2. Re-read the latest persisted order state within the locked transaction
      const lockedOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });

      if (!lockedOrder) {
        throw new NotFoundException('Order not found.');
      }

      // Idempotency: If the order has already achieved target status, return it safely without duplicate side-effects
      if (lockedOrder.status === toStatus) {
        return lockedOrder;
      }

      // 3. Validate Allowed Status Transitions based on actor context
      const allowedTransitions = isSellerContext
        ? SELLER_ALLOWED_ORDER_STATUS_TRANSITIONS[lockedOrder.status] || []
        : DOMAIN_ORDER_STATUS_TRANSITIONS[lockedOrder.status] || [];

      if (!allowedTransitions.includes(toStatus)) {
        if (lockedOrder.status === OrderStatus.COMPLETED) {
          throw new BadRequestException(
            `Cannot transition order from status COMPLETED to ${toStatus}. COMPLETED orders cannot be transitioned by merchants. Return requests must originate from buyer or customer support workflows.`
          );
        }
        if (lockedOrder.status === OrderStatus.CANCELLED) {
          throw new BadRequestException(
            `Cannot transition order from status CANCELLED to ${toStatus}. Order is CANCELLED (Terminal state).`
          );
        }
        if (lockedOrder.status === OrderStatus.RETURNED) {
          throw new BadRequestException(
            `Cannot transition order from status RETURNED to ${toStatus}. Order is RETURNED (Terminal state).`
          );
        }
        throw new BadRequestException(
          `Cannot transition order from status ${lockedOrder.status} to ${toStatus}. Allowed transitions: ${
            allowedTransitions.join(', ') || 'None'
          }`
        );
      }

      // 4. Exactly-Once Inventory Mutation
      // Step A: If cancelling: release reserved stock atomically back to inventory
      if (toStatus === OrderStatus.CANCELLED && lockedOrder.status !== OrderStatus.CANCELLED) {
        for (const item of lockedOrder.items) {
          if (item.variantId) {
            await this.inventoryService.releaseStockReservation(
              item.variantId,
              item.quantity,
              lockedOrder.id,
              tx
            );
          }
        }
      }

      // Step B: If completing: finalize stock deduction (fulfill reserved stock)
      if (toStatus === OrderStatus.COMPLETED && lockedOrder.status !== OrderStatus.COMPLETED) {
        for (const item of lockedOrder.items) {
          if (item.variantId) {
            await this.inventoryService.fulfillStock(
              item.variantId,
              item.quantity,
              lockedOrder.id,
              tx
            );
          }
        }
      }

      // Step C: Determine aligned fulfillment and shipment statuses
      const updateData: any = {
        status: toStatus,
        cancelledAt: toStatus === OrderStatus.CANCELLED ? new Date() : undefined,
      };

      if (toStatus === OrderStatus.CONFIRMED || toStatus === OrderStatus.ACCEPTED) {
        updateData.fulfillmentStatus = FulfillmentStatus.PROCESSING;
      } else if (toStatus === OrderStatus.READY) {
        updateData.fulfillmentStatus = FulfillmentStatus.READY_TO_SHIP;
      } else if (toStatus === OrderStatus.DISPATCHED) {
        updateData.fulfillmentStatus = FulfillmentStatus.SHIPPED;
        updateData.shipmentStatus = ShipmentStatus.IN_TRANSIT;
      } else if (toStatus === OrderStatus.COMPLETED) {
        updateData.fulfillmentStatus = FulfillmentStatus.DELIVERED;
        updateData.shipmentStatus = ShipmentStatus.DELIVERED;
        if (!lockedOrder.reviewToken) {
          updateData.reviewToken = crypto.randomBytes(16).toString('hex');
        }
      } else if (toStatus === OrderStatus.CANCELLED) {
        updateData.fulfillmentStatus = FulfillmentStatus.CANCELLED;
        updateData.shipmentStatus = ShipmentStatus.CANCELLED;
      } else if (toStatus === OrderStatus.RETURN_REQUESTED) {
        updateData.fulfillmentStatus = FulfillmentStatus.RETURN_REQUESTED;
      } else if (toStatus === OrderStatus.RETURNED) {
        updateData.fulfillmentStatus = FulfillmentStatus.RETURNED;
        updateData.shipmentStatus = ShipmentStatus.RTO;
      }

      const updated = await tx.order.update({
        where: { id: lockedOrder.id },
        data: updateData,
      });

      // Step D1: If COMPLETED, synchronize Shipment status to DELIVERED atomically
      if (toStatus === OrderStatus.COMPLETED) {
        const existingShipment = await tx.shipment.findFirst({ where: { orderId: lockedOrder.id } });
        if (existingShipment) {
          await tx.shipment.update({
            where: { id: existingShipment.id },
            data: {
              status: ShipmentStatus.DELIVERED,
              fulfillmentStatus: FulfillmentStatus.DELIVERED,
            },
          });
          await tx.shipmentEvent.create({
            data: {
              shipmentId: existingShipment.id,
              status: 'DELIVERED',
              description: 'Order successfully delivered to customer.',
            },
          });
        }
      }

      // Step D2: If DISPATCHED and rider info is supplied, record shipment details atomically
      if (toStatus === OrderStatus.DISPATCHED && (riderName || riderPhone)) {
        const courierName = riderName
          ? (riderPhone ? `Store Team: ${riderName.trim()} (${riderPhone.trim()})` : `Store Team: ${riderName.trim()}`)
          : 'Store Team Self-Delivery';
        const awbNumber = riderPhone
          ? `SELF_${lockedOrder.orderNumber}_${riderPhone.replace(/[^0-9]/g, '').slice(-4)}`
          : `SELF_${lockedOrder.orderNumber}`;
        const trackingUrl = riderPhone ? `tel:${riderPhone.trim()}` : undefined;

        const existingShipment = await tx.shipment.findFirst({ where: { orderId: lockedOrder.id } });
        let sId = existingShipment?.id;

        if (existingShipment) {
          await tx.shipment.update({
            where: { id: existingShipment.id },
            data: {
              provider: 'SELF_DELIVERY',
              status: ShipmentStatus.IN_TRANSIT,
              fulfillmentStatus: FulfillmentStatus.SHIPPED,
              courierName,
              awbNumber: existingShipment.awbNumber || awbNumber,
              trackingUrl: trackingUrl || existingShipment.trackingUrl,
            },
          });
        } else {
          const newShipment = await tx.shipment.create({
            data: {
              tenantId: tenant.tenantId,
              storeId: tenant.storeId,
              orderId: lockedOrder.id,
              provider: 'SELF_DELIVERY',
              status: ShipmentStatus.IN_TRANSIT,
              fulfillmentStatus: FulfillmentStatus.SHIPPED,
              courierName,
              awbNumber,
              trackingUrl,
            },
          });
          sId = newShipment.id;
        }

        if (sId) {
          await tx.shipmentEvent.create({
            data: {
              shipmentId: sId,
              status: 'OUT_FOR_DELIVERY',
              description: `Dispatched with ${courierName}${riderPhone ? ` (${riderPhone})` : ''}.${customMessage ? ` Note: ${customMessage}` : ''}`,
            },
          });
        }
      }

      // Step E: Create OrderStatusHistory record
      const fullReason = reason
        ? customMessage
          ? `${reason} - "${customMessage}"`
          : reason
        : customMessage
          ? `Note: ${customMessage}`
          : undefined;

      await tx.orderStatusHistory.create({
        data: {
          orderId: lockedOrder.id,
          fromStatus: lockedOrder.status,
          toStatus,
          reason: fullReason,
          actorId,
        },
      });

      // Step F: Create AuditLog record
      await tx.auditLog.create({
        data: {
          actorId,
          tenantId: tenant.tenantId,
          storeId: tenant.storeId,
          action: 'ORDER_STATUS_CHANGED',
          entityType: 'Order',
          entityId: lockedOrder.id,
          metadata: { fromStatus: lockedOrder.status, toStatus, reason: fullReason, customMessage, riderName, riderPhone, riderEmail },
        },
      });

      await tx.outboxEvent.upsert({ where: { id: `order-email:${updated.id}:${toStatus}` }, update: {}, create: {
        id: `order-email:${updated.id}:${toStatus}`, tenantId: tenant.tenantId, storeId: tenant.storeId,
        eventType: 'ORDER_EMAIL', payload: { orderId: updated.id, status: toStatus, customMessage },
      } });
      return updated;
    });

    // Trigger status transition notifications asynchronously to buyer and delivery partner at EVERY step
    this.triggerStatusNotifications(order.id, toStatus, customMessage, riderName, riderPhone, riderEmail).catch((err) => {
      this.logger.warn(`Failed to trigger status notification: ${err.message}`);
    });

    return result;
  }

  private async triggerStatusNotifications(
    orderId: string,
    toStatus: OrderStatus,
    customMessage?: string,
    riderName?: string,
    riderPhone?: string,
    riderEmail?: string
  ) {
    try {
      const fullOrder = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true, customer: true, orderAddress: true, store: true, shipments: { include: { events: true } } },
      });

      if (!fullOrder) return;

      const store = fullOrder.store;
      const deliveryAddress = (fullOrder.deliveryAddress as any) || fullOrder.orderAddress || {};
      const customerEmail = fullOrder.buyerEmail || deliveryAddress.email || fullOrder.customer?.email;
      const customerPhone = fullOrder.customer?.phone || deliveryAddress.phone;
      const customerName = fullOrder.buyerName || fullOrder.customer?.fullName || deliveryAddress.fullName || 'Valued Customer';
      const trackingUrl = fullOrder.trackingToken
        ? buildPublicTrackingUrl(fullOrder.orderNumber, fullOrder.trackingToken)
        : undefined;
      const effectiveReviewToken = fullOrder.reviewToken || fullOrder.trackingToken;
      const reviewUrl = effectiveReviewToken
        ? buildPublicReviewUrl(store.slug, fullOrder.orderNumber, effectiveReviewToken)
        : undefined;

      const shipment = fullOrder.shipments?.[0];
      const deliveryMode = shipment?.provider === 'SELF_DELIVERY' ? 'SELF_DELIVERY' : 'SHIPROCKET';

      // 1. Resolve Rider Details (Name, Phone, Email)
      let effRiderName = riderName;
      let effRiderPhone = riderPhone;
      let effRiderEmail = riderEmail;

      if (!effRiderName && shipment?.courierName && shipment.courierName.startsWith('Store Team:')) {
        effRiderName = shipment.courierName.replace('Store Team:', '').trim();
      }

      if (!effRiderPhone && shipment?.events) {
        const outForDeliveryEvent = shipment.events.find((e: any) => e.status === 'OUT_FOR_DELIVERY' || e.description?.includes('Dispatched with'));
        if (outForDeliveryEvent?.description) {
          const match = outForDeliveryEvent.description.match(/\((\d{10,12})\)/);
          if (match) {
            effRiderPhone = match[1];
          }
        }
      }

      // Check directory in store.socialLinks.deliveryPartners for matching partner to complete email/phone
      const social = (store.socialLinks as any) || {};
      const directoryPartners: any[] = Array.isArray(social.deliveryPartners) ? social.deliveryPartners : [];
      if (effRiderName || effRiderPhone) {
        const cleanRiderPhone = (effRiderPhone || '').replace(/[^0-9]/g, '');
        const matched = directoryPartners.find((p: any) =>
          (cleanRiderPhone && p.phone && p.phone.replace(/[^0-9]/g, '') === cleanRiderPhone) ||
          (effRiderName && p.name && p.name.trim().toLowerCase() === effRiderName.trim().toLowerCase())
        );
        if (matched) {
          effRiderName = effRiderName || matched.name;
          effRiderPhone = effRiderPhone || matched.phone;
          effRiderEmail = effRiderEmail || matched.email;
        }
      } else if (directoryPartners.length > 0 && deliveryMode === 'SELF_DELIVERY') {
        const def = directoryPartners.find((p: any) => p.isDefault) || directoryPartners[0];
        if (def) {
          effRiderName = def.name;
          effRiderPhone = def.phone;
          effRiderEmail = def.email;
        }
      }

      const emailContext = {
        order: fullOrder,
        store: {
          id: store.id,
          name: store.name,
          address: store.businessAddress || undefined,
          supportEmail: store.supportEmail || undefined,
          supportPhone: store.supportPhone || undefined,
        },
        customer: {
          fullName: customerName,
          email: customerEmail || '',
          phone: customerPhone,
        },
        trackingUrl,
        reviewUrl,
        courierName: shipment?.courierName || (effRiderName ? `Store Team: ${effRiderName}` : undefined),
        awbNumber: shipment?.awbNumber || undefined,
        riderName: effRiderName || undefined,
        riderPhone: effRiderPhone || undefined,
        deliveryMode: deliveryMode as any,
        customMessage,
      };

      // Buyer status/review emails are durably queued with the status transaction.

      // --- B. NOTIFY BUYER VIA WHATSAPP ---
      const itemsSummary = (fullOrder.items || [])
        .map((it: any) => `${it.quantity}x ${it.productName}`)
        .join(', ');

      if (customerPhone) {
        const waContext = {
          orderNumber: fullOrder.orderNumber,
          storeName: store.name,
          storePhone: store.supportPhone || undefined,
          customerName,
          customerPhone,
          totalPaise: fullOrder.totalPaise,
          itemsSummary,
          status: toStatus,
          trackingUrl,
          reviewUrl,
          deliveryMode: deliveryMode as any,
          courierName: shipment?.courierName || (effRiderName ? `Store Team: ${effRiderName}` : undefined),
          awbNumber: shipment?.awbNumber || undefined,
          riderName: effRiderName || undefined,
          riderPhone: effRiderPhone || undefined,
          customMessage,
        };
        await this.whatsappService.sendDirectOrderStatusUpdate(waContext, toStatus);
      }

      // --- C. NOTIFY DELIVERY PARTNER ON DISPATCH & DELIVERY ---
      if (effRiderPhone || effRiderEmail) {
        const isCod = fullOrder.paymentStatus === 'PENDING' || Boolean(fullOrder.notes?.includes('COD'));
        const deliveryAddressStr = [
          deliveryAddress.addressLine1 || deliveryAddress.address1 || deliveryAddress.street,
          deliveryAddress.addressLine2 || deliveryAddress.address2,
          deliveryAddress.city,
          deliveryAddress.state,
          deliveryAddress.pincode || deliveryAddress.postalCode,
        ].filter(Boolean).join(', ');

        const riderWaContext = {
          orderNumber: fullOrder.orderNumber,
          storeName: store.name,
          storePhone: store.supportPhone || undefined,
          storeAddress: store.businessAddress || undefined,
          customerName,
          customerPhone: customerPhone || undefined,
          deliveryAddressStr,
          totalPaise: fullOrder.totalPaise,
          itemsSummary,
          paymentMethod: isCod ? 'COD' : 'ONLINE',
          isCod,
          riderName: effRiderName || 'Delivery Partner',
          riderPhone: effRiderPhone || '',
          customMessage,
        };

        const riderEmailContext = {
          order: fullOrder,
          store: {
            id: store.id,
            name: store.name,
            address: store.businessAddress || undefined,
            supportEmail: store.supportEmail || undefined,
            supportPhone: store.supportPhone || undefined,
          },
          customer: {
            fullName: customerName,
            email: customerEmail || undefined,
            phone: customerPhone || undefined,
            address: deliveryAddress,
          },
          rider: {
            name: effRiderName || 'Delivery Partner',
            phone: effRiderPhone || '',
            email: effRiderEmail || '',
          },
          customMessage,
        };

        if (toStatus === OrderStatus.DISPATCHED) {
          if (effRiderPhone) {
            await this.whatsappService.sendDirectDeliveryPartnerAssignment(riderWaContext);
          }
          if (effRiderEmail) {
            await this.mailService.sendDeliveryPartnerDispatchedEmail(riderEmailContext);
          }
        } else if (toStatus === OrderStatus.COMPLETED) {
          if (effRiderPhone) {
            await this.whatsappService.sendDirectDeliveryPartnerCompleted(riderWaContext);
          }
          if (effRiderEmail) {
            await this.mailService.sendDeliveryPartnerDeliveredEmail(riderEmailContext);
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch status update notifications: ${err.message}`);
    }
  }

  /**
   * Merchant action to record COD payment collection upon order delivery.
   * Validates tenant boundary, payment method, payment status, and order fulfillment lifecycle stage.
   */
  public async collectCodPayment(
    orderId: string,
    tenant: TenantContext,
    input: { collectionMethod?: string; amountPaise?: number; note?: string },
    actorId?: string
  ) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        tenantId: tenant.tenantId,
        storeId: tenant.storeId,
      },
      include: {
        customer: true,
        orderAddress: true,
        paymentOrders: { include: { transactions: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('This order is already marked as PAID.');
    }

    const isCod =
      order.paymentMethod?.toUpperCase() === 'COD' ||
      order.notes?.includes('COD') ||
      order.paymentOrders?.length === 0;

    if (!isCod) {
      throw new BadRequestException('COD payment collection can only be recorded for Cash on Delivery orders.');
    }

    // Rule 4: Show it only when DELIVERED or COMPLETED.
    // Backend validation: Prevent accidental marking of unpaid COD orders before dispatch / completion
    const allowedStatuses: OrderStatus[] = [
      OrderStatus.COMPLETED,
      OrderStatus.DISPATCHED,
      OrderStatus.READY,
    ];

    if (!allowedStatuses.includes(order.status)) {
      throw new BadRequestException(
        `COD payment can only be marked as collected once order is dispatched or delivered (Current status: ${order.status}).`
      );
    }

    const normalizedCollectionMethod = (input.collectionMethod || 'CASH').toUpperCase();
    const collectedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      // 1. Update order payment status and COD collection details
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: 'COD',
          codCollectionMethod: normalizedCollectionMethod,
          codCollectedAt: collectedAt,
          codCollectedBy: actorId || 'MERCHANT',
        },
        include: {
          customer: true,
          orderAddress: true,
          items: true,
          statusHistory: { orderBy: { createdAt: 'desc' } },
          paymentOrders: { include: { transactions: true } },
          shipments: true,
        },
      });

      // 2. Audit Trail in OrderStatusHistory
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: order.status,
          reason: `COD Payment of ₹${(order.totalPaise / 100).toFixed(2)} collected via ${normalizedCollectionMethod}${input.note ? ` (${input.note})` : ''}`,
          actorId,
        },
      });

      // 3. AuditLog entry
      try {
        await tx.auditLog.create({
          data: {
            tenantId: tenant.tenantId,
            storeId: tenant.storeId,
            action: 'COD_PAYMENT_COLLECTED',
            entityType: 'ORDER',
            entityId: order.id,
            actorId,
            actorType: 'USER',
            metadata: {
              orderNumber: order.orderNumber,
              amountPaise: order.totalPaise,
              collectionMethod: normalizedCollectionMethod,
              collectedAt: collectedAt.toISOString(),
            },
          },
        });
      } catch (auditErr: any) {
        this.logger.warn(`Could not write auditLog record: ${auditErr.message}`);
      }

      return updatedOrder;
    });
  }
}

