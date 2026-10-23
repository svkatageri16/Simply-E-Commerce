import { getPublicStoreUrl } from '@simply/types';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth, apiClient } from '../context/AuthContext';
import { Layout } from '../components/Layout';
import { ProductEditorDrawer } from '../components/ProductEditorDrawer';
import { DashboardMetricCard, StoreLaunchIllustration } from '../components/dashboard/DashboardEnrichment';
import { formatPaise } from '@simply/ui';
import { useSellerI18n } from '@simply/i18n';
import {
  TrendingUp,
  ShoppingBag,
  MessageSquare,
  Users,
  AlertTriangle,
  Plus,
  Palette,
  Eye,
  Share2,
  Package,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Boxes,
  Check,
  ChevronDown,
  Sparkles,
  Globe,
  CreditCard,
  Truck,
  Building2,
} from 'lucide-react';
import { getStorefrontUrl } from '../utils/config';

type PeriodKey = 'today' | '7d' | '30d' | '3m' | '6m' | '1y' | 'custom';

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '3m', label: '3 Months' },
  { key: '6m', label: '6 Months' },
  { key: '1y', label: '1 Year' },
  { key: 'custom', label: 'Custom' },
];

export default function CompactDashboardPage() {
  const { user, store, loading: authLoading, setStoreContext } = useAuth();
  const router = useRouter();
  const { t, locale, formatCurrency } = useSellerI18n();

  const periodOptions = useMemo<{ key: PeriodKey; label: string }[]>(() => [
    { key: 'today', label: t('common.today') },
    { key: '7d', label: t('common.days7') },
    { key: '30d', label: t('common.days30') },
    { key: '3m', label: t('common.months3') },
    { key: '6m', label: t('common.months6') },
    { key: '1y', label: t('common.year1') },
    { key: 'custom', label: t('common.custom') },
  ], [t]);

  // State
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick Action State
  const [copiedLink, setCopiedLink] = useState(false);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [showAllIssues, setShowAllIssues] = useState(false);

  const isFirstLoad = useRef(true);

  const loadDashboard = useCallback(
    async (period: PeriodKey, isBackground = false, startDate?: string, endDate?: string) => {
      if (!store) return;
      if (isBackground) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await apiClient.seller.getDashboard({
          period,
          startDate: period === 'custom' ? startDate || customStart : undefined,
          endDate: period === 'custom' ? endDate || customEnd : undefined,
        });
        setDashboardData(res);
        if (res?.store) {
          setStoreContext(res.store);
        }
      } catch (err: any) {
        console.error('Failed to load merchant dashboard:', err);
        if (!isBackground) {
          setError(err?.message || 'Failed to load business analytics.');
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false);
        isFirstLoad.current = false;
      }
    },
    [store, customStart, customEnd, setStoreContext]
  );

  // Initial load and period changes
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (!authLoading && user && !store) {
      router.push('/onboarding');
      return;
    }

    if (store && selectedPeriod !== 'custom') {
      loadDashboard(selectedPeriod, !isFirstLoad.current);
    }
  }, [authLoading, user, store, selectedPeriod, loadDashboard]);

  // Window Focus Refetch
  useEffect(() => {
    const handleFocus = () => {
      if (store && selectedPeriod !== 'custom') {
        loadDashboard(selectedPeriod, true);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [store, selectedPeriod, loadDashboard]);

  // 30-Second Polling while Dashboard is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && store && selectedPeriod !== 'custom') {
        loadDashboard(selectedPeriod, true);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [store, selectedPeriod, loadDashboard]);

  const handlePeriodChange = (key: PeriodKey) => {
    setSelectedPeriod(key);
    if (key === 'custom') {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
    }
  };

  const handleApplyCustomPeriod = () => {
    if (!customStart || !customEnd) return;
    loadDashboard('custom', false, customStart, customEnd);
  };

  // Active store resolution (prefer fresh store data from dashboard API if available)
  const activeStore = dashboardData?.store || store;

  // Setup / Readiness evaluation (truthful checks from backend entitlement)
  const isLive = activeStore?.status === 'LIVE' || activeStore?.status === 'ACTIVE';
  const hasActiveSubscription = Boolean(
    activeStore?.publicVisibility ? !activeStore.publicVisibility.requiresPayment : activeStore?.subscription?.status === 'ACTIVE' ||
    activeStore?.subscriptionStatus === 'ACTIVE' ||
    (activeStore?.publicVisibility?.canBePublic && activeStore?.status !== 'EXPIRED')
  );
  const isStorePublic = Boolean(
    activeStore?.publicVisibility?.isPublic ?? (activeStore?.isPubliclyAccessible && isLive)
  );

  const baseStorefrontUrl = getStorefrontUrl();
  const storefrontUrl = activeStore?.slug
    ? isStorePublic
      ? getPublicStoreUrl(activeStore.slug, baseStorefrontUrl)
      : getPublicStoreUrl(activeStore.slug, baseStorefrontUrl, { preview: true })
    : '#';

  const handleShareStore = () => {
    if (!activeStore?.slug) return;
    const url = isStorePublic
      ? getPublicStoreUrl(activeStore.slug, baseStorefrontUrl)
      : getPublicStoreUrl(activeStore.slug, baseStorefrontUrl, { preview: true });

    if (navigator.share && isStorePublic) {
      navigator.share({ title: activeStore.name, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Safe unpacked data
  const metrics = dashboardData?.metrics || {
    revenuePaise: 0,
    orders: 0,
    enquiries: 0,
    customers: 0,
    pendingOrders: 0,
    lowStock: 0,
    activeProducts: 0,
    averageOrderValuePaise: 0,
  };

  const comparison = dashboardData?.comparison || {};
  const attention = dashboardData?.attention || {};
  const returningCount = dashboardData?.customerInsights?.returningCustomers || 0;

  // Extract real period series data for dynamic sparklines
  const salesSeriesList = dashboardData?.salesSeries || [];
  const totalSalesSeries = salesSeriesList.map((s: any) => (s.revenuePaise ?? 0) / 100);
  const ordersSeries = salesSeriesList.map((s: any) => s.orders ?? 0);
  const enquiriesSeries = salesSeriesList.map((s: any) => s.enquiries ?? 0);
  const customersSeries = salesSeriesList.map((s: any) => s.customers ?? 0);
  const aovSeries = salesSeriesList.map((s: any) => (s.aovPaise ?? 0) / 100);

  const isSubscriptionValid = Boolean(
    hasActiveSubscription ||
    (activeStore?.status !== 'EXPIRED' && !attention.subscriptionRequiresAction)
  );
  const effectiveBranding = activeStore?.branding || store?.branding;
  const hasBrandingMedia = Boolean(effectiveBranding?.logoUrl || effectiveBranding?.heroMediaId || effectiveBranding?.bannerUrl);
  const hasCustomTheme = Boolean(
    (activeStore?.themeConfigs && activeStore.themeConfigs.length > 0) ||
    (effectiveBranding?.primaryColor && effectiveBranding?.primaryColor !== '#1E3A8A')
  );
  const isBrandingComplete = Boolean(hasBrandingMedia || hasCustomTheme);
  const isPaymentConfigured = Boolean(!attention.paymentSetupIncomplete);
  const isShippingConfigured = Boolean(!attention.shippingSetupIncomplete);
  const hasProducts = Boolean(metrics.activeProducts > 0);
  const hasBusinessInfo = Boolean(activeStore?.name && activeStore?.slug);

  const [storePreviewed, setStorePreviewed] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setStorePreviewed(localStorage.getItem('simply_store_previewed') === 'true');
    }
  }, []);
  const isStorePreviewed = Boolean(storePreviewed || activeStore?.status === 'LIVE' || isLive);

  // =========================================================================
  // DYNAMIC ATTENTION PRIORITY RULES (STRICTLY TRUTHFUL & ORDERED)
  // =========================================================================
  const issues: { text: string; link: string; linkText: string; priority: number }[] = [];

  if (attention.subscriptionRequiresAction || activeStore?.status === 'EXPIRED' || !hasActiveSubscription) {
    issues.push({
      priority: 1,
      text: t('dashboard.subscriptionRequired'),
      link: '/subscription',
      linkText: `${t('dashboard.viewPlans')} →`,
    });
  } else if (!isStorePublic && !isLive) {
    issues.push({
      priority: 2,
      text: t('dashboard.storePrivateMode'),
      link: '/subscription',
      linkText: `${t('dashboard.activateStore')} →`,
    });
  }

  if (attention.paymentSetupIncomplete) {
    issues.push({
      priority: 3,
      text: t('dashboard.paymentIncomplete'),
      link: '/settings',
      linkText: `${t('dashboard.configurePayments')} →`,
    });
  }

  if (attention.shippingSetupIncomplete) {
    issues.push({
      priority: 4,
      text: t('dashboard.shippingIncomplete'),
      link: '/settings',
      linkText: `${t('dashboard.configureDelivery')} →`,
    });
  }

  if (metrics.activeProducts === 0) {
    issues.push({
      priority: 5,
      text: t('dashboard.noProductsCatalog'),
      link: '/products',
      linkText: `${t('dashboard.addProduct')} →`,
    });
  }

  if (metrics.pendingOrders > 0) {
    issues.push({
      priority: 6,
      text: `${metrics.pendingOrders} ${t('dashboard.pendingOrdersCount')}`,
      link: '/orders',
      linkText: `${t('dashboard.manageOrders')} →`,
    });
  }

  if (metrics.lowStock > 0) {
    issues.push({
      priority: 7,
      text: `${metrics.lowStock} ${t('dashboard.lowStock')}`,
      link: '/products',
      linkText: `${t('dashboard.restock')} →`,
    });
  }

  if (!isBrandingComplete) {
    issues.push({
      priority: 8,
      text: t('dashboard.storeBrandingIncomplete'),
      link: '/brand-studio',
      linkText: `${t('dashboard.customizeStore')} →`,
    });
  }

  if (!hasBusinessInfo) {
    issues.push({
      priority: 9,
      text: t('dashboard.businessInfoIncomplete'),
      link: '/settings',
      linkText: `${t('common.edit')} →`,
    });
  }

  // Sort strictly by priority
  issues.sort((a, b) => a.priority - b.priority);

  const storeStatusText =
    isStorePublic
      ? t('common.active')
      : activeStore?.status === 'EXPIRED'
      ? t('navigation.expired')
      : t('navigation.private');

  // =========================================================================
  // DYNAMIC GUIDANCE: YOUR NEXT STEP / GROW YOUR STORE (6 TRUTHFUL CHECKS)
  // =========================================================================
  const setupChecklist = [
    { label: t('dashboard.businessInfo'), done: hasBusinessInfo },
    { label: t('dashboard.productsAdded'), done: hasProducts },
    { label: t('dashboard.storeDesigned'), done: isBrandingComplete },
    { label: t('dashboard.storePreviewed'), done: isStorePreviewed },
    { label: t('dashboard.payments'), done: isPaymentConfigured },
    { label: t('dashboard.deliverySetup'), done: isShippingConfigured },
  ];
  const completedSteps = setupChecklist.filter((s) => s.done).length;
  const totalSteps = setupChecklist.length; // 6
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  let nextAction: {
    priority: number;
    title: string;
    description: string;
    primaryCta: { label: string; action: () => void };
    secondaryCta?: { label: string; action: () => void };
    badge: string;
    icon: any;
    stepsLabel: string;
    steps: Array<{ step: number; title: string; desc: string }>;
  };

  if (!isSubscriptionValid || activeStore?.status === 'EXPIRED') {
    nextAction = {
      priority: 0,
      badge: 'PLAN',
      title: t('dashboard.choosePlanTitle'),
      description: t('dashboard.choosePlanDesc'),
      stepsLabel: t('dashboard.growthStepsHeading'),
      steps: [
        { step: 1, title: 'Launch Plan', desc: 'Activate your branded online store for ₹999 + GST / 30 days.' },
        { step: 2, title: 'Complete Payment', desc: 'Pay securely via UPI, Card, or NetBanking.' },
        { step: 3, title: 'Make Store Live', desc: 'Immediately enable public checkout and sharing.' },
      ],
      primaryCta: {
        label: t('dashboard.viewPlans'),
        action: () => router.push('/subscription'),
      },
      secondaryCta: {
        label: t('navigation.storePreview'),
        action: () => {
          if (typeof window !== 'undefined') localStorage.setItem('simply_store_previewed', 'true');
          setStorePreviewed(true);
          router.push('/store-preview');
        },
      },
      icon: Sparkles,
    };
  } else if (!hasBusinessInfo) {
    // Step 1: Business info
    nextAction = {
      priority: 1,
      badge: 'BUSINESS INFO',
      title: 'Complete Your Business Profile',
      description: 'Set your official store name, handle slug, and primary contact channels so customers can find you.',
      stepsLabel: 'Step 1 of 6: Setup business details in 3 quick actions:',
      steps: [
        { step: 1, title: 'Store Name & Handle', desc: 'Choose a memorable brand name and unique web address slug.' },
        { step: 2, title: 'Contact & WhatsApp', desc: 'Provide phone and WhatsApp so shoppers can reach you directly.' },
        { step: 3, title: 'Store Location', desc: 'Add your business address and operating city for customer trust.' },
      ],
      primaryCta: {
        label: 'Update Business Info',
        action: () => router.push('/settings'),
      },
      secondaryCta: {
        label: t('navigation.storePreview'),
        action: () => {
          if (typeof window !== 'undefined') localStorage.setItem('simply_store_previewed', 'true');
          setStorePreviewed(true);
          router.push('/store-preview');
        },
      },
      icon: Building2,
    };
  } else if (!hasProducts) {
    // Step 2: Products added
    nextAction = {
      priority: 2,
      badge: 'CATALOG',
      title: t('dashboard.addProductsTitle'),
      description: t('dashboard.addProductsDesc'),
      stepsLabel: 'Step 2 of 6: Add items to your catalog in 3 quick actions:',
      steps: [
        { step: 1, title: 'Enter Product Details', desc: 'Provide title, description, and assign the right category.' },
        { step: 2, title: 'Upload Product Photos', desc: 'Add 1 to 3 crisp photos showcasing your item from different angles.' },
        { step: 3, title: 'Set Pricing & Stock', desc: 'Define your MRP, selling discount price, and initial inventory.' },
      ],
      primaryCta: {
        label: t('dashboard.addProduct'),
        action: () => setProductDrawerOpen(true),
      },
      secondaryCta: {
        label: t('navigation.storePreview'),
        action: () => {
          if (typeof window !== 'undefined') localStorage.setItem('simply_store_previewed', 'true');
          setStorePreviewed(true);
          router.push('/store-preview');
        },
      },
      icon: Package,
    };
  } else if (!isBrandingComplete) {
    // Step 3: Store designed
    nextAction = {
      priority: 3,
      badge: 'BRANDING',
      title: t('dashboard.brandingTitle'),
      description: t('dashboard.brandingDesc'),
      stepsLabel: 'Step 3 of 6: Style your storefront in 3 quick actions:',
      steps: [
        { step: 1, title: 'Theme Colors & Fonts', desc: 'Pick your brand palette, header style, and font pairing in Brand Studio.' },
        { step: 2, title: 'Banner & Store Logo', desc: 'Upload your storefront hero cover banner and distinct logo mark.' },
        { step: 3, title: 'Curate Showcase Sections', desc: 'Arrange featured collections, hero highlights, and store announcements.' },
      ],
      primaryCta: {
        label: t('dashboard.customizeStore'),
        action: () => router.push('/brand-studio'),
      },
      secondaryCta: {
        label: t('navigation.storePreview'),
        action: () => {
          if (typeof window !== 'undefined') localStorage.setItem('simply_store_previewed', 'true');
          setStorePreviewed(true);
          router.push('/store-preview');
        },
      },
      icon: Palette,
    };
  } else if (!isStorePreviewed) {
    // Step 4: Store previewed
    nextAction = {
      priority: 4,
      badge: 'PREVIEW',
      title: 'Review Your Storefront Preview',
      description: 'Preview how your catalogue and layout look to mobile and desktop buyers before launch.',
      stepsLabel: 'Step 4 of 6: Inspect store experience in 3 quick actions:',
      steps: [
        { step: 1, title: 'Review Mobile Layout', desc: 'Inspect responsive header, product grids, and category carousels.' },
        { step: 2, title: 'Test Cart & Navigation', desc: 'Add an item to cart and verify checkout order summary flow.' },
        { step: 3, title: 'Confirm Storefront Ready', desc: 'Check WhatsApp direct enquiry and contact links on your storefront.' },
      ],
      primaryCta: {
        label: t('navigation.storePreview'),
        action: () => {
          if (typeof window !== 'undefined') localStorage.setItem('simply_store_previewed', 'true');
          setStorePreviewed(true);
          router.push('/store-preview');
        },
      },
      secondaryCta: {
        label: t('dashboard.customizeStore'),
        action: () => router.push('/brand-studio'),
      },
      icon: Eye,
    };
  } else if (!isPaymentConfigured) {
    // Step 5: Payments
    nextAction = {
      priority: 5,
      badge: 'PAYMENTS',
      title: t('dashboard.paymentTitle'),
      description: t('dashboard.paymentDesc'),
      stepsLabel: 'Step 5 of 6: Configure payments in 3 quick actions:',
      steps: [
        { step: 1, title: 'Select Payment Modes', desc: 'Choose UPI QR, Razorpay gateway, or Cash on Delivery.' },
        { step: 2, title: 'Provide Account Details', desc: 'Enter your merchant UPI VPA or Razorpay API credentials.' },
        { step: 3, title: 'Test Checkout', desc: 'Place a test order to verify payments credit your account smoothly.' },
      ],
      primaryCta: {
        label: t('dashboard.configurePayments'),
        action: () => router.push('/settings'),
      },
      secondaryCta: {
        label: t('navigation.storePreview'),
        action: () => {
          if (typeof window !== 'undefined') localStorage.setItem('simply_store_previewed', 'true');
          setStorePreviewed(true);
          router.push('/store-preview');
        },
      },
      icon: CreditCard,
    };
  } else if (!isShippingConfigured) {
    // Step 6: Delivery setup
    nextAction = {
      priority: 6,
      badge: 'DELIVERY',
      title: t('dashboard.deliveryTitle'),
      description: t('dashboard.deliveryDesc'),
      stepsLabel: 'Step 6 of 6: Setup shipping & delivery in 3 quick actions:',
      steps: [
        { step: 1, title: 'Set Serviceable Areas', desc: 'Define cities, states or serviceable pincodes.' },
        { step: 2, title: 'Define Shipping Rates', desc: 'Set standard flat shipping fee and free delivery cart threshold.' },
        { step: 3, title: 'Set Dispatch Timelines', desc: 'Specify estimated handling and delivery turnaround days.' },
      ],
      primaryCta: {
        label: t('dashboard.configureDelivery'),
        action: () => router.push('/settings'),
      },
      secondaryCta: {
        label: t('navigation.storePreview'),
        action: () => {
          if (typeof window !== 'undefined') localStorage.setItem('simply_store_previewed', 'true');
          setStorePreviewed(true);
          router.push('/store-preview');
        },
      },
      icon: Truck,
    };
  } else {
    // All 6 steps complete!
    nextAction = {
      priority: 7,
      badge: 'GROW',
      title: t('dashboard.storeReadyTitle'),
      description: t('dashboard.storeReadySubtitle'),
      stepsLabel: t('dashboard.growthStepsHeading'),
      steps: [
        { step: 1, title: t('dashboard.growthStep1Title'), desc: t('dashboard.growthStep1Desc') },
        { step: 2, title: t('dashboard.growthStep2Title'), desc: t('dashboard.growthStep2Desc') },
        { step: 3, title: t('dashboard.growthStep3Title'), desc: t('dashboard.growthStep3Desc') },
      ],
      primaryCta: {
        label: t('dashboard.shareStore'),
        action: handleShareStore,
      },
      secondaryCta: {
        label: t('dashboard.viewStore'),
        action: () => {
          if (activeStore?.slug) {
            window.open(getPublicStoreUrl(activeStore.slug, baseStorefrontUrl), '_blank');
          }
        },
      },
      icon: Share2,
    };
  }


  if (authLoading || (loading && !dashboardData)) {
    return (
      <Layout title={t('navigation.dashboard')}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-slate-400 mx-auto mb-3" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {t('common.loading')}
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('navigation.dashboard')}>
      <Head>
        <title>{t('navigation.dashboard')} | Simply Merchant Portal</title>
      </Head>

      <div className="space-y-2.5 sm:space-y-3">
        {/* =========================================================================
            PART 3: COMPACT DASHBOARD TITLE BAR
            Left: Dashboard, Welcome back, {store.name} · {Status}
            Right: Global period selector + [View Storefront]
        ========================================================================= */}
        <section className="bg-[var(--merchant-surface)] rounded-xl sm:rounded-2xl p-3 sm:p-3.5 md:py-3 md:px-4.5 border border-[var(--merchant-border)] shadow-2xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
            {/* Left Info */}
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-[11px] font-bold text-[var(--merchant-primary)] uppercase tracking-wider">
                  {t('navigation.dashboard')}
                </span>
                <span className="text-[var(--merchant-text-muted)] text-xs">•</span>
                <span className="text-[11px] sm:text-xs font-medium text-[var(--merchant-text-secondary)]">
                  {activeStore?.name || store?.name || 'My Store'} ·{' '}
                  <span className={isStorePublic ? 'text-emerald-500 font-semibold' : 'text-[var(--merchant-primary)] font-semibold'}>
                    {storeStatusText}
                  </span>
                  {activeStore?.subscription?.currentPeriodEnd && hasActiveSubscription && (
                    <span className="text-[var(--merchant-text-muted)] text-[11px] ml-2 font-normal hidden sm:inline">
                      (Renews {new Date(activeStore.subscription.currentPeriodEnd).toLocaleDateString()})
                    </span>
                  )}
                </span>
                {isRefreshing && (
                  <span className="inline-flex items-center text-[10px] text-[var(--merchant-text-muted)] gap-1 ml-2">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    <span>{t('common.updating')}</span>
                  </span>
                )}
              </div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-[var(--merchant-text)] truncate">
                {t('dashboard.welcomeBack')}, {store?.name || 'Merchant'}
              </h1>
            </div>

            {/* Right Controls: Period Selector + View Store */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Desktop Period Selector: Compact segmented chips */}
              <div className="hidden sm:inline-flex items-center bg-[var(--merchant-surface-muted)] p-0.5 rounded-xl border border-[var(--merchant-border)]">
                {periodOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handlePeriodChange(opt.key)}
                    className={`px-2 sm:px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                      selectedPeriod === opt.key
                        ? 'bg-[var(--merchant-surface-raised)] text-[var(--merchant-text)] shadow-xs'
                        : 'text-[var(--merchant-text-secondary)] hover:text-[var(--merchant-text)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Mobile Period Dropdown */}
              <div className="sm:hidden relative">
                <select
                  value={selectedPeriod}
                  onChange={(e) => handlePeriodChange(e.target.value as PeriodKey)}
                  className="appearance-none bg-[var(--merchant-surface-muted)] border border-[var(--merchant-border)] text-[var(--merchant-text)] text-xs font-semibold rounded-xl px-2.5 py-1.5 pr-7 shadow-2xs focus:outline-hidden"
                >
                  {periodOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--merchant-text-muted)] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* View Storefront Link */}
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-xl text-xs font-bold bg-[var(--merchant-primary)] hover:bg-[var(--merchant-primary-hover)] text-white shadow-xs transition-colors shrink-0"
              >
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                <span>{t('dashboard.viewStorefront')}</span>
              </a>
            </div>
          </div>

          {/* Custom Date Range Form if selected */}
          {showCustomPicker && (
            <div className="mt-2.5 pt-2.5 border-t border-[var(--merchant-border)] flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[var(--merchant-text)]">{t('dashboard.customDateRange')}:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1 bg-[var(--merchant-input-bg)] border border-[var(--merchant-input-border)] text-[var(--merchant-text)] rounded-lg text-xs"
              />
              <span className="text-[var(--merchant-text-muted)]">{t('dashboard.to')}</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1 bg-[var(--merchant-input-bg)] border border-[var(--merchant-input-border)] text-[var(--merchant-text)] rounded-lg text-xs"
              />
              <button
                type="button"
                onClick={handleApplyCustomPeriod}
                className="px-3 py-1 bg-[var(--merchant-primary)] text-white text-xs font-semibold rounded-lg hover:bg-[var(--merchant-primary-hover)]"
              >
                {t('common.apply')}
              </button>
            </div>
          )}
        </section>

        {/* =========================================================================
            PART 4: NEEDS IMMEDIATE ATTENTION — DYNAMIC & AUTO-DISMISSING
        ========================================================================= */}
        {issues.length > 0 && (
          <div className="bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 rounded-xl px-3.5 py-2 text-xs text-amber-900 dark:text-amber-200 shadow-2xs transition-all">
            {/* Desktop View: Single horizontal strip */}
            <div className="hidden sm:flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="font-bold text-amber-950 dark:text-amber-100 shrink-0">
                  {t('dashboard.needsImmediateAttention')} ({issues.length})
                </span>
                <span className="text-amber-400">•</span>
                <span className="truncate text-amber-900 dark:text-amber-300 font-medium">
                  {issues[0].text}
                </span>
                {issues.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowAllIssues(!showAllIssues)}
                    className="text-[10px] bg-amber-200/60 dark:bg-amber-900/60 hover:bg-amber-300/60 dark:hover:bg-amber-800/60 px-1.5 py-0.5 rounded text-amber-900 dark:text-amber-200 font-semibold shrink-0 cursor-pointer transition-colors"
                  >
                    {showAllIssues ? t('dashboard.hideOthers') : t('dashboard.moreCount', { count: issues.length - 1 })}
                  </button>
                )}
              </div>

              <a
                href={issues[0].link}
                onClick={(e) => {
                  e.preventDefault();
                  router.push(issues[0].link);
                }}
                className="text-xs font-bold text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 underline underline-offset-2 shrink-0 ml-3"
              >
                {issues[0].linkText}
              </a>
            </div>

            {/* Mobile View: Controlled 2-row layout */}
            <div className="sm:hidden flex flex-col gap-1.5">
              {/* Row 1: Icon + Title + Count (+ More button) */}
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="font-bold text-amber-950 dark:text-amber-100 text-[11px]">
                    {t('dashboard.needsImmediateAttention')} ({issues.length})
                  </span>
                </div>
                {issues.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowAllIssues(!showAllIssues)}
                    className="text-[10px] bg-amber-200/60 dark:bg-amber-900/60 px-1.5 py-0.5 rounded text-amber-900 dark:text-amber-200 font-semibold cursor-pointer"
                  >
                    {showAllIssues ? t('common.close') : t('dashboard.moreCount', { count: issues.length - 1 })}
                  </button>
                )}
              </div>

              {/* Row 2: Primary Issue + Matching CTA */}
              <div className="flex items-center justify-between w-full pt-1 border-t border-amber-500/20 text-[11px]">
                <span className="truncate text-amber-900 dark:text-amber-300 font-medium">
                  {issues[0].text}
                </span>
                <a
                  href={issues[0].link}
                  onClick={(e) => {
                    e.preventDefault();
                    router.push(issues[0].link);
                  }}
                  className="font-bold text-amber-800 dark:text-amber-300 underline shrink-0 ml-2 whitespace-nowrap"
                >
                  {issues[0].linkText}
                </a>
              </div>
            </div>

            {/* Expandable list when +N more is clicked */}
            {showAllIssues && issues.length > 1 && (
              <div className="mt-2 pt-2 border-t border-amber-500/20 space-y-1 text-[11px]">
                {issues.slice(1).map((iss, idx) => (
                  <div key={idx} className="flex items-center justify-between text-amber-900 dark:text-amber-300 py-0.5">
                    <span className="truncate">• {iss.text}</span>
                    <a
                      href={iss.link}
                      onClick={(e) => {
                        e.preventDefault();
                        router.push(iss.link);
                      }}
                      className="font-bold text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 underline shrink-0 ml-2"
                    >
                      {iss.linkText}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            PART 5 & 6: DASHBOARD METRICS — EXACTLY EIGHT CARDS
        ========================================================================= */}
        <section aria-label="Business and Operational Metrics" className="space-y-2 sm:space-y-2.5">
          {/* Row 1 — Business Performance with Real Period Sparklines */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5 lg:gap-3">
            {/* 1. Total Sales */}
            <DashboardMetricCard
              label={t('dashboard.revenue')}
              value={formatPaise(metrics.revenuePaise)}
              subtitle={t('dashboard.paidEligibleOrders')}
              icon={<TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--merchant-primary)]" />}
              iconBgClass="bg-[var(--merchant-primary-soft)]"
              trend={comparison.revenuePercent}
              sparklineData={totalSalesSeries}
              sparklineColor="var(--merchant-primary)"
            />

            {/* 2. Orders */}
            <DashboardMetricCard
              label={t('dashboard.orders')}
              value={metrics.orders}
              subtitle={t('dashboard.totalPlacedOrders')}
              icon={<ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--merchant-primary)]" />}
              iconBgClass="bg-[var(--merchant-primary-soft)]"
              trend={comparison.ordersPercent}
              sparklineData={ordersSeries}
              sparklineColor="var(--merchant-primary)"
            />

            {/* 3. Enquiries / RFQs */}
            <DashboardMetricCard
              label={t('dashboard.enquiries')}
              value={metrics.enquiries}
              subtitle={t('dashboard.b2bQuotationRequests')}
              icon={<MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--merchant-accent)]" />}
              iconBgClass="bg-[var(--merchant-accent-soft)]"
              trend={comparison.enquiriesPercent}
              sparklineData={enquiriesSeries}
              sparklineColor="var(--merchant-accent)"
            />

            {/* 4. Customers */}
            <DashboardMetricCard
              label={t('dashboard.customers')}
              value={metrics.customers}
              subtitle={`${returningCount} ${t('dashboard.returningBuyers')}`}
              icon={<Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />}
              iconBgClass="bg-emerald-500/10"
              trend={comparison.customersPercent}
              sparklineData={customersSeries}
              sparklineColor="#10B981"
            />
          </div>

          {/* Row 2 — Operational Metrics & Point-in-Time Status Meters */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5 lg:gap-3">
            {/* 5. Pending Orders */}
            <DashboardMetricCard
              label={t('dashboard.pendingOrders')}
              value={metrics.pendingOrders}
              subtitle={t('dashboard.needsFulfillment')}
              icon={<Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />}
              iconBgClass="bg-amber-500/10"
              actionText={`${t('common.manage')} →`}
              onAction={() => router.push('/orders')}
              statusMeterType="pending"
              statusMeterValue={metrics.pendingOrders}
            />

            {/* 6. Low Stock (≤ 5) */}
            <DashboardMetricCard
              label={t('dashboard.lowStock')}
              value={metrics.lowStock}
              subtitle={t('dashboard.variantsToRestock')}
              icon={<AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500" />}
              iconBgClass="bg-rose-500/10"
              actionText={`${t('dashboard.restock')} →`}
              onAction={() => router.push('/products')}
              actionColorClass="text-rose-500 hover:text-rose-600"
              statusMeterType="stock"
              statusMeterValue={metrics.lowStock}
            />

            {/* 7. Active Products */}
            <DashboardMetricCard
              label={t('dashboard.activeProducts')}
              value={metrics.activeProducts}
              subtitle={t('dashboard.liveInCatalog')}
              icon={<Boxes className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--merchant-primary)]" />}
              iconBgClass="bg-[var(--merchant-primary-soft)]"
              actionText={`${t('dashboard.catalog')} →`}
              onAction={() => router.push('/products')}
              statusMeterType="catalog"
              statusMeterValue={metrics.activeProducts}
            />

            {/* 8. Avg Order Value */}
            <DashboardMetricCard
              label={t('dashboard.averageOrderValue')}
              value={formatPaise(metrics.averageOrderValuePaise)}
              subtitle={t('dashboard.perPaidOrder')}
              icon={<TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--merchant-primary)]" />}
              iconBgClass="bg-[var(--merchant-primary-soft)]"
              sparklineData={aovSeries}
              sparklineColor="var(--merchant-primary)"
            />
          </div>
        </section>

        {/* =========================================================================
            PART 9: QUICK ACTIONS — EXACTLY FOUR COMPACT INTERACTIVE CARDS
        ========================================================================= */}
        <section aria-label="Quick Actions" className="bg-[var(--merchant-surface)] rounded-xl sm:rounded-2xl p-3 sm:p-3.5 md:py-3 md:px-4.5 border border-[var(--merchant-border)] shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] sm:text-xs font-bold text-[var(--merchant-text-muted)] uppercase tracking-wider">
              {t('dashboard.quickActions')}
            </h2>
            <button
              type="button"
              onClick={() => router.push('/analytics')}
              className="text-xs font-bold text-[var(--merchant-primary)] hover:text-[var(--merchant-primary-hover)] flex items-center gap-1 group"
            >
              <span>{t('dashboard.viewBusinessAnalytics')}</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5 lg:gap-3">
            {/* Action 1: Add Product */}
            <button
              type="button"
              onClick={() => setProductDrawerOpen(true)}
              className="p-2.5 sm:p-3 bg-[var(--merchant-surface-raised)] hover:bg-[var(--merchant-surface-muted)] rounded-xl sm:rounded-2xl border border-[var(--merchant-border)] text-left transition-all duration-200 hover:-translate-y-0.5 shadow-2xs hover:shadow-xs group flex flex-col justify-between min-h-[68px] sm:min-h-[74px]"
            >
              <div className="flex items-center justify-between w-full">
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-[var(--merchant-primary-soft)] text-[var(--merchant-primary)] flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--merchant-text-muted)] group-hover:text-[var(--merchant-primary)] transition-colors" />
              </div>
              <div className="mt-1.5">
                <div className="text-xs sm:text-sm font-bold text-[var(--merchant-text)] group-hover:text-[var(--merchant-primary)] transition-colors truncate">
                  {t('dashboard.addProduct')}
                </div>
                <div className="text-[10px] sm:text-[11px] text-[var(--merchant-text-muted)] font-medium mt-0.5 truncate">{t('dashboard.quickActionAddProductSubtitle')}</div>
              </div>
            </button>

            {/* Action 2: Manage Orders */}
            <button
              type="button"
              onClick={() => router.push('/orders')}
              className="p-2.5 sm:p-3 bg-[var(--merchant-surface-raised)] hover:bg-[var(--merchant-surface-muted)] rounded-xl sm:rounded-2xl border border-[var(--merchant-border)] text-left transition-all duration-200 hover:-translate-y-0.5 shadow-2xs hover:shadow-xs group flex flex-col justify-between min-h-[68px] sm:min-h-[74px]"
            >
              <div className="flex items-center justify-between w-full">
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--merchant-text-muted)] group-hover:text-[var(--merchant-primary)] transition-colors" />
              </div>
              <div className="mt-1.5">
                <div className="text-xs sm:text-sm font-bold text-[var(--merchant-text)] group-hover:text-[var(--merchant-primary)] transition-colors truncate">
                  {t('dashboard.manageOrders')}
                </div>
                <div className="text-[10px] sm:text-[11px] text-[var(--merchant-text-muted)] font-medium mt-0.5 truncate">{t('dashboard.quickActionManageOrdersSubtitle')}</div>
              </div>
            </button>

            {/* Action 3: Customize Store */}
            <button
              type="button"
              onClick={() => router.push('/brand-studio')}
              className="p-2.5 sm:p-3 bg-[var(--merchant-surface-raised)] hover:bg-[var(--merchant-surface-muted)] rounded-xl sm:rounded-2xl border border-[var(--merchant-border)] text-left transition-all duration-200 hover:-translate-y-0.5 shadow-2xs hover:shadow-xs group flex flex-col justify-between min-h-[68px] sm:min-h-[74px]"
            >
              <div className="flex items-center justify-between w-full">
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-[var(--merchant-accent-soft)] text-[var(--merchant-accent)] flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
                  <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--merchant-text-muted)] group-hover:text-[var(--merchant-primary)] transition-colors" />
              </div>
              <div className="mt-1.5">
                <div className="text-xs sm:text-sm font-bold text-[var(--merchant-text)] group-hover:text-[var(--merchant-primary)] transition-colors truncate">
                  {t('dashboard.customizeStore')}
                </div>
                <div className="text-[10px] sm:text-[11px] text-[var(--merchant-text-muted)] font-medium mt-0.5 truncate">{t('dashboard.quickActionCustomizeStoreSubtitle')}</div>
              </div>
            </button>

            {/* Action 4: Share Store */}
            <button
              type="button"
              onClick={handleShareStore}
              className="p-2.5 sm:p-3 bg-[var(--merchant-surface-raised)] hover:bg-[var(--merchant-surface-muted)] rounded-xl sm:rounded-2xl border border-[var(--merchant-border)] text-left transition-all duration-200 hover:-translate-y-0.5 shadow-2xs hover:shadow-xs group flex flex-col justify-between min-h-[68px] sm:min-h-[74px]"
            >
              <div className="flex items-center justify-between w-full">
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
                  {copiedLink ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--merchant-text-muted)] group-hover:text-[var(--merchant-primary)] transition-colors" />
              </div>
              <div className="mt-1.5">
                <div className="text-xs sm:text-sm font-bold text-[var(--merchant-text)] group-hover:text-[var(--merchant-primary)] transition-colors truncate">
                  {copiedLink ? t('dashboard.copiedToClipboard') : t('dashboard.shareStore')}
                </div>
                <div className="text-[10px] sm:text-[11px] text-[var(--merchant-text-muted)] font-medium mt-0.5 truncate">{t('dashboard.quickActionShareStoreSubtitle')}</div>
              </div>
            </button>
          </div>
        </section>

        {/* =========================================================================
            PART 10: YOUR NEXT STEP / GROW YOUR STORE — FULL-WIDTH DYNAMIC COMPOSITION
        ========================================================================= */}
        <section
          aria-label="Your Next Step"
          className="w-full rounded-xl sm:rounded-2xl p-4 sm:p-5 md:py-4.5 md:px-5.5 text-white shadow-md relative overflow-hidden transition-all duration-200 border
            /* DARK THEME: Graphite to Violet deep gradient */
            dark:bg-gradient-to-r dark:from-[#171822] dark:via-[#251A46] dark:to-[#38206A] dark:border-violet-500/25
            /* LIGHT THEME: Rich contrasting deep sage / olive panel */
            bg-gradient-to-r from-[#203427] via-[#2A4433] to-[#365741] border-emerald-700/30"
        >
          {/* Subtle ambient light glow */}
          <div className="absolute -right-16 -top-16 w-80 h-80 bg-[var(--merchant-accent)]/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-3.5 sm:space-y-4 w-full">
            {/* ROW 1: Eyebrow + Title + Description | Illustration | Progress & CTAs */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4 w-full">
              {/* Left Area: Title & Description */}
              <div className="space-y-1.5 flex-1 min-w-0 pr-0 lg:pr-3">
                <div className="flex items-center gap-1.5">
                  <span className="p-1 rounded-md bg-white/10 text-[var(--merchant-accent)]">
                    <nextAction.icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--merchant-accent)]">
                    {t('dashboard.yourNextStep')} • {nextAction.badge}
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-black text-white tracking-tight leading-snug">
                  {nextAction.title}
                </h3>

                <p className="text-xs sm:text-[13px] text-white/85 leading-relaxed font-normal max-w-2xl">
                  {nextAction.description}
                </p>
              </div>

              {/* Center: StoreLaunchIllustration (hidden on mobile, visible on laptop/desktop) */}
              <div className="hidden md:flex items-center justify-center shrink-0 px-2 lg:px-4">
                <StoreLaunchIllustration className="text-white hover:scale-105 transition-transform duration-300" />
              </div>

              {/* Right Area: Progress Card + Action Buttons */}
              <div className="w-full lg:w-76 xl:w-80 shrink-0 flex flex-col justify-between gap-2.5 lg:pl-4 lg:border-l lg:border-white/15">
                {/* Progress counter & bar */}
                <div className="space-y-1.5 bg-black/20 dark:bg-black/30 p-2.5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between text-xs text-white font-medium">
                    <span className="text-white/80">{t('dashboard.storeSetup')}</span>
                    <span className="font-bold text-white tracking-wide">
                      {t('dashboard.completeOf', { completed: completedSteps, total: totalSteps })}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--merchant-accent)] rounded-full transition-all duration-500 shadow-xs"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  {nextAction.secondaryCta && (
                    <button
                      type="button"
                      onClick={nextAction.secondaryCta.action}
                      className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all shadow-xs text-center whitespace-nowrap"
                    >
                      {nextAction.secondaryCta.label}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={nextAction.primaryCta.action}
                    className="flex-1 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs text-center whitespace-nowrap flex items-center justify-center gap-1.5
                      /* DARK: Violet primary CTA */
                      dark:bg-[var(--merchant-primary)] dark:hover:bg-[var(--merchant-primary-hover)] dark:text-white
                      /* LIGHT: Gold primary CTA */
                      bg-[var(--merchant-accent)] hover:bg-[var(--merchant-accent-hover)] text-slate-950"
                  >
                    <span>{nextAction.primaryCta.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>
              </div>
            </div>

            {/* ROW 2: Setup Checklist — Strictly Single Line Across Full Width */}
            <div className="w-full pt-2.5 border-t border-white/15">
              <div className="w-full overflow-x-auto scrollbar-none py-2 px-3 sm:px-4 rounded-xl bg-black/20 dark:bg-black/30 border border-white/10">
                <div className="flex items-center justify-between min-w-max lg:min-w-0 gap-3 sm:gap-4 md:gap-6 text-xs whitespace-nowrap">
                  {setupChecklist.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 shrink-0">
                      {step.done ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full border border-white/50 shrink-0 inline-block" />
                      )}
                      <span className={step.done ? 'text-white/95 font-medium' : 'text-white/60'}>
                        {step.label}
                      </span>
                      {idx < setupChecklist.length - 1 && (
                        <span className="text-white/25 ml-2 hidden xl:inline">•</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ROW 3: Dynamic 1-2-3 Action Plan Explaining Steps in Brief */}
            <div className="w-full pt-1.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[var(--merchant-accent)] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <span>{nextAction.stepsLabel}</span>
                </span>
                <span className="text-white/50 text-[10px] hidden sm:inline">{t('dashboard.actionableRoadmap')}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-2.5 w-full">
                {nextAction.steps.map((st) => (
                  <div
                    key={st.step}
                    className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-xl bg-white/5 hover:bg-white/[0.08] border border-white/10 transition-colors"
                  >
                    <span className="w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full bg-[var(--merchant-accent)]/20 text-[var(--merchant-accent)] font-black text-xs flex items-center justify-center shrink-0 border border-[var(--merchant-accent)]/30 mt-0.5">
                      {st.step}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white tracking-tight truncate">
                        {st.title}
                      </div>
                      <p className="text-[11px] text-white/75 leading-relaxed mt-0.5 font-normal">
                        {st.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Product Editor Drawer for seamless Add Product */}
      {productDrawerOpen && <ProductEditorDrawer
        key={store?.id}
        isOpen={productDrawerOpen}
        productId={null}
        onClose={() => setProductDrawerOpen(false)}
        onSaved={() => {
          setProductDrawerOpen(false);
          loadDashboard(selectedPeriod, true);
        }}
      />}
    </Layout>
  );
}
