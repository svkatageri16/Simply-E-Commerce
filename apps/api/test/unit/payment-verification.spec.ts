import { RazorpayPaymentProvider } from '../../src/modules/payments/providers/razorpay-payment.provider';
import * as crypto from 'crypto';
import { subscriptionPrice } from '../../src/modules/subscriptions/subscription-price';

describe('Payment Verification & Gateways (Unit Tests)', () => {
  let razorpayProvider: RazorpayPaymentProvider;

  beforeEach(() => {
    razorpayProvider = new RazorpayPaymentProvider();
  });

  it('supports a configured GST rate with two decimal places without floating-point rejection', () => {
    expect(subscriptionPrice(99900, 16.65)).toMatchObject({ gstBasisPoints: 1665, taxPaise: 16633, totalPaise: 116533 });
    expect(() => subscriptionPrice(99900, 16.651)).toThrow();
  });

  it('fails closed on a live gateway outage and never fabricates a captured payment', async () => {
    const env = { mode: process.env.NODE_ENV, key: process.env.RAZORPAY_PLATFORM_KEY_ID, secret: process.env.RAZORPAY_PLATFORM_KEY_SECRET };
    const fetchMock = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('isolated network outage'));
    try {
      process.env.NODE_ENV = 'production';
      process.env.RAZORPAY_PLATFORM_KEY_ID = 'rzp_live_fixture';
      process.env.RAZORPAY_PLATFORM_KEY_SECRET = 'isolated-secret';
      await expect(razorpayProvider.getPayment('pay_fixture')).rejects.toThrow(/could not be confirmed/i);
      await expect(razorpayProvider.createPaymentOrder({ tenantId: 'tenant', storeId: 'store', amountPaise: 117882, currency: 'INR', purpose: 'PLATFORM_SUBSCRIPTION' as any })).rejects.toThrow(/network error/i);
    } finally {
      fetchMock.mockRestore();
      for (const [key, value] of Object.entries({ NODE_ENV: env.mode, RAZORPAY_PLATFORM_KEY_ID: env.key, RAZORPAY_PLATFORM_KEY_SECRET: env.secret })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });

  it('1. Correctly verifies authentic Razorpay HMAC-SHA256 signature', async () => {
    const merchantSecret = 'secret_key_store_aurelia_999';
    const orderId = 'order_998877';
    const paymentId = 'pay_11223344';

    // Signature formula: hmac_sha256(order_id + "|" + payment_id, secret)
    const validSignature = crypto
      .createHmac('sha256', merchantSecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = await razorpayProvider.verifyPayment({
      orderId: 'internal-order-1',
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      providerSignature: validSignature,
      merchantSecret,
    });

    expect(isValid).toBe(true);
  });

  it('2. Rejects forged or tampered payment signature', async () => {
    const merchantSecret = 'secret_key_store_aurelia_999';
    const orderId = 'order_998877';
    const paymentId = 'pay_11223344';

    const forgedSignature = 'forged_fake_signature_attempt_12345';

    const isValid = await razorpayProvider.verifyPayment({
      orderId: 'internal-order-1',
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      providerSignature: forgedSignature,
      merchantSecret,
    });

    expect(isValid).toBe(false);
  });

  it('3. Rejects payment verification when secret is mismatched', async () => {
    const wrongSecret = 'different_store_secret';
    const orderId = 'order_998877';
    const paymentId = 'pay_11223344';

    const signatureWithCorrectSecret = crypto
      .createHmac('sha256', 'actual_store_secret')
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = await razorpayProvider.verifyPayment({
      orderId: 'internal-order-1',
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      providerSignature: signatureWithCorrectSecret,
      merchantSecret: wrongSecret,
    });

    expect(isValid).toBe(false);
  });
});
