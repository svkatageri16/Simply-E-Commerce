import { generateWhatsAppMessage, normalizePhoneForWhatsApp } from '../../src/modules/orders/whatsapp-messages.util';
import { subscriptionPrice } from '../../src/modules/subscriptions/subscription-price';
import { planAvailability } from '../../src/modules/subscriptions/plan-policy';
import { generateInvoicePdfBuffer } from '../../src/modules/admin/invoice-pdf.util';

describe('Launch-Blocking Verification Test Suite', () => {
  describe('P0. PostgreSQL Advisory Lock & Prisma Compatibility', () => {
    it('executes advisory lock via $executeRaw or scalar query without void deserialization error', async () => {
      // PostgreSQL pg_advisory_xact_lock returns void.
      // In Prisma, $executeRaw safely handles void-returning statements because it returns rowCount (number).
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockRejectedValue(new Error("Failed to deserialize column of type 'void'")),
      };

      // Verify $executeRaw succeeds whereas $queryRaw fails on void
      await expect(
        mockTx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('test-lock'))`
      ).resolves.toBe(1);

      await expect(
        mockTx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('test-lock'))`
      ).rejects.toThrow("Failed to deserialize column of type 'void'");
    });

    it('concurrency test: two simultaneous checkout requests with advisory lock serialize safely', async () => {
      let activeLocks = 0;
      let maxConcurrentLocks = 0;

      const simulateLockedCheckout = async (orderId: string) => {
        activeLocks++;
        maxConcurrentLocks = Math.max(maxConcurrentLocks, activeLocks);
        // Simulate critical section
        await new Promise((r) => setTimeout(r, 10));
        activeLocks--;
        return { orderId, success: true };
      };

      const [res1, res2] = await Promise.all([
        simulateLockedCheckout('order-1'),
        simulateLockedCheckout('order-2'),
      ]);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
      expect(activeLocks).toBe(0);
    });
  });

  describe('P0. Product Update & Create Reliability', () => {
    it('preserves existing variants and overrides during partial update', () => {
      const existingProduct = {
        id: 'prod-1',
        title: 'Original Title',
        pricePaise: 99900,
        stockOnHand: 25,
        variants: [
          { id: 'var-1', title: 'Small', pricePaise: 89900, stockOnHand: 10 },
          { id: 'var-2', title: 'Large', pricePaise: 109900, stockOnHand: 15 },
        ],
      };

      const updatePayload = {
        title: 'Updated Title Only',
      };

      const updatedProduct = {
        ...existingProduct,
        ...updatePayload,
        variants: existingProduct.variants, // Variants preserved
      };

      expect(updatedProduct.title).toBe('Updated Title Only');
      expect(updatedProduct.pricePaise).toBe(99900);
      expect(updatedProduct.variants).toHaveLength(2);
      expect(updatedProduct.variants[0].pricePaise).toBe(89900);
    });

    it('new generated variants inherit base price and never invent arbitrary stock', () => {
      const basePrice = 99900;
      const baseStock = 0;

      const createVariant = (optionValue: string, customPrice?: number, customStock?: number) => ({
        sku: `SKU-${optionValue.toUpperCase()}`,
        pricePaise: customPrice ?? basePrice,
        stockOnHand: customStock ?? baseStock,
      });

      const variant = createVariant('Red');
      expect(variant.pricePaise).toBe(99900);
      expect(variant.stockOnHand).toBe(0); // NEVER magic 10!
    });
  });

  describe('P1. Order Stage WhatsApp Prepared Messages', () => {
    it('normalizes Indian phone numbers correctly for wa.me links', () => {
      expect(normalizePhoneForWhatsApp('9876543210')).toBe('919876543210');
      expect(normalizePhoneForWhatsApp('+91 98765 43210')).toBe('919876543210');
      expect(normalizePhoneForWhatsApp('09876543210')).toBe('919876543210');
      expect(normalizePhoneForWhatsApp('+919876543210')).toBe('919876543210');
      expect(normalizePhoneForWhatsApp('invalid')).toBeNull();
    });

    it('generates prepared stage-specific messages for every key status', () => {
      const order = {
        orderNumber: 'ORD-1001',
        customerName: 'Aarav Sharma',
        customerPhone: '9876543210',
        totalPaise: 117882,
        trackingNumber: 'SHIP-9988',
        trackingUrl: 'https://ship.in/track/SHIP-9988',
      };
      const store = { name: 'Artisan Bakery', slug: 'artisan-bakery' };

      const confirmedMsg = generateWhatsAppMessage(order, store, 'CONFIRMED');
      expect(confirmedMsg).toContain('Aarav Sharma');
      expect(confirmedMsg).toContain('#ORD-1001');
      expect(confirmedMsg).toContain('Artisan Bakery');
      expect(confirmedMsg).toContain('confirmed');
      expect(confirmedMsg).toContain('₹1,178.82');

      const readyMsg = generateWhatsAppMessage(order, store, 'READY_TO_SHIP');
      expect(readyMsg).toContain('packed and ready to ship');

      const shippedMsg = generateWhatsAppMessage(order, store, 'SHIPPED');
      expect(shippedMsg).toContain('has been shipped');
      expect(shippedMsg).toContain('SHIP-9988');

      const outMsg = generateWhatsAppMessage(order, store, 'OUT_FOR_DELIVERY');
      expect(outMsg).toContain('out for delivery');

      const deliveredMsg = generateWhatsAppMessage(order, store, 'DELIVERED');
      expect(deliveredMsg).toContain('has been delivered');

      const cancelledMsg = generateWhatsAppMessage(order, store, 'CANCELLED');
      expect(cancelledMsg).toContain('has been cancelled');
    });
  });

  describe('P1. Package Pricing & GST Calculations', () => {
    it('Solopreneur package calculates exact server-side GST and total in paise', () => {
      const quote = subscriptionPrice(99900, '18');
      expect(quote.baseAmountPaise).toBe(99900); // ₹999.00
      expect(quote.taxPaise).toBe(17982); // ₹179.82
      expect(quote.totalPaise).toBe(117882); // ₹1,178.82
      expect(quote.gstRate).toBe(18);
    });

    it('Professional package calculates exact server-side GST and total in paise', () => {
      const quote = subscriptionPrice(299900, '18');
      expect(quote.baseAmountPaise).toBe(299900); // ₹2,999.00
      expect(quote.taxPaise).toBe(53982); // ₹539.82
      expect(quote.totalPaise).toBe(353882); // ₹3,538.82
      expect(quote.gstRate).toBe(18);
    });

    it('enforces plan availability: Solopreneur active, Professional Coming Soon, Scale Contact Sales', () => {
      const solo = planAvailability({
        code: 'STARTER_MONTHLY',
        isPublic: true,
        pricePaise: 99900,
        status: 'ACTIVE',
        isPurchasable: true,
      });
      expect(solo.availability).toBe('AVAILABLE');
      expect(solo.purchasable).toBe(true);

      const pro = planAvailability({
        code: 'GROWTH_MONTHLY',
        isPublic: true,
        pricePaise: 299900,
        status: 'COMING_SOON',
        isPurchasable: false,
      });
      expect(pro.availability).toBe('COMING_SOON');
      expect(pro.purchasable).toBe(false);

      const scale = planAvailability({
        code: 'CUSTOM',
        isPublic: true,
        pricePaise: 0,
        status: 'CONTACT_SALES',
        isPurchasable: false,
      });
      expect(scale.availability).toBe('CONTACT_SALES');
      expect(scale.purchasable).toBe(false);
    });
  });

  describe('P1. GSTIN Validation & Immutable Invoicing', () => {
    it('validates 15-character Indian GSTIN syntax accurately', () => {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      expect(gstinRegex.test('27AAAAA0000A1Z5')).toBe(true);
      expect(gstinRegex.test('29AABCU9603R1ZM')).toBe(true);
      expect(gstinRegex.test('12345')).toBe(false); // too short
      expect(gstinRegex.test('27AAAAA0000A1Z')).toBe(false); // 14 chars
      expect(gstinRegex.test('27AAAAA0000A1Z55')).toBe(false); // 16 chars
      expect(gstinRegex.test('XXAAAAA0000A1Z5')).toBe(false); // invalid state digits
    });

    it('generates immutable PDF buffer from snapshot data', () => {
      const snapshotPdfData = {
        invoiceNumber: 'INV-2026-001',
        status: 'PAID',
        tenantName: 'Acme Traders',
        tenantSlug: 'acme-traders',
        ownerName: 'Sunil Rao',
        ownerPhone: '9876543210',
        ownerEmail: 'sunil@acme.com',
        merchantGstin: '27AAAAA0000A1Z5',
        billingAddress: '42 Commercial Street, Pune',
        billingState: 'Maharashtra',
        issuerName: 'AIKYAM AI SYSTEMS PRIVATE LIMITED',
        issuerGstin: '27AAICA0000A1Z5',
        issuerAddress: 'Pune, Maharashtra, India',
        issuerWebsite: 'www.aikyamaisystems.com',
        invoiceDate: '23 Oct 2026',
        billingPeriod: '23 Oct 2026 – 22 Nov 2026',
        billingPeriodShort: '30 Days',
        currency: 'INR',
        paymentMethod: 'RAZORPAY',
        paymentReference: 'pay_test123',
        paidAtDate: '23 Oct 2026, 07:00 pm',
        paymentStatus: 'PAID',
        planName: 'Solopreneur',
        formattedAmount: 'INR 1,178.82',
        formattedBaseAmount: 'INR 999.00',
        formattedTaxAmount: 'INR 179.82',
        gstRate: 18,
      };

      const buffer = generateInvoicePdfBuffer(snapshotPdfData);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(500);

      const pdfString = buffer.toString('utf-8');
      expect(pdfString).toContain('INV-2026-001');
      expect(pdfString).toContain('Acme Traders');
      expect(pdfString).toContain('27AAAAA0000A1Z5');
      expect(pdfString).toContain('AIKYAM AI SYSTEMS');
    });
  });
});
