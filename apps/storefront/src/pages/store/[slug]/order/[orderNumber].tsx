import { getPublicStoreUrl } from '@simply/types';
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  CheckCircle, 
  Package, 
  Truck, 
  MapPin, 
  CreditCard, 
  MessageSquare, 
  Clock, 
  ArrowLeft,
  ShieldCheck
} from 'lucide-react';
import { useCart } from '../../../../context/CartContext';
import { ThemeWrapper } from '../../../../components/ThemeWrapper';
import { StoreHeader } from '../../../../components/StoreHeader';
import { StoreFooter } from '../../../../components/StoreFooter';
import { formatPaise, getPaymentDisplayDetails, formatPaymentMethod } from '@simply/ui';
import { useStorefrontI18n } from '@simply/i18n';

export default function OrderConfirmationPage() {
  const router = useRouter();
  const { slug, orderNumber, t: trackingToken } = router.query;
  const { t, locale, initStoreLocales } = useStorefrontI18n();
  const { api, setStoreId } = useCart();

  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState<any | null>(null);
  const [order, setOrder] = useState<any | null>(null);
  const [trackingDenied, setTrackingDenied] = useState(false);

  useEffect(() => {
    if (!slug || !orderNumber) return;
    loadOrder(String(slug), String(orderNumber), trackingToken ? String(trackingToken) : undefined);
  }, [slug, orderNumber, trackingToken]);

  const loadOrder = async (storeSlug: string, orderNum: string, token?: string) => {
    setLoading(true);
    setTrackingDenied(false);
    try {
      const [sRes, oRes] = await Promise.all([
        api.stores.getPublicStorefront(storeSlug),
        api.orders.trackOrder(orderNum, token),
      ]);
      setStoreData(sRes);
      setOrder(oRes);
      if (sRes.store) {
        initStoreLocales({
          storeSlug: String(storeSlug),
          defaultLocale: sRes.store.storefrontDefaultLocale,
          enabledLocales: sRes.store.enabledStorefrontLocales,
        });
      }
      if (sRes.store?.id) {
        setStoreId(sRes.store.id);
      }
    } catch (err: any) {
      console.error('Failed to load tracked order', err);
      if (err?.code === 'INVALID_TRACKING_TOKEN' || err?.status === 403) {
        setTrackingDenied(true);
      }
    } finally {
      setLoading(false);
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

  if (trackingDenied) {
    return (
      <ThemeWrapper themeConfig={themeConfig} branding={themeConfig?.branding}>
        <StoreHeader store={store} themeConfig={themeConfig} />
        <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-[var(--store-text-primary)]">Secure Tracking Token Required</h1>
          <p className="text-xs text-[var(--store-text-secondary)] leading-relaxed">
            For privacy and customer security under Indian DPDPA compliance, order tracking requires your unique tracking link with security token (?t=...). Please use the direct link provided in your order confirmation SMS or WhatsApp.
          </p>
          <Link
            href={getPublicStoreUrl(String(slug))}
            className="inline-block px-4 py-2 bg-[var(--store-button-bg)] store-inverse text-white text-xs font-semibold rounded-lg"
          >
            Back to Store
          </Link>
        </div>
        <StoreFooter store={store} />
      </ThemeWrapper>
    );
  }

  if (!order) {
    return (
      <ThemeWrapper themeConfig={themeConfig} branding={themeConfig?.branding}>
        <StoreHeader store={store} themeConfig={themeConfig} />
        <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
          <h1 className="text-xl font-bold text-[var(--store-text-primary)]">Order Not Found</h1>
          <p className="text-xs text-[var(--store-text-secondary)]">
            We could not locate an order matching #{orderNumber}.
          </p>
          <Link
            href={getPublicStoreUrl(String(slug))}
            className="inline-block px-4 py-2 bg-[var(--store-button-bg)] store-inverse text-white text-xs font-semibold rounded-lg"
          >
            Back to Store
          </Link>
        </div>
        <StoreFooter store={store} />
      </ThemeWrapper>
    );
  }

  const addr = order.shippingAddress || (order.deliveryAddress as any) || (order.orderAddress as any) || {};
  const customerName = order.customerName || order.customer?.fullName || addr.fullName || 'Customer';
  const customerPhone = order.customerPhone || order.customer?.phone || addr.phone || '';
  const city = addr.city || order.deliveryCity || '';
  const state = addr.state || order.deliveryState || '';
  const pincode = addr.postalCode || addr.pincode || order.deliveryPincode || '';
  const cleanPhone = (store.contactPhone || '').replace(/[^0-9]/g, '').replace(/^91/, '');

  const itemsSummary = (order.items || [])
    .map((it: any) => `${it.quantity}x ${it.titleSnapshot || it.productName || 'Item'}`)
    .join(', ');

  const buyerToVendorWaText =
    `*New Order Placed - #${order.orderNumber}*\n\n` +
    `Hello *${store.name}*,\n` +
    `I have just placed an order on your store!\n\n` +
    `📦 *Items:* ${itemsSummary}\n` +
    `💰 *Total Amount:* ${formatPaise(order.totalPaise || order.totalAmountPaise || 0)}\n` +
    `👤 *Customer:* ${customerName} (${customerPhone})\n` +
    `📍 *Delivery City / PIN:* ${city} ${pincode ? `- ${pincode}` : ''}\n\n` +
    `Please confirm my order and let me know when it is dispatched. Thank you!`;

  const waOrderDetailsLink = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(buyerToVendorWaText)}`;

  // Status step calculation
  const statusSteps = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
  let currentStepIdx = 0;
  if (order.status === 'PROCESSING') currentStepIdx = 1;
  else if (order.status === 'SHIPPED') currentStepIdx = 2;
  else if (order.status === 'DELIVERED') currentStepIdx = 3;

  return (
    <ThemeWrapper themeConfig={themeConfig} branding={themeConfig?.branding}>
      <Head>
        <title>{`Order #${order.orderNumber} Confirmed | ${store.name}`}</title>
      </Head>

      <StoreHeader store={store} themeConfig={themeConfig} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Success Hero Card */}
        <div className="bg-[var(--store-surface)] store-surface border border-[var(--store-border)] rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle className="w-8 h-8" />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              Order Confirmed & Placed
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[var(--store-text-primary)] tracking-tight mt-2">
              Thank you for your purchase!
            </h1>
            <p className="text-xs text-[var(--store-text-secondary)] mt-1 font-mono">
              Order #{order.orderNumber} • Placed on {new Date(order.createdAt).toLocaleString('en-IN')}
            </p>
          </div>

          {/* Email Confirmation Notice (Zero Login Required) */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 max-w-lg mx-auto text-center space-y-1">
            <p className="font-bold flex items-center justify-center gap-1.5">
              <span>✉️</span> Email Confirmation & Tracking Updates
            </p>
            <p className="text-[11px] text-emerald-700">
              Your order is saved and email confirmation is queued. No login is required to check order status and delivery progress using your secure tracking link.
            </p>
          </div>

          {/* WhatsApp Action (Deep Link to connect with merchant) */}
          {cleanPhone && (
            <div className="pt-2 flex flex-col items-center justify-center gap-1.5">
              <a
                href={waOrderDetailsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-xl text-xs font-bold shadow-sm transition"
              >
                <MessageSquare className="w-4 h-4" /> Open WhatsApp or WhatsApp Web to continue with the prepared order message
              </a>
              <span className="text-[11px] text-[var(--store-text-secondary)]">
                Connect directly with the merchant with your pre-filled order summary.
              </span>
            </div>
          )}
        </div>

        {/* 4-Step Fulfillment Tracker */}
        <div className="bg-[var(--store-surface)] store-surface border border-[var(--store-border)] rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-xs font-bold text-[var(--store-text-secondary)] uppercase tracking-wider">
            Live Delivery & Fulfillment Status
          </h2>

          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {[
              { label: 'Confirmed', icon: CheckCircle },
              { label: 'Processing', icon: Clock },
              { label: 'Shipped', icon: Truck },
              { label: 'Delivered', icon: Package },
            ].map((step, idx) => {
              const Icon = step.icon;
              const isDone = idx <= currentStepIdx;
              const isCurrent = idx === currentStepIdx;

              return (
                <div key={step.label} className="space-y-2">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto transition ${
                      isDone
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[var(--store-surface)] store-surface text-[var(--store-text-secondary)]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <p
                    className={`text-[11px] font-semibold ${
                      isCurrent ? 'text-[var(--store-text-primary)] font-bold' : isDone ? 'text-emerald-700' : 'text-[var(--store-text-secondary)]'
                    }`}
                  >
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Order Details & Summary Split */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Items List */}
          <div className="bg-[var(--store-surface)] store-surface border border-[var(--store-border)] rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-xs font-bold text-[var(--store-text-secondary)] uppercase tracking-wider flex items-center gap-2">
              <Package className="w-4 h-4" /> Ordered Items ({order.items?.length || 0})
            </h2>

            <div className="divide-y divide-gray-100 text-xs">
              {(order.items || []).map((item: any, idx: number) => {
                const title = item.productName || item.titleSnapshot || 'Product';
                const variantLabel = item.variantTitle || item.variantTitleSnapshot;
                const unitPrice = item.unitPricePaise || 0;
                const lineTotal = item.totalPricePaise || (item.quantity * unitPrice);

                return (
                  <div key={item.id || idx} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {item.imageUrl && (
                        <div className="w-11 h-11 rounded-lg overflow-hidden bg-[var(--store-surface)] store-surface flex-shrink-0 border border-[var(--store-border)]">
                          <img src={item.imageUrl} alt={title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--store-text-primary)] truncate">{title}</p>
                        {variantLabel && (
                          <p className="text-[var(--store-text-secondary)] text-[11px] font-medium">{variantLabel}</p>
                        )}
                        {item.sku && (
                          <p className="text-[var(--store-text-secondary)] font-mono text-[10px]">SKU: {item.sku}</p>
                        )}
                        <p className="text-[var(--store-text-secondary)] font-mono text-[11px]">
                          Qty: {item.quantity} × {formatPaise(unitPrice)}
                        </p>
                      </div>
                    </div>
                    <div className="font-mono font-bold text-[var(--store-text-primary)] flex-shrink-0">
                      {formatPaise(lineTotal)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[var(--store-border)] space-y-1.5 text-xs text-[var(--store-text-secondary)]">
              <div className="flex justify-between">
                <span>{t('common.subtotal')}</span>
                <span className="font-mono">{formatPaise(order.subtotalPaise || order.totalPaise || 0)}</span>
              </div>
              {order.discountPaise && order.discountPaise > 0 ? (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>{t('checkout.couponDiscount')}</span>
                  <span className="font-mono">- {formatPaise(order.discountPaise)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span>{t('checkout.freeDelivery')}</span>
                <span className="text-emerald-700 font-semibold">
                  {order.shippingPaise && order.shippingPaise > 0 ? formatPaise(order.shippingPaise) : 'FREE'}
                </span>
              </div>
              <div className="pt-2 border-t border-[var(--store-border)] flex justify-between text-sm font-bold text-[var(--store-text-primary)]">
                <span>{t('common.total')}</span>
                <span className="font-mono text-emerald-800">{formatPaise(order.totalPaise || order.totalAmountPaise || 0)}</span>
              </div>
            </div>
          </div>

          {/* Shipping Address & Payment Details */}
          <div className="space-y-6">
            <div className="bg-[var(--store-surface)] store-surface border border-[var(--store-border)] rounded-2xl p-6 shadow-sm space-y-3 text-xs">
              <h2 className="font-bold text-[var(--store-text-secondary)] uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Shipping Destination
              </h2>
              <div className="text-[var(--store-text-primary)] space-y-1">
                <p className="font-bold text-[var(--store-text-primary)]">{order.customerName}</p>
                <p>{addr.addressLine1}</p>
                {addr.addressLine2 && <p>{addr.addressLine2}</p>}
                <p>
                  {addr.city}, {addr.state} - <span className="font-mono font-bold">{addr.postalCode}</span>
                </p>
                <p className="text-[var(--store-text-secondary)] font-mono">Mobile: {order.customerPhone}</p>
              </div>
            </div>

            {/* Delivery Partner Assigned Card (Recipient visibility) */}
            {(order.riderName || order.riderPhone || order.carrier) && (
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-5 shadow-sm space-y-3 text-xs">
                <h2 className="font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-2">
                  <Truck className="w-4 h-4 text-emerald-600" /> Assigned Delivery Partner
                </h2>
                <div className="space-y-2 text-emerald-950">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-700">Delivery Person:</span>
                    <span className="font-bold text-[var(--store-text-primary)]">{order.riderName || order.carrier || 'Store Delivery Partner'}</span>
                  </div>
                  {order.riderPhone && (
                    <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60">
                      <span className="text-emerald-700">Direct Contact:</span>
                      <a
                        href={`tel:${order.riderPhone}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--store-surface)] store-surface border border-emerald-300 rounded-lg text-emerald-800 font-mono font-bold shadow-2xs hover:bg-emerald-50 transition"
                      >
                        📞 Call {order.riderPhone}
                      </a>
                    </div>
                  )}
                  {order.trackingNumber && (
                    <div className="flex items-center justify-between pt-0.5 text-[11px] text-emerald-800 font-mono">
                      <span>Tracking Ref:</span>
                      <span>{order.trackingNumber}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payment Details */}
            {(() => {
              const paymentDisplay = getPaymentDisplayDetails(order);
              return (
                <div className="bg-[var(--store-surface)] store-surface border border-[var(--store-border)] rounded-2xl p-6 shadow-sm space-y-3 text-xs">
                  <h2 className="font-bold text-[var(--store-text-secondary)] uppercase tracking-wider flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Payment Details
                  </h2>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--store-text-secondary)]">Method:</span>
                    <span className="font-semibold text-[var(--store-text-primary)]">{paymentDisplay.methodLabel}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--store-text-secondary)]">Payment Status:</span>
                    <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      order.paymentStatus === 'PAID'
                        ? 'text-emerald-700 bg-emerald-100'
                        : 'text-amber-700 bg-amber-100'
                    }`}>
                      {order.paymentStatus === 'PAID' ? 'Paid' : 'Pending'}
                    </span>
                  </div>
                  {!paymentDisplay.isCod && (paymentDisplay.transactionId || order.transactionId) && (
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--store-text-secondary)]">Transaction ID:</span>
                      <span className="font-mono font-bold text-[var(--store-text-primary)] text-[11px] select-all bg-[var(--store-surface)] store-surface px-1.5 py-0.5 rounded">
                        {paymentDisplay.transactionId || order.transactionId}
                      </span>
                    </div>
                  )}
                  {paymentDisplay.isCod && order.paymentStatus === 'PAID' && (
                    <div className="pt-2 border-t border-[var(--store-border)] space-y-1.5 text-[var(--store-text-secondary)] text-[11px]">
                      <div className="flex items-center justify-between">
                        <span>COD Collected:</span>
                        <span className="font-bold text-emerald-700">Yes</span>
                      </div>
                      {(order.codCollectionMethod || paymentDisplay.codCollectionLabel) && (
                        <div className="flex items-center justify-between">
                          <span>Collected Via:</span>
                          <span className="font-semibold text-[var(--store-text-primary)]">
                            {paymentDisplay.codCollectionLabel || order.codCollectionMethod}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        <div className="text-center pt-4">
          <Link
            href={getPublicStoreUrl(String(slug))}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold text-white shadow-md transition hover:opacity-90"
            style={{ backgroundColor: 'var(--theme-primary, #111827)', color: 'var(--theme-on-primary)' }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('storefront.continueShopping')}</span>
          </Link>
        </div>
      </main>

      <StoreFooter store={store} themeConfig={themeConfig} />
    </ThemeWrapper>
  );
}
