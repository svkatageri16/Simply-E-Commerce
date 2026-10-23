import { useDirectCheckout } from '../../../hooks/useDirectCheckout';
import { getPublicStoreUrl } from '@simply/types';
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  ShieldCheck, 
  CreditCard, 
  Truck, 
  MapPin, 
  Phone, 
  Mail, 
  User, 
  ArrowLeft, 
  CheckCircle,
  Lock,
  ArrowRight,
  Store as StoreIcon,
  ShoppingBag,
  ExternalLink,
  Tag,
  Sparkles,
  Info,
  Clock,
  Check
} from 'lucide-react';
import { useCart } from '../../../context/CartContext';
import { useToast } from '../../../components/ui/Toast';
import { ThemeWrapper } from '../../../components/ThemeWrapper';
import { StoreHeader } from '../../../components/StoreHeader';
import { StoreFooter } from '../../../components/StoreFooter';
import { SafeImage } from '../../../components/ui/SafeImage';
import { SearchableLocationSelect } from '../../../components/ui/SearchableLocationSelect';
import { 
  formatPaise, 
  INDIAN_STATES_AND_UTS, 
  getCitiesForIndianState,
  resolveVariantDisplayMedia,
  PAYMENT_GATEWAY_MIN_AMOUNT_PAISE,
  PAYMENT_GATEWAY_MIN_AMOUNT_RUPEES
} from '@simply/ui';
import { getSellerStorePreviewUrl } from '../../../utils/config';
import { useStorefrontI18n } from '@simply/i18n';

// Quick PIN code mapping for common Indian states & cities to assist buyers
const PINCODE_MAP: Record<string, { city: string; state: string }> = {
  '110001': { city: 'New Delhi', state: 'Delhi' },
  '400001': { city: 'Mumbai', state: 'Maharashtra' },
  '560001': { city: 'Bengaluru', state: 'Karnataka' },
  '600001': { city: 'Chennai', state: 'Tamil Nadu' },
  '700001': { city: 'Kolkata', state: 'West Bengal' },
  '500001': { city: 'Hyderabad', state: 'Telangana' },
  '380001': { city: 'Ahmedabad', state: 'Gujarat' },
  '411001': { city: 'Pune', state: 'Maharashtra' },
  '302001': { city: 'Jaipur', state: 'Rajasthan' },
  '226001': { city: 'Lucknow', state: 'Uttar Pradesh' },
  '682001': { city: 'Kochi', state: 'Kerala' },
  '462001': { city: 'Bhopal', state: 'Madhya Pradesh' },
};

function formatItemVariantLabel(item: any): string | null {
  if (item.variantTitle && item.variantTitle !== 'Default') {
    return item.variantTitle;
  }
  const variant = item.variant;
  if (!variant) return null;
  if (Array.isArray(variant.optionValues) && variant.optionValues.length > 0) {
    const sorted = [...variant.optionValues].sort((a: any, b: any) => {
      const sortA = a.optionValue?.option?.sortOrder ?? a.option?.sortOrder ?? 0;
      const sortB = b.optionValue?.option?.sortOrder ?? b.option?.sortOrder ?? 0;
      if (sortA !== sortB) return sortA - sortB;
      const nameA = a.optionValue?.option?.name || a.option?.name || '';
      const nameB = b.optionValue?.option?.name || b.option?.name || '';
      return nameA.localeCompare(nameB);
    });
    const values = sorted
      .map((ov: any) => ov.optionValue?.value || ov.value)
      .filter(Boolean);
    if (values.length > 0) {
      return values.join(' · ');
    }
  }
  if (variant.title && variant.title !== 'Default' && variant.title !== 'Standard') {
    return variant.title;
  }
  return null;
}

export default function StoreCheckoutPage() {
  const router = useRouter();
  const { slug, preview } = router.query;
  const isEmbedded = router.query.embedded === 'true';
  const toast = useToast();
  const { locale, t, initStoreLocales } = useStorefrontI18n();

  const persistent = useCart();
  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isPreviewMode = Boolean(storeData?.isPreview || preview === 'true');
  const directToken = typeof router.query.direct === 'string' ? router.query.direct : '';
  const direct = useDirectCheckout(directToken, storeData, preview ? String(preview) : undefined);
  const { setStoreId, setShippingSettings } = persistent;
  const { cart, guestToken, itemCount, subtotalPaise, api, clearCart, appliedCoupon, couponError,
    isCheckingCoupon, applyCoupon, removeCoupon, discountPaise, grandTotalPaise, shippingPaise,
    flatRatePaise, freeShippingThresholdPaise, freeDeliveryRemainingPaise, isFreeDeliveryQualified,
    orderNotes, setOrderNotes } = directToken ? direct : persistent;

  // Preview flow completion state
  const [previewCompleted, setPreviewCompleted] = useState(false);
  const [completedOrderSnapshot, setCompletedOrderSnapshot] = useState<any | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [fulfillmentType, setFulfillmentType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'RAZORPAY'>('COD');
  const [couponInput, setCouponInput] = useState('');
  const checkoutKeyRef = useRef<string>('');
  const checkoutStorageKey = `simply_checkout_key:${String(slug || '')}:${directToken || cart?.id || guestToken || ''}`;

  useEffect(() => {
    try {
      checkoutKeyRef.current = sessionStorage.getItem(checkoutStorageKey) || `chk_${crypto.randomUUID()}`;
      sessionStorage.setItem(checkoutStorageKey, checkoutKeyRef.current);
    } catch { checkoutKeyRef.current = `chk_${crypto.randomUUID()}`; }
  }, [checkoutStorageKey]);

  const handlePaymentMethodChange = (method: 'COD' | 'RAZORPAY') => {
    if (submitting) return;
    setPaymentMethod(method);
  };

  const taxableAmountPaise = Math.max(0, subtotalPaise - discountPaise);
  const taxPaise = Math.round(taxableAmountPaise * 0.05);
  const effectiveShippingPaise = fulfillmentType === 'PICKUP' ? 0 : shippingPaise;
  const calculatedGrandTotalPaise = Math.max(0, taxableAmountPaise + effectiveShippingPaise + taxPaise);

  const getLink = (path: string) => {
    const params = new URLSearchParams();
    if (preview === 'true' || storeData?.isPreview) params.set('preview', 'true');
    if (isEmbedded) params.set('embedded', 'true');
    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
  };

  useEffect(() => {
    if (!slug) return;
    loadStore();
  }, [slug, preview]);

  const loadStore = async () => {
    setLoading(true);
    try {
      const res = await api.stores.getPublicStorefront(String(slug), preview ? String(preview) : undefined);
      setStoreData(res);
      if (res.store && initStoreLocales) {
        initStoreLocales(res.store.storefrontDefaultLocale, res.store.enabledStorefrontLocales);
      }
      if (res.store?.id) {
        setStoreId(res.store.id);
      }
      if (res.store?.shippingSettings) {
        setShippingSettings(res.store.shippingSettings);
      }
      if (res.store?.fulfillmentMode === 'PICKUP') {
        setFulfillmentType('PICKUP');
      }
      if (res.store?.paymentSettings?.codEnabled === false) {
        setPaymentMethod('RAZORPAY');
      }
    } catch (err) {
      console.error('Failed to load store checkout', err);
      toast.error('Store Unavailable', 'Could not fetch store checkout details');
    } finally {
      setLoading(false);
    }
  };

  const handlePincodeChange = (val: string) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 6);
    setPostalCode(cleaned);

    // Auto fill city/state if in lookup map
    if (cleaned.length === 6 && PINCODE_MAP[cleaned]) {
      const info = PINCODE_MAP[cleaned];
      if (!state) setState(info.state);
      if (!city) setCity(info.city);
      toast.info('Auto-detected Location', `${info.city}, ${info.state}`);
    }
  };

  const handleStateChange = (selectedState: string) => {
    setState(selectedState);
    if (!selectedState) {
      setCity('');
      return;
    }
    const availableCities = getCitiesForIndianState(selectedState);
    if (city && !availableCities.some((c) => c.toLowerCase() === city.toLowerCase())) {
      setCity('');
    }
  };

  const handleApplyCoupon = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const cleanCode = couponInput.trim();
    if (!cleanCode) return;
    const ok = await applyCoupon(cleanCode);
    if (ok) {
      toast.success('Coupon Applied!', `You saved with ${cleanCode.toUpperCase()}`);
      setCouponInput('');
    } else {
      toast.error('Invalid Coupon', couponError || 'This promo code could not be applied');
    }
  };

  const handleRemoveCoupon = () => {
    removeCoupon();
    toast.info('Coupon Removed', 'Standard pricing restored');
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    const items = cart?.items || [];
    if (items.length === 0) {
      toast.warning('Empty Cart', 'Please add products before checking out.');
      return;
    }

    if (!name.trim()) {
      toast.error('Missing Name', 'Please enter your full name for order delivery.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      toast.error('Invalid Mobile Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setEmailError('Please enter a valid email address (e.g. name@example.com)');
      toast.error('Valid Email Required', 'Please enter a valid email address for order confirmation and tracking.');
      return;
    }
    setEmailError(null);

    if (fulfillmentType === 'DELIVERY') {
      if (!state.trim()) {
        toast.error('Missing State', 'Please select your state.');
        return;
      }
      if (!city.trim()) {
        toast.error('Missing City', 'Please select your city.');
        return;
      }
      const cleanPincode = postalCode.replace(/\D/g, '');
      if (cleanPincode.length !== 6) {
        toast.error('Invalid PIN Code', 'Please enter a valid 6-digit PIN code.');
        return;
      }
      if (!addressLine1.trim()) {
        toast.error('Missing Address', 'Please enter your street / building address.');
        return;
      }
    }

    if (paymentMethod === 'RAZORPAY' && calculatedGrandTotalPaise > 0 && calculatedGrandTotalPaise < PAYMENT_GATEWAY_MIN_AMOUNT_PAISE) {
      if (storeData?.store?.paymentSettings?.codEnabled !== false) {
        toast.warning(
          'Online Payment Minimum',
          `Online payment is available for orders of ₹${PAYMENT_GATEWAY_MIN_AMOUNT_RUPEES} or more. Switched to Cash on Delivery.`
        );
        setPaymentMethod('COD');
        return;
      } else {
        toast.error(
          'Order Below Minimum',
          `Online payment requires a minimum order of ₹${PAYMENT_GATEWAY_MIN_AMOUNT_RUPEES}. Please add items to your cart.`
        );
        return;
      }
    }

    // ------------------------------------------------------------------------
    // MERCHANT PREVIEW MODE: ZERO COMMERCE MUTATION SIMULATION
    // ------------------------------------------------------------------------
    if (isPreviewMode) {
      setSubmitting(true);
      setTimeout(() => {
        const orderSnapshot = {
          previewOrderNumber: `PREV-${Math.floor(100000 + Math.random() * 900000)}`,
          customerName: name.trim(),
          customerPhone: cleanPhone,
          customerEmail: email.trim() || null,
          fulfillmentType,
          shippingAddress: fulfillmentType === 'DELIVERY' ? {
            addressLine1: addressLine1.trim(),
            addressLine2: addressLine2.trim() || null,
            landmark: addressLine2.trim() || null,
            city: city.trim(),
            state: state.trim(),
            postalCode: postalCode.trim(),
            country: 'India',
          } : null,
          pickupStoreAddress: storeData?.store?.businessAddress || 'Store Location',
          paymentMethod,
          items: items.map((it: any) => {
            const mediaUrl = resolveVariantDisplayMedia({
              itemImageUrl: it.imageUrl,
              variant: it.variant,
              productMedia: it.variant?.product?.media,
              selectedOptionValues: it.variant?.optionValues,
            });
            return {
              id: it.id,
              title: it.variant?.product?.title || it.variant?.title || 'Item',
              variantTitle: formatItemVariantLabel(it),
              sku: it.sku || it.variant?.sku,
              imageUrl: mediaUrl,
              quantity: it.quantity,
              pricePaise: it.variant?.pricePaise || 0,
              lineTotalPaise: (it.variant?.pricePaise || 0) * it.quantity,
            };
          }),
          subtotalPaise,
          discountPaise,
          totalPaise: calculatedGrandTotalPaise,
          couponCode: appliedCoupon?.code,
          notes: orderNotes,
        };

        setCompletedOrderSnapshot(orderSnapshot);
        setPreviewCompleted(true);
        clearCart();
        setSubmitting(false);
        toast.success('Preview Order Placed', 'Simulation completed successfully.');
      }, 500);
      return;
    }

    // ------------------------------------------------------------------------
    // REAL BUYER GUEST CHECKOUT
    // ------------------------------------------------------------------------
    setSubmitting(true);
    try {
      const payload = {
        storeId: storeData.store.id,
        checkoutKey: checkoutKeyRef.current || undefined,
        ...(directToken ? { directItems: direct.selection ? [{ productId: direct.selection.productId, variantId: direct.selection.variantId, quantity: direct.selection.quantity }] : [] } : { cartId: cart.id }),
        fullName: name.trim(),
        phone: cleanPhone,
        email: cleanEmail,
        deliveryAddress: fulfillmentType === 'DELIVERY' ? {
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim() || undefined,
          landmark: addressLine2.trim() || undefined,
          city: city.trim(),
          state: state.trim(),
          pincode: postalCode.trim(),
          country: 'India',
        } : undefined,
        paymentMethod,
        notes: orderNotes.trim() || undefined,
        couponCode: appliedCoupon?.code || undefined,
        discountPaise: discountPaise > 0 ? discountPaise : undefined,
        fulfillmentMode: fulfillmentType,
      };

      const orderResult = await api.orders.checkout(payload);

      if (paymentMethod === 'RAZORPAY') {
        const paymentOrder = await api.payments.createOrder(orderResult.id);

        const sdkReady = await new Promise((resolve) => {
          if (typeof window === 'undefined') return resolve(false);
          if ((window as any).Razorpay) return resolve(true);
          const script = document.createElement('script');
          const timeout = window.setTimeout(() => resolve(false), 15000);
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.async = true;
          script.onload = () => { window.clearTimeout(timeout); resolve(Boolean((window as any).Razorpay)); };
          script.onerror = () => { window.clearTimeout(timeout); resolve(false); };
          document.body.appendChild(script);
        });

        if (!sdkReady) {
          toast.error('Payment Error', 'Razorpay payment gateway failed to load. Please try COD.');
          setSubmitting(false);
          return;
        }

        const options = {
          key: paymentOrder.keyId,
          amount: paymentOrder.amountPaise,
          currency: paymentOrder.currency || 'INR',
          name: storeData.store.name,
          description: `Order ${orderResult.orderNumber}`,
          order_id: paymentOrder.providerOrderId,
          prefill: { name: name.trim(), email: cleanEmail, contact: cleanPhone },
          theme: { color: '#0f172a' },
          modal: {
            ondismiss: function () {
              setSubmitting(false);
              toast.info('Payment Not Completed', 'Online payment was closed. You can retry or switch to Cash on Delivery.');
            },
          },
          handler: async function (response: any) {
            try {
              await api.payments.verify({
                paymentOrderId: paymentOrder.paymentOrderId,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              });
              clearCart();
              try { sessionStorage.removeItem(checkoutStorageKey); } catch {}
              toast.success('Order Placed Successfully!', `Order #${orderResult.orderNumber}`);
              const tokenParam = orderResult.trackingToken ? `?t=${orderResult.trackingToken}` : '';
              router.push(`/store/${slug}/order/${orderResult.orderNumber}${tokenParam}`);
            } catch (err: any) {
              setSubmitting(false);
              toast.error('Payment Verification Failed', err?.message || 'Contact store support if money was debited.');
            }
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on('payment.failed', function (errResp: any) {
          toast.error('Payment Cancelled', errResp.error?.description || 'Payment was not completed. You can try again or switch to Cash on Delivery.');
          setSubmitting(false);
        });
        rzp.open();
      } else {
        // COD Success
        clearCart();
        try { sessionStorage.removeItem(checkoutStorageKey); } catch {}
        toast.success('Order Placed!', `Your order #${orderResult.orderNumber} is confirmed.`);
        const tokenParam = orderResult.trackingToken ? `?t=${orderResult.trackingToken}` : '';
        router.push(`/store/${slug}/order/${orderResult.orderNumber}${tokenParam}`);
      }
    } catch (err: any) {
      console.error('Checkout error', err);
      toast.error('Order Failed', err.message || 'Failed to place order. Please check details.');
      setSubmitting(false);
    }
  };

  if (loading || !storeData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--store-surface)] store-surface">
        <div className="w-8 h-8 border-4 border-[var(--store-border)] border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  const { store, themeConfig } = storeData;
  const items = cart?.items || [];
  const supportsPickup = store.fulfillmentMode === 'PICKUP' || store.fulfillmentMode === 'DELIVERY_AND_PICKUP';
  const supportsDelivery = store.fulfillmentMode === 'DELIVERY' || store.fulfillmentMode === 'DELIVERY_AND_PICKUP';

  return (
    <ThemeWrapper themeConfig={themeConfig} branding={themeConfig?.branding}>
      <Head>
        <title>{previewCompleted ? 'Order Confirmed' : 'Secure Checkout'} | {store.name}</title>
      </Head>

      {/* Merchant Preview Top Banner */}
      {isPreviewMode && !isEmbedded && (
        <div className="bg-[var(--store-button-bg)] store-inverse text-white text-xs py-2 px-4 flex items-center justify-between sticky top-0 z-50 shadow">
          <div className="flex items-center gap-2">
            <span className="font-bold text-amber-400">Merchant Preview</span>
            <span className="text-[var(--store-text-secondary)]">You are experiencing the exact buyer checkout flow.</span>
          </div>
          <a
            href={getSellerStorePreviewUrl()}
            className="bg-white/10 hover:bg-white/20 px-3 py-1 rounded text-[11px] font-medium transition"
          >
            Exit Preview
          </a>
        </div>
      )}

      <StoreHeader store={store} themeConfig={themeConfig} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* PREVIEW COMPLETED CONFIRMATION VIEW */}
        {previewCompleted && completedOrderSnapshot ? (
          <div className="max-w-2xl mx-auto space-y-6 py-6 animate-fadeIn">
            <div className="bg-[var(--store-surface)] store-surface p-8 rounded-2xl border border-emerald-200 shadow-sm text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-9 h-9" />
              </div>
              <div>
                <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-2">
                  Preview Mode
                </span>
                <h1 className="text-2xl font-bold text-[var(--store-text-primary)]">
                  Customer checkout preview complete
                </h1>
                <p className="text-sm text-[var(--store-text-secondary)] mt-2 max-w-md mx-auto">
                  This simulated checkout confirmed all buyer flows. No real order was created and inventory remained untouched.
                </p>
              </div>

              {/* Simulated Order Snapshot */}
              <div className="bg-[var(--store-surface)] store-surface border border-[var(--store-border)] rounded-xl p-4 text-left space-y-3 text-xs">
                <div className="flex justify-between items-center border-b border-[var(--store-border)] pb-2">
                  <span className="text-[var(--store-text-secondary)]">Preview Order ID:</span>
                  <span className="font-mono font-bold text-[var(--store-text-primary)]">{completedOrderSnapshot.previewOrderNumber}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--store-text-secondary)]">Customer:</span>
                  <span className="font-medium text-[var(--store-text-primary)]">{completedOrderSnapshot.customerName} (+91 {completedOrderSnapshot.customerPhone})</span>
                </div>
                {completedOrderSnapshot.couponCode && (
                  <div className="flex justify-between items-center text-emerald-700 font-semibold">
                    <span>Applied Coupon:</span>
                    <span>{completedOrderSnapshot.couponCode} (-{formatPaise(completedOrderSnapshot.discountPaise || 0)})</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-[var(--store-text-secondary)]">Fulfillment:</span>
                  <span className="font-medium text-[var(--store-text-primary)]">
                    {completedOrderSnapshot.fulfillmentType === 'DELIVERY' 
                      ? `Home Delivery to ${completedOrderSnapshot.shippingAddress?.city}, ${completedOrderSnapshot.shippingAddress?.postalCode}`
                      : `Store Pickup (${store.name})`
                    }
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--store-text-secondary)]">Payment:</span>
                  <span className="font-medium text-[var(--store-text-primary)]">
                    {completedOrderSnapshot.paymentMethod === 'COD' ? 'Cash on Delivery (Doorstep)' : 'Online Payment (Simulated)'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-[var(--store-border)] font-bold text-sm text-[var(--store-text-primary)]">
                  <span>Simulated Total:</span>
                  <span className="font-mono text-emerald-700">{formatPaise(completedOrderSnapshot.totalPaise)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href={getLink(getPublicStoreUrl(String(slug)))}
                  data-theme-btn="true"
                  className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-[var(--store-button-bg)] store-inverse text-white hover:bg-[var(--store-button-bg)] store-inverse transition flex items-center justify-center gap-1.5"
                >
                  <ShoppingBag className="w-4 h-4" /> Back to Store
                </Link>
                <a
                  href={getSellerStorePreviewUrl()}
                  data-theme-btn="true"
                  className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-[var(--store-surface)] store-surface text-[var(--store-text-primary)] hover:bg-[var(--store-surface)] store-surface transition flex items-center justify-center gap-1.5"
                >
                  Exit Preview
                </a>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-2 text-xs text-[var(--store-text-secondary)]">
              <Link href={getLink(`/store/${slug}/cart`)} className="hover:text-[var(--store-text-primary)] flex items-center gap-1 transition">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Cart
              </Link>
              <span>/</span>
              <span className="font-semibold text-[var(--store-text-primary)]">
                {isPreviewMode ? 'Preview Checkout' : 'Express Guest Checkout'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[var(--store-text-primary)] tracking-tight">
                  {isPreviewMode ? 'Store Checkout Preview' : t('storefront.checkout')}
                </h1>
                <p className="text-xs text-[var(--store-text-secondary)] mt-0.5">
                  Fast, encrypted checkout without mandatory password creation.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" /> 256-Bit SSL Encrypted
                </span>
              </div>
            </div>

            <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* LEFT: Checkout Form Steps */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* STEP 1: Contact Information */}
                <div className="bg-[var(--store-surface)] store-surface p-6 rounded-2xl border border-[var(--store-border)] shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[var(--store-text-primary)] uppercase tracking-wider flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[var(--store-button-bg)] store-inverse text-white flex items-center justify-center text-xs">1</span>
                      {t('checkout.contactInfo')}
                    </h2>
                    <span className="text-[11px] text-[var(--store-text-secondary)] font-medium">OTP-free guest flow</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--store-text-primary)] mb-1">
                        {t('checkout.fullName')} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-[var(--store-text-secondary)] absolute left-3 top-2.5" />
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. Anand Sharma"
                          className="w-full pl-9 pr-3 py-2 border border-[var(--store-border)] rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 font-medium"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--store-text-primary)] mb-1">
                        {t('checkout.phone')} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-mono text-[var(--store-text-secondary)] font-bold">+91</span>
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="9876543210"
                          maxLength={10}
                          className="w-full pl-11 pr-3 py-2 border border-[var(--store-border)] rounded-lg text-xs font-mono focus:ring-2 focus:ring-emerald-500 font-medium"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-[var(--store-text-primary)] mb-1">
                        {t('checkout.email')} <span className="text-red-500 font-bold">*</span>{' '}
                        <span className="text-[var(--store-text-secondary)] text-[11px] font-normal">
                          (Required for order confirmation & tracking)
                        </span>
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-[var(--store-text-secondary)] absolute left-3 top-2.5" />
                        <input
                          type="email"
                          required
                          data-testid="checkout-email-input"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (emailError) setEmailError(null);
                          }}
                          onBlur={() => {
                            const trimmed = email.trim().toLowerCase();
                            if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
                              setEmailError('Please enter a valid email address (e.g. name@example.com).');
                            } else {
                              setEmailError(null);
                            }
                          }}
                          placeholder="anand@example.com"
                          className={`w-full pl-9 pr-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 font-medium ${
                            emailError ? 'border-red-500 bg-red-50/10' : 'border-[var(--store-border)]'
                          }`}
                        />
                      </div>
                      {emailError && (
                        <p className="text-[11px] text-red-600 mt-1 font-medium">{emailError}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* STEP 2: Fulfillment & Address */}
                <div className="bg-[var(--store-surface)] store-surface p-6 rounded-2xl border border-[var(--store-border)] shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[var(--store-text-primary)] uppercase tracking-wider flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[var(--store-button-bg)] store-inverse text-white flex items-center justify-center text-xs">2</span>
                      {t('checkout.delivery')}
                    </h2>

                    {supportsPickup && supportsDelivery && (
                      <div className="flex p-0.5 bg-[var(--store-surface)] store-surface rounded-xl text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setFulfillmentType('DELIVERY')}
                          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                            fulfillmentType === 'DELIVERY' ? 'bg-[var(--store-surface)] store-surface shadow-sm text-[var(--store-text-primary)] font-bold' : 'text-[var(--store-text-secondary)] hover:text-[var(--store-text-primary)]'
                          }`}
                        >
                          <Truck className="w-3.5 h-3.5" /> Home Delivery
                        </button>
                        <button
                          type="button"
                          onClick={() => setFulfillmentType('PICKUP')}
                          className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
                            fulfillmentType === 'PICKUP' ? 'bg-[var(--store-surface)] store-surface shadow-sm text-[var(--store-text-primary)] font-bold' : 'text-[var(--store-text-secondary)] hover:text-[var(--store-text-primary)]'
                          }`}
                        >
                          <StoreIcon className="w-3.5 h-3.5" /> Store Pickup
                        </button>
                      </div>
                    )}
                  </div>

                  {fulfillmentType === 'PICKUP' ? (
                    <div className="p-4 bg-[var(--store-surface)] store-surface border border-emerald-200 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                        <StoreIcon className="w-4 h-4 text-emerald-700" /> Store Pickup Location
                      </div>
                      <p className="text-xs text-[var(--store-text-primary)] font-bold">
                        {store.name}
                      </p>
                      <p className="text-xs text-[var(--store-text-secondary)]">
                        {store.businessAddress || 'Address will be provided upon pickup confirmation'}
                      </p>
                      {store.contactPhone && (
                        <p className="text-xs text-[var(--store-text-secondary)]">
                          Direct Contact: +91 {store.contactPhone}
                        </p>
                      )}
                      <div className="pt-2 flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                        <Check className="w-3.5 h-3.5" /> Zero delivery fee • Collect your ready package directly from the store counter.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Country & State Selection */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-[var(--store-text-primary)] mb-1">
                            Country
                          </label>
                          <div className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--store-surface)] store-surface border border-[var(--store-border)] text-[var(--store-text-primary)] flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <span>🇮🇳</span> India
                            </span>
                            <span className="text-[10px] text-[var(--store-text-secondary)] font-normal">Preselected</span>
                          </div>
                        </div>

                        {/* Searchable State Dropdown */}
                        <div>
                          <SearchableLocationSelect
                            label="State / Union Territory"
                            required
                            value={state}
                            onChange={handleStateChange}
                            options={INDIAN_STATES_AND_UTS}
                            placeholder="Select State"
                          />
                        </div>
                      </div>

                      {/* City & PIN Code Selection */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Searchable City Dropdown (Dependent on State) */}
                        <div>
                          <SearchableLocationSelect
                            label="City / District"
                            required
                            value={city}
                            onChange={setCity}
                            options={state ? getCitiesForIndianState(state) : []}
                            placeholder="Select City"
                            disabled={!state}
                            disabledPlaceholder="Select State first"
                            helperText={state ? undefined : 'Please select a state to view cities'}
                          />
                        </div>

                        {/* PIN Code */}
                        <div>
                          <label className="block text-xs font-semibold text-[var(--store-text-primary)] mb-1">
                            PIN Code <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={6}
                            value={postalCode}
                            onChange={(e) => handlePincodeChange(e.target.value)}
                            placeholder="e.g. 413001"
                            className="w-full px-3 py-2 border border-[var(--store-border)] rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-emerald-500 text-[var(--store-text-primary)]"
                          />
                          <p className="text-[10px] text-[var(--store-text-secondary)] mt-1">6-digit Indian Postal Code</p>
                        </div>
                      </div>

                      {/* Address Line 1 */}
                      <div>
                        <label className="block text-xs font-semibold text-[var(--store-text-primary)] mb-1">
                          Address Line 1 (Flat, House No., Building, Street) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={addressLine1}
                          onChange={(e) => setAddressLine1(e.target.value)}
                          placeholder="e.g. Flat 402, Lotus Residency, 5th Cross Road"
                          className="w-full px-3 py-2 border border-[var(--store-border)] rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 font-medium"
                        />
                      </div>

                      {/* Address Line 2 / Landmark */}
                      <div>
                        <label className="block text-xs font-semibold text-[var(--store-text-primary)] mb-1">
                          Address Line 2 / Landmark <span className="text-[var(--store-text-secondary)] text-[11px] font-normal">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          value={addressLine2}
                          onChange={(e) => setAddressLine2(e.target.value)}
                          placeholder="e.g. Near HDFC Bank / Behind Metro Station"
                          className="w-full px-3 py-2 border border-[var(--store-border)] rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      {/* Delivery Instructions */}
                      <div>
                        <label className="block text-xs font-semibold text-[var(--store-text-primary)] mb-1">
                          Delivery Instructions / Special Notes
                        </label>
                        <input
                          type="text"
                          value={orderNotes}
                          onChange={(e) => setOrderNotes(e.target.value)}
                          placeholder="e.g. Please ring doorbell twice, leave at reception, or gate code 1234"
                          className="w-full px-3 py-2 border border-[var(--store-border)] rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* STEP 3: Payment Method */}
                <div className="bg-[var(--store-surface)] store-surface p-6 rounded-2xl border border-[var(--store-border)] shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[var(--store-text-primary)] uppercase tracking-wider flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[var(--store-button-bg)] store-inverse text-white flex items-center justify-center text-xs">3</span>
                      {t('checkout.paymentMethod')}
                    </h2>
                    <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Verified Secure
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Cash on Delivery (only rendered if enabled by store) */}
                    {storeData?.store?.paymentSettings?.codEnabled !== false && (
                      <label
                        onClick={() => handlePaymentMethodChange('COD')}
                        className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                          paymentMethod === 'COD'
                            ? 'border-emerald-600 bg-[var(--store-surface)] store-surface ring-2 ring-emerald-500/20'
                            : 'border-[var(--store-border)] hover:border-[var(--store-border)]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="paymentMethod"
                            checked={paymentMethod === 'COD'}
                            onChange={() => handlePaymentMethodChange('COD')}
                            className="text-emerald-600 focus:ring-emerald-600 h-4 w-4"
                          />
                          <div>
                            <p className="text-xs font-bold text-[var(--store-text-primary)] flex items-center gap-1.5">
                              {t('checkout.cod')}
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                Most Popular
                              </span>
                            </p>
                            <p className="text-[11px] text-[var(--store-text-secondary)] mt-0.5">
                              Pay in cash directly upon package delivery at your doorstep or store collection.
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-[var(--store-text-primary)] bg-[var(--store-surface)] store-surface px-2 py-1 rounded">
                          Pay on Delivery
                        </span>
                      </label>
                    )}

                    <label
                      onClick={() => handlePaymentMethodChange('RAZORPAY')}
                      className={`p-4 rounded-xl border flex flex-col gap-2 cursor-pointer transition ${
                        paymentMethod === 'RAZORPAY'
                          ? 'border-emerald-600 bg-[var(--store-surface)] store-surface ring-2 ring-emerald-500/20'
                          : 'border-[var(--store-border)] hover:border-[var(--store-border)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="paymentMethod"
                            checked={paymentMethod === 'RAZORPAY'}
                            onChange={() => handlePaymentMethodChange('RAZORPAY')}
                            className="text-emerald-600 focus:ring-emerald-600 h-4 w-4"
                          />
                          <div>
                            <p className="text-xs font-bold text-[var(--store-text-primary)] flex items-center gap-1.5">
                              {t('checkout.online')}
                              {isPreviewMode && (
                                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                  Preview Mode Simulation
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-[var(--store-text-secondary)] mt-0.5">
                              {isPreviewMode 
                                ? 'Preview simulation — tested safely without real live credit deductions.'
                                : 'Instant digital checkout via UPI (Google Pay, PhonePe, Paytm), Debit/Credit Cards & Netbanking.'
                              }
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-1 rounded">
                          Instant Confirmed
                        </span>
                      </div>
                      {calculatedGrandTotalPaise > 0 && calculatedGrandTotalPaise < PAYMENT_GATEWAY_MIN_AMOUNT_PAISE && (
                        <div className="mt-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-2">
                          <Info className="w-4 h-4 flex-shrink-0 text-amber-600" />
                          <span>
                            Online payment requires an order of at least ₹{PAYMENT_GATEWAY_MIN_AMOUNT_RUPEES}.00. You can select Cash on Delivery or add items to your cart.
                          </span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              {/* RIGHT: Order Summary Sidebar */}
              <div className="lg:col-span-4 bg-[var(--store-surface)] store-surface border border-[var(--store-border)] rounded-2xl p-6 shadow-sm space-y-6 sticky top-24">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[var(--store-text-primary)]">
                    Order Summary
                  </h2>
                  <span className="text-xs text-[var(--store-text-secondary)] font-mono">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </span>
                </div>

                {/* Items list */}
                {items.length === 0 ? (
                  <div className="py-6 text-center space-y-2">
                    <p className="text-xs text-[var(--store-text-secondary)]">Your cart is empty.</p>
                    <Link
                      href={getLink(getPublicStoreUrl(String(slug)))}
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Browse Store Catalog
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1 divide-y divide-gray-100">
                    {items.map((item: any) => {
                      const title = item.productName || item.variant?.product?.name || item.variant?.product?.title || item.variant?.title || 'Product';
                      const variantLabel = formatItemVariantLabel(item);
                      const sku = item.sku || item.variant?.sku;
                      const unitPrice = item.unitPricePaise || item.variant?.pricePaise || 0;
                      const lineTotal = unitPrice * (item.quantity || 1);
                      const img = resolveVariantDisplayMedia({
                        itemImageUrl: item.imageUrl,
                        variant: item.variant,
                        productMedia: item.variant?.product?.media,
                        selectedOptionValues: item.variant?.optionValues,
                      });

                      return (
                        <div key={item.id} className="pt-3 first:pt-0 flex items-start justify-between text-xs gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            {img && (
                              <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--store-surface)] store-surface flex-shrink-0 border border-[var(--store-border)]">
                                <SafeImage src={img} alt={title} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div className="min-w-0 space-y-0.5">
                              <p className="font-semibold text-[var(--store-text-primary)] truncate">{title}</p>
                              {variantLabel && (
                                <p className="text-[11px] font-medium text-[var(--store-text-primary)] bg-[var(--store-surface)] store-surface px-1.5 py-0.5 rounded inline-block">
                                  {variantLabel}
                                </p>
                              )}
                              {sku && (
                                <p className="text-[10px] font-mono text-[var(--store-text-secondary)]">
                                  SKU: {sku}
                                </p>
                              )}
                              <p className="text-[11px] text-[var(--store-text-secondary)] font-mono">
                                Qty: {item.quantity} × {formatPaise(unitPrice)}
                              </p>
                            </div>
                          </div>
                          <div className="font-mono font-bold text-[var(--store-text-primary)] flex-shrink-0 pt-0.5">
                            {formatPaise(lineTotal)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Free Delivery Goal Tracker */}
                {fulfillmentType === 'DELIVERY' && freeShippingThresholdPaise && (
                  <div className={`p-3.5 rounded-xl border text-xs space-y-2 transition ${
                    isFreeDeliveryQualified
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50/80 border-amber-200 text-amber-900'
                  }`}>
                    <div className="flex items-center justify-between font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Truck className={`w-4 h-4 ${isFreeDeliveryQualified ? 'text-emerald-600' : 'text-amber-700'}`} />
                        {isFreeDeliveryQualified ? (
                          <span className="font-bold text-emerald-800">🎉 FREE Delivery Unlocked!</span>
                        ) : (
                          <span>Add <strong className="font-mono text-amber-950 font-bold">{formatPaise(freeDeliveryRemainingPaise)}</strong> more for FREE Delivery</span>
                        )}
                      </span>
                      <span className="text-[11px] font-mono opacity-75">
                        Goal: {formatPaise(freeShippingThresholdPaise)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-[var(--store-surface)] store-surface rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isFreeDeliveryQualified ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.round((subtotalPaise / freeShippingThresholdPaise) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Coupon Code Section */}
                <div className="pt-3 border-t border-[var(--store-border)] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--store-text-primary)] flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-emerald-600" /> Promo / Coupon Code
                    </span>
                  </div>

                  {appliedCoupon ? (
                    <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <div className="space-y-0.5">
                        <span className="text-xs font-mono font-bold text-emerald-800 tracking-wider">
                          {appliedCoupon.code}
                        </span>
                        <p className="text-[10px] text-emerald-700">
                          {appliedCoupon.label} (Saved {formatPaise(discountPaise)})
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleApplyCoupon();
                          }
                        }}
                        placeholder="Enter coupon code"
                        className="flex-1 px-3 py-1.5 border border-[var(--store-border)] rounded-lg text-xs font-mono uppercase focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleApplyCoupon()}
                        disabled={isCheckingCoupon || !couponInput.trim()}
                        className="px-3 py-1.5 bg-[var(--store-button-bg)] store-inverse text-white rounded-lg text-xs font-semibold hover:bg-[var(--store-button-bg)] store-inverse transition disabled:opacity-50"
                      >
                        {isCheckingCoupon ? 'Checking...' : 'Apply'}
                      </button>
                    </div>
                  )}
                  {couponError && (
                    <p className="text-[11px] text-red-600">{couponError}</p>
                  )}
                </div>

                {/* Price Breakdown */}
                <div className="pt-3 border-t border-[var(--store-border)] space-y-2 text-xs text-[var(--store-text-secondary)]">
                  <div className="flex justify-between">
                    <span>Items Subtotal</span>
                    <span className="font-mono">{formatPaise(subtotalPaise)}</span>
                  </div>

                  {discountPaise > 0 && (
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Coupon Discount ({appliedCoupon?.code})</span>
                      <span className="font-mono">- {formatPaise(discountPaise)}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span>Fulfillment</span>
                    <span className="font-semibold">
                      {fulfillmentType === 'PICKUP' ? (
                        <span className="text-emerald-700 font-bold">FREE STORE PICKUP</span>
                      ) : (fulfillmentType === 'DELIVERY' ? shippingPaise : 0) === 0 ? (
                        <span className="text-emerald-700 font-bold">FREE DELIVERY</span>
                      ) : (
                        <span className="font-mono text-[var(--store-text-primary)]">{formatPaise(shippingPaise)}</span>
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>Taxes & GST (5% Est.)</span>
                    <span className="font-mono text-[var(--store-text-secondary)]">
                      {formatPaise(Math.round(Math.max(0, subtotalPaise - discountPaise) * 0.05))}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-[var(--store-border)] flex justify-between text-base font-bold text-[var(--store-text-primary)]">
                    <span>{t('common.total')}</span>
                    <span className="font-mono text-emerald-800">
                      {formatPaise(calculatedGrandTotalPaise)}
                    </span>
                  </div>
                </div>

                {/* Submit Order Button */}
                <button data-theme-tone="primary"
                  type="submit"
                  data-testid="place-order-button"
                  disabled={submitting || items.length === 0}
                  data-theme-btn="true"
                  className="w-full py-4 rounded-xl text-xs font-bold text-white shadow-lg transition hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--theme-primary, #111827)', color: 'var(--theme-on-primary)' }}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {isPreviewMode ? 'Completing Preview Flow...' : 'Placing Order Securely...'}
                    </span>
                  ) : isPreviewMode ? (
                    <>
                      <span>Place Preview Order • {formatPaise(calculatedGrandTotalPaise)}</span>
                      <CheckCircle className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>{t('checkout.placeOrder')} • {formatPaise(calculatedGrandTotalPaise)}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Trust and Policy Badges */}
                <div className="space-y-2 pt-2 border-t border-[var(--store-border)] text-[11px] text-[var(--store-text-secondary)]">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>100% Genuine Quality Guarantee</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Safe contactless doorstep dispatch</span>
                  </div>
                </div>

                {isPreviewMode ? (
                  <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg py-2 px-3 text-center font-medium leading-relaxed">
                    ✦ Merchant Preview Simulation: Order creation runs safely without changing inventory or triggering real bank charges.
                  </p>
                ) : (
                  <div className="text-center text-[10px] text-[var(--store-text-secondary)]">
                    By confirming this order, you accept the store's terms of service. Digital order receipt will be generated.
                  </div>
                )}
              </div>
            </form>
          </>
        )}
      </main>

      <StoreFooter store={store} themeConfig={themeConfig} />
    </ThemeWrapper>
  );
}
