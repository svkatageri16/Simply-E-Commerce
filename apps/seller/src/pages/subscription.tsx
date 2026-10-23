import { getPublicStoreUrl } from '@simply/types';
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { 
  CreditCard, 
  Check, 
  Sparkles, 
  AlertCircle, 
  Globe, 
  Lock, 
  ShieldCheck,
  Zap,
  ArrowRight,
  History,
  FileText,
  Download,
  Mail,
  Clock
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useSellerI18n } from '@simply/i18n';
import { formatPaise } from '@simply/ui';
import { getStorefrontUrl } from '../utils/config';

const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as any).Razorpay) return resolve(true);

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function SubscriptionPage() {
  const { api, user, refreshProfile } = useAuth();
  const { t, locale } = useSellerI18n();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<any[]>([]);
  const [currentSub, setCurrentSub] = useState<any>(null);
  const [store, setStore] = useState<any>(null);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptionInfo();
  }, []);

  const loadSubscriptionInfo = async () => {
    setLoading(true);
    try {
      const [plansRes, subRes, storeRes] = await Promise.all([
        api.subscriptions.getPlans(),
        api.subscriptions.getCurrent().catch(() => null),
        api.stores.getMyStore(),
      ]);
      const rawPlans = plansRes || [];
      const sortedPlans = [...rawPlans].sort((a: any, b: any) => {
        const isCustomA = a.availability === 'CONTACT' || (a.code || '').toUpperCase().includes('CUSTOM') || a.pricePaise <= 0;
        const isCustomB = b.availability === 'CONTACT' || (b.code || '').toUpperCase().includes('CUSTOM') || b.pricePaise <= 0;
        if (isCustomA && !isCustomB) return 1;
        if (!isCustomA && isCustomB) return -1;
        return a.pricePaise - b.pricePaise;
      });
      setPlans(sortedPlans);
      setCurrentSub(subRes);
      setStore(storeRes);
    } catch (err) {
      console.error('Failed to load subscription info', err);
    } finally {
      setLoading(false);
    }
  };

  const getGridClasses = (count: number) => {
    if (count <= 1) return 'grid grid-cols-1 max-w-md mx-auto gap-6 items-stretch';
    if (count === 2) return 'grid grid-cols-1 md:grid-cols-2 max-w-4xl mx-auto gap-6 items-stretch';
    if (count === 3) return 'grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch';
    if (count === 4) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch';
    return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch';
  };

  const isLive = (store?.status === 'LIVE' || store?.status === 'ACTIVE') && currentSub?.status === 'ACTIVE';
  const isExpired = currentSub?.status === 'EXPIRED' || store?.status === 'SUSCRIPTION_EXPIRED' || store?.status === 'SUSPENDED';

  // Find the canonical Launch plan by identity; its price comes from the backend.
  const launchPlan = plans.find((p) => p.code === 'STARTER_MONTHLY') || plans.find((p) => p.purchasable);

  const handleActivatePlan = async (plan: any) => {
    if (activating) return;
    const planToActivate = plan || launchPlan;
    if (!planToActivate) return;

    setActivating(planToActivate.id);

    try {
      if (currentSub?.planId === planToActivate.id && isLive) {
        alert(t('subscription.alreadySubscribed'));
        setActivating(null);
        return;
      }

      // Load Razorpay Checkout SDK
      const sdkReady = await loadRazorpayScript();
      if (!sdkReady) {
        alert(t('subscription.razorpayUnavailable'));
        setActivating(null);
        return;
      }

      // Backend calculates authoritative plan amount and creates Razorpay Order
      const orderData = await api.subscriptions.createOrder(planToActivate.id, 'MONTHLY');

      const options = {
        key: orderData.keyId,
        amount: orderData.amountPaise,
        currency: orderData.currency || 'INR',
        name: 'LetzShop Platform',
        description: `Plan: ${planToActivate.name}`,
        order_id: orderData.providerOrderId,
        prefill: {
          name: user?.fullName || '',
          contact: user?.phone || '',
          email: user?.email || '',
        },
        theme: {
          color: '#10B981',
        },
        modal: {
          ondismiss: function () {
            setActivating(null);
          },
        },
        handler: async function (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) {
          try {
            await api.subscriptions.verify({
              paymentOrderId: orderData.paymentOrderId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });

            alert(t('subscription.paymentSuccess'));
            await loadSubscriptionInfo();
            await refreshProfile();
          } catch (verifyErr: any) {
            alert(verifyErr.message || t('subscription.paymentFailed'));
          } finally {
            setActivating(null);
          }
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (errResp: any) {
        alert(t('subscription.paymentFailed') + (errResp.error?.description || ''));
        setActivating(null);
      });
      rzp.open();
    } catch (err: any) {
      alert(err.message || t('subscription.paymentFailed'));
      setActivating(null);
    }
  };

  // Custom email link construction with prefilled subject and body
  const customEmailSubject = encodeURIComponent(t('subscription.customRequirementSubject'));
  const customEmailBody = encodeURIComponent(
    t('subscription.customRequirementBody', {
      storeName: store?.name || 'My Store',
      phone: user?.phone || 'N/A',
      email: user?.email || 'N/A',
    })
  );
  const customEmailHref = `mailto:business@aikyamaisystems.com?subject=${customEmailSubject}&body=${customEmailBody}`;

  return (
    <Layout>
      <Head>
        <title>{t('subscription.title')} | Simply Seller</title>
      </Head>

      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--merchant-text)] tracking-tight">
            {t('subscription.title')}
          </h1>
          <p className="text-sm text-[var(--merchant-text-muted)] mt-1">
            {t('subscription.subtitle')}
          </p>
        </div>

        {/* Current Status Card */}
        <div
          className={`p-6 rounded-2xl border shadow-xs transition-colors ${
            isLive
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : isExpired
              ? 'bg-rose-500/10 border-rose-500/30'
              : 'bg-amber-500/10 border-amber-500/30'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {isLive ? (
                  <>
                    <Globe className="w-5 h-5 text-emerald-500" />
                    <span className="font-bold text-[var(--merchant-text)] text-base">
                      {t('subscription.currentStoreLive')}
                    </span>
                  </>
                ) : isExpired ? (
                  <>
                    <AlertCircle className="w-5 h-5 text-rose-500" />
                    <span className="font-bold text-[var(--merchant-text)] text-base">
                      {t('subscription.storeOfflineExpired')}
                    </span>
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5 text-amber-500" />
                    <span className="font-bold text-[var(--merchant-text)] text-base">
                      {t('subscription.storePrivate')}
                    </span>
                  </>
                )}
              </div>

              <p className="text-xs text-[var(--merchant-text-muted)]">
                {isLive
                  ? t('subscription.liveDesc', {
                      plan: currentSub?.plan?.name || 'Active Plan',
                      date: currentSub?.currentPeriodEnd
                        ? new Date(currentSub.currentPeriodEnd).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : '',
                    })
                  : isExpired
                  ? t('subscription.expiredDesc')
                  : t('subscription.privateDesc')}
              </p>
            </div>

            {isLive && store?.slug && (
              <a
                href={getPublicStoreUrl(store.slug, getStorefrontUrl())}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition self-start sm:self-auto shrink-0"
              >
                {t('subscription.visitPublicStorefront')}
              </a>
            )}
          </div>
        </div>

        {/* Dynamic Plan Grid */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-[var(--merchant-text)]">
            {t('subscription.choosePlanTitle')}
          </h2>

          <div className={getGridClasses(plans.length)}>
            {plans.map((p: any) => {
              const isCurrent = currentSub?.planId === p.id && isLive;
              const isComingSoon = p.availability === 'COMING_SOON' || (p.code || '').toUpperCase().includes('GROWTH');
              const isCustom = p.availability === 'CONTACT' || p.pricePaise <= 0 || (p.code || '').toUpperCase().includes('CUSTOM');
              const isPopular = p.code === 'STARTER_MONTHLY' && !isCurrent;

              return (
                <div
                  key={p.id || p.code}
                  className={`bg-[var(--merchant-surface)] rounded-2xl border p-6 flex flex-col justify-between transition-all duration-200 shadow-xs relative h-full ${
                    isCurrent
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                      : isPopular
                        ? 'border-[var(--merchant-primary)] ring-2 ring-[var(--merchant-primary)]/20 shadow-md'
                        : 'border-[var(--merchant-border)]'
                  } ${isComingSoon ? 'opacity-90' : ''}`}
                >
                  {isCurrent ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-xs">
                      {t('subscription.currentPlan')}
                    </span>
                  ) : isComingSoon ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-900 text-[10px] font-black uppercase tracking-wider px-3 py-0.5 rounded-full shadow-xs">
                      {t('subscription.comingSoon')}
                    </span>
                  ) : isPopular ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--merchant-primary)] text-white text-[11px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-xs">
                      {t('subscription.mostPopular')}
                    </span>
                  ) : null}

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-xl text-[var(--merchant-text)]">
                          {p.name}
                        </h3>
                      </div>
                      {p.description && (
                        <p className="text-xs text-[var(--merchant-text-muted)] mt-1.5 min-h-[32px]">
                          {p.description}
                        </p>
                      )}
                    </div>

                    {/* Price display: No /monthly for unpriced/custom plans */}
                    {isCustom ? (
                      <div className="py-2.5 px-3 rounded-lg bg-[var(--merchant-surface-muted)] border border-[var(--merchant-border)]">
                        <span className="text-xs font-semibold text-[var(--merchant-text)]">
                          Contact Aikyam
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1 py-1">
                        <span className="text-3xl font-black text-[var(--merchant-text)] font-mono">
                          {formatPaise(p.pricePaise)}
                        </span>
                        <span className="text-xs font-medium text-[var(--merchant-text-muted)]">
                          + GST / {p.billingPeriodDays || 30} days
                        </span>
                      </div>
                    )}

                    {/* Highlights - rendered only if Admin entered highlights */}
                    {p.highlights && p.highlights.length > 0 && (
                      <div className="border-t border-[var(--merchant-border)] pt-4 space-y-2.5 text-xs text-[var(--merchant-text-secondary)]">
                        {p.highlights.map((h: any, idx: number) => (
                          <div key={h.id || idx} className="flex items-start gap-2">
                            <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isComingSoon ? 'text-amber-500' : 'text-emerald-500'}`} />
                            <span>{h.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Footer / CTA */}
                  <div className="pt-6 mt-auto">
                    {isCurrent ? (
                      <button
                        type="button"
                        disabled
                        className="w-full py-3 rounded-xl text-xs font-bold bg-[var(--merchant-surface-muted)] text-emerald-400 border border-emerald-500/30 cursor-default flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4 text-emerald-500" />
                        <span>{t('subscription.active')}</span>
                      </button>
                    ) : isComingSoon ? (
                      <button
                        type="button"
                        disabled
                        className="w-full py-3 rounded-xl text-xs font-bold bg-[var(--merchant-surface-muted)] text-[var(--merchant-text-muted)] border border-[var(--merchant-border)] cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{t('subscription.comingSoon')}</span>
                      </button>
                    ) : isCustom ? (
                      <a
                        href={customEmailHref}
                        className="w-full py-3 rounded-xl text-xs font-bold bg-[var(--merchant-surface-raised)] hover:bg-[var(--merchant-surface-muted)] text-[var(--merchant-text)] border border-[var(--merchant-border)] shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Mail className="w-4 h-4 text-[var(--merchant-primary)]" />
                        <span>{t('subscription.contactAikyam')}</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={activating !== null}
                        onClick={() => handleActivatePlan(p)}
                        className="w-full py-3 rounded-xl text-xs font-bold bg-[var(--merchant-primary)] hover:bg-[var(--merchant-primary-hover)] text-white shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {activating === p.id ? (
                          t('subscription.activating')
                        ) : (
                          <>
                            <span>{t('subscription.activatePlan')}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subscription Details & Billing History */}
        {currentSub && (
          <div className="space-y-4 pt-8 border-t border-[var(--merchant-border)]">
            <h2 className="text-lg font-bold text-[var(--merchant-text)] flex items-center gap-2">
              <History className="w-5 h-5 text-[var(--merchant-text-muted)]" />
              <span>{t('subscription.billingDetailsTitle')}</span>
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Active Plan Details */}
              <div className="bg-[var(--merchant-surface)] rounded-2xl border border-[var(--merchant-border)] p-6 shadow-xs flex flex-col justify-between transition-colors">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--merchant-text)] flex items-center gap-2 mb-4">
                    <CreditCard className="w-4 h-4 text-emerald-500" />
                    <span>{t('subscription.currentSubTitle')}</span>
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between items-center pb-2 border-b border-[var(--merchant-border)]">
                      <span className="text-[var(--merchant-text-muted)]">{t('subscription.planLabel')}</span>
                      <span className="font-semibold text-[var(--merchant-text)]">
                        {currentSub.plan?.name || 'Subscription'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-[var(--merchant-border)]">
                      <span className="text-[var(--merchant-text-muted)]">{t('subscription.statusLabel')}</span>
                      <span className={`font-bold ${isLive ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {currentSub.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-[var(--merchant-border)]">
                      <span className="text-[var(--merchant-text-muted)]">{t('subscription.periodStart')}</span>
                      <span className="font-medium text-[var(--merchant-text-secondary)]">
                        {currentSub.currentPeriodStart
                          ? new Date(currentSub.currentPeriodStart).toLocaleDateString(locale)
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-[var(--merchant-border)]">
                      <span className="text-[var(--merchant-text-muted)]">{t('subscription.periodEnd')}</span>
                      <span className="font-medium text-[var(--merchant-text-secondary)]">
                        {currentSub.currentPeriodEnd
                          ? new Date(currentSub.currentPeriodEnd).toLocaleDateString(locale)
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--merchant-text-muted)]">{t('subscription.autoRenew')}</span>
                      <span className="font-medium text-[var(--merchant-text-secondary)]">
                        {!currentSub.cancelAtPeriodEnd ? t('subscription.enabled') : t('subscription.disabled')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoices */}
              <div className="lg:col-span-2 bg-[var(--merchant-surface)] rounded-2xl border border-[var(--merchant-border)] shadow-xs overflow-hidden flex flex-col transition-colors">
                <div className="px-6 py-4 border-b border-[var(--merchant-border)] bg-[var(--merchant-surface-muted)]">
                  <h3 className="text-sm font-semibold text-[var(--merchant-text)] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[var(--merchant-primary)]" />
                    <span>{t('subscription.invoiceHistory')}</span>
                  </h3>
                </div>
                
                {(!currentSub.invoices || currentSub.invoices.length === 0) ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-[var(--merchant-text-muted)]">
                    <FileText className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">{t('subscription.noInvoices')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-[var(--merchant-surface-muted)] text-[var(--merchant-text-muted)] border-b border-[var(--merchant-border)]">
                        <tr>
                          <th className="px-6 py-3 font-medium">{t('subscription.invoiceNum')}</th>
                          <th className="px-6 py-3 font-medium">{t('subscription.date')}</th>
                          <th className="px-6 py-3 font-medium">{t('subscription.amount')}</th>
                          <th className="px-6 py-3 font-medium">{t('subscription.status')}</th>
                          <th className="px-6 py-3 font-medium text-right">{t('subscription.action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--merchant-border)]">
                        {currentSub.invoices.map((inv: any) => (
                          <tr key={inv.id} className="hover:bg-[var(--merchant-surface-muted)]/50 transition-colors">
                            <td className="px-6 py-4 font-mono text-xs text-[var(--merchant-text-secondary)]">
                              {inv.invoiceNumber}
                            </td>
                            <td className="px-6 py-4 text-[var(--merchant-text-secondary)]">
                              {new Date(inv.createdAt).toLocaleDateString(locale)}
                            </td>
                            <td className="px-6 py-4 font-medium text-[var(--merchant-text)]">
                              {formatPaise(inv.amountPaise)}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                inv.status === 'PAID' ? 'bg-emerald-500/15 text-emerald-500' :
                                inv.status === 'PENDING' ? 'bg-amber-500/15 text-amber-500' :
                                'bg-[var(--merchant-surface-muted)] text-[var(--merchant-text-muted)]'
                              }`}>
                                {inv.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                type="button"
                                disabled={!inv.invoicePdfUrl}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
                                  inv.invoicePdfUrl 
                                    ? 'text-[var(--merchant-primary)] hover:underline' 
                                    : 'text-[var(--merchant-text-muted)] cursor-not-allowed'
                                }`}
                                onClick={() => inv.invoicePdfUrl && window.open(inv.invoicePdfUrl, '_blank')}
                                title={!inv.invoicePdfUrl ? 'PDF unavailable' : 'Download PDF'}
                              >
                                <Download className="w-3.5 h-3.5" />
                                {t('subscription.downloadPdf')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Value Proposition Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[var(--merchant-border)]">
          <div className="p-4 bg-[var(--merchant-surface)] border border-[var(--merchant-border)] rounded-xl space-y-1 transition-colors">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <h4 className="text-xs font-bold text-[var(--merchant-text)]">{t('subscription.trustTitle1')}</h4>
            <p className="text-[11px] text-[var(--merchant-text-muted)]">
              {t('subscription.trustDesc1')}
            </p>
          </div>
          <div className="p-4 bg-[var(--merchant-surface)] border border-[var(--merchant-border)] rounded-xl space-y-1 transition-colors">
            <Zap className="w-5 h-5 text-[var(--merchant-accent)]" />
            <h4 className="text-xs font-bold text-[var(--merchant-text)]">{t('subscription.trustTitle2')}</h4>
            <p className="text-[11px] text-[var(--merchant-text-muted)]">
              {t('subscription.trustDesc2')}
            </p>
          </div>
          <div className="p-4 bg-[var(--merchant-surface)] border border-[var(--merchant-border)] rounded-xl space-y-1 transition-colors">
            <CreditCard className="w-5 h-5 text-[var(--merchant-primary)]" />
            <h4 className="text-xs font-bold text-[var(--merchant-text)]">{t('subscription.trustTitle3')}</h4>
            <p className="text-[11px] text-[var(--merchant-text-muted)]">
              {t('subscription.trustDesc3')}
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
