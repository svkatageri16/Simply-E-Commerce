import { getSellerUrl as getPreviewSellerOrigin } from '../../../utils/config';
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  ShoppingBag, 
  ArrowRight, 
  Star, 
  CheckCircle, 
  ShieldCheck, 
  ShieldAlert,
  Sparkles,
  Lock,
  ExternalLink,
  MessageSquare,
  Plus,
  Check,
  Truck,
  Award,
  Zap,
  Clock,
  FileText,
  Layers,
  Search,
  Building
} from 'lucide-react';
import { useCart } from '../../../context/CartContext';
import { useToast } from '../../../components/ui/Toast';
import { ThemeWrapper } from '../../../components/ThemeWrapper';
import { StoreHeader } from '../../../components/StoreHeader';
import { StoreFooter } from '../../../components/StoreFooter';
import { SafeImage } from '../../../components/ui/SafeImage';
import { formatPaise } from '@simply/ui';
import { getSellerStorePreviewUrl } from '../../../utils/config';
import { useStorefrontI18n } from '@simply/i18n';
import { logWhatsappEnquiry } from '../../../utils/enquiry';
import { getProductTranslation } from '../../../utils/productTranslation';
import { normalizeBrandText } from '@simply/types';

export default function StoreHomePage() {
  const router = useRouter();
  const { slug, preview, previewSecret } = router.query;
  const { setStoreId, api, addItem } = useCart();
  const { locale, t, initStoreLocales } = useStorefrontI18n();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState<any | null>(null);
  const loadRevision = useRef(0);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);

  useEffect(() => {
    if (router.query.embedded === 'true' && !loading && storeData) {
      window.parent.postMessage({ type: 'BRAND_PREVIEW_READY' }, new URL(getPreviewSellerOrigin()).origin);
    }
  }, [router.query.embedded, loading, Boolean(storeData)]);

  useEffect(() => {
    if (!slug) return;
    if (preview === 'true') {
      try {
        sessionStorage.setItem('simply_merchant_preview', 'true');
      } catch {}
    }
    const effectiveSecret =
      (typeof previewSecret === 'string' && previewSecret.trim() ? previewSecret.trim() : undefined) ||
      (typeof preview === 'string' && preview !== 'true' && preview.trim() ? preview.trim() : undefined);
    loadStorefront(String(slug), effectiveSecret);
  }, [slug, preview, previewSecret]);

  useEffect(() => {
    if (router.query.embedded === 'true') {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin === new URL(getPreviewSellerOrigin()).origin && event.source === window.parent && event.data?.type === 'UPDATE_THEME_PREVIEW' && event.data.themeConfig) {
          setStoreData((prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              themeConfig: {
                ...prev.themeConfig,
                ...normalizeBrandText(event.data.themeConfig),
                branding: {
                  ...prev.themeConfig?.branding,
                  ...event.data.branding,
                  ...event.data.themeConfig?.branding,
                },
              },
            };
          });
        }
      };
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, [router.query.embedded]);

  const loadStorefront = async (storeSlug: string, previewSecret?: string) => {
    const revision = ++loadRevision.current;
    setLoading(true);
    setErrorCode(null);
    setErrorMsg(null);
    try {
      const res = await api.stores.getPublicStorefront(storeSlug, previewSecret);
      if (revision !== loadRevision.current) return;
      setStoreData({ ...res, themeConfig: normalizeBrandText(res.themeConfig) });
      if (res.store && initStoreLocales) {
        initStoreLocales(res.store.storefrontDefaultLocale, res.store.enabledStorefrontLocales);
      }
      if (res.store?.id) {
        setStoreId(res.store.id);
      }
    } catch (err: any) {
      if (revision !== loadRevision.current) return;
      console.error('Failed to load storefront', err);
      const code = err.code || (err.status === 404 ? 'STORE_NOT_FOUND' : 'INTERNAL_ERROR');
      setErrorCode(code);
      setErrorMsg(err.message || 'Store unavailable');
    } finally {
      if (revision === loadRevision.current) setLoading(false);
    }
  };

  const handleQuickAdd = async (e: React.MouseEvent, product: any) => {
    e.preventDefault();
    e.stopPropagation();

    const isPreview = Boolean(
      storeData?.isPreview ||
      router.query.preview === 'true' ||
      (typeof window !== 'undefined' && sessionStorage.getItem('simply_merchant_preview') === 'true')
    );

    let variant = product.variants?.[0];
    if (!variant?.id || variant.id.startsWith('var_')) {
      router.push(getLink(`/store/${slug}/product/${product.id}`));
      return;
    }

    setAddingId(product.id);
    try {
      const primaryImg =
        product.media?.[0]?.publicUrl ||
        product.media?.[0]?.url ||
        product.images?.[0]?.url;

      await addItem(variant.id, 1, {
        productId: product.id,
        productName: product.name || product.title || 'Product',
        variantName: variant.name || variant.title || 'Standard',
        pricePaise: variant.pricePaise || product.minPricePaise || product.pricePaise || 0,
        imageUrl: primaryImg,
        sku: variant.sku || '',
      });
      setAddedId(product.id);
      toast.cartAdded(t('cartToast.added'));
      setTimeout(() => setAddedId(null), 2000);
    } catch (err: any) {
      console.error('Quick add failed', err);
      toast.error('Could Not Add Item', err?.message || 'Failed to add item to bag');
    } finally {
      setAddingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-600 font-mono">Loading storefront experience...</p>
        </div>
      </div>
    );
  }

  // Handle typed error states (STORE_PRIVATE, SUBSCRIPTION_REQUIRED, STORE_NOT_FOUND, NETWORK_OFFLINE, API_UNAVAILABLE, etc.)
  if (errorCode || !storeData) {
    let title = 'Storefront Unavailable';
    let description = errorMsg || 'This digital store is currently unavailable. Please check back shortly.';
    let icon = <Lock className="w-6 h-6" />;

    if (errorCode === 'STORE_SUSPENDED' || errorCode === 'TENANT_SUSPENDED') {
      title = 'This service has been suspended.';
      description = 'This store has been administratively suspended. If you believe this is in error, please contact LetzShop platform support.';
      icon = <ShieldAlert className="w-6 h-6 text-red-600" />;
    } else if (errorCode === 'STORE_PRIVATE' || errorCode === 'STORE_NOT_LIVE') {
      title = 'Private Merchant Storefront';
      description = 'This store is currently in private setup mode. It is accessible only by the merchant owner or platform admin via preview link.';
      icon = <Lock className="w-6 h-6 text-amber-600" />;
    } else if (errorCode === 'STORE_SUBSCRIPTION_EXPIRED') {
      title = 'Store Subscription Expired';
      description = 'This store subscription validity period has ended. Public access is temporarily paused until renewal.';
      icon = <Clock className="w-6 h-6 text-blue-600" />;
    } else if (errorCode === 'SUBSCRIPTION_REQUIRED' || errorCode === 'STORE_SUBSCRIPTION_REQUIRED') {
      title = 'Subscription Required';
      description = 'An active paid subscription is required to make this storefront public.';
      icon = <Lock className="w-6 h-6 text-gray-600" />;
    } else if (errorCode === 'STORE_NOT_FOUND') {
      title = 'Store Not Found';
      description = `No merchant storefront exists with the slug '${slug}'. Please check the URL and try again.`;
    } else if (errorCode === 'NETWORK_OFFLINE') {
      title = 'Unable to Connect';
      description = 'Unable to connect to the Letz Shop network. Please check your internet connection.';
    } else if (errorCode === 'API_UNAVAILABLE') {
      title = 'Service Temporarily Unavailable';
      description = 'The storefront service is currently undergoing scheduled maintenance. Please try again in a few moments.';
    } else if (errorCode === 'INTERNAL_ERROR') {
      title = 'Unexpected Error';
      description = 'We encountered an unexpected error loading this storefront. Please refresh the page or try again later.';
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-gray-200 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center mx-auto">
            {icon}
          </div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="text-xs text-[var(--store-text-secondary)] leading-relaxed">{description}</p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition"
            >
              Go to Letz Shop Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { store, products = [], categories = [], themeConfig } = storeData;
  const isPrivatePreview = storeData.isPreview;
  const isPreviewMode = Boolean(
    isPrivatePreview ||
    router.query.preview === 'true' ||
    (typeof window !== 'undefined' && sessionStorage.getItem('simply_merchant_preview') === 'true')
  );
  const isEmbedded = router.query.embedded === 'true';

  const getLink = (path: string) => {
    const params = new URLSearchParams();
    if (isPreviewMode) params.set('preview', 'true');
    if (isEmbedded) params.set('embedded', 'true');
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };

  const themeCode = themeConfig?.themeId || 'atelier';
  const homeConfig = themeConfig?.pages?.home || {};
  const heroBadge = homeConfig.heroBadge;
  const heroTitle = homeConfig.heroTitle;
  const heroSubtitle = homeConfig.heroSubtitle;
  const heroCtaText = homeConfig.heroCtaText;
  const heroCtaLink = homeConfig.heroCtaLink ? getLink(homeConfig.heroCtaLink) : '#products';
  const heroSecondaryCtaText = homeConfig.heroSecondaryCtaText;
  const heroSecondaryCtaLink = homeConfig.heroSecondaryCtaLink ? getLink(homeConfig.heroSecondaryCtaLink) : getLink(`/store/${slug}/about`);
  const heroBanner = homeConfig.heroBannerUrl || themeConfig?.branding?.bannerUrl || store?.branding?.bannerUrl || store?.bannerUrl;

  // Filter products by active category
  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter((p: any) => p.categoryId === activeCategory);

  return (
    <ThemeWrapper themeConfig={themeConfig} branding={themeConfig?.branding}>
      <Head>
        <title>{store.name} | Official Storefront</title>
        <meta name="description" content={`Discover authentic products from ${store.name}. Pan-India delivery and direct merchant service.`} />
      </Head>

      {/* Persistent Merchant Preview Banner (Hidden when embedded in iframe) */}
      {isPreviewMode && !isEmbedded && (
        <div className="bg-slate-950 text-white font-medium text-xs py-2 px-4 sticky top-0 z-50 shadow-md flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold text-white">Merchant Preview</span>
            <span className="text-slate-400 hidden sm:inline">— You're viewing your store exactly as customers will see it.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem('simply_merchant_preview');
              } catch {}
              if (window.opener) {
                window.close();
              } else {
                window.location.href = getSellerStorePreviewUrl();
              }
            }}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition"
          >
            Exit Preview
          </button>
        </div>
      )}

      <StoreHeader store={store} themeConfig={themeConfig} />

      <main data-brand-page="home" className="[overflow-wrap:anywhere] space-y-8 sm:space-y-12 pb-16">
        <style jsx global>{`[data-brand-page="home"] [data-theme-accent] { max-width: 100%; flex-wrap: wrap; } [data-brand-page="home"] [data-theme-accent] span { min-width: 0; } [data-brand-page="home"] [data-theme-hero] a { max-width: 100%; }`}</style>
        {/* =========================================================================
            1. HERO COMPOSITION (GENUINELY DISTINCT ACROSS 6 THEMES)
        ========================================================================= */}

        {/* --- ATELIER: Luxury Editorial Split-Hero --- */}
        {themeCode === 'atelier' && (
          <section data-theme-hero="true" className="relative overflow-hidden pt-6 pb-10 sm:pt-8 sm:pb-12 lg:pt-10 lg:pb-14 px-4 sm:px-6 lg:px-8 border-b border-amber-900/40">
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
              <div className="lg:col-span-7 space-y-5 text-left flex flex-col justify-center">
                <div data-theme-accent="true" className="inline-flex items-center gap-2 px-3.5 py-1 text-[11px] font-mono tracking-[0.2em] uppercase text-amber-300 border border-amber-500/40 bg-stone-900/40">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-bold">{store.name}</span>
                  <span className="text-amber-500/60">•</span>
                  <span>{heroBadge ?? 'Artisanal Atelier'}</span>
                </div>

                <div className="space-y-1">
                  <div className="text-xs sm:text-sm font-serif tracking-[0.2em] uppercase text-amber-600/90 font-semibold">
                    The {store.name} Maison
                  </div>
                  <h1 className="text-3xl sm:text-5xl lg:text-6xl font-serif tracking-tight leading-[1.1] font-theme-heading text-stone-900">
                    {heroTitle ? (
                      heroTitle
                    ) : (
                      <>
                        Timeless Elegance & Handcrafted Luxury by <span className="text-amber-600 italic underline decoration-amber-300/60 underline-offset-4">{store.name}</span>
                      </>
                    )}
                  </h1>
                </div>

                <p className="text-sm sm:text-base max-w-xl font-light leading-relaxed opacity-90">
                  {heroSubtitle ??
                    'Every creation embodies heritage craftsmanship, hand-selected materials, and immaculate proportion. Designed for collectors of fine distinction.'}
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-4">
                  <a data-theme-tone="primary"
                    data-theme-btn="true"
                    href={heroCtaLink}
                    className="px-8 py-3.5 bg-amber-400 text-stone-950 font-semibold text-xs tracking-widest uppercase hover:bg-amber-300 transition shadow-lg flex items-center gap-2"
                  >
                    <span>{heroCtaText ?? 'Explore Haute Collection'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>

                  <Link data-theme-tone="secondary"
                    data-theme-btn="true"
                    href={heroSecondaryCtaLink}
                    className="px-6 py-3.5 border border-stone-600 text-stone-200 text-xs font-semibold tracking-widest uppercase hover:border-amber-400 hover:text-amber-300 transition"
                  >
                    {heroSecondaryCtaText ?? 'About Our Story'}
                  </Link>
                </div>
              </div>

              {/* Atelier Visual Frame / Mosaic */}
              <div className="lg:col-span-5 relative flex justify-center">
                <div className="w-full max-w-md lg:max-w-lg aspect-[4/3] rounded-sm overflow-hidden border border-amber-500/30 shadow-2xl relative bg-stone-950">
                  {heroBanner || products?.[0]?.media?.[0]?.publicUrl || products?.[0]?.images?.[0]?.url ? (
                    <SafeImage
                      src={heroBanner || products?.[0]?.media?.[0]?.publicUrl || products?.[0]?.images?.[0]?.url}
                      alt={store.name}
                      className="w-full h-full object-cover object-center"
                      fallbackTitle={store.name}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                      <span className="font-serif text-3xl text-amber-300/80 italic">{store.name}</span>
                      <p className="text-xs text-stone-400 font-mono tracking-widest uppercase">Excellence In Every Detail</p>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-4 left-4 right-4 p-4 border border-amber-500/20 bg-stone-950/70 store-image-caption backdrop-blur-sm">
                    <p className="text-[11px] font-serif tracking-wider text-amber-200 text-center uppercase">Verified 100% Authentic • Certified Craftsmanship</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- PULSE: High Voltage Drop Hero --- */}
        {themeCode === 'pulse' && (
          <section data-theme-hero="true" className="relative overflow-hidden pt-6 pb-10 sm:pt-8 sm:pb-12 lg:pt-10 lg:pb-14 px-4 sm:px-6 lg:px-8 border-b-4 border-pink-500">
            <div className={`max-w-6xl mx-auto ${heroBanner ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 items-center text-left' : 'space-y-6 text-center'}`}>
              <div className={heroBanner ? 'lg:col-span-7 space-y-6' : 'space-y-6'}>
                <div data-theme-accent="true" className="inline-flex items-center gap-2 px-4 py-1.5 bg-black text-white font-black text-xs uppercase tracking-widest border-2 border-pink-500 shadow-lg">
                  <Zap className="w-4 h-4 fill-pink-500 text-pink-500" />
                  <span className="text-pink-400">{store.name}</span>
                  <span>•</span>
                  <span>{heroBadge ?? 'OFFICIAL DROP'}</span>
                </div>

                <h1 className="text-4xl sm:text-7xl font-black uppercase tracking-tighter leading-none font-theme-heading">
                  <span className="text-pink-500 block">{store.name}</span>
                  <span>{heroTitle ?? 'ONLINE DROP CATALOG'}</span>
                </h1>

                <p className="text-sm sm:text-lg text-slate-300 max-w-2xl font-medium">
                  {heroSubtitle ??
                    'High-octane apparel, trending accessories, and limited releases. Once sold out, they never restock.'}
                </p>

                <div className={`flex flex-wrap items-center ${heroBanner ? '' : 'justify-center'} gap-4 pt-2`}>
                  <a data-theme-tone="primary"
                    data-theme-btn="true"
                    href={heroCtaLink}
                    className="px-8 py-4 bg-pink-500 hover:bg-pink-600 text-white font-black text-sm uppercase tracking-wider transition shadow-lg transform hover:-translate-y-0.5"
                  >
                    {heroCtaText ?? 'SHOP THE DROP NOW'}
                  </a>
                  <Link data-theme-tone="secondary"
                    data-theme-btn="true"
                    href={heroSecondaryCtaLink}
                    className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-black text-sm uppercase tracking-wider border border-white/20 transition"
                  >
                    {heroSecondaryCtaText ?? 'ABOUT THE BRAND'}
                  </Link>
                </div>

                {/* Ticker Stats */}
                <div className="grid grid-cols-3 max-w-lg pt-6 border-t border-slate-800 text-center">
                  <div>
                    <div className="font-black text-lg text-pink-500">EXPRESS</div>
                    <div className="text-[10px] text-slate-400 font-mono uppercase">24-48H DISPATCH</div>
                  </div>
                  <div>
                    <div className="font-black text-lg text-white">GENUINE</div>
                    <div className="text-[10px] text-slate-400 font-mono uppercase">100% VERIFIED</div>
                  </div>
                  <div>
                    <div className="font-black text-lg text-pink-500">SECURE</div>
                    <div className="text-[10px] text-slate-400 font-mono uppercase">INSTANT CHECKOUT</div>
                  </div>
                </div>
              </div>

              {heroBanner && (
                <div className="lg:col-span-5 relative flex justify-center">
                  <div className="w-full max-w-sm lg:max-w-md aspect-[4/3] sm:aspect-[4/5] overflow-hidden border-4 border-pink-500 shadow-[0_0_30px_rgba(236,72,153,0.3)] bg-black relative">
                    <SafeImage
                      src={heroBanner}
                      alt={store.name}
                      className="w-full h-full object-cover"
                      fallbackTitle={store.name}
                    />
                    <div className="absolute top-3 left-3 bg-black text-pink-400 text-[10px] font-black uppercase px-2 py-1 tracking-wider border border-pink-500">
                      ⚡ LIVE DROP
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* --- HARVEST: Warm Organic Showcase Hero --- */}
        {themeCode === 'harvest' && (
          <section data-theme-hero="true" className="relative overflow-hidden border-b border-amber-200 pt-6 pb-10 sm:pt-8 sm:pb-12 lg:pt-10 lg:pb-14 px-4 sm:px-6 lg:px-8">
            <div className={`max-w-6xl mx-auto ${heroBanner ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 items-center text-left' : 'max-w-5xl text-center space-y-5'}`}>
              <div className={heroBanner ? 'lg:col-span-7 space-y-5' : 'space-y-5'}>
                <span data-theme-accent="true" className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold bg-amber-100/90 text-amber-950 border border-amber-300 shadow-xs">
                  <span>{heroBadge ?? '🌿 Pure & Handcrafted by'}</span>
                  <strong className="text-emerald-800 font-extrabold">{store.name}</strong>
                </span>

                <h1 className="text-3xl sm:text-5xl font-serif font-bold text-stone-900 tracking-tight leading-tight font-theme-heading">
                  <span className="block text-amber-800 font-bold mb-1 underline decoration-amber-300 decoration-wavy underline-offset-4">{store.name}</span>
                  <span>{heroTitle ?? 'Authentic Homemade Delicacies & Fresh Daily Batches'}</span>
                </h1>

                <p className="text-sm sm:text-base text-stone-600 max-w-2xl leading-relaxed">
                  {heroSubtitle ??
                    'Made using traditional recipes, pure ingredients, and zero artificial preservatives. Fresh batches prepared daily and vacuum-sealed for doorstep delivery.'}
                </p>

                <div className={`flex flex-wrap items-center ${heroBanner ? '' : 'justify-center'} gap-4 pt-2`}>
                  <a data-theme-tone="primary"
                    data-theme-btn="true"
                    href={heroCtaLink}
                    className="px-6 py-3 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-sm shadow-md transition flex items-center gap-2"
                  >
                    <span>{heroCtaText ?? 'Order Fresh Batch'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                  <Link data-theme-tone="secondary"
                    data-theme-btn="true"
                    href={heroSecondaryCtaLink}
                    className="px-6 py-3 rounded-full bg-white border border-stone-300 text-stone-800 font-semibold text-sm hover:bg-stone-50 transition shadow-sm flex items-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    <span>{heroSecondaryCtaText ?? 'Our Kitchen Story'}</span>
                  </Link>
                </div>

                {/* Harvest Trust Badges */}
                <div className={`flex flex-wrap items-center ${heroBanner ? '' : 'justify-center'} gap-6 pt-6 text-xs text-stone-700 font-medium`}>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" /> 100% Pure Ghee & Natural
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" /> Zero Chemical Additives
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" /> Safe Food-Grade Packaging
                  </span>
                </div>
              </div>

              {heroBanner && (
                <div className="lg:col-span-5 relative flex justify-center">
                  <div className="w-full max-w-sm lg:max-w-md aspect-[4/3] sm:aspect-[4/5] rounded-3xl overflow-hidden border-2 border-amber-300/60 shadow-xl bg-amber-50 relative">
                    <SafeImage
                      src={heroBanner}
                      alt={store.name}
                      className="w-full h-full object-cover"
                      fallbackTitle={store.name}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-900/40 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 left-3 right-3 p-3 bg-white/90 backdrop-blur-md rounded-2xl border border-amber-200/60 text-center">
                      <p className="text-[11px] font-serif font-bold text-stone-800 tracking-wide">
                        🌿 Fresh Harvest • {store.name} Signature
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* --- FOUNDRY: Technical B2B Industrial Hero --- */}
        {themeCode === 'foundry' && (
          <section data-theme-hero="true" data-store-inverse-hero="true" className="relative overflow-hidden bg-slate-900 text-slate-100 pt-6 pb-10 sm:pt-8 sm:pb-12 lg:pt-10 lg:pb-14 px-4 sm:px-6 lg:px-8 border-b-2 border-slate-700 font-mono">
            {/* Background Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40 pointer-events-none" />

            <div className="max-w-6xl mx-auto space-y-6 relative">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div data-theme-accent="true" className="inline-flex items-center gap-2 text-xs text-sky-400 font-bold uppercase tracking-wider">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />
                  <span>{store.name.toUpperCase()} // {heroBadge ?? 'OEM B2B SUPPLY DIVISION'}</span>
                </div>
                <div className="text-xs text-slate-400">
                  STANDARD: <span className="text-white font-bold">ISO 9001:2015</span> | QC: <span className="text-emerald-400 font-bold">PASS 100%</span>
                </div>
              </div>

              <h1 className="text-3xl sm:text-5xl font-mono font-bold text-white tracking-tight leading-tight font-theme-heading">
                <span className="text-sky-400 block">{store.name}</span>
                <span>{heroTitle ?? '// PRECISION COMPONENTS & WHOLESALE'}</span>
              </h1>

              <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
                {heroSubtitle ??
                  'Direct factory manufacturing, precision engineering components, and bulk industrial wholesale. Technical specifications compliant with domestic and export standards.'}
              </p>

              {/* Technical Specifications Highlights Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                <div className="bg-slate-800/80 p-3 border border-slate-700 rounded-sm">
                  <div className="text-slate-400 text-[10px]">SUPPLY CAPABILITY</div>
                  <div className="font-bold text-white mt-1">Direct Factory Pricing</div>
                </div>
                <div className="bg-slate-800/80 p-3 border border-slate-700 rounded-sm">
                  <div className="text-slate-400 text-[10px]">MIN ORDER QUANTITY</div>
                  <div className="font-bold text-sky-300 mt-1">Flexible B2B MOQs</div>
                </div>
                <div className="bg-slate-800/80 p-3 border border-slate-700 rounded-sm">
                  <div className="text-slate-400 text-[10px]">DISPATCH TIMELINE</div>
                  <div className="font-bold text-white mt-1">3-5 Business Days</div>
                </div>
                <div className="bg-slate-800/80 p-3 border border-slate-700 rounded-sm">
                  <div className="text-slate-400 text-[10px]">DOCUMENTATION</div>
                  <div className="font-bold text-emerald-400 mt-1">MTC & GST Invoicing</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-4">
                <a data-theme-tone="primary"
                  data-theme-btn="true"
                  href={heroCtaLink}
                  className="px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs uppercase tracking-wider rounded-sm transition shadow flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  <span>{heroCtaText ?? 'Browse Technical Catalog'}</span>
                </a>
                <Link data-theme-tone="secondary"
                  data-theme-btn="true"
                  href={heroSecondaryCtaLink}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider border border-slate-600 rounded-sm transition flex items-center gap-2"
                >
                  <Building className="w-4 h-4 text-emerald-400" />
                  <span>{heroSecondaryCtaText ?? 'Factory Infrastructure'}</span>
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* --- HABITAT: Spacious Lifestyle & Interior Sanctuary Hero --- */}
        {themeCode === 'habitat' && (
          <section data-theme-hero="true" className="relative overflow-hidden bg-stone-100 text-stone-900 pt-6 pb-10 sm:pt-8 sm:pb-12 lg:pt-10 lg:pb-14 px-4 sm:px-6 lg:px-8 border-b border-stone-200">
            <div className={`max-w-6xl mx-auto ${heroBanner ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 items-center text-left' : 'max-w-5xl text-center space-y-6'}`}>
              <div className={heroBanner ? 'lg:col-span-7 space-y-6' : 'space-y-6'}>
                <span data-theme-accent="true" className="text-xs font-serif uppercase tracking-[0.25em] text-stone-700 block font-semibold">
                  THE {store.name.toUpperCase()} STUDIO • {heroBadge ?? 'BESPOKE LIVING SPACES'}
                </span>

                <h1 className="text-4xl sm:text-6xl font-serif text-stone-900 tracking-tight leading-tight font-theme-heading">
                  <span className="italic block font-normal text-stone-600 mb-1">Intentional Living with</span>
                  <span className="font-bold underline decoration-stone-300">{store.name}</span>
                  {heroTitle && heroTitle !== store.name && (
                    <span className="block text-xl sm:text-2xl font-light text-stone-600 mt-2">{heroTitle}</span>
                  )}
                </h1>

                <p className="text-sm sm:text-base text-stone-600 max-w-2xl leading-relaxed font-light">
                  {heroSubtitle ??
                    'Handcrafted solid wood furniture, bespoke living objects, and organic textures. Curated to bring harmony, warmth, and enduring beauty into your sanctuary.'}
                </p>

                <div className={`flex flex-wrap items-center ${heroBanner ? '' : 'justify-center'} gap-4 pt-3`}>
                  <a data-theme-tone="primary"
                    data-theme-btn="true"
                    href={heroCtaLink}
                    className="px-8 py-3.5 bg-stone-900 text-stone-50 font-serif text-xs uppercase tracking-widest hover:bg-stone-800 transition"
                  >
                    {heroCtaText ?? 'View Living Pieces'}
                  </a>
                  <Link data-theme-tone="secondary"
                    data-theme-btn="true"
                    href={heroSecondaryCtaLink}
                    className="px-8 py-3.5 border border-stone-400 text-stone-800 font-serif text-xs uppercase tracking-widest hover:bg-white transition"
                  >
                    {heroSecondaryCtaText ?? 'Our Design Ethos'}
                  </Link>
                </div>
              </div>

              {heroBanner && (
                <div className="lg:col-span-5 relative flex justify-center">
                  <div className="w-full max-w-sm lg:max-w-md aspect-[4/3] sm:aspect-[4/5] rounded-2xl overflow-hidden border border-stone-300 shadow-xl bg-stone-200 relative">
                    <SafeImage
                      src={heroBanner}
                      alt={store.name}
                      className="w-full h-full object-cover"
                      fallbackTitle={store.name}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* --- LOCAL: High Density Instant Commerce Hero --- */}
        {themeCode === 'local' && (
          <section data-theme-hero="true" data-store-inverse-hero="true" className="bg-blue-900 text-white pt-6 pb-10 sm:pt-8 sm:pb-10 px-4 sm:px-6 lg:px-8 border-b border-blue-800">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-3">
                <div data-theme-accent="true" className="inline-flex items-center gap-2 bg-blue-800 px-3.5 py-1 rounded text-xs font-semibold text-blue-200">
                  <Truck className="w-3.5 h-3.5 text-green-400" />
                  <strong className="text-white font-bold">{store.name}</strong>
                  <span>•</span>
                  <span>{heroBadge ?? 'Fast Neighborhood Dispatch'}</span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight font-theme-heading">
                  <span className="text-yellow-300 block">{store.name} Superstore</span>
                  <span className="text-lg sm:text-2xl font-medium text-blue-100">{heroTitle ?? 'Daily Groceries & Essentials'}</span>
                </h1>
                <p className="text-xs sm:text-sm text-blue-200 max-w-xl">
                  {heroSubtitle ??
                    'Order daily groceries, FMCG provisions, and household essentials. Direct from your trusted local merchant at true wholesale rates.'}
                </p>
                <div className="pt-2 flex items-center gap-3">
                  <a data-theme-tone="primary"
                    data-theme-btn="true"
                    href={heroCtaLink}
                    className="px-5 py-2.5 bg-white text-blue-900 font-bold text-xs rounded-lg shadow-sm hover:bg-blue-50 transition"
                  >
                    {heroCtaText ?? 'Order Online'}
                  </a>
                  <Link data-theme-tone="secondary"
                    data-theme-btn="true"
                    href={heroSecondaryCtaLink}
                    className="px-4 py-2.5 border border-blue-400 text-white font-medium text-xs rounded-lg hover:bg-blue-800 transition"
                  >
                    {heroSecondaryCtaText ?? 'Store Location'}
                  </Link>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                {heroBanner && (
                  <div className="w-full sm:w-44 h-32 rounded-xl overflow-hidden border border-blue-700 shadow-md shrink-0">
                    <SafeImage
                      src={heroBanner}
                      alt={store.name}
                      className="w-full h-full object-cover"
                      fallbackTitle={store.name}
                    />
                  </div>
                )}
                <div className="bg-white/10 p-4 rounded-xl border border-white/20 space-y-2.5 min-w-[260px]">
                  <div className="text-xs font-bold text-white">Need it immediately?</div>
                  <p className="text-[11px] text-blue-200">Send your shopping list or tap below to chat directly with store staff.</p>
                  <a
                    href={`https://wa.me/919822012345?text=Hello%20${encodeURIComponent(store.name)}%2C%20here%20is%20my%20order%20list:`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      if (store?.id) {
                        logWhatsappEnquiry({
                          storeId: store.id,
                          customerName: 'WhatsApp Buyer',
                          message: `WhatsApp direct list enquiry for ${store.name}`,
                        });
                      }
                    }}
                    data-theme-btn="true"
                    className="block w-full text-center py-2.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg transition shadow"
                  >
                    ⚡ Send List on WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- AURA: Luminous Glow & Clean Beauty Hero --- */}
        {themeCode === 'aura' && (
          <section data-theme-hero="true" className="relative overflow-hidden pt-8 pb-12 sm:pt-12 sm:pb-16 lg:pt-14 lg:pb-20 px-4 sm:px-6 lg:px-8 border-b border-rose-200/80 bg-gradient-to-br from-rose-50/90 via-pink-50/50 to-amber-50/30">
            {/* Soft Ambient Radial Blur */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-rose-200/40 rounded-full blur-3xl pointer-events-none" />
            
            <div className={`max-w-7xl mx-auto relative ${heroBanner ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center text-left' : 'max-w-3xl text-center space-y-6 mx-auto'}`}>
              <div className={heroBanner ? 'lg:col-span-7 space-y-6' : 'space-y-6'}>
                <div data-theme-accent="true" className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-900 border border-rose-300/80 shadow-xs ${heroBanner ? '' : 'mx-auto'}`}>
                  <Sparkles className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                  <strong className="font-bold text-rose-950">{store.name}</strong>
                  <span className="text-rose-400">•</span>
                  <span>{heroBadge ?? 'Luminous Clean Actives'}</span>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-sans tracking-[0.25em] uppercase text-rose-700 font-bold block">
                    {store.name} Clean Apothecary
                  </span>
                  <h1 className="text-3xl sm:text-5xl lg:text-6xl font-serif text-slate-900 tracking-tight leading-[1.12] font-theme-heading">
                    {heroTitle ? (
                      heroTitle
                    ) : (
                      <>
                        Radiant Skin Health & <span className="text-rose-700 italic font-normal">Pure Formulations</span> by {store.name}
                      </>
                    )}
                  </h1>
                </div>

                <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed font-light">
                  {heroSubtitle ??
                    'Antioxidant-dense botanical serums, barrier-restoring moisture creams, and clean cosmetic pigments. Clinically formulated for radiant everyday distinction.'}
                </p>

                <div className={`flex flex-wrap items-center ${heroBanner ? '' : 'justify-center'} gap-4 pt-2`}>
                  <a data-theme-tone="primary"
                    data-theme-btn="true"
                    href={heroCtaLink}
                    className="px-8 py-3.5 bg-rose-900 hover:bg-rose-800 text-white font-bold text-xs tracking-wider uppercase rounded-full transition shadow-lg flex items-center gap-2"
                  >
                    <span>{heroCtaText ?? 'Explore Clean Beauty'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>

                  <Link data-theme-tone="secondary"
                    data-theme-btn="true"
                    href={heroSecondaryCtaLink}
                    className="px-6 py-3.5 border-2 border-rose-300 text-rose-900 font-semibold text-xs tracking-wider uppercase rounded-full hover:bg-rose-100/60 transition"
                  >
                    {heroSecondaryCtaText ?? 'Our Clean Story'}
                  </Link>
                </div>

                {/* Aura Trust Strip */}
                <div className={`flex flex-wrap items-center ${heroBanner ? '' : 'justify-center'} gap-5 pt-4 text-xs text-rose-900/80 font-medium`}>
                  <span className="flex items-center gap-1.5 bg-white/80 backdrop-blur-xs px-3 py-1 rounded-full border border-rose-200 shadow-2xs">
                    <CheckCircle className="w-3.5 h-3.5 text-rose-500" /> 100% Vegan Actives
                  </span>
                  <span className="flex items-center gap-1.5 bg-white/80 backdrop-blur-xs px-3 py-1 rounded-full border border-rose-200 shadow-2xs">
                    <ShieldCheck className="w-3.5 h-3.5 text-rose-500" /> Dermatologist Tested
                  </span>
                  <span className="flex items-center gap-1.5 bg-white/80 backdrop-blur-xs px-3 py-1 rounded-full border border-rose-200 shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5 text-rose-500" /> Clean Zero-Toxin
                  </span>
                </div>
              </div>

              {heroBanner && (
                <div className="lg:col-span-5 relative flex justify-center">
                  <div className="w-full max-w-md lg:max-w-lg aspect-[4/3] rounded-3xl overflow-hidden border-2 border-rose-200/90 shadow-2xl bg-white relative">
                    <SafeImage
                      src={heroBanner}
                      alt={store.name}
                      className="w-full h-full object-cover object-center"
                      fallbackTitle={store.name}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-rose-950/40 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-4 left-4 right-4 p-3 bg-white/90 backdrop-blur-md rounded-2xl border border-rose-100 text-center shadow-lg">
                      <p className="text-[11px] font-serif font-bold text-rose-950 tracking-wider uppercase">
                        ✨ Clinical Botanical Actives • Certified Pure
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* --- NOIR: Avant-Garde Dark Studio & Monolith Hero --- */}
        {themeCode === 'noir' && (
          <section data-theme-hero="true" className="relative overflow-hidden bg-zinc-950 text-zinc-100 pt-8 pb-12 sm:pt-12 sm:pb-16 lg:pt-14 lg:pb-20 px-4 sm:px-6 lg:px-8 border-b border-zinc-800">
            {/* High-tech Matrix Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

            <div className={`max-w-7xl mx-auto relative ${heroBanner ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center text-left' : 'max-w-4xl text-center space-y-6 mx-auto'}`}>
              <div className={heroBanner ? 'lg:col-span-7 space-y-6' : 'space-y-6'}>
                <div data-theme-accent="true" className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-sm text-xs font-mono font-bold bg-zinc-900 text-emerald-400 border border-emerald-500/40 shadow-lg ${heroBanner ? '' : 'mx-auto'}`}>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>{store.name.toUpperCase()} // {heroBadge ?? 'LIMITED MONOLITH RUN'}</span>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-mono tracking-[0.3em] uppercase text-zinc-400 font-bold">
                    SYSTEM STATUS: 100% ONLINE // DIRECT ARCHIVE
                  </div>
                  <h1 className="text-4xl sm:text-6xl lg:text-7xl font-sans font-black uppercase tracking-tighter text-white leading-none font-theme-heading">
                    <span className="text-emerald-400 block tracking-normal">{store.name}</span>
                    <span>{heroTitle ?? 'THE MONOLITH ARCHIVE'}</span>
                  </h1>
                </div>

                <p className="text-xs sm:text-sm text-zinc-400 max-w-xl font-mono leading-relaxed">
                  {heroSubtitle ??
                    'Precision engineered textiles, stealth utilitarian accessories, and architectural minimalism. Manufactured without excess, calibrated for performance.'}
                </p>

                <div className={`flex flex-wrap items-center ${heroBanner ? '' : 'justify-center'} gap-4 pt-2`}>
                  <a data-theme-tone="primary"
                    data-theme-btn="true"
                    href={heroCtaLink}
                    className="px-8 py-4 bg-white hover:bg-zinc-200 text-black font-mono font-black text-xs uppercase tracking-wider transition shadow-[0_0_25px_rgba(255,255,255,0.2)] flex items-center gap-2"
                  >
                    <span>{heroCtaText ?? 'BROWSE ARCHIVE'}</span>
                    <ArrowRight className="w-4 h-4 text-black" />
                  </a>

                  <Link data-theme-tone="secondary"
                    data-theme-btn="true"
                    href={heroSecondaryCtaLink}
                    className="px-6 py-4 border border-zinc-700 hover:border-emerald-400 text-zinc-300 hover:text-white font-mono text-xs uppercase tracking-wider transition"
                  >
                    {heroSecondaryCtaText ?? 'BRAND MANIFESTO'}
                  </Link>
                </div>

                {/* Technical HUD Metrics */}
                <div className="grid grid-cols-3 max-w-md pt-5 border-t border-zinc-800 font-mono text-center">
                  <div>
                    <div className="text-emerald-400 font-bold text-base">VERIFIED</div>
                    <div className="text-[10px] text-zinc-500 uppercase">100% AUTHENTIC</div>
                  </div>
                  <div>
                    <div className="text-white font-bold text-base">DISPATCH</div>
                    <div className="text-[10px] text-zinc-500 uppercase">EXPRESS 24H</div>
                  </div>
                  <div>
                    <div className="text-emerald-400 font-bold text-base">RESERVE</div>
                    <div className="text-[10px] text-zinc-500 uppercase">NUMBERED RUN</div>
                  </div>
                </div>
              </div>

              {heroBanner && (
                <div className="lg:col-span-5 relative flex justify-center">
                  <div className="w-full max-w-md lg:max-w-lg aspect-[4/3] rounded-sm overflow-hidden border border-zinc-800 shadow-[0_0_50px_rgba(16,185,129,0.15)] bg-zinc-900 relative">
                    <SafeImage
                      src={heroBanner}
                      alt={store.name}
                      className="w-full h-full object-cover object-center"
                      fallbackTitle={store.name}
                    />
                    <div className="absolute top-3 left-3 bg-zinc-950/90 text-emerald-400 text-[10px] font-mono font-bold px-2.5 py-1 border border-emerald-500/50">
                      SECURE ASSET // {store.name}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* --- VISTA: Earth & Craft Heritage Showcase Hero --- */}
        {themeCode === 'vista' && (
          <section data-theme-hero="true" className="relative overflow-hidden bg-[#FDFBF7] text-[#431407] pt-8 pb-12 sm:pt-12 sm:pb-16 lg:pt-14 lg:pb-20 px-4 sm:px-6 lg:px-8 border-b border-orange-200/80">
            <div className={`max-w-7xl mx-auto ${heroBanner ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center text-left' : 'max-w-3xl text-center space-y-6 mx-auto'}`}>
              <div className={heroBanner ? 'lg:col-span-7 space-y-6' : 'space-y-6'}>
                <div data-theme-accent="true" className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-serif font-bold bg-amber-100/90 text-amber-950 border border-amber-300 shadow-xs ${heroBanner ? '' : 'mx-auto'}`}>
                  <Award className="w-3.5 h-3.5 text-amber-700" />
                  <strong>{store.name}</strong>
                  <span className="text-amber-400">•</span>
                  <span>{heroBadge ?? 'Master Artisan Heritage'}</span>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-serif tracking-[0.2em] uppercase text-orange-800 font-bold block">
                    Handmade With Integrity • Est. Direct
                  </span>
                  <h1 className="text-3xl sm:text-5xl lg:text-6xl font-serif text-[#431407] tracking-tight leading-[1.14] font-theme-heading">
                    {heroTitle ? (
                      heroTitle
                    ) : (
                      <>
                        Earth-Grown, Hand-Woven & <span className="text-orange-800 italic underline decoration-amber-400/80 decoration-wavy underline-offset-4">Heirloom Crafted</span> by {store.name}
                      </>
                    )}
                  </h1>
                </div>

                <p className="text-sm sm:text-base text-stone-700 max-w-xl leading-relaxed font-normal">
                  {heroSubtitle ??
                    'Celebrating indigenous artisanal lineages, natural sun-cured textures, and ethical craft communities. Each offering is made with patient attention and zero shortcuts.'}
                </p>

                <div className={`flex flex-wrap items-center ${heroBanner ? '' : 'justify-center'} gap-4 pt-2`}>
                  <a data-theme-tone="primary"
                    data-theme-btn="true"
                    href={heroCtaLink}
                    className="px-8 py-3.5 bg-[#9A3412] hover:bg-[#7C2D12] text-white font-serif font-bold text-xs tracking-wider uppercase rounded-xl transition shadow-md flex items-center gap-2"
                  >
                    <span>{heroCtaText ?? 'Explore Artisan Works'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>

                  <Link data-theme-tone="secondary"
                    data-theme-btn="true"
                    href={heroSecondaryCtaLink}
                    className="px-6 py-3.5 border-2 border-[#9A3412]/40 text-[#9A3412] hover:bg-orange-50 font-serif font-bold text-xs tracking-wider uppercase rounded-xl transition"
                  >
                    {heroSecondaryCtaText ?? 'The Heritage Craft'}
                  </Link>
                </div>

                {/* Vista Artisan Guarantee */}
                <div className={`flex flex-wrap items-center ${heroBanner ? '' : 'justify-center'} gap-5 pt-4 text-xs text-stone-800 font-medium`}>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-700" /> 100% Natural Earth Materials
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-700" /> Fair Artisan Trade
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-700" /> Doorstep Protective Care
                  </span>
                </div>
              </div>

              {heroBanner && (
                <div className="lg:col-span-5 relative flex justify-center">
                  <div className="w-full max-w-md lg:max-w-lg aspect-[4/3] rounded-2xl overflow-hidden border-2 border-amber-200/90 shadow-xl bg-stone-100 relative">
                    <SafeImage
                      src={heroBanner}
                      alt={store.name}
                      className="w-full h-full object-cover object-center"
                      fallbackTitle={store.name}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-900/40 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 left-3 right-3 p-3 bg-white/95 backdrop-blur-md rounded-xl border border-amber-200 text-center">
                      <p className="text-[11px] font-serif font-bold text-[#431407] tracking-wider uppercase">
                        🌿 Authentic Heritage Craft • {store.name}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* --- FEAST: Food-First Visual Commerce Hero --- */}
        {themeCode === 'feast' && (
          <section data-theme-hero="true" className="relative overflow-hidden bg-[#FFFBEB] text-[#451A03] pt-8 pb-12 sm:pt-12 sm:pb-16 lg:pt-14 lg:pb-20 px-4 sm:px-6 lg:px-8 border-b border-amber-200">
            <div className={`max-w-7xl mx-auto ${heroBanner ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center text-left' : 'max-w-3xl text-center space-y-6 mx-auto'}`}>
              <div className={heroBanner ? 'lg:col-span-7 space-y-6' : 'space-y-6'}>
                <div data-theme-accent="true" className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold bg-amber-200/80 text-amber-950 border border-amber-300 shadow-xs ${heroBanner ? '' : 'mx-auto'}`}>
                  <span>{heroBadge ?? '🍫 Fresh Batch Crafted Daily •'}</span>
                  <strong>{store.name}</strong>
                </div>

                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-serif text-[#451A03] tracking-tight leading-[1.15] font-theme-heading">
                  <span className="text-amber-800 block">{store.name}</span>
                  <span>{heroTitle ?? 'Artisanal Confections & Fresh Delicacies'}</span>
                </h1>

                <p className="text-sm sm:text-base text-stone-700 max-w-xl leading-relaxed">
                  {heroSubtitle ??
                    'Prepared in small batches using pure ingredients, gourmet recipes, and zero artificial preservatives. Vacuum sealed and shipped fresh to your doorstep.'}
                </p>

                <div className={`flex flex-wrap items-center ${heroBanner ? '' : 'justify-center'} gap-4 pt-2`}>
                  <a data-theme-tone="primary"
                    data-theme-btn="true"
                    href={heroCtaLink}
                    className="px-8 py-3.5 bg-[#78350F] hover:bg-[#5E290C] text-white font-bold text-xs uppercase tracking-wider rounded-full transition shadow-md flex items-center gap-2"
                  >
                    <span>{heroCtaText ?? 'Order Fresh Now'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>

                  <Link data-theme-tone="secondary"
                    data-theme-btn="true"
                    href={heroSecondaryCtaLink}
                    className="px-6 py-3.5 border-2 border-[#78350F]/40 text-[#78350F] hover:bg-amber-100/50 font-bold text-xs uppercase tracking-wider rounded-full transition"
                  >
                    {heroSecondaryCtaText ?? 'Kitchen Story'}
                  </Link>
                </div>
              </div>

              {heroBanner && (
                <div className="lg:col-span-5 relative flex justify-center">
                  <div className="w-full max-w-md lg:max-w-lg aspect-[4/3] rounded-3xl overflow-hidden border-2 border-amber-300 shadow-xl bg-amber-50 relative">
                    <SafeImage
                      src={heroBanner}
                      alt={store.name}
                      className="w-full h-full object-cover object-center"
                      fallbackTitle={store.name}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* --- HORIZON: Enterprise Heritage & Innovation Panorama Hero --- */}
        {themeCode === 'horizon' && (
          <section data-theme-hero="true" className="relative overflow-hidden min-h-[620px] lg:min-h-[680px] flex items-center border-b border-slate-200">
            {/* Full-Bleed Panoramic Background Image */}
            <div className="absolute inset-0 z-0">
              <SafeImage
                src={heroBanner || '/themes/horizon-hero.jpg'}
                alt={store.name}
                className="w-full h-full object-cover object-right md:object-center"
                fallbackTitle={store.name}
                loading="eager"
                decoding="async"
              />
              {/* Gradient Scrim: Crisp white/frost on left for crystal-clear readability, seamlessly fading into the panoramic visual on right */}
              <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 sm:via-white/90 md:via-white/85 lg:via-white/75 to-transparent pointer-events-none" />
              <div className="absolute inset-0 bg-radial from-transparent to-slate-900/10 pointer-events-none" />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 relative z-10 w-full">
              <div className="max-w-2xl space-y-6">
                {/* Legacy Shield Trust Badge */}
                <div data-theme-accent="true" className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/95 backdrop-blur-md text-blue-900 border border-blue-200 shadow-sm">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{heroBadge ?? 'Built from 65 years of legacy'}</span>
                </div>

                {/* Monumental Dual-Color Headline */}
                <div className="space-y-2">
                  <h1 className="text-4xl sm:text-6xl lg:text-7xl font-sans font-black tracking-tight text-slate-900 leading-[1.08] font-theme-heading">
                    {heroTitle ? (
                      heroTitle
                    ) : (
                      <>
                        From <span className="text-amber-600">Looms</span>
                        <br />
                        to <span className="text-blue-600">Labs.</span>
                      </>
                    )}
                  </h1>
                </div>

                {/* Subtitle */}
                <p className="text-sm sm:text-base text-slate-700 max-w-xl font-normal leading-relaxed">
                  {heroSubtitle ??
                    'The same family that mastered the precision of textile manufacturing for 65 years now builds the technology infrastructure that businesses run on, oil fields depend on, and global supply chains trust.'}
                </p>

                {/* 3 Floating Frosted Glass Pillar Cards (matching user screenshot) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-white/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md transition group">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
                      <Building className="w-4 h-4" />
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Heritage</div>
                    <div className="text-xs font-bold text-slate-900 mt-0.5">Legacy of Precision</div>
                  </div>

                  <div className="bg-white/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md transition group">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Evolution</div>
                    <div className="text-xs font-bold text-slate-900 mt-0.5">Future of Innovation</div>
                  </div>

                  <div className="bg-white/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md transition group">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-105 transition">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Scale</div>
                    <div className="text-xs font-bold text-slate-900 mt-0.5">Technology That Powers</div>
                  </div>
                </div>

                {/* Dual Action Buttons */}
                <div className="flex flex-wrap items-center gap-4 pt-3">
                  <a data-theme-tone="primary"
                    data-theme-btn="true"
                    href={heroCtaLink}
                    className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-blue-600/25 flex items-center gap-2 group cursor-pointer"
                  >
                    <span>{heroCtaText ?? 'Explore Our Story'}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </a>

                  <Link data-theme-tone="secondary"
                    data-theme-btn="true"
                    href={heroSecondaryCtaLink}
                    className="px-6 py-3.5 bg-white/90 hover:bg-white text-slate-800 font-bold text-xs uppercase tracking-wider rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md transition flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span>{heroSecondaryCtaText ?? 'Our Services'}</span>
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- CANVAS: Full-Front Cinematic Showcase Hero --- */}
        {themeCode === 'canvas' && (
          <section data-theme-hero="true" data-store-overlay="true" className="relative overflow-hidden min-h-[640px] lg:min-h-[720px] flex items-center justify-center border-b border-zinc-800 bg-black text-white text-center">
            {/* Full-Bleed Panoramic Background Image */}
            <div className="absolute inset-0 z-0">
              <SafeImage
                src={heroBanner || '/themes/canvas-hero.jpg'}
                alt={store.name}
                className="w-full h-full object-cover object-center"
                fallbackTitle={store.name}
                loading="eager"
                decoding="async"
              />
              {/* Cinematic Vignette & Dark Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/40 pointer-events-none" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-black/40 to-black/90 pointer-events-none" />
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative z-10 w-full space-y-6">
              {/* Floating Monolith Pill */}
              <div data-theme-accent="true" className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono font-medium tracking-widest uppercase bg-black/60 backdrop-blur-md text-amber-300 border border-amber-500/30 shadow-lg mx-auto">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{store.name.toUpperCase()} // {heroBadge ?? 'CINEMATIC PANORAMA 2026'}</span>
              </div>

              {/* Monumental Headline */}
              <h1 className="text-4xl sm:text-6xl lg:text-7xl xl:text-8xl font-sans font-black tracking-tight text-white uppercase leading-[1.02] font-theme-heading drop-shadow-md">
                {heroTitle ? (
                  heroTitle
                ) : (
                  <>
                    Immersive <span className="text-amber-400 italic font-serif">Frontiers.</span>
                    <br />
                    Direct from {store.name}
                  </>
                )}
              </h1>

              {/* Subtitle */}
              <p className="text-sm sm:text-base lg:text-lg text-slate-200 max-w-2xl mx-auto font-light leading-relaxed drop-shadow">
                {heroSubtitle ??
                  'Edge-to-edge visual excellence, archival material rigor, and timeless silhouettes. Experience the entire collection in full cinematic scale.'}
              </p>

              {/* Dual Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                <a data-theme-tone="primary"
                  data-theme-btn="true"
                  href={heroCtaLink}
                  className="px-9 py-4 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs uppercase tracking-widest rounded-full transition shadow-xl shadow-amber-500/20 flex items-center gap-2 group cursor-pointer"
                >
                  <span>{heroCtaText ?? 'Explore Showcase'}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </a>

                <Link data-theme-tone="secondary"
                  data-theme-btn="true"
                  href={heroSecondaryCtaLink}
                  className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-medium text-xs uppercase tracking-widest rounded-full backdrop-blur-md border border-white/25 transition shadow-lg"
                >
                  {heroSecondaryCtaText ?? 'Archival Film'}
                </Link>
              </div>

              {/* Bottom Trust Indicators */}
              <div className="pt-8 border-t border-white/15 flex flex-wrap items-center justify-center gap-6 sm:gap-12 text-xs font-mono text-slate-300">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Direct Provenance</span>
                </div>
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-amber-400" />
                  <span>Pan-India Insured Dispatch</span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>Master-Crafted Quality</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* =========================================================================
            2. CATEGORIES PRESENTATION (THEME DISTINCT)
        ========================================================================= */}
        {categories.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-lg sm:text-xl font-bold text-gray-900 ${
                  themeCode === 'atelier' ? 'font-serif text-2xl tracking-wide' :
                  themeCode === 'foundry' ? 'font-mono uppercase text-base' :
                  themeCode === 'pulse' ? 'font-black uppercase tracking-tight' : ''
                }`}>
                  {themeCode === 'foundry' ? '// COMPONENT CATEGORIES' :
                   themeCode === 'habitat' ? 'Shop by Space' :
                   themeCode === 'pulse' ? 'DROP CATEGORIES' : 'Featured Collections'}
                </h2>
                <p className="text-xs text-[var(--store-text-secondary)]">
                  {themeCode === 'foundry' ? 'Select equipment classification' : 'Explore products by category'}
                </p>
              </div>

              {/* Clear Filter / All Link */}
              {activeCategory !== 'all' && (
                <button
                  onClick={() => setActiveCategory('all')}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Show All ({products.length})
                </button>
              )}
            </div>

            {/* Category Cards / Pills Layout */}
            <div className={`grid gap-3 ${
              themeCode === 'harvest' ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' :
              themeCode === 'foundry' ? 'grid-cols-2 sm:grid-cols-4 font-mono' :
              themeCode === 'pulse' ? 'grid-cols-2 sm:grid-cols-4' :
              themeCode === 'local' ? 'flex flex-wrap gap-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
            }`}>
              {/* Category Pill: All Products */}
              {themeCode === 'local' ? (
                <>
                  <button
                    onClick={() => setActiveCategory('all')}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition ${
                      activeCategory === 'all'
                        ? 'bg-blue-900 text-white shadow'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All Items ({products.length})
                  </button>
                  {categories.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCategory(c.id)}
                      className={`px-4 py-2 rounded-full text-xs font-bold transition ${
                        activeCategory === c.id
                          ? 'bg-blue-900 text-white shadow'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {c.name} ({c.visibleProductCount ?? c._count?.products ?? 0})
                    </button>
                  ))}
                </>
              ) : (
                categories.map((c: any) => {
                  const isSelected = activeCategory === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveCategory(isSelected ? 'all' : c.id)}
                      data-theme-card="true"
                      className={`p-4 transition text-left space-y-1 relative border ${
                        isSelected
                          ? 'border-gray-900 bg-gray-900 text-white shadow-md'
                          : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-900'
                      } ${
                        themeCode === 'atelier' ? 'rounded-none' :
                        themeCode === 'pulse' ? 'rounded-none skew-x-[-2deg]' :
                        themeCode === 'foundry' ? 'rounded-sm font-mono' :
                        themeCode === 'harvest' ? 'rounded-2xl bg-amber-50/40 border-amber-200' : 'rounded-xl'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-bold text-sm block line-clamp-1 ${
                          themeCode === 'atelier' ? 'font-serif' : ''
                        }`}>
                          {c.name}
                        </span>
                        <span className={`text-[10px] font-mono block ${
                          isSelected ? 'text-gray-300' : 'text-gray-400'
                        }`}>
                          {c.visibleProductCount ?? c._count?.products ?? 0}
                        </span>
                      </div>
                      <span className={`text-[11px] block line-clamp-1 ${
                        isSelected ? 'text-gray-300' : 'text-gray-500'
                      }`}>
                        {themeCode === 'foundry' ? 'Industrial Grade' : 'View Collection'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        )}

        {/* =========================================================================
            3. PRODUCT CARDS & GRID (GENUINELY DISTINCT THEME COMPOSITIONS)
        ========================================================================= */}
        <section id="products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 scroll-mt-24">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 pb-4">
            <div>
              <h2 className={`text-xl sm:text-2xl font-bold text-[var(--store-text-primary)] ${
                themeCode === 'atelier' ? 'font-serif tracking-wide text-2xl' :
                themeCode === 'foundry' ? 'font-mono uppercase text-lg' :
                themeCode === 'pulse' ? 'font-black uppercase tracking-tight' : ''
              }`}>
                {themeCode === 'foundry' ? `// ${store.name.toUpperCase()} TECHNICAL INVENTORY` :
                 themeCode === 'pulse' ? `${store.name.toUpperCase()} ACTIVE DROP` :
                 themeCode === 'harvest' ? `Handcrafted by ${store.name}` :
                 themeCode === 'habitat' ? `${store.name} Living Pieces` : `${store.name} Collection`}
              </h2>
              <p className="text-xs text-[var(--store-text-secondary)]">
                Showing {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'} ready for dispatch
              </p>
            </div>

            <Link
              href={`/store/${slug}/search`}
              className="text-xs font-bold hover:underline flex items-center gap-1 self-start sm:self-auto"
              style={{ color: 'var(--theme-accent, #D97706)' }}
            >
              <span>Explore All Products</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-500 text-sm space-y-2">
              <p className="font-semibold text-gray-700">No products found in this category.</p>
              <button
                onClick={() => setActiveCategory('all')}
                className="text-xs text-blue-600 font-semibold hover:underline"
              >
                Reset filter and view all products
              </button>
            </div>
          ) : (
            <div className={`store-product-grid grid gap-4 sm:gap-6 ${
              themeCode === 'foundry' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
              themeCode === 'local' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' :
              themeCode === 'atelier' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' :
              'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
            }`}>
              {filteredProducts.map((p: any) => {
                const trans = getProductTranslation(p.translations, locale);
                const title = trans?.name?.trim() || p.name || p.title || 'Product';
                const description = trans?.description?.trim() || p.description;
                const primaryVariant = p.variants?.[0];
                const pricePaise = p.basePricePaise ?? primaryVariant?.pricePaise ?? 0;
                const comparePaise = p.compareAtPricePaise ?? primaryVariant?.compareAtPricePaise;
                const primaryMedia = p.media?.find((m: any) => m.isPrimary) || p.media?.[0];
                const coverImage =
                  primaryMedia?.publicUrl ||
                  (primaryMedia?.storageKey ? `/media/file/${primaryMedia.storageKey}` : undefined) ||
                  p.images?.[0]?.url;
                const isEnquiryOnly = p.mode === 'ENQUIRY_ONLY' || p.productType === 'ENQUIRY_ONLY';
                const isSellAndEnquiry = p.mode === 'SELL_AND_ENQUIRY' || p.productType === 'SELL_AND_ENQUIRY';
                const allowsEnquiry = isEnquiryOnly || isSellAndEnquiry;
                const hasVariants = p.variants && p.variants.length > 0;
                const isAdded = addedId === p.id;
                const isAdding = addingId === p.id;

                {/* --- A. ATELIER LUXURY CARD (3:4 Framed Portrait) --- */}
                if (themeCode === 'atelier') {
                  return (
                    <div
                      key={p.id}
                      className="bg-white border border-stone-200 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col group relative"
                    >
                      <Link
                        href={getLink(`/store/${slug}/product/${p.id}`)}
                        className="block relative aspect-[3/4] bg-stone-100 overflow-hidden"
                      >
                        <SafeImage
                          src={coverImage}
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          fallbackTitle={title}
                        />
                        <span className="absolute top-3 left-3 bg-stone-900/90 text-amber-200 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1">
                          Haute Creation
                        </span>
                      </Link>

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-3 bg-[var(--store-surface)]">
                        <div>
                          {p.category?.name && (
                            <span className="text-[10px] font-mono text-[var(--store-text-secondary)] uppercase tracking-widest block mb-1">
                              {p.category.name}
                            </span>
                          )}
                          <Link
                            href={getLink(`/store/${slug}/product/${p.id}`)}
                            className="font-serif text-base text-[var(--store-text-primary)] hover:text-amber-800 transition line-clamp-2 leading-snug font-medium"
                          >
                            {title}
                          </Link>
                        </div>

                        <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
                          <div>
                            <div data-store-price="true" className="font-serif text-base font-semibold text-[var(--store-text-primary)]">
                              {formatPaise(pricePaise)}
                            </div>
                            {comparePaise && (
                              <div className="text-[11px] text-[var(--store-text-secondary)] font-mono line-through">
                                {formatPaise(comparePaise)}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              data-store-button="true"
                              onClick={(e) => handleQuickAdd(e, p)}
                              disabled={isAdding}
                              className="px-3 py-1.5 rounded-none bg-[var(--store-surface)] hover:bg-[var(--store-surface)] text-amber-200 text-xs font-semibold uppercase tracking-wider transition shadow-sm flex items-center gap-1"
                              title={t('storefront.addToCart')}
                            >
                              {isAdded ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Added</span>
                                </>
                              ) : isAdding ? (
                                <span>Adding...</span>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>{t('storefront.addToCart')}</span>
                                </>
                              )}
                            </button>
                            <Link
                              href={getLink(`/store/${slug}/product/${p.id}`)}
                              className="text-xs font-semibold text-[var(--store-text-primary)] hover:text-amber-700 flex items-center gap-1 uppercase tracking-wider p-1"
                              title="View full piece"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                {/* --- B. PULSE STREETWEAR CARD (1:1 Elevated Modern) --- */}
                if (themeCode === 'pulse') {
                  return (
                    <div
                      key={p.id}
                      className="bg-slate-900 border-2 border-slate-800 overflow-hidden shadow-lg hover:border-pink-500 transition-all flex flex-col group relative"
                    >
                      <Link
                        href={getLink(`/store/${slug}/product/${p.id}`)}
                        className="block relative aspect-square bg-slate-950 overflow-hidden"
                      >
                        <SafeImage
                          src={coverImage}
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={title}
                        />
                        <span className="absolute top-2 left-2 bg-pink-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 shadow">
                          DROP 01
                        </span>
                      </Link>

                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3 bg-[var(--store-surface)]">
                        <div>
                          <Link
                            href={getLink(`/store/${slug}/product/${p.id}`)}
                            className="font-black text-sm uppercase tracking-tight text-[var(--store-text-primary)] hover:text-pink-400 transition line-clamp-1"
                          >
                            {title}
                          </Link>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span data-store-price="true" className="font-black text-base text-pink-400 font-mono">
                              {formatPaise(pricePaise)}
                            </span>
                            {comparePaise && (
                              <span className="text-xs text-[var(--store-text-secondary)] font-mono line-through">
                                {formatPaise(comparePaise)}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          data-store-button="true"
                              onClick={(e) => handleQuickAdd(e, p)}
                          disabled={isAdding}
                          className="w-full py-2 bg-[var(--store-surface)] hover:bg-pink-500 hover:text-[var(--store-text-primary)] text-[var(--store-text-primary)] font-black text-xs uppercase tracking-wider transition shadow flex items-center justify-center gap-1.5"
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>IN BAG</span>
                            </>
                          ) : (
                            <>
                              <ShoppingBag className="w-3.5 h-3.5" />
                              <span>{isAdding ? t('common.loading') : t('storefront.addToCart')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                }

                {/* --- C. HARVEST ARTISANAL CARD (1:1 Rounded Soft with Quick-Add) --- */}
                if (themeCode === 'harvest') {
                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col group relative"
                    >
                      <Link
                        href={getLink(`/store/${slug}/product/${p.id}`)}
                        className="block relative aspect-square bg-amber-50/50 overflow-hidden"
                      >
                        <SafeImage
                          src={coverImage}
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={title}
                        />
                        <span className="absolute top-2 left-2 bg-emerald-700 text-white text-[10px] font-bold rounded-full px-2.5 py-0.5 shadow">
                          Fresh Batch
                        </span>
                      </Link>

                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                        <div>
                          {p.category?.name && (
                            <span className="text-[10px] font-semibold text-amber-800 uppercase block mb-1">
                              {p.category.name}
                            </span>
                          )}
                          <Link
                            href={getLink(`/store/${slug}/product/${p.id}`)}
                            className="font-serif font-bold text-sm text-[var(--store-text-primary)] hover:text-emerald-800 transition line-clamp-2"
                          >
                            {title}
                          </Link>
                          <div className="text-[11px] text-[var(--store-text-secondary)] mt-1">
                            Vacuum-sealed 500g pack
                          </div>
                        </div>

                        <div className="pt-2 border-t border-amber-100 flex items-center justify-between gap-2">
                          <div data-store-price="true" className="font-bold text-sm text-[var(--store-text-primary)] font-mono">
                            {formatPaise(pricePaise)}
                          </div>

                          <button
                            data-store-button="true"
                              onClick={(e) => handleQuickAdd(e, p)}
                            disabled={isAdding}
                            className="px-3.5 py-1.5 rounded-full bg-emerald-800 hover:bg-emerald-900 text-[var(--store-text-primary)] font-bold text-xs shadow-sm transition flex items-center gap-1"
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Added</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>{t('storefront.addToCart')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                {/* --- D. FOUNDRY B2B SPEC-SHEET CARD (4:3 Technical with MOQ & RFQ) --- */}
                if (themeCode === 'foundry') {
                  return (
                    <div
                      key={p.id}
                      className="bg-slate-800 border border-slate-700 rounded-sm overflow-hidden shadow-md font-mono flex flex-col group relative"
                    >
                      <Link
                        href={getLink(`/store/${slug}/product/${p.id}`)}
                        className="block relative aspect-[4/3] bg-slate-900 overflow-hidden border-b border-slate-700"
                      >
                        <SafeImage
                          src={coverImage}
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={title}
                        />
                        <div className="absolute top-2 left-2 bg-slate-900/90 text-sky-400 text-[10px] font-bold px-2 py-0.5 border border-sky-500/40">
                          SPEC: INDUSTRIAL GRADE
                        </div>
                      </Link>

                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3 text-[var(--store-text-primary)]">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] text-[var(--store-text-secondary)]">
                            <span>PART ID: #PRD-{p.id.slice(0, 6).toUpperCase()}</span>
                            <span className="text-emerald-400 font-bold">IN STOCK</span>
                          </div>

                          <Link
                            href={getLink(`/store/${slug}/product/${p.id}`)}
                            className="font-bold text-sm text-[var(--store-text-primary)] hover:text-sky-300 transition line-clamp-2 block"
                          >
                            {title}
                          </Link>

                          {/* Technical Specification Matrix */}
                          <div className="bg-[var(--store-surface)] p-2.5 rounded-sm border border-slate-700/80 space-y-1 text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-[var(--store-text-secondary)]">Standard MOQ:</span>
                              <span className="text-[var(--store-text-primary)] font-bold">25 Units</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--store-text-secondary)]">Lead Time:</span>
                              <span className="text-[var(--store-text-primary)] font-bold">3-5 Business Days</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--store-text-secondary)]">Unit Base:</span>
                              <span data-store-price="true" className="text-sky-400 font-bold">{formatPaise(pricePaise)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Dual Action: Instant RFQ on WhatsApp & Product Page */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700">
                          <a
                            href={`https://wa.me/919822012345?text=RFQ%20Inquiry%20for%20Item%3A%20${encodeURIComponent(title)}%20(SKU%3A%20PRD-${p.id.slice(0, 6).toUpperCase()})`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => {
                              if (store?.id) {
                                logWhatsappEnquiry({
                                  storeId: store.id,
                                  productId: p.id,
                                  customerName: 'WhatsApp Buyer',
                                  message: `RFQ Quote enquiry for ${title}`,
                                });
                              }
                            }}
                            data-theme-btn="true"
                            className="px-2.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-[var(--store-text-primary)] text-[11px] font-bold text-center rounded-sm transition flex items-center justify-center gap-1"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>RFQ Quote</span>
                          </a>

                          <Link
                            href={getLink(`/store/${slug}/product/${p.id}`)}
                            data-theme-btn="true"
                            className="px-2.5 py-2 bg-sky-700 hover:bg-sky-600 text-[var(--store-text-primary)] text-[11px] font-bold text-center rounded-sm transition flex items-center justify-center gap-1"
                          >
                            <span>Full Spec</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                {/* --- E. HABITAT LIFESTYLE CARD (4:5 Minimal Bleed) --- */}
                if (themeCode === 'habitat') {
                  return (
                    <div
                      key={p.id}
                      className="bg-white border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col group relative"
                    >
                      <Link
                        href={getLink(`/store/${slug}/product/${p.id}`)}
                        className="block relative aspect-[4/5] bg-stone-100 overflow-hidden"
                      >
                        <SafeImage
                          src={coverImage}
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          fallbackTitle={title}
                        />
                        <span className="absolute top-3 left-3 bg-stone-900/80 text-white text-[10px] font-serif uppercase tracking-wider px-2 py-0.5">
                          Living Sanctuary
                        </span>
                      </Link>

                      <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                        <div>
                          <Link
                            href={getLink(`/store/${slug}/product/${p.id}`)}
                            className="font-serif text-sm font-semibold text-[var(--store-text-primary)] hover:text-[var(--store-text-secondary)] transition line-clamp-1"
                          >
                            {title}
                          </Link>
                          <div className="text-[11px] text-[var(--store-text-secondary)]">
                            Solid Wood • Hand-Finished
                          </div>
                        </div>

                        <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                          <div data-store-price="true" className="font-serif text-sm font-bold text-[var(--store-text-primary)]">
                            {formatPaise(pricePaise)}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              data-store-button="true"
                              onClick={(e) => handleQuickAdd(e, p)}
                              disabled={isAdding}
                              className="px-3.5 py-1.5 rounded-lg bg-[var(--store-surface)] hover:bg-[var(--store-surface)] text-[var(--store-text-primary)] font-medium text-xs shadow-sm transition flex items-center gap-1"
                              title={t('storefront.addToCart')}
                            >
                              {isAdded ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Added</span>
                                </>
                              ) : isAdding ? (
                                <span>Adding...</span>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>{t('storefront.addToCart')}</span>
                                </>
                              )}
                            </button>
                            <Link
                              href={getLink(`/store/${slug}/product/${p.id}`)}
                              className="text-xs font-serif uppercase tracking-wider text-[var(--store-text-secondary)] hover:text-[var(--store-text-primary)]"
                              title="View piece details"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                {/* --- G. AURA CLEAN BEAUTY CARD (3:4 Luminous Glassmorphic Portrait) --- */}
                if (themeCode === 'aura') {
                  return (
                    <div
                      key={p.id}
                      className="bg-white/95 rounded-2xl border border-rose-200/80 overflow-hidden shadow-xs hover:shadow-xl hover:border-rose-300 transition-all duration-300 flex flex-col group relative"
                    >
                      <Link
                        href={getLink(`/store/${slug}/product/${p.id}`)}
                        className="block relative aspect-[3/4] bg-rose-50/40 overflow-hidden"
                      >
                        <SafeImage
                          src={coverImage}
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          fallbackTitle={title}
                        />
                        <span className="absolute top-2.5 left-2.5 bg-rose-900/90 text-rose-100 text-[10px] font-sans font-semibold tracking-wider px-2.5 py-0.5 rounded-full shadow">
                          Pure Active
                        </span>
                      </Link>

                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3 bg-gradient-to-b from-white to-rose-50/20">
                        <div>
                          {p.category?.name && (
                            <span className="text-[10px] font-sans font-bold text-rose-700 uppercase tracking-widest block mb-1">
                              {p.category.name}
                            </span>
                          )}
                          <Link
                            href={getLink(`/store/${slug}/product/${p.id}`)}
                            className="font-serif text-sm font-semibold text-[var(--store-text-primary)] hover:text-rose-800 transition line-clamp-2 leading-snug"
                          >
                            {title}
                          </Link>
                        </div>

                        <div className="pt-2.5 border-t border-rose-100 flex items-center justify-between">
                          <div>
                            <div data-store-price="true" className="font-serif text-base font-bold text-rose-950">
                              {formatPaise(pricePaise)}
                            </div>
                            {comparePaise && comparePaise > pricePaise && (
                              <div className="text-[10px] text-[var(--store-text-secondary)] line-through">
                                {formatPaise(comparePaise)}
                              </div>
                            )}
                          </div>

                          <button
                            data-store-button="true"
                              onClick={(e) => handleQuickAdd(e, p)}
                            disabled={isAdding}
                            className="px-3.5 py-1.5 rounded-full bg-rose-900 hover:bg-rose-800 text-[var(--store-text-primary)] font-sans font-bold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer"
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-rose-300" />
                                <span>Added</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>{t('storefront.addToCart')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                {/* --- H. NOIR CYBER MONOLITH CARD (4:5 Stealth Carbon) --- */}
                if (themeCode === 'noir') {
                  return (
                    <div
                      key={p.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden shadow-lg hover:border-emerald-500/70 transition-all flex flex-col group relative font-mono"
                    >
                      <Link
                        href={getLink(`/store/${slug}/product/${p.id}`)}
                        className="block relative aspect-[4/5] bg-zinc-950 overflow-hidden border-b border-zinc-800"
                      >
                        <SafeImage
                          src={coverImage}
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          fallbackTitle={title}
                        />
                        <span className="absolute top-2 left-2 bg-zinc-950/90 text-emerald-400 text-[10px] font-bold px-2 py-0.5 border border-emerald-500/40">
                          // MONOLITH
                        </span>
                      </Link>

                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3 bg-[var(--store-surface)] text-[var(--store-text-primary)]">
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-[var(--store-text-secondary)] mb-1">
                            <span>#{p.id.slice(0, 6).toUpperCase()}</span>
                            <span className="text-emerald-400 font-bold">RESERVE RUN</span>
                          </div>
                          <Link
                            href={getLink(`/store/${slug}/product/${p.id}`)}
                            className="font-sans font-bold text-sm text-[var(--store-text-primary)] hover:text-emerald-300 transition line-clamp-1"
                          >
                            {title}
                          </Link>
                        </div>

                        <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                          <div data-store-price="true" className="font-mono text-sm font-bold text-emerald-400">
                            {formatPaise(pricePaise)}
                          </div>
                          <button
                            data-store-button="true"
                              onClick={(e) => handleQuickAdd(e, p)}
                            disabled={isAdding}
                            className="px-3 py-1.5 rounded-sm bg-[var(--store-surface)] hover:bg-[var(--store-surface)] text-black font-mono font-black text-xs transition flex items-center gap-1 cursor-pointer"
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-black" />
                                <span>ADDED</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>{t('storefront.addToCart')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                {/* --- I. VISTA SUN-DRENCHED ARTISAN CARD (4:3 Warm Earth Linen) --- */}
                if (themeCode === 'vista') {
                  return (
                    <div
                      key={p.id}
                      className="bg-[#FDFBF7] rounded-2xl border-2 border-amber-200/80 overflow-hidden shadow-xs hover:shadow-lg transition-all flex flex-col group relative"
                    >
                      <Link
                        href={getLink(`/store/${slug}/product/${p.id}`)}
                        className="block relative aspect-[4/3] bg-amber-50/50 overflow-hidden"
                      >
                        <SafeImage
                          src={coverImage}
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          fallbackTitle={title}
                        />
                        <span className="absolute top-2.5 left-2.5 bg-[#431407]/90 text-amber-200 text-[10px] font-serif font-bold px-2.5 py-0.5 rounded-full shadow">
                          Artisan Weave
                        </span>
                      </Link>

                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                        <div>
                          {p.category?.name && (
                            <span className="text-[10px] font-serif font-bold text-orange-800 uppercase tracking-wider block mb-1">
                              {p.category.name}
                            </span>
                          )}
                          <Link
                            href={getLink(`/store/${slug}/product/${p.id}`)}
                            className="font-serif text-sm font-bold text-[#431407] hover:text-orange-800 transition line-clamp-2 leading-snug"
                          >
                            {title}
                          </Link>
                        </div>

                        <div className="pt-2.5 border-t border-amber-200/60 flex items-center justify-between">
                          <div data-store-price="true" className="font-serif text-base font-bold text-[#9A3412]">
                            {formatPaise(pricePaise)}
                          </div>
                          <button
                            data-store-button="true"
                              onClick={(e) => handleQuickAdd(e, p)}
                            disabled={isAdding}
                            className="px-3.5 py-1.5 rounded-xl bg-[#9A3412] hover:bg-[#7C2D12] text-[var(--store-text-primary)] font-serif font-bold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer"
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-amber-300" />
                                <span>Crafted</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Select</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                {/* --- J. HORIZON ENTERPRISE CARD (Clean Elevated Modern) --- */}
                if (themeCode === 'horizon') {
                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs hover:shadow-xl hover:border-blue-500 transition-all duration-300 flex flex-col group relative"
                    >
                      <Link
                        href={getLink(`/store/${slug}/product/${p.id}`)}
                        className="block relative aspect-square bg-slate-50 overflow-hidden"
                      >
                        <SafeImage
                          src={coverImage}
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          fallbackTitle={title}
                        />
                        {comparePaise && comparePaise > pricePaise ? (
                          <span className="absolute top-2.5 left-2.5 bg-blue-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                            Save ₹{Math.round((comparePaise - pricePaise) / 100)}
                          </span>
                        ) : p.category?.name ? (
                          <span className="absolute top-2.5 left-2.5 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-medium tracking-wide px-2.5 py-0.5 rounded-full shadow-xs">
                            {p.category.name}
                          </span>
                        ) : null}
                      </Link>

                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3 bg-[var(--store-surface)]">
                        <div>
                          {p.category?.name && (
                            <span className="text-[10px] font-sans font-bold text-blue-600 uppercase tracking-wider block mb-1">
                              {p.category.name}
                            </span>
                          )}
                          <Link
                            href={getLink(`/store/${slug}/product/${p.id}`)}
                            className="font-sans text-sm font-bold text-[var(--store-text-primary)] hover:text-blue-600 transition line-clamp-2 leading-snug"
                          >
                            {title}
                          </Link>
                        </div>

                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                          <div>
                            <div data-store-price="true" className="font-sans text-base sm:text-lg font-bold text-[var(--store-text-primary)]">
                              {formatPaise(pricePaise)}
                            </div>
                            {comparePaise && comparePaise > pricePaise && (
                              <div className="text-[10px] text-[var(--store-text-secondary)] line-through">
                                {formatPaise(comparePaise)}
                              </div>
                            )}
                          </div>

                          <button
                            data-store-button="true"
                              onClick={(e) => handleQuickAdd(e, p)}
                            disabled={isAdding}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-[var(--store-text-primary)] font-sans font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-blue-200" />
                                <span>Added</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>{t('storefront.addToCart')}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                {/* --- K. CANVAS FULL-BLEED CINEMATIC SHOWCASE CARD (Clean Adaptive Surface) --- */}
                if (themeCode === 'canvas') {
                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs hover:shadow-xl hover:border-amber-400 transition-all duration-300 flex flex-col group relative"
                    >
                      <Link
                        href={getLink(`/store/${slug}/product/${p.id}`)}
                        className="block relative aspect-square bg-slate-50 overflow-hidden"
                      >
                        <SafeImage
                          src={coverImage}
                          alt={title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          fallbackTitle={title}
                        />
                        {comparePaise && comparePaise > pricePaise ? (
                          <span className="absolute top-2.5 left-2.5 bg-amber-500 text-slate-950 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                            Save ₹{Math.round((comparePaise - pricePaise) / 100)}
                          </span>
                        ) : p.category?.name ? (
                          <span className="absolute top-2.5 left-2.5 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-medium tracking-wide px-2.5 py-0.5 rounded-full shadow-xs">
                            {p.category.name}
                          </span>
                        ) : null}
                      </Link>

                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3 bg-[var(--store-surface)]">
                        <div>
                          <Link
                            href={getLink(`/store/${slug}/product/${p.id}`)}
                            className="font-sans text-sm font-bold text-[var(--store-text-primary)] hover:text-amber-600 transition-colors line-clamp-2 leading-snug"
                          >
                            {title}
                          </Link>
                        </div>

                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                          <div>
                            <div data-store-price="true" className="font-sans text-base sm:text-lg font-bold text-[var(--store-text-primary)]">
                              {formatPaise(pricePaise)}
                            </div>
                            {comparePaise && comparePaise > pricePaise && (
                              <div className="text-[11px] text-[var(--store-text-secondary)] line-through">
                                {formatPaise(comparePaise)}
                              </div>
                            )}
                          </div>

                          <button
                            data-store-button="true"
                              onClick={(e) => handleQuickAdd(e, p)}
                            disabled={isAdding}
                            className="px-4 py-2 rounded-xl bg-[var(--store-surface)] hover:bg-amber-500 hover:text-[var(--store-text-primary)] text-[var(--store-text-primary)] font-sans font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Added</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Select</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                {/* --- F. LOCAL HIGH-DENSITY CARD (Fast Commerce with 1-Tap Buy) --- */}
                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col group relative"
                  >
                    <Link
                      href={getLink(`/store/${slug}/product/${p.id}`)}
                      className="block relative aspect-square bg-gray-100 overflow-hidden"
                    >
                      <SafeImage
                        src={coverImage}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        fallbackTitle={title}
                      />
                      {comparePaise && comparePaise > pricePaise && (
                        <span className="absolute top-2 left-2 bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                          Save ₹{Math.round((comparePaise - pricePaise) / 100)}
                        </span>
                      )}
                    </Link>

                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        {p.category?.name && (
                          <span className="text-[10px] text-gray-400 font-semibold block uppercase">
                            {p.category.name}
                          </span>
                        )}
                        <Link
                          href={getLink(`/store/${slug}/product/${p.id}`)}
                          className="font-bold text-xs text-gray-900 hover:text-blue-700 transition line-clamp-2 leading-snug"
                        >
                          {title}
                        </Link>
                      </div>

                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-1">
                        <div>
                          <div data-store-price="true" className="font-mono font-bold text-xs text-gray-900">
                            {formatPaise(pricePaise)}
                          </div>
                          {comparePaise && (
                            <div className="text-[10px] text-gray-400 font-mono line-through">
                              {formatPaise(comparePaise)}
                            </div>
                          )}
                        </div>

                        <button
                          data-store-button="true"
                              onClick={(e) => handleQuickAdd(e, p)}
                          disabled={isAdding}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-800 text-white font-bold text-[11px] transition shadow-sm flex items-center gap-1"
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3 h-3 text-green-300" />
                              <span>Added</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>{t('storefront.addToCart')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* =========================================================================
            4. THEME-SPECIFIC DISTINCT HOMEPAGE SECTIONS
        ========================================================================= */}

        {/* --- ATELIER: Editorial Lookbook & Heritage Strip --- */}
        {themeCode === 'atelier' && (
          <section className="py-16 px-4 sm:px-6 lg:px-8 border-y border-amber-900/40">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              <span className="font-mono text-xs uppercase tracking-[0.25em] text-amber-300">
                The Artisanal Benchmark
              </span>
              <h3 className="text-2xl sm:text-4xl font-serif font-light leading-snug">
                &ldquo;True luxury resides in the quiet integrity of the materials and the patience of the artisan.&rdquo;
              </h3>
              <p className="text-xs sm:text-sm opacity-80 max-w-2xl mx-auto leading-relaxed font-light">
                Each piece dispatched by {store.name} carries a registered hallmark of authenticity. We accommodate private appointments and custom bridal commissions.
              </p>
              <div className="pt-4 flex flex-wrap items-center justify-center gap-8 text-xs font-serif text-amber-200/90 tracking-wider">
                <span>✦ Hallmarked 100% Certified</span>
                <span>✦ Insured Air Courier</span>
                <span>✦ Private Concierge Support</span>
              </div>
            </div>
          </section>
        )}

        {/* --- FOUNDRY: Plant Infrastructure & Quality Assurance --- */}
        {themeCode === 'foundry' && (
          <section className="bg-slate-900 text-slate-200 py-12 px-4 sm:px-6 lg:px-8 border-y border-slate-700 font-mono">
            <div className="max-w-6xl mx-auto space-y-8">
              <div className="border-b border-slate-800 pb-4">
                <span className="text-xs text-sky-400 font-bold">// MANUFACTURING INFRASTRUCTURE & ASSURANCE</span>
                <h3 className="text-xl sm:text-2xl font-bold text-white mt-1">Direct Factory Sourcing Capabilities</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-slate-800/60 p-5 border border-slate-700 rounded-sm space-y-2">
                  <div className="text-sky-400 font-bold text-xs">01. PRECISION TOLERANCE</div>
                  <h4 className="text-sm font-bold text-white">CNC Machining & Testing</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Components machined to strict microns. Batch test certificates (MTC) provided with dispatch consignments.
                  </p>
                </div>
                <div className="bg-slate-800/60 p-5 border border-slate-700 rounded-sm space-y-2">
                  <div className="text-sky-400 font-bold text-xs">02. COMMERCIAL LOGISTICS</div>
                  <h4 className="text-sm font-bold text-white">Bulk Freight Pan-India</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Dedicated commercial freight partnerships for palleted transport, road lines, and expedited shipments.
                  </p>
                </div>
                <div className="bg-slate-800/60 p-5 border border-slate-700 rounded-sm space-y-2">
                  <div className="text-sky-400 font-bold text-xs">03. TAX & COMPLIANCE</div>
                  <h4 className="text-sm font-bold text-white">GST Invoicing & Credit</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Automated B2B GST tax invoices with HSN / SAC breakdown to ensure complete input tax credit for your firm.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- HARVEST: Purity Commitment & Farm Kitchen Story --- */}
        {themeCode === 'harvest' && (
          <section className="bg-amber-100/40 border-y border-amber-200 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center space-y-4">
              <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Our Purity Commitment</span>
              <h3 className="text-xl sm:text-3xl font-serif font-bold text-stone-900">
                Fresh From Our Kitchen to Your Table
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 leading-relaxed max-w-2xl mx-auto">
                At {store.name}, we refuse shortcuts. Every recipe starts with raw ingredients sourced directly from verified farmers. Cooked in small daily batches so you get pure taste and peak nutrition.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-stone-700">
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> FSSAI Compliant Kitchen
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> Eco-Friendly Safe Packaging
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> 100% Satisfaction Guarantee
                </span>
              </div>
            </div>
          </section>
        )}

        {/* --- HABITAT / LOCAL / PULSE Default Brand Strip --- */}
        {(themeCode === 'habitat' || themeCode === 'local' || themeCode === 'pulse') && (
          <section className="bg-gray-50 border-y border-gray-200 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center space-y-4">
              <h3 className="text-xl sm:text-2xl font-bold text-[var(--store-text-primary)]">
                Direct From {store.name}
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed max-w-2xl mx-auto">
                Every item in our storefront is meticulously verified before dispatch. We take pride in building direct relationships with our buyers across India.
              </p>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-gray-700">
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> 100% Genuine Quality
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> Fast Courier Tracking
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" /> Dedicated WhatsApp Support
                </span>
              </div>
            </div>
          </section>
        )}
      </main>

      <StoreFooter store={store} themeConfig={themeConfig} />
    </ThemeWrapper>
  );
}
