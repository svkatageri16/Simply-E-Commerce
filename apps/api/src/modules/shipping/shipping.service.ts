import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaClient, ShipmentStatus, ShippingProviderType, OrderStatus, FulfillmentStatus } from '@prisma/client';
import { MockShippingProvider } from './providers/mock-shipping.provider';
import { ShiprocketShippingProvider } from './providers/shiprocket-shipping.provider';
import { ShippingProvider } from './interfaces/shipping-provider.interface';
import { TenantContext } from '@simply/types';
import { MailService } from '../notifications/mail.service';
import { WhatsAppService } from '../notifications/whatsapp.service';

export interface DispatchOptions {
  mode?: 'SHIPROCKET' | 'SELF_DELIVERY';
  riderName?: string;
  riderPhone?: string;
  notes?: string;
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly mockProvider: MockShippingProvider,
    private readonly shiprocketProvider: ShiprocketShippingProvider,
    private readonly mailService: MailService,
    private readonly whatsappService: WhatsAppService
  ) {}

  private getProvider(type: ShippingProviderType): ShippingProvider {
    return type === ShippingProviderType.SHIPROCKET ? this.shiprocketProvider : this.mockProvider;
  }

  public async createShipmentForOrder(
    orderId: string,
    tenant: TenantContext,
    options?: DispatchOptions
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: tenant.tenantId, storeId: tenant.storeId },
      include: {
        items: true,
        customer: true,
        orderAddress: true,
        shipments: true,
        store: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found.');

    const store = order.store;
    const deliveryAddress = (order.deliveryAddress as any) || order.orderAddress || {};
    const customerEmail = order.customer?.email || deliveryAddress.email || '';
    const customerPhone = order.customer?.phone || deliveryAddress.phone || '';
    const customerName = order.customer?.fullName || deliveryAddress.fullName || 'Valued Customer';
    const trackingUrl = order.trackingToken
      ? `${process.env.STOREFRONT_BASE_URL || process.env.STOREFRONT_URL || 'https://letzshop.com'}/track/${order.orderNumber}?t=${order.trackingToken}`
      : undefined;

    // Check if merchant explicitly requested Self-Delivery or configured it
    const merchantShipping = await this.prisma.merchantShippingAccount.findFirst({
      where: { storeId: tenant.storeId, isEnabled: true },
    });

    const isSelfDelivery =
      options?.mode === 'SELF_DELIVERY' ||
      (!options?.mode && merchantShipping?.accountId === 'SELF_DELIVERY');

    if (isSelfDelivery) {
      const courierName = options?.riderName
        ? `Store Team: ${options.riderName.trim()}`
        : 'Store Team Self-Delivery';
      const awbNumber = options?.riderPhone
        ? `SELF_${order.orderNumber}_${options.riderPhone.replace(/[^0-9]/g, '').slice(-4)}`
        : `SELF_${order.orderNumber}`;

      const selfShipment = await this.prisma.$transaction(async (tx) => {
        // Delete existing draft/pending mock shipment if any
        if (order.shipments && order.shipments.length > 0) {
          await tx.shipment.deleteMany({ where: { orderId: order.id } });
        }

        const s = await tx.shipment.create({
          data: {
            tenantId: tenant.tenantId,
            storeId: tenant.storeId,
            orderId: order.id,
            provider: 'SELF_DELIVERY',
            status: ShipmentStatus.IN_TRANSIT,
            fulfillmentStatus: FulfillmentStatus.SHIPPED,
            courierName,
            awbNumber,
            trackingUrl: trackingUrl || null,
            labelUrl: null,
            manifestUrl: null,
          },
        });

        await tx.shipmentEvent.create({
          data: {
            shipmentId: s.id,
            status: 'OUT_FOR_DELIVERY',
            description: `Self-delivery dispatched by store team.${options?.riderName ? ` Rider: ${options.riderName}` : ''}${options?.riderPhone ? ` (${options.riderPhone})` : ''}`,
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.DISPATCHED,
            shipmentStatus: ShipmentStatus.IN_TRANSIT,
            fulfillmentStatus: FulfillmentStatus.SHIPPED,
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: OrderStatus.DISPATCHED,
            reason: `Self-delivery dispatched${options?.riderName ? ` via rider ${options.riderName}` : ''}`,
          },
        });

        return s;
      });

      // Send dispatch notification email to buyer asynchronously
      this.mailService
        .sendOrderDispatchedEmail({
          order,
          store: {
            id: store.id,
            name: store.name,
            supportEmail: store.supportEmail || undefined,
            supportPhone: store.supportPhone || undefined,
          },
          customer: {
            fullName: customerName,
            email: customerEmail,
            phone: customerPhone,
          },
          trackingUrl,
          courierName,
          awbNumber,
          riderName: options?.riderName,
          riderPhone: options?.riderPhone,
          deliveryMode: 'SELF_DELIVERY',
        })
        .catch((err) => this.logger.warn(`Failed to send self-dispatch email: ${err.message}`));

      return selfShipment;
    }

    // Otherwise: Shiprocket / Logistics Provider
    const providerType = merchantShipping?.provider || ShippingProviderType.SHIPROCKET;
    const provider = this.getProvider(providerType);

    try {
      const shipmentResult = await provider.createShipment({
        orderId: order.id,
        orderNumber: order.orderNumber,
        pickupPincode: '400001',
        pickupLocation: merchantShipping?.accountId || 'Primary',
        totalPaise: order.totalPaise,
        paymentMethod: order.paymentStatus === 'PAID' ? 'Prepaid' : 'COD',
        deliveryAddress: {
          fullName: customerName,
          phone: customerPhone || '9999999999',
          addressLine1: deliveryAddress.addressLine1 || 'Street Address',
          addressLine2: deliveryAddress.addressLine2 || '',
          city: deliveryAddress.city || 'City',
          state: deliveryAddress.state || 'State',
          pincode: deliveryAddress.pincode || '400001',
          email: customerEmail,
        },
        items: order.items.map((it) => ({
          name: it.productName,
          sku: it.sku,
          quantity: it.quantity,
          pricePaise: it.unitPricePaise,
        })),
        weightKg: 0.5,
        merchantApiKey: merchantShipping?.apiKeyEncrypted,
        merchantApiSecret: merchantShipping?.apiSecretEncrypted,
      });

      const shipment = await this.prisma.$transaction(async (tx) => {
        if (order.shipments && order.shipments.length > 0) {
          await tx.shipment.deleteMany({ where: { orderId: order.id } });
        }

        const createdShipment = await tx.shipment.create({
          data: {
            tenantId: tenant.tenantId,
            storeId: tenant.storeId,
            orderId: order.id,
            provider: providerType,
            awbNumber: shipmentResult.awbNumber,
            courierName: shipmentResult.courierName,
            trackingUrl: shipmentResult.trackingUrl,
            labelUrl: shipmentResult.labelUrl,
            manifestUrl: shipmentResult.manifestUrl,
            status: ShipmentStatus.MANIFESTED,
            fulfillmentStatus: FulfillmentStatus.SHIPPED,
            weightKg: 0.5,
          },
        });

        await tx.shipmentEvent.create({
          data: {
            shipmentId: createdShipment.id,
            status: 'MANIFESTED',
            description: `Shipment manifested with ${shipmentResult.courierName}. AWB: ${shipmentResult.awbNumber}`,
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.DISPATCHED,
            shipmentStatus: ShipmentStatus.MANIFESTED,
            fulfillmentStatus: FulfillmentStatus.SHIPPED,
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: OrderStatus.DISPATCHED,
            reason: `Shiprocket shipment created with AWB ${shipmentResult.awbNumber}`,
          },
        });

        return createdShipment;
      });

      // Send dispatch notification email to buyer asynchronously
      this.mailService
        .sendOrderDispatchedEmail({
          order,
          store: {
            id: store.id,
            name: store.name,
            supportEmail: store.supportEmail || undefined,
            supportPhone: store.supportPhone || undefined,
          },
          customer: {
            fullName: customerName,
            email: customerEmail,
            phone: customerPhone,
          },
          trackingUrl,
          courierName: shipmentResult.courierName,
          awbNumber: shipmentResult.awbNumber,
          deliveryMode: 'SHIPROCKET',
        })
        .catch((err) => this.logger.warn(`Failed to send dispatch email: ${err.message}`));

      return shipment;
    } catch (err: any) {
      this.logger.error(
        `[SHIPPING PROVIDER FAILURE] Failed to create shipment for order ${order.orderNumber}: ${err.message}`
      );

      await this.prisma.outboxEvent.create({
        data: {
          tenantId: tenant.tenantId,
          storeId: tenant.storeId,
          eventType: 'SHIPMENT_CREATION_FAILED_RETRY',
          payload: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            provider: providerType,
            error: err.message,
          },
          status: 'PENDING',
          retryCount: 0,
          maxRetries: 5,
        },
      });

      throw new BadRequestException(
        `Failed to dispatch via Shiprocket: ${err.message || 'Courier API error'}. Please verify wallet balance or use Self-Delivery.`
      );
    }
  }

  /**
   * Pulls real-time shipment status & tracking directly from Shiprocket API
   */
  public async syncShiprocketTracking(orderId: string, tenant: TenantContext) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: tenant.tenantId, storeId: tenant.storeId },
      include: { shipments: true, customer: true, store: true },
    });

    if (!order) throw new NotFoundException('Order not found.');

    const shipment = order.shipments?.[0];
    if (!shipment || !shipment.awbNumber) {
      throw new BadRequestException('No active shipment or AWB found for this order.');
    }

    if (shipment.provider === ShippingProviderType.SHIPROCKET || shipment.provider === 'SHIPROCKET') {
      const trackingResult = await this.shiprocketProvider.trackShipment(shipment.awbNumber);

      let targetShipmentStatus = shipment.status;
      let targetOrderStatus = order.status;

      if (trackingResult?.status) {
        const srStatus = String(trackingResult.status).toUpperCase();
        if (srStatus.includes('DELIVERED')) {
          targetShipmentStatus = ShipmentStatus.DELIVERED;
          targetOrderStatus = OrderStatus.COMPLETED;
        } else if (srStatus.includes('OUT FOR DELIVERY') || srStatus.includes('OUT_FOR_DELIVERY')) {
          targetShipmentStatus = ShipmentStatus.OUT_FOR_DELIVERY;
          targetOrderStatus = OrderStatus.DISPATCHED;
        } else if (srStatus.includes('IN TRANSIT') || srStatus.includes('SHIPPED') || srStatus.includes('PICKED UP')) {
          targetShipmentStatus = ShipmentStatus.IN_TRANSIT;
          targetOrderStatus = OrderStatus.DISPATCHED;
        } else if (srStatus.includes('CANCELLED')) {
          targetShipmentStatus = ShipmentStatus.CANCELLED;
        } else if (srStatus.includes('RTO')) {
          targetShipmentStatus = ShipmentStatus.RTO;
        }
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
        const latest = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
        if (latest.status === OrderStatus.CANCELLED || latest.status === OrderStatus.COMPLETED) return;
        await tx.shipment.update({
          where: { id: shipment.id },
          data: { status: targetShipmentStatus },
        });

        if (trackingResult?.activities && trackingResult.activities.length > 0) {
          for (const act of trackingResult.activities) {
            await tx.shipmentEvent.create({
              data: {
                shipmentId: shipment.id,
                status: act.status || 'STATUS_UPDATE',
                location: act.location || trackingResult.location || null,
                description: act.activity || act.status || 'Tracking update from Shiprocket',
                eventTimestamp: act.date ? new Date(act.date) : new Date(),
              },
            });
          }
        }

        if (targetOrderStatus !== latest.status || latest.shipmentStatus !== targetShipmentStatus) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: targetOrderStatus,
              shipmentStatus: targetShipmentStatus,
            },
          });
        }
        const emailStatus = targetShipmentStatus === ShipmentStatus.OUT_FOR_DELIVERY ? 'OUT_FOR_DELIVERY' : targetOrderStatus;
        await tx.outboxEvent.upsert({ where: { id: `order-email:${order.id}:${emailStatus}` }, update: {}, create: { id: `order-email:${order.id}:${emailStatus}`, tenantId: order.tenantId, storeId: order.storeId, eventType: 'ORDER_EMAIL', payload: { orderId: order.id, status: emailStatus } } });
      });

      return {
        success: true,
        awbNumber: shipment.awbNumber,
        shipmentStatus: targetShipmentStatus,
        orderStatus: targetOrderStatus,
        tracking: trackingResult,
      };
    }

    // For Self-Delivery or Mock
    return {
      success: true,
      awbNumber: shipment.awbNumber,
      shipmentStatus: shipment.status,
      orderStatus: order.status,
      tracking: {
        status: shipment.status,
        courierName: shipment.courierName,
      },
    };
  }

  public async trackShipment(awbNumber: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { awbNumber },
      include: { events: { orderBy: { createdAt: 'desc' } } },
    });

    if (!shipment) throw new NotFoundException('Shipment not found.');
    return shipment;
  }
}
