import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  RawBodyRequest,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { RazorpayPaymentProvider } from './providers/razorpay-payment.provider';
import { Public } from '../../common/decorators';

@ApiTags('Payments')
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: Number(process.env.PAYMENT_RATE_LIMIT) || (process.env.NODE_ENV === 'test' ? 50000 : 30), ttl: 60000 } })
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly razorpayProvider: RazorpayPaymentProvider
  ) {}

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create payment gateway order with idempotency' })
  async createPaymentOrder(
    @Body('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    return this.paymentsService.createPaymentOrder(orderId, idempotencyKey);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify payment signature server-side and update order state' })
  async verifyPayment(
    @Body()
    body: {
      paymentOrderId?: string;
      providerPaymentId?: string;
      providerOrderId?: string;
      providerSignature?: string;
      razorpay_payment_id?: string;
      razorpay_order_id?: string;
      razorpay_signature?: string;
    }
  ) {
    return this.paymentsService.verifyAndCapturePayment({
      paymentOrderId: body.paymentOrderId,
      providerPaymentId: body.providerPaymentId || body.razorpay_payment_id,
      providerOrderId: body.providerOrderId || body.razorpay_order_id,
      providerSignature: body.providerSignature || body.razorpay_signature,
    });
  }

  @Post('webhook/razorpay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reprocessable Razorpay payment webhook endpoint' })
  async handleRazorpayWebhook(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Body() payload: any,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') providerEventId?: string
  ) {
    if (!signature) {
      throw new BadRequestException('Missing x-razorpay-signature header');
    }

    const webhookSecret = this.razorpayProvider.platformWebhookSecret;
    if (!webhookSecret) {
      throw new BadRequestException('Webhook verification disabled: secret not configured');
    }

    const rawPayload: string | Buffer =
      req.rawBody ??
      (typeof req.body === 'string'
        ? req.body
        : typeof payload === 'string'
        ? payload
        : JSON.stringify(payload));

    const isValid = this.razorpayProvider.verifyWebhookSignature(
      rawPayload,
      signature,
      webhookSecret
    );

    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
    const eventId = providerEventId || `${data?.event}:${data?.id || data?.payload?.payment?.entity?.id || signature}`;
    const eventType = data?.event || 'payment.captured';
    return this.paymentsService.handleWebhook('RAZORPAY', eventId, eventType, data, signature);
  }
}
