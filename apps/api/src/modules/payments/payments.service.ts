import { subscriptionPrice } from '../subscriptions/subscription-price';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  PrismaClient,
  PaymentStatus,
  OrderStatus,
  OutboxStatus,
  PaymentProviderType,
  PaymentPurpose,
  SubscriptionStatus,
} from '@prisma/client';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { RazorpayPaymentProvider } from './providers/razorpay-payment.provider';
import { PaymentProvider } from './interfaces/payment-provider.interface';
import {
  PaymentVerificationFailedException,
  IllegalPaymentBoundaryException,
} from '../../common/exceptions/domain.exceptions';
import { PaymentStateMachine } from './state-machine/payment-state-machine';
import { SubscriptionService } from '../subscriptions/subscription.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly mockProvider: MockPaymentProvider,
    private readonly razorpayProvider: RazorpayPaymentProvider,
    private readonly subscriptionService: SubscriptionService
  ) {}

  private getProvider(type: PaymentProviderType): PaymentProvider {
    return type === PaymentProviderType.RAZORPAY ? this.razorpayProvider : this.mockProvider;
  }

  /**
   * Initializes a payment order for merchant ecommerce checkout.
   * STRICT BOUNDARY: Enforces merchant account credentials; forbids platform SaaS credentials.
   */
  public async createPaymentOrder(orderId: string, idempotencyKey?: string) {
    return this.createMerchantPaymentOrder(orderId, idempotencyKey);
  }

  public async createMerchantPaymentOrder(orderId: string, idempotencyKey?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { store: true },
    });

    if (!order) throw new NotFoundException('Order not found.');

    // 1. Idempotency Check
    if (idempotencyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (existingKey && existingKey.responseBody) {
        this.logger.log(`[IDEMPOTENCY] Replaying cached response for key: ${idempotencyKey}`);
        return existingKey.responseBody;
      }
    }

    // 2. Resolve Merchant Payment Account (Multi-Merchant Gateway)
    const merchantAccount = await this.prisma.merchantPaymentAccount.findFirst({
      where: { storeId: order.storeId, isEnabled: true },
      orderBy: [
        { provider: 'desc' }, // Prioritizes real gateway provider (e.g. RAZORPAY) over MOCK
        { updatedAt: 'desc' },
      ],
    });

    // 3. Strict Payment Boundary Check: Forbid AIKYAM Platform Credentials for Merchant Orders
    const platformKeyId = this.razorpayProvider.platformKeyId;
    const boundaryViolation = platformKeyId
      ? await this.prisma.merchantPaymentAccount.findFirst({
          where: {
            storeId: order.storeId,
            isEnabled: true,
            keyId: platformKeyId,
          },
        })
      : null;

    if (boundaryViolation || (platformKeyId && merchantAccount?.keyId && merchantAccount.keyId === platformKeyId)) {
      throw new IllegalPaymentBoundaryException(
        'Security boundary violation: AIKYAM SaaS billing credentials cannot be used for merchant store orders.'
      );
    }

    const providerType = merchantAccount?.provider || PaymentProviderType.MOCK;
    const provider = this.getProvider(providerType);

    // 4. Create Gateway Order
    const providerResult = await provider.createPaymentOrder({
      tenantId: order.tenantId,
      storeId: order.storeId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountPaise: order.totalPaise,
      currency: order.currency,
      purpose: PaymentPurpose.MERCHANT_ORDER,
      merchantKeyId: merchantAccount?.keyId,
      merchantKeySecret: merchantAccount?.keySecretEncrypted,
      receipt: order.orderNumber,
    });

    // 5. Save PaymentOrder with purpose = MERCHANT_ORDER
    const paymentOrder = await this.prisma.paymentOrder.create({
      data: {
        tenantId: order.tenantId,
        storeId: order.storeId,
        orderId: order.id,
        purpose: PaymentPurpose.MERCHANT_ORDER,
        provider: providerType,
        providerOrderId: providerResult.providerOrderId,
        amountPaise: order.totalPaise,
        currency: order.currency,
        status: PaymentStatus.PENDING,
        idempotencyKey,
        receipt: order.orderNumber,
      },
    });

    const response = {
      paymentOrderId: paymentOrder.id,
      providerOrderId: providerResult.providerOrderId,
      amountPaise: paymentOrder.amountPaise,
      currency: paymentOrder.currency,
      keyId: providerResult.keyId || 'mock_key',
      purpose: PaymentPurpose.MERCHANT_ORDER,
    };

    // 6. Store Idempotency Key record
    if (idempotencyKey) {
      await this.prisma.idempotencyKey.upsert({
        where: { key: idempotencyKey },
        update: {
          responseBody: response,
          status: 'COMPLETED',
        },
        create: {
          key: idempotencyKey,
          tenantId: order.tenantId,
          storeId: order.storeId,
          route: '/payments/orders',
          requestHash: 'order_create_hash',
          status: 'COMPLETED',
          responseStatusCode: 201,
          responseBody: response,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
        },
      });
    }

    return response;
  }

  /**
   * Initializes a payment order for AIKYAM SaaS platform subscription billing.
   * STRICT BOUNDARY: Uses platform Razorpay credentials ONLY.
   */
  /**
   * Initializes a payment order for AIKYAM SaaS platform subscription billing.
   * STRICT BOUNDARY: Uses platform Razorpay credentials ONLY.
   * Authoritative plan amount is calculated strictly from DB.
   */
  public async createPlatformSubscriptionPaymentOrder(
    tenantId: string,
    planId: string,
    billingCycle = 'MONTHLY',
    idempotencyKey?: string,
    allowActiveRenewal = true
  ): Promise<any> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { stores: true },
    });
    if (!tenant) throw new NotFoundException('Merchant tenant not found.');

    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found.');

    if (plan.code.toUpperCase().includes('GROWTH')) {
      throw new BadRequestException('The Growth plan is coming soon and cannot be purchased or activated at this time.');
    }

    if (!plan.isPublic || plan.code.toUpperCase().includes('CUSTOM') || plan.pricePaise <= 0) {
      throw new BadRequestException('This plan is not available for self-service purchase. Contact Aikyam.');
    }

    // Check if tenant already has an active subscription for this plan (Requirement 12: already-active subscription)
    if (!allowActiveRenewal) {
      const now = new Date();
      const activeSub = await this.prisma.subscription.findFirst({
        where: {
          tenantId,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: { gt: now },
        },
      });
      if (activeSub) {
        throw new BadRequestException(
          'Tenant already has an active subscription to this plan. Duplicate subscription creation is prevented.'
        );
      }
    }

    // Idempotency check (Requirement 10: Double-clicking subscription payment must not create duplicate subscriptions)
    if (idempotencyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (existingKey && existingKey.responseBody) {
        this.logger.log(`[IDEMPOTENCY] Replaying cached response for subscription order key: ${idempotencyKey}`);
        return existingKey.responseBody;
      }
    }

    const quote = subscriptionPrice(plan.pricePaise);
    const storeId = tenant.stores[0]?.id || 'platform';
    const provider = this.razorpayProvider;

    // Call provider with purpose = PLATFORM_SUBSCRIPTION and authoritative plan amount
    const providerResult = await provider.createPaymentOrder({
      tenantId,
      storeId,
      amountPaise: quote.totalPaise,
      currency: 'INR',
      purpose: PaymentPurpose.PLATFORM_SUBSCRIPTION,
      subscriptionId: plan.id,
      receipt: `sub_${tenant.slug}_${Date.now()}`,
    });

    // Save PaymentOrder with purpose = PLATFORM_SUBSCRIPTION
    let paymentOrder;
    try {
      paymentOrder = await this.prisma.paymentOrder.create({
        data: {
          tenantId,
          storeId,
          purpose: PaymentPurpose.PLATFORM_SUBSCRIPTION,
          subscriptionId: plan.id,
          baseAmountPaise: quote.baseAmountPaise, taxPaise: quote.taxPaise, gstBasisPoints: quote.gstBasisPoints,
          provider: PaymentProviderType.RAZORPAY,
          providerOrderId: providerResult.providerOrderId,
          amountPaise: quote.totalPaise,
          currency: 'INR',
          status: PaymentStatus.PENDING,
          idempotencyKey,
          receipt: `sub_${tenant.slug}_${Date.now()}`,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002' && idempotencyKey) {
        // Concurrent double-click: Return the first successfully inserted order
        const existingOrder = await this.prisma.paymentOrder.findUnique({
          where: { idempotencyKey },
        });
        if (existingOrder) {
          this.logger.log(`[IDEMPOTENCY RACE] Returning concurrently created payment order for key: ${idempotencyKey}`);
          return {
            paymentOrderId: existingOrder.id,
            providerOrderId: existingOrder.providerOrderId,
            amountPaise: existingOrder.amountPaise,
            currency: existingOrder.currency,
            keyId: providerResult.keyId,
            purpose: PaymentPurpose.PLATFORM_SUBSCRIPTION,
            planCode: plan.code,
            planName: plan.name,
      ...quote,
          };
        }
      }
      throw err;
    }

    const response = {
      paymentOrderId: paymentOrder.id,
      providerOrderId: providerResult.providerOrderId,
      amountPaise: paymentOrder.amountPaise,
      currency: paymentOrder.currency,
      keyId: providerResult.keyId,
      purpose: PaymentPurpose.PLATFORM_SUBSCRIPTION,
      planCode: plan.code,
      planName: plan.name,
      ...quote,
    };

    if (idempotencyKey) {
      await this.prisma.idempotencyKey.upsert({
        where: { key: idempotencyKey },
        update: { responseBody: response, status: 'COMPLETED' },
        create: {
          key: idempotencyKey,
          tenantId,
          storeId,
          route: '/subscriptions/create-order',
          requestHash: 'sub_create_hash',
          status: 'COMPLETED',
          responseStatusCode: 201,
          responseBody: response,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

    return response;
  }

  /**
   * Verifies payment server-side and advances order or subscription state.
   * Uses PaymentStateMachine to prevent illegal state transitions.
   * Handles duplicate callbacks idempotently.
   */
  public async verifyAndCapturePayment(
    paymentOrderIdOrInput: string | {
      paymentOrderId?: string;
      providerPaymentId?: string;
      providerOrderId?: string;
      providerSignature?: string;
      razorpay_payment_id?: string;
      razorpay_order_id?: string;
      razorpay_signature?: string;
      skipSignatureVerification?: boolean;
      paymentMethod?: string;
    },
    legacyPaymentId?: string,
    legacySignature?: string,
    skipSignatureCheck = false
  ) {
    let paymentOrderId: string | undefined;
    let providerPaymentId: string | undefined;
    let providerOrderId: string | undefined;
    let providerSignature: string | undefined;
    let skipSignature = skipSignatureCheck;

    if (typeof paymentOrderIdOrInput === 'object') {
      paymentOrderId = paymentOrderIdOrInput.paymentOrderId;
      providerPaymentId = paymentOrderIdOrInput.providerPaymentId || paymentOrderIdOrInput.razorpay_payment_id;
      providerOrderId = paymentOrderIdOrInput.providerOrderId || paymentOrderIdOrInput.razorpay_order_id;
      providerSignature = paymentOrderIdOrInput.providerSignature || paymentOrderIdOrInput.razorpay_signature;
      if (paymentOrderIdOrInput.skipSignatureVerification) {
        skipSignature = true;
      }
    } else {
      paymentOrderId = paymentOrderIdOrInput;
      providerPaymentId = legacyPaymentId;
      providerSignature = legacySignature;
    }

    const paymentOrder = await this.prisma.paymentOrder.findFirst({
      where: paymentOrderId
        ? { id: paymentOrderId }
        : providerOrderId
        ? { providerOrderId }
        : undefined,
      include: { order: true },
    });

    if (!paymentOrder) throw new NotFoundException('Payment order record not found.');

    // Security check: Validate providerOrderId if provided (Requirement 12: wrong Razorpay order)
    if (providerOrderId && providerOrderId !== paymentOrder.providerOrderId) {
      this.logger.error(
        `[SECURITY] Order ID mismatch: received ${providerOrderId}, expected ${paymentOrder.providerOrderId}`
      );
      throw new BadRequestException('Order ID does not match payment order.');
    }

    // Idempotent duplicate callback check (Requirement 10 & 12: duplicate callback)
    if (paymentOrder.status === PaymentStatus.PAID) {
      this.logger.log(`[IDEMPOTENT CALLBACK] PaymentOrder ${paymentOrder.id} is already PAID.`);
      const existingTx = await this.prisma.paymentTransaction.findFirst({
        where: { paymentOrderId: paymentOrder.id },
      });
      return {
        success: true,
        message: 'Payment already verified and processed.',
        paymentOrderId: paymentOrder.id,
        purpose: paymentOrder.purpose,
        paymentStatus: PaymentStatus.PAID,
        transactionId: existingTx?.id,
      };
    }

    // State machine check
    PaymentStateMachine.validateTransition(paymentOrder.status, PaymentStatus.PAID);

    const provider = this.getProvider(paymentOrder.provider);

    // Resolve merchant credentials if applicable
    let merchantSecret: string | undefined;
    let merchantKeyId: string | undefined;
    if (paymentOrder.purpose === PaymentPurpose.MERCHANT_ORDER) {
      const merchantAccount = await this.prisma.merchantPaymentAccount.findFirst({
        where: { storeId: paymentOrder.storeId, isEnabled: true },
      });
      merchantSecret = merchantAccount?.keySecretEncrypted;
      merchantKeyId = merchantAccount?.keyId;
    } else {
      merchantSecret = this.razorpayProvider.platformKeySecret;
      merchantKeyId = this.razorpayProvider.platformKeyId;
    }

    // Server-side signature verification (skipped when already verified by webhook HMAC or manual admin reconciliation)
    if (!skipSignature) {
      const isValid = await provider.verifyPayment({
        orderId: paymentOrder.orderId || undefined,
        providerOrderId: paymentOrder.providerOrderId,
        providerPaymentId: providerPaymentId!,
        providerSignature: providerSignature!,
        merchantSecret,
      });

      if (!isValid) {
        this.logger.warn(`Signature verification failed for payment order ${paymentOrder.id}`);
        throw new PaymentVerificationFailedException();
      }
    }

    let verifiedPaymentEntity: any = null;
    // Gateway verification where appropriate (Requirement 7, Requirement 12: failed payment, tampered amount)
    if (paymentOrder.provider === PaymentProviderType.RAZORPAY) {
      try {
        const keyId = merchantKeyId;
        const paymentEntity = await this.razorpayProvider.getPayment(providerPaymentId!, {
          keyId,
          keySecret: merchantSecret,
          expectedAmount: paymentOrder.amountPaise,
          expectedOrderId: paymentOrder.providerOrderId,
        });
        verifiedPaymentEntity = paymentEntity;

        if (paymentEntity) {
          if (paymentEntity.status === 'failed') {
            await this.prisma.paymentOrder.update({
              where: { id: paymentOrder.id },
              data: { status: PaymentStatus.FAILED },
            });
            throw new BadRequestException('Payment has failed on gateway.');
          }

          if (paymentEntity.order_id && paymentEntity.order_id !== paymentOrder.providerOrderId) {
            this.logger.error(
              `[SECURITY] Gateway order_id mismatch: ${paymentEntity.order_id} vs ${paymentOrder.providerOrderId}`
            );
            throw new BadRequestException('Payment entity order_id does not match payment order.');
          }

          if (paymentEntity.amount && paymentEntity.amount !== paymentOrder.amountPaise) {
            this.logger.error(
              `[SECURITY] Tampered payment amount detected: gateway amount ${paymentEntity.amount} vs order amount ${paymentOrder.amountPaise}`
            );
            throw new BadRequestException('Payment amount mismatch: tampered amount detected.');
          }
        }
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        this.logger.warn(`Could not verify payment entity with gateway API: ${err.message}`);
      }
    }

    // Resolve specific payment method (e.g. UPI, Card, Net Banking)
    const rawMethod =
      verifiedPaymentEntity?.method ||
      (typeof paymentOrderIdOrInput === 'object' ? paymentOrderIdOrInput.paymentMethod : undefined);

    let specificPaymentMethod = 'UPI';
    if (rawMethod) {
      const lower = String(rawMethod).toLowerCase();
      if (lower.includes('upi')) specificPaymentMethod = 'UPI';
      else if (lower.includes('card')) specificPaymentMethod = 'CARD';
      else if (lower.includes('netbanking') || lower.includes('net_banking')) specificPaymentMethod = 'NETBANKING';
      else if (lower.includes('wallet')) specificPaymentMethod = 'WALLET';
      else specificPaymentMethod = String(rawMethod).toUpperCase();
    }

    return this.prisma.$transaction(async (tx) => {
      // Update Payment Order
      await tx.paymentOrder.update({
        where: { id: paymentOrder.id },
        data: { status: PaymentStatus.PAID },
      });

      // Record Transaction with authentic payment method
      const transaction = await tx.paymentTransaction.create({
        data: {
          paymentOrderId: paymentOrder.id,
          providerPaymentId: providerPaymentId!,
          providerSignature: providerSignature || null,
          status: PaymentStatus.PAID,
          amountPaise: paymentOrder.amountPaise,
          paymentMethod: specificPaymentMethod,
          rawResponse: verifiedPaymentEntity || null,
        },
      });

      // Handle based on Payment Purpose
      if (paymentOrder.purpose === PaymentPurpose.PLATFORM_SUBSCRIPTION) {
        // Activate merchant subscription for AIKYAM SaaS
        if (paymentOrder.subscriptionId) {
          const activatedSub = await this.subscriptionService.activateOrRenewSubscription(
            paymentOrder.tenantId,
            paymentOrder.subscriptionId,
            30,
            'RAZORPAY_PAYMENT'
          );

          if (activatedSub) {
            const invoice = await tx.subscriptionInvoice.create({
              data: {
                tenantId: paymentOrder.tenantId,
                subscriptionId: activatedSub.id,
                invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                amountPaise: paymentOrder.amountPaise,
                baseAmountPaise: paymentOrder.baseAmountPaise, taxPaise: paymentOrder.taxPaise, gstBasisPoints: paymentOrder.gstBasisPoints,
                currency: paymentOrder.currency,
                status: 'PAID',
                paidAt: new Date(),
              },
            });

            await tx.subscriptionPayment.create({
              data: {
                invoiceId: invoice.id,
                paymentMethod: 'RAZORPAY',
                providerPaymentId: providerPaymentId!,
                amountPaise: paymentOrder.amountPaise,
                status: 'SUCCESS',
              },
            });
          }
        }

        return {
          success: true,
          paymentOrderId: paymentOrder.id,
          purpose: paymentOrder.purpose,
          paymentStatus: PaymentStatus.PAID,
          transactionId: transaction.id,
        };
      }

      // MERCHANT_ORDER: Fulfill customer ecommerce purchase
      if (paymentOrder.orderId && paymentOrder.order) {
        const updatedOrder = await tx.order.update({
          where: { id: paymentOrder.orderId },
          data: {
            paymentStatus: PaymentStatus.PAID,
            paymentMethod: specificPaymentMethod,
            status: OrderStatus.ACCEPTED,
          },
        });

        // Record Order Status History
        await tx.orderStatusHistory.create({
          data: {
            orderId: paymentOrder.orderId,
            fromStatus: paymentOrder.order.status,
            toStatus: OrderStatus.ACCEPTED,
            reason: `Payment verified successfully (${providerPaymentId})`,
          },
        });

        // Outbox Event for Asynchronous Shipment Fulfillment (Reliable Integrations)
        await tx.outboxEvent.create({
          data: {
            tenantId: paymentOrder.tenantId,
            storeId: paymentOrder.storeId,
            eventType: 'ORDER_PAID',
            payload: {
              orderId: paymentOrder.orderId,
              orderNumber: paymentOrder.order.orderNumber,
              totalPaise: paymentOrder.amountPaise,
            },
            status: OutboxStatus.PENDING,
            retryCount: 0,
            maxRetries: 5,
          },
        });

        return {
          success: true,
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          status: updatedOrder.status,
          paymentStatus: updatedOrder.paymentStatus,
          transactionId: transaction.id,
        };
      }

      return {
        success: true,
        paymentOrderId: paymentOrder.id,
        paymentStatus: PaymentStatus.PAID,
        transactionId: transaction.id,
      };
    });
  }

  /**
   * Safe, reprocessable webhook pipeline with deduplication and state machine enforcement.
   */
  public async handleWebhook(
    providerType: string,
    eventId: string,
    eventType: string,
    payload: any,
    signature: string
  ) {
    // 1. Webhook Deduplication: Check if event was already processed
    const existing = await this.prisma.paymentWebhookEvent.findUnique({
      where: { eventId },
    });

    if (existing && existing.isProcessed) {
      this.logger.log(`[WEBHOOK DEDUPLICATION] Event ${eventId} already processed. Skipping idempotently.`);
      return { status: 'already_processed', eventId };
    }

    const webhookRecord = await this.prisma.paymentWebhookEvent.upsert({
      where: { eventId },
      update: {},
      create: {
        provider: providerType,
        eventId,
        eventType,
        payload,
        status: 'RECEIVED',
        isProcessed: false,
      },
    });

    try {
      // 2. Route events
      if (eventType === 'order.paid' || eventType === 'payment.captured') {
        const providerOrderId =
          payload?.payload?.order?.entity?.id ||
          payload?.payload?.payment?.entity?.order_id ||
          payload?.order_id ||
          payload?.orderId;

        const eventAmount =
          payload?.payload?.payment?.entity?.amount ??
          payload?.payload?.order?.entity?.amount;

        const eventCurrency =
          payload?.payload?.payment?.entity?.currency ??
          payload?.payload?.order?.entity?.currency;

        if (providerOrderId) {
          const paymentOrder = await this.prisma.paymentOrder.findFirst({
            where: { providerOrderId },
          });

          if (!paymentOrder) {
            this.logger.warn(`[WEBHOOK] PaymentOrder not found for providerOrderId ${providerOrderId}.`);
            return { status: 'ignored', reason: 'order_not_found', eventId };
          }

          // Authoritative validation: amount & currency
          if (eventAmount !== undefined && eventAmount !== paymentOrder.amountPaise) {
            this.logger.error(
              `[SECURITY] Webhook payment amount mismatch: event ${eventAmount} vs order ${paymentOrder.amountPaise}`
            );
            throw new BadRequestException('Webhook payment amount mismatch: tampered amount detected');
          }

          if (eventCurrency !== undefined && eventCurrency.toUpperCase() !== paymentOrder.currency.toUpperCase()) {
            this.logger.error(
              `[SECURITY] Webhook payment currency mismatch: event ${eventCurrency} vs order ${paymentOrder.currency}`
            );
            throw new BadRequestException('Webhook payment currency mismatch');
          }

          // Idempotency: If already PAID, skip mutation safely (no duplicate activation/invoices)
          if (paymentOrder.status === PaymentStatus.PAID) {
            this.logger.log(`[WEBHOOK IDEMPOTENCY] PaymentOrder ${paymentOrder.id} is already PAID. Skipping.`);
          } else {
            PaymentStateMachine.validateTransition(paymentOrder.status, PaymentStatus.PAID);
            const paymentId =
              payload?.payload?.payment?.entity?.id || payload?.id || `pay_wh_${Date.now()}`;
            const webhookMethod = payload?.payload?.payment?.entity?.method || undefined;
            await this.verifyAndCapturePayment({
              paymentOrderId: paymentOrder.id,
              providerPaymentId: paymentId,
              providerSignature: signature || 'WEBHOOK_VERIFIED',
              skipSignatureVerification: true,
              paymentMethod: webhookMethod,
            });
          }
        }
      } else if (eventType === 'payment.failed') {
        const providerOrderId = payload?.payload?.payment?.entity?.order_id || payload?.order_id;
        if (providerOrderId) {
          const paymentOrder = await this.prisma.paymentOrder.findFirst({
            where: { providerOrderId },
          });

          if (paymentOrder) {
            // Out-of-order check: Never downgrade an already PAID payment
            if (paymentOrder.status === PaymentStatus.PAID) {
              this.logger.warn(
                `[OUT-OF-ORDER WEBHOOK] Received payment.failed for order ${paymentOrder.id} which is already PAID. Preserving PAID status.`
              );
              await this.prisma.auditLog.create({
                data: {
                  actorId: 'RAZORPAY_WEBHOOK',
                  actorType: 'SYSTEM',
                  tenantId: paymentOrder.tenantId,
                  action: 'STALE_PAYMENT_FAILED_IGNORED',
                  entityType: 'PaymentOrder',
                  entityId: paymentOrder.id,
                  metadata: { eventId, reason: 'Payment was already captured and marked PAID' },
                },
              });
            } else if (paymentOrder.status === PaymentStatus.PENDING) {
              PaymentStateMachine.validateTransition(paymentOrder.status, PaymentStatus.FAILED);
              await this.prisma.paymentOrder.update({
                where: { id: paymentOrder.id },
                data: { status: PaymentStatus.FAILED },
              });
              if (paymentOrder.orderId) {
                await this.prisma.order.update({
                  where: { id: paymentOrder.orderId },
                  data: { paymentStatus: PaymentStatus.FAILED },
                });
              }
            }
          }
        }
      } else if (eventType === 'refund.processed') {
        const providerRefundId = payload?.payload?.refund?.entity?.id || payload?.id;
        const providerPaymentId = payload?.payload?.refund?.entity?.payment_id;
        const refundAmount = payload?.payload?.refund?.entity?.amount;

        let txRecord = providerPaymentId
          ? await this.prisma.paymentTransaction.findFirst({
              where: { providerPaymentId },
              include: { paymentOrder: { include: { order: true } } },
            })
          : null;

        if (!txRecord && payload?.payload?.refund?.entity?.notes?.paymentOrderId) {
          txRecord = await this.prisma.paymentTransaction.findFirst({
            where: { paymentOrderId: payload.payload.refund.entity.notes.paymentOrderId },
            include: { paymentOrder: { include: { order: true } } },
          });
        }

        if (txRecord) {
          if (txRecord.paymentOrder.status !== PaymentStatus.REFUNDED) {
            PaymentStateMachine.validateTransition(txRecord.paymentOrder.status, PaymentStatus.REFUNDED);
            await this.prisma.paymentOrder.update({
              where: { id: txRecord.paymentOrderId },
              data: { status: PaymentStatus.REFUNDED },
            });
            if (txRecord.paymentOrder.orderId) {
              await this.prisma.order.update({
                where: { id: txRecord.paymentOrder.orderId },
                data: { paymentStatus: PaymentStatus.REFUNDED },
              });
            }

            // PRODUCT POLICY: Full refund of an AIKYAM SaaS subscription immediately deactivates store
            if (txRecord.paymentOrder.purpose === PaymentPurpose.PLATFORM_SUBSCRIPTION) {
              await this.subscriptionService.refundAndDeactivateSubscription(
                txRecord.paymentOrder.tenantId,
                payload?.payload?.refund?.entity?.notes?.reason || 'Full subscription refund via webhook',
                'RAZORPAY_WEBHOOK',
                {
                  providerRefundId,
                  amountPaise: refundAmount || txRecord.amountPaise,
                  paymentOrderId: txRecord.paymentOrderId,
                }
              );
            }
          }

          if (providerRefundId && txRecord.paymentOrder.orderId) {
            await this.prisma.refund.upsert({
              where: { providerRefundId },
              update: { status: 'processed' },
              create: {
                tenantId: txRecord.paymentOrder.tenantId,
                storeId: txRecord.paymentOrder.storeId,
                orderId: txRecord.paymentOrder.orderId,
                paymentTransactionId: txRecord.id,
                providerRefundId,
                amountPaise: refundAmount || txRecord.amountPaise,
                reason: payload?.payload?.refund?.entity?.notes?.reason || 'Refund processed via webhook',
                status: 'processed',
              },
            });
          }

          await this.prisma.auditLog.create({
            data: {
              actorId: 'RAZORPAY_WEBHOOK',
              actorType: 'SYSTEM',
              tenantId: txRecord.paymentOrder.tenantId,
              action: 'PAYMENT_REFUNDED_VIA_WEBHOOK',
              entityType: 'PaymentOrder',
              entityId: txRecord.paymentOrderId,
              metadata: { providerRefundId, amountPaise: refundAmount },
            },
          });
        }
      }

      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          isProcessed: true,
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });

      return { status: 'processed', eventId };
    } catch (err: any) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookRecord.id },
        data: {
          error: err.message,
          status: 'FAILED',
          retryCount: { increment: 1 },
        },
      });
      throw err;
    }
  }

  /**
   * Processes refund and enforces state transition to REFUNDED.
   */
  public async refundPaymentTransaction(
    paymentTransactionId: string,
    amountPaise: number,
    reason?: string
  ) {
    const txRecord = await this.prisma.paymentTransaction.findUnique({
      where: { id: paymentTransactionId },
      include: { paymentOrder: { include: { order: true } } },
    });

    if (!txRecord) throw new NotFoundException('Payment transaction not found.');

    // State machine check
    PaymentStateMachine.validateTransition(txRecord.paymentOrder.status, PaymentStatus.REFUNDED);

    const provider = this.getProvider(txRecord.paymentOrder.provider);
    const refundResult = await provider.refundPayment({
      paymentTransactionId: txRecord.id,
      providerPaymentId: txRecord.providerPaymentId,
      amountPaise,
      reason,
    });

    return this.prisma.$transaction(async (prismaTx) => {
      let refund: any = null;
      // Create Refund record for merchant customer orders (which have an Order relation)
      if (txRecord.paymentOrder.orderId) {
        refund = await prismaTx.refund.create({
          data: {
            tenantId: txRecord.paymentOrder.tenantId,
            storeId: txRecord.paymentOrder.storeId,
            orderId: txRecord.paymentOrder.orderId,
            paymentTransactionId: txRecord.id,
            providerRefundId: refundResult.providerRefundId,
            amountPaise,
            reason,
            status: refundResult.status,
          },
        });

        // Update Order payment status
        await prismaTx.order.update({
          where: { id: txRecord.paymentOrder.orderId },
          data: { paymentStatus: PaymentStatus.REFUNDED },
        });
      }

      // Update Payment Order status
      await prismaTx.paymentOrder.update({
        where: { id: txRecord.paymentOrderId },
        data: { status: PaymentStatus.REFUNDED },
      });

      // PRODUCT POLICY: Full refund of an AIKYAM SaaS subscription immediately deactivates store
      if (txRecord.paymentOrder.purpose === PaymentPurpose.PLATFORM_SUBSCRIPTION) {
        await this.subscriptionService.refundAndDeactivateSubscription(
          txRecord.paymentOrder.tenantId,
          reason || 'Full subscription refund processed',
          'SYSTEM',
          {
            providerRefundId: refundResult.providerRefundId,
            amountPaise,
            paymentOrderId: txRecord.paymentOrderId,
          }
        );
      }

      // Record audit log for refund
      await prismaTx.auditLog.create({
        data: {
          actorId: 'SYSTEM',
          actorType: 'SYSTEM',
          tenantId: txRecord.paymentOrder.tenantId,
          action: 'PAYMENT_REFUNDED',
          entityType: 'PaymentOrder',
          entityId: txRecord.paymentOrderId,
          metadata: {
            providerRefundId: refundResult.providerRefundId,
            amountPaise,
            reason,
          },
        },
      });

      return refund ?? {
        success: true,
        paymentOrderId: txRecord.paymentOrderId,
        status: 'processed',
        providerRefundId: refundResult.providerRefundId,
        amountPaise,
      };
    });
  }

  /**
   * Reconciles an internal PaymentOrder with external gateway state.
   * Compares gateway order/payment state with local DB, reports mismatches,
   * performs permitted state transitions, and records an audit log.
   */
  public async reconcilePaymentOrder(paymentOrderId: string, adminUserId?: string) {
    const paymentOrder = await this.prisma.paymentOrder.findUnique({
      where: { id: paymentOrderId },
      include: {
        order: true,
        transactions: true,
      },
    });

    if (!paymentOrder) {
      throw new NotFoundException(`PaymentOrder ${paymentOrderId} not found.`);
    }

    const mismatches: Array<{ field: string; dbValue: any; gatewayValue: any }> = [];
    let actionTaken = 'NONE';
    let gatewayOrder: any = null;
    let gatewayPayment: any = null;

    if (paymentOrder.provider === PaymentProviderType.RAZORPAY) {
      const keyId =
        paymentOrder.purpose === PaymentPurpose.PLATFORM_SUBSCRIPTION
          ? this.razorpayProvider.platformKeyId
          : undefined;
      const keySecret =
        paymentOrder.purpose === PaymentPurpose.PLATFORM_SUBSCRIPTION
          ? this.razorpayProvider.platformKeySecret
          : undefined;

      // 1. Fetch gateway order
      if (paymentOrder.providerOrderId) {
        gatewayOrder = await this.razorpayProvider.getOrder(paymentOrder.providerOrderId, {
          keyId,
          keySecret,
          expectedAmount: paymentOrder.amountPaise,
        });
      }

      // 2. Fetch gateway payment if there is a payment transaction or provider payment ID
      const lastTx = paymentOrder.transactions[0];
      if (lastTx?.providerPaymentId) {
        gatewayPayment = await this.razorpayProvider.getPayment(lastTx.providerPaymentId, {
          keyId,
          keySecret,
          expectedAmount: paymentOrder.amountPaise,
          expectedOrderId: paymentOrder.providerOrderId,
        });
      }

      // 3. Compare amounts
      if (gatewayOrder?.amount && gatewayOrder.amount !== paymentOrder.amountPaise) {
        mismatches.push({
          field: 'amountPaise',
          dbValue: paymentOrder.amountPaise,
          gatewayValue: gatewayOrder.amount,
        });
      }

      // 4. Compare status
      const isGatewayPaid =
        gatewayOrder?.status === 'paid' ||
        gatewayPayment?.status === 'captured' ||
        gatewayOrder?.amount_paid === paymentOrder.amountPaise;

      if (isGatewayPaid && paymentOrder.status !== PaymentStatus.PAID) {
        mismatches.push({
          field: 'status',
          dbValue: paymentOrder.status,
          gatewayValue: 'PAID',
        });

        // Reconcile to PAID
        PaymentStateMachine.validateTransition(paymentOrder.status, PaymentStatus.PAID);
        await this.verifyAndCapturePayment({
          paymentOrderId: paymentOrder.id,
          providerPaymentId: gatewayPayment?.id || `pay_reconciled_${Date.now()}`,
          providerSignature: 'MANUAL_RECONCILIATION',
          skipSignatureVerification: true,
        });
        actionTaken = 'RECONCILED_TO_PAID';
      } else if (gatewayPayment?.status === 'failed' && paymentOrder.status === PaymentStatus.PENDING) {
        mismatches.push({
          field: 'status',
          dbValue: paymentOrder.status,
          gatewayValue: 'FAILED',
        });
        PaymentStateMachine.validateTransition(paymentOrder.status, PaymentStatus.FAILED);
        await this.prisma.paymentOrder.update({
          where: { id: paymentOrder.id },
          data: { status: PaymentStatus.FAILED },
        });
        actionTaken = 'RECONCILED_TO_FAILED';
      } else {
        actionTaken = mismatches.length === 0 ? 'IN_SYNC' : 'MISMATCH_REPORTED';
      }
    }

    // 5. Audit log
    const auditLog = await this.prisma.auditLog.create({
      data: {
        actorId: adminUserId || 'SYSTEM_ADMIN',
        actorType: adminUserId ? 'USER' : 'SYSTEM',
        tenantId: paymentOrder.tenantId,
        action: 'MANUAL_PAYMENT_RECONCILIATION',
        entityType: 'PaymentOrder',
        entityId: paymentOrder.id,
        metadata: {
          previousStatus: paymentOrder.status,
          actionTaken,
          mismatches,
          gatewayOrderId: gatewayOrder?.id,
          gatewayPaymentId: gatewayPayment?.id,
        },
      },
    });

    return {
      paymentOrderId: paymentOrder.id,
      previousStatus: paymentOrder.status,
      currentStatus: actionTaken === 'RECONCILED_TO_PAID' ? PaymentStatus.PAID : paymentOrder.status,
      provider: paymentOrder.provider,
      providerOrderId: paymentOrder.providerOrderId,
      actionTaken,
      inSync: mismatches.length === 0,
      mismatches,
      auditLogId: auditLog.id,
      timestamp: new Date().toISOString(),
    };
  }
}
