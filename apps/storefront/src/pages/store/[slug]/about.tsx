import { getSellerUrl as getPreviewSellerOrigin } from '../../../utils/config';
import React, { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  Building, 
  MapPin, 
  Clock, 
  Phone, 
  Mail, 
  ArrowLeft, 
  CheckCircle, 
  Sparkles, 
  ShieldCheck, 
  Award, 
  HeartHandshake,
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { useCart } from '../../../context/CartContext';
import { ThemeWrapper } from '../../../components/ThemeWrapper';
import { StoreHeader } from '../../../components/StoreHeader';
import { StoreFooter } from '../../../components/StoreFooter';
import { SafeImage } from '../../../components/ui/SafeImage';
import { getSellerStorePreviewUrl } from '../../../utils/config';
import { normalizeBrandText, clampCatalogText, ABOUT_TEXT_LIMITS } from '@simply/types';

export default function StoreAboutPage() {
  const router = useRouter();
  const { slug, preview } = router.query;
  const { setStoreId, api } = useCart();

  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState<any | null>(null);
  const loadRevision = useRef(0);

  useEffect(() => {
    if (router.query.embedded === 'true' && !loading && storeData) {
      window.parent.postMessage({ type: 'BRAND_PREVIEW_READY' }, new URL(getPreviewSellerOrigin()).origin);
    }
  }, [router.query.embedded, loading, Boolean(storeData)]);

  useEffect(() => {
    if (!slug) return;
    loadStorefront(String(slug), preview ? String(preview) : undefined);
  }, [slug, preview]);

  // Live real-time studio preview sync
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
    try {
      const res = await api.stores.getPublicStorefront(storeSlug, previewSecret);
      if (revision !== loadRevision.current) return;
      setStoreData({ ...res, themeConfig: normalizeBrandText(res.themeConfig) });
      if (res.store?.id) {
        setStoreId(res.store.id);
      }
    } catch (err: any) {
      if (revision !== loadRevision.current) return;
      console.error('Failed to load store about page', err);
    } finally {
      if (revision === loadRevision.current) setLoading(false);
    }
  };

  const isPreviewMode = Boolean(
    storeData?.isPreview ||
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

  if (loading || !storeData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--store-surface)] store-surface">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[var(--store-border)] border-t-gray-900 rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-[var(--store-text-secondary)]">Loading store story...</p>
        </div>
      </div>
    );
  }

  const { store, themeConfig } = storeData;
  const themeCode = themeConfig?.themeId || 'atelier';
  const aboutConfig = themeConfig?.pages?.about || {};

  // Custom text with defaults
  const pageTitle = aboutConfig.pageTitle ?? `About ${store.name}`;
  const tagline = aboutConfig.tagline ?? 'Rooted in authentic tradition, crafted for everyday distinction.';
  const storyParagraph1 =
    aboutConfig.storyParagraph1 ??
    themeConfig?.storeStory ??
    (clampCatalogText(store.description, ABOUT_TEXT_LIMITS.storyParagraph1) ||
    'Founded with a steadfast commitment to purity and heritage, our boutique brings you exceptional goods meticulously selected from trusted origins.');
  const storyParagraph2 =
    aboutConfig.storyParagraph2 ??
    'Every offering is curated by experienced master specialists who value genuine craftsmanship, ethical supply chains, and transparent customer service.';
  
  const missionTitle = aboutConfig.missionTitle ?? 'Our Mission';
  const missionText =
    aboutConfig.missionText ??
    'To deliver genuine, authentic quality directly to discerning customers with zero compromise on integrity and craftsmanship.';

  const visionTitle = aboutConfig.visionTitle ?? 'Our Vision';
  const visionText =
    aboutConfig.visionText ??
    'Preserving authentic Indian heritage while making premium craftsmanship accessible across the country.';

  const values = Array.isArray(aboutConfig.values) && aboutConfig.values.length > 0
    ? aboutConfig.values
    : [
        {
          title: '100% Authentic Quality',
          desc: 'Directly sourced and inspected for absolute purity and highest benchmark standards.',
        },
        {
          title: 'Direct Merchant Care',
          desc: 'Hand-packed with care by our dedicated team with direct support for every customer.',
        },
        {
          title: 'Secure Pan-India Delivery',
          desc: 'Reliable express shipping with real-time tracking and verified protective packaging.',
        },
      ];

  const storeAddress =
    aboutConfig.storeAddress ??
    themeConfig?.physicalStoreAddress ??
    (clampCatalogText(store.businessAddress, ABOUT_TEXT_LIMITS.storeAddress) ||
    'Heritage Arcade, MG Road, Pune, Maharashtra 411001');
  
  const storeHours =
    aboutConfig.storeHours ??
    themeConfig?.physicalStoreTimings ??
    'Monday – Saturday: 10:30 AM to 8:30 PM (IST)';

  const contactPhone = aboutConfig.contactPhone ?? (clampCatalogText(store.supportPhone, ABOUT_TEXT_LIMITS.contactPhone) || '+91 98220 12345');
  const contactEmail = aboutConfig.contactEmail ?? (clampCatalogText(store.supportEmail, ABOUT_TEXT_LIMITS.contactEmail) || 'contact@sairamteacompany.com');
  const heroImage =
    aboutConfig.bannerUrl ||
    themeConfig?.branding?.bannerUrl ||
    store.branding?.bannerUrl ||
    store.bannerUrl;

  return (
    <ThemeWrapper themeConfig={themeConfig} branding={themeConfig?.branding}>
      <Head>
        <title>{pageTitle} | {store.name}</title>
        <meta name="description" content={tagline} />
      </Head>

      {/* Persistent Merchant Preview Banner */}
      {isPreviewMode && !isEmbedded && (
        <div className="bg-slate-950 text-white font-medium text-xs py-2 px-4 sticky top-0 z-50 shadow-md flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold text-white">Merchant Preview</span>
            <span className="text-slate-400 hidden sm:inline">— About Us Page</span>
          </div>
          <button
            type="button"
            onClick={() => {
              try { sessionStorage.removeItem('simply_merchant_preview'); } catch {}
              if (window.opener) window.close();
              else window.location.href = getSellerStorePreviewUrl();
            }}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 transition"
          >
            Exit Preview
          </button>
        </div>
      )}

      <StoreHeader store={store} themeConfig={themeConfig} />

      <main className="[overflow-wrap:anywhere] max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12 sm:pt-6 sm:pb-14 space-y-8 sm:space-y-10">
        {/* 1. Hero Header */}
        <section className="relative rounded-3xl overflow-hidden p-6 sm:p-10 border border-gray-200/80 shadow-xs bg-[var(--store-surface)] store-surface text-left space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 text-[11px] font-mono tracking-wider uppercase rounded-full bg-[var(--store-surface)] store-surface text-[var(--store-text-primary)]">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="font-bold text-[var(--store-text-primary)]">{store.name}</span>
            <span className="text-[var(--store-text-secondary)]">•</span>
            <span>Heritage & Story</span>
          </div>
          <h1 className="text-3xl sm:text-6xl font-bold font-theme-heading text-[var(--store-text-primary)] tracking-tight leading-tight">
            {pageTitle}
          </h1>
          <p className="text-sm sm:text-lg text-[var(--store-text-secondary)] max-w-2xl leading-relaxed">
            {tagline}
          </p>
        </section>

        {/* 2. Story Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200/60 uppercase">
                {aboutConfig.storyBadge ?? 'Our Story'}
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold font-theme-heading text-[var(--store-text-primary)] tracking-tight">
                {aboutConfig.storyHeading ?? 'Rooted in authentic tradition & passionate care'}
              </h2>
            </div>
            <div className="space-y-4 text-xs sm:text-sm text-[var(--store-text-secondary)] leading-relaxed">
              <p>{storyParagraph1}</p>
              <p>{storyParagraph2}</p>
            </div>
            <div className="pt-2">
              <Link data-theme-tone="primary"
                href={getLink(`/store/${slug}/products`)}
                data-theme-btn="true"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold text-white shadow-md transition hover:opacity-90"
                style={{ backgroundColor: 'var(--theme-primary, #111827)', color: 'var(--theme-on-primary)' }}
              >
                <span>Explore Our Products</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--store-border)] shadow-md bg-[var(--store-surface)] store-surface relative">
              {heroImage ? (
                <SafeImage
                  src={heroImage}
                  alt={store.name}
                  className="w-full h-full object-cover"
                  fallbackTitle={store.name}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-3 bg-gradient-to-br from-stone-900 to-stone-800 text-white">
                  <Building className="w-10 h-10 text-amber-400" />
                  <span className="font-serif text-2xl font-bold">{store.name}</span>
                  <p className="text-xs text-[var(--store-text-secondary)] font-mono tracking-widest uppercase">Verified Merchant Partner</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 3. Mission & Vision */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[var(--store-surface)] store-surface p-8 rounded-2xl border border-[var(--store-border)] shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[var(--store-text-primary)]">{missionTitle}</h3>
            <p className="text-xs sm:text-sm text-[var(--store-text-secondary)] leading-relaxed">{missionText}</p>
          </div>

          <div className="bg-[var(--store-surface)] store-surface p-8 rounded-2xl border border-[var(--store-border)] shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-[var(--store-text-primary)]">{visionTitle}</h3>
            <p className="text-xs sm:text-sm text-[var(--store-text-secondary)] leading-relaxed">{visionText}</p>
          </div>
        </section>

        {/* 4. Core Pillars / Values */}
        <section className="space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold font-theme-heading text-[var(--store-text-primary)]">
              Why Customers Trust {store.name}
            </h2>
            <p className="text-xs text-[var(--store-text-secondary)]">Built on three unwavering principles of authentic commerce.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {values.map((val: any, idx: number) => (
              <div
                key={idx}
                className="bg-[var(--store-surface)] store-surface p-6 rounded-2xl border border-[var(--store-border)] shadow-xs space-y-2 text-center"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--store-surface)] store-surface border border-[var(--store-border)] text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-[var(--store-text-primary)]">{val.title}</h4>
                <p className="text-xs text-[var(--store-text-secondary)] leading-relaxed">{val.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Physical Store / Contact Box */}
        <section className="bg-[var(--store-surface)] store-surface rounded-3xl border border-[var(--store-border)] p-8 sm:p-10 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--store-border)] pb-6">
            <div>
              <span className="text-xs font-mono font-bold text-[var(--store-text-secondary)] uppercase tracking-widest block mb-1">
                Direct Contact & Store Location
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-[var(--store-text-primary)]">
                Visit Our Store or Get in Touch
              </h3>
            </div>
            <a
              href={`https://wa.me/919822012345?text=Hello%20${encodeURIComponent(store.name)}%2C%20I%20have%20an%20inquiry%20regarding%20your%20products`}
              target="_blank"
              rel="noreferrer"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-2 self-start sm:self-auto"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chat on WhatsApp</span>
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-xs">
            <div className="space-y-1.5">
              <span className="text-[var(--store-text-secondary)] font-semibold flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[var(--store-text-secondary)]" /> Store Address
              </span>
              <p className="font-medium text-[var(--store-text-primary)] leading-relaxed">{storeAddress}</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-[var(--store-text-secondary)] font-semibold flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[var(--store-text-secondary)]" /> Operating Hours
              </span>
              <p className="font-medium text-[var(--store-text-primary)] leading-relaxed">{storeHours}</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-[var(--store-text-secondary)] font-semibold flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-[var(--store-text-secondary)]" /> Phone Support
              </span>
              <p className="font-medium text-[var(--store-text-primary)] font-mono">{contactPhone}</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-[var(--store-text-secondary)] font-semibold flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-[var(--store-text-secondary)]" /> Support Email
              </span>
              <p className="font-medium text-[var(--store-text-primary)] font-mono">{contactEmail}</p>
            </div>
          </div>
        </section>
      </main>

      <StoreFooter store={store} themeConfig={themeConfig} />
    </ThemeWrapper>
  );
}
