import { getSellerUrl as getPreviewSellerOrigin } from '../../../utils/config';
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  ShoppingBag, 
  Search, 
  Filter, 
  ArrowLeft, 
  Sparkles, 
  Plus, 
  Check, 
  SlidersHorizontal,
  Package,
  Layers,
  ArrowRight,
  MessageSquare
} from 'lucide-react';
import { useCart } from '../../../context/CartContext';
import { useStorefrontI18n } from '@simply/i18n';
import { useToast } from '../../../components/ui/Toast';
import { ThemeWrapper } from '../../../components/ThemeWrapper';
import { StoreHeader } from '../../../components/StoreHeader';
import { StoreFooter } from '../../../components/StoreFooter';
import { SafeImage } from '../../../components/ui/SafeImage';
import { formatPaise } from '@simply/ui';
import { normalizeCatalogHeader } from '@simply/types';
import { getSellerStorePreviewUrl } from '../../../utils/config';

export default function StoreProductsPage() {
  const router = useRouter();
  const { slug, preview, category: categoryQuery } = router.query;
  const { setStoreId, api, addItem } = useCart();
  const toast = useToast();
  const { t } = useStorefrontI18n();

  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState<any | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc' | 'newest'>('featured');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);

  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPages, setCatalogPages] = useState(1);
  const [catalogLoading, setCatalogLoading] = useState(false);
  useEffect(() => { setCatalogPage(1); }, [slug, activeCategory, searchQuery, sortBy]);
  useEffect(() => {
    if (!slug || !storeData?.store?.id) return;
    let current = true;
    setCatalogLoading(true);
    const timer = setTimeout(() => {
      api.stores.getPublicProducts(String(slug), { page: catalogPage, limit: 20, category: activeCategory === 'all' ? undefined : activeCategory, q: searchQuery, sort: sortBy, previewSecret: preview ? String(preview) : undefined }).then((res: any) => {
        if (!current) return;
        setStoreData((prev: any) => ({ ...prev, products: res.products }));
        setCatalogPages(res.pagination.totalPages || 1);
      }).catch((error: any) => { if (current) toast.error('Could not load products', error.message); }).finally(() => { if (current) setCatalogLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [slug, storeData?.store?.id, activeCategory, searchQuery, sortBy, catalogPage, preview]);

  useEffect(() => {
    if (router.query.embedded === 'true' && !loading && storeData) {
      window.parent.postMessage({ type: 'CATALOG_PREVIEW_READY' }, new URL(getPreviewSellerOrigin()).origin);
    }
  }, [router.query.embedded, loading, Boolean(storeData)]);

  useEffect(() => {
    if (!slug) return;
    loadStorefront(String(slug), preview ? String(preview) : undefined);
  }, [slug, preview]);

  useEffect(() => {
    if (categoryQuery && typeof categoryQuery === 'string') {
      setActiveCategory(categoryQuery);
    }
  }, [categoryQuery]);

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
                ...normalizeCatalogHeader(event.data.themeConfig),
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
    setLoading(true);
    try {
      const res = await api.stores.getPublicStorefront(storeSlug, previewSecret);
      setStoreData({ ...res, themeConfig: normalizeCatalogHeader(res.themeConfig) });
      if (res.store?.id) {
        setStoreId(res.store.id);
      }
    } catch (err: any) {
      console.error('Failed to load store products', err);
    } finally {
      setLoading(false);
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

  const handleQuickAdd = async (e: React.MouseEvent, product: any) => {
    e.preventDefault();
    e.stopPropagation();

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

  if (loading || !storeData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--store-surface)] store-surface">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[var(--store-border)] border-t-gray-900 rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-[var(--store-text-secondary)]">Loading catalog...</p>
        </div>
      </div>
    );
  }

  const { store, products = [], categories = [], themeConfig } = storeData;
  const themeCode = themeConfig?.themeId || 'atelier';
  const productsConfig = themeConfig?.pages?.products || {};

  const processedProducts = products;

  // Titles & text from vendor customization
  const pageTitle = productsConfig.pageTitle ?? 'Our Collection';
  const pageSubtitle = productsConfig.pageSubtitle ?? `Explore our complete selection of handcrafted offerings from ${store.name}.`;
  const badgeText = productsConfig.badgeText ?? 'Direct from Merchant';

  return (
    <ThemeWrapper themeConfig={themeConfig} branding={themeConfig?.branding}>
      <Head>
        <title>{pageTitle} | {store.name}</title>
        <meta name="description" content={pageSubtitle} />
      </Head>

      {/* Persistent Merchant Preview Banner */}
      {isPreviewMode && !isEmbedded && (
        <div className="bg-slate-950 text-white font-medium text-xs py-2 px-4 sticky top-0 z-50 shadow-md flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold text-white">Merchant Preview</span>
            <span className="text-slate-400 hidden sm:inline">— Products Catalog Page</span>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12 sm:pt-6 sm:pb-14 space-y-5 sm:space-y-6">

        {/* Page Hero Header Banner */}
        <div data-testid="catalog-header" className="relative rounded-2xl overflow-hidden p-5 sm:p-7 border border-gray-200/80 shadow-xs bg-[var(--store-surface)] store-surface text-left space-y-2 [overflow-wrap:anywhere]">
          <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 px-3 py-1 text-[11px] font-mono tracking-wider uppercase rounded-full bg-[var(--store-surface)] store-surface text-[var(--store-text-primary)]">
            <Sparkles className="w-3 h-3 shrink-0 text-amber-500" />
            <span className="font-bold text-[var(--store-text-primary)]">{store.name}</span>
            <span className="text-[var(--store-text-secondary)]">•</span>
            <span data-catalog-field="badgeText" className="min-w-0">{badgeText}</span>
          </div>
          <h1 className={`text-2xl sm:text-4xl font-bold text-[var(--store-text-primary)] tracking-tight ${
            themeCode === 'atelier' ? 'font-serif' :
            themeCode === 'pulse' ? 'font-black uppercase' :
            themeCode === 'foundry' ? 'font-mono' : ''
          }`}>
            <span className="text-amber-800 block text-xs sm:text-sm font-semibold tracking-wider uppercase font-mono mb-0.5">{store.name} Collection</span>
            <span data-catalog-field="pageTitle" className="block text-balance">{pageTitle}</span>
          </h1>
          <p data-catalog-field="pageSubtitle" className="text-xs sm:text-sm text-[var(--store-text-secondary)] max-w-2xl leading-relaxed">
            {pageSubtitle}
          </p>
        </div>

        {/* Search, Filter & Sort Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-[var(--store-surface)] store-surface p-3.5 rounded-xl border border-[var(--store-border)] shadow-xs">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[var(--store-text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search products by title, keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-[var(--store-border)] rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-gray-900 transition"
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[var(--store-text-secondary)] whitespace-nowrap">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              aria-label="Sort products by"
              className="px-3 py-2 border border-[var(--store-border)] rounded-lg text-xs bg-[var(--store-surface)] store-surface font-medium text-[var(--store-text-primary)] focus:outline-hidden focus:ring-2 focus:ring-gray-900"
            >
              <option value="featured">Featured First</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="newest">Newest Arrivals</option>
            </select>
          </div>
        </div>

        {/* Category Filter Pills (Matching Home Page) */}
        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeCategory === 'all'
                  ? 'bg-[var(--store-button-bg)] store-inverse text-white shadow-xs'
                  : 'bg-[var(--store-surface)] store-surface text-[var(--store-text-secondary)] border border-[var(--store-border)] hover:bg-[var(--store-surface)] store-surface'
              }`}
            >
              All Products ({products.length})
            </button>
            {categories.map((cat: any) => {
              const count = products.filter((p: any) => p.categoryId === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                    activeCategory === cat.id
                      ? 'bg-[var(--store-button-bg)] store-inverse text-white shadow-xs'
                      : 'bg-[var(--store-surface)] store-surface text-[var(--store-text-secondary)] border border-[var(--store-border)] hover:bg-[var(--store-surface)] store-surface'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Products Grid — Responsive 2-Columns on Mobile Like Home Page */}
        {processedProducts.length === 0 ? (
          <div className="bg-[var(--store-surface)] store-surface border border-dashed border-[var(--store-border)] rounded-2xl p-12 text-center space-y-3 max-w-lg mx-auto">
            <div className="w-14 h-14 bg-[var(--store-surface)] store-surface rounded-full flex items-center justify-center mx-auto text-[var(--store-text-secondary)]">
              <Package className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-[var(--store-text-primary)]">No products found</h3>
            <p className="text-xs text-[var(--store-text-secondary)] leading-relaxed">
              {searchQuery
                ? `No products match your search for "${searchQuery}". Try a different keyword.`
                : 'No products are currently available in this category.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-3.5 py-1.5 bg-[var(--store-button-bg)] store-inverse text-white text-xs font-bold rounded-lg hover:bg-[var(--store-button-bg)] store-inverse transition"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className={`store-product-grid grid gap-3.5 sm:gap-6 ${
            themeCode === 'foundry' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
            themeCode === 'local' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' :
            themeCode === 'atelier' ? 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' :
            'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
          }`}>
            {processedProducts.map((p: any) => {
              const title = p.name || p.title || 'Product';
              const primaryVariant = p.variants?.[0];
              const pricePaise = p.basePricePaise ?? primaryVariant?.pricePaise ?? p.pricePaise ?? 0;
              const comparePaise = p.compareAtPricePaise ?? primaryVariant?.compareAtPricePaise;
              const primaryMedia = p.media?.find((m: any) => m.isPrimary) || p.media?.[0];
              const coverImage =
                primaryMedia?.publicUrl ||
                primaryMedia?.url ||
                (primaryMedia?.storageKey ? `/media/file/${primaryMedia.storageKey}` : undefined) ||
                p.images?.[0]?.url ||
                '';
              const isAdded = addedId === p.id;
              const isAdding = addingId === p.id;
              const hasDiscount = comparePaise && comparePaise > pricePaise;

              {/* --- A. ATELIER LUXURY CARD --- */}
              if (themeCode === 'atelier') {
                return (
                  <div
                    key={p.id}
                    className="bg-[var(--store-surface)] store-surface border border-[var(--store-border)] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between group relative"
                  >
                    <Link
                      href={getLink(`/store/${slug}/product/${p.id}`)}
                      className="block relative aspect-[3/4] bg-[var(--store-surface)] store-surface overflow-hidden"
                    >
                      <SafeImage
                        src={coverImage}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        fallbackTitle={title}
                      />
                      <span className="absolute top-2.5 left-2.5 bg-stone-900/90 text-amber-200 text-[9px] sm:text-[10px] font-mono uppercase tracking-widest px-2 py-0.5">
                        Haute Creation
                      </span>
                    </Link>

                    <div className="p-3 sm:p-5 flex-1 flex flex-col justify-between space-y-2 sm:space-y-3 bg-[var(--store-surface)] store-surface">
                      <div>
                        {p.category?.name && (
                          <span className="text-[9px] sm:text-[10px] font-mono text-[var(--store-text-secondary)] uppercase tracking-widest block mb-0.5">
                            {p.category.name}
                          </span>
                        )}
                        <Link
                          href={getLink(`/store/${slug}/product/${p.id}`)}
                          className="font-serif text-xs sm:text-base text-[var(--store-text-primary)] hover:text-amber-800 transition line-clamp-2 leading-snug font-medium"
                        >
                          {title}
                        </Link>
                      </div>

                      <div className="pt-2 sm:pt-3 border-t border-[var(--store-border)] flex items-center justify-between gap-1">
                        <div>
                          <div data-store-price="true" className="font-serif text-xs sm:text-base font-semibold text-[var(--store-text-primary)]">
                            {formatPaise(pricePaise)}
                          </div>
                          {comparePaise && (
                            <div className="text-[10px] text-[var(--store-text-secondary)] font-mono line-through">
                              {formatPaise(comparePaise)}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 sm:gap-2">
                          <button
                            type="button"
                            data-store-button="true"
                          onClick={(e) => handleQuickAdd(e, p)}
                            disabled={isAdding}
                            className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-none bg-[var(--store-button-bg)] store-inverse hover:bg-[var(--store-button-bg)] store-inverse text-amber-200 text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition shadow-sm flex items-center gap-1"
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span>Added</span>
                              </>
                            ) : isAdding ? (
                              <span>...</span>
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
                  </div>
                );
              }

              {/* --- B. PULSE STREETWEAR CARD --- */}
              if (themeCode === 'pulse') {
                return (
                  <div
                    key={p.id}
                    className="bg-[var(--store-surface)] store-surface border-2 border-slate-800 overflow-hidden shadow-lg hover:border-pink-500 transition-all flex flex-col justify-between group relative"
                  >
                    <Link
                      href={getLink(`/store/${slug}/product/${p.id}`)}
                      className="block relative aspect-square bg-[var(--store-button-bg)] store-inverse overflow-hidden"
                    >
                      <SafeImage
                        src={coverImage}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        fallbackTitle={title}
                      />
                      <span className="absolute top-2 left-2 bg-pink-500 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 shadow">
                        DROP 01
                      </span>
                    </Link>

                    <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between space-y-2 sm:space-y-3 bg-[var(--store-button-bg)] store-inverse">
                      <div>
                        <Link
                          href={getLink(`/store/${slug}/product/${p.id}`)}
                          className="font-black text-xs sm:text-sm uppercase tracking-tight text-white hover:text-pink-400 transition line-clamp-1"
                        >
                          {title}
                        </Link>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span data-store-price="true" className="font-black text-xs sm:text-base text-pink-400 font-mono">
                            {formatPaise(pricePaise)}
                          </span>
                          {comparePaise && (
                            <span className="text-[10px] sm:text-xs text-[var(--store-text-secondary)] font-mono line-through">
                              {formatPaise(comparePaise)}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        data-store-button="true"
                          onClick={(e) => handleQuickAdd(e, p)}
                        disabled={isAdding}
                        className="w-full py-1.5 sm:py-2 bg-[var(--store-surface)] store-surface hover:bg-pink-500 hover:text-white text-[var(--store-text-primary)] font-black text-[10px] sm:text-xs uppercase tracking-wider transition shadow flex items-center justify-center gap-1"
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>IN BAG</span>
                          </>
                        ) : (
                          <>
                            <ShoppingBag className="w-3 h-3" />
                            <span>{isAdding ? t('common.loading') : t('storefront.addToCart')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              }

              {/* --- C. HARVEST ARTISANAL CARD (Matching Home Page Image 1) --- */}
              if (themeCode === 'harvest') {
                return (
                  <div
                    key={p.id}
                    className="bg-[var(--store-surface)] store-surface rounded-2xl border border-amber-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between group relative"
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
                      <span className="absolute top-2 left-2 bg-emerald-700 text-white text-[9px] sm:text-[10px] font-bold rounded-full px-2.5 py-0.5 shadow">
                        Fresh Batch
                      </span>
                    </Link>

                    <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between space-y-2 sm:space-y-3">
                      <div>
                        {p.category?.name && (
                          <span className="text-[9px] sm:text-[10px] font-semibold text-amber-800 uppercase block mb-0.5">
                            {p.category.name}
                          </span>
                        )}
                        <Link
                          href={getLink(`/store/${slug}/product/${p.id}`)}
                          className="font-serif font-bold text-xs sm:text-sm text-[var(--store-text-primary)] hover:text-emerald-800 transition line-clamp-2"
                        >
                          {title}
                        </Link>
                        <div className="text-[10px] sm:text-[11px] text-[var(--store-text-secondary)] mt-1 line-clamp-1">
                          Vacuum-sealed 500g pack
                        </div>
                      </div>

                      <div className="pt-2 border-t border-amber-100 flex items-center justify-between gap-1 sm:gap-2">
                        <div data-store-price="true" className="font-bold text-xs sm:text-sm text-[var(--store-text-primary)] font-mono">
                          {formatPaise(pricePaise)}
                        </div>

                        <button
                          type="button"
                          data-store-button="true"
                          onClick={(e) => handleQuickAdd(e, p)}
                          disabled={isAdding}
                          className="px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-[11px] sm:text-xs shadow-sm transition flex items-center gap-1 shrink-0"
                        >
                          {isAdded ? (
                            <>
                              <Check className="w-3 h-3" />
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
              }

              {/* --- D. FOUNDRY B2B SPEC-SHEET CARD --- */}
              if (themeCode === 'foundry') {
                return (
                  <div
                    key={p.id}
                    className="bg-[var(--store-surface)] store-surface border border-slate-700 rounded-sm overflow-hidden shadow-md font-mono flex flex-col justify-between group relative"
                  >
                    <Link
                      href={getLink(`/store/${slug}/product/${p.id}`)}
                      className="block relative aspect-[4/3] bg-[var(--store-button-bg)] store-inverse overflow-hidden border-b border-slate-700"
                    >
                      <SafeImage
                        src={coverImage}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        fallbackTitle={title}
                      />
                      <div className="absolute top-2 left-2 bg-slate-900/90 text-sky-400 text-[9px] font-bold px-2 py-0.5 border border-sky-500/40">
                        SPEC: INDUSTRIAL GRADE
                      </div>
                    </Link>

                    <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between space-y-2 text-[var(--store-text-secondary)]">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[9px] text-[var(--store-text-secondary)]">
                          <span>PART ID: #PRD-{p.id.slice(0, 6).toUpperCase()}</span>
                          <span className="text-emerald-400 font-bold">IN STOCK</span>
                        </div>

                        <Link
                          href={getLink(`/store/${slug}/product/${p.id}`)}
                          className="font-bold text-xs sm:text-sm text-white hover:text-sky-300 transition line-clamp-2 block"
                        >
                          {title}
                        </Link>
                      </div>

                      <div className="pt-2 border-t border-slate-700 flex items-center justify-between">
                        <span data-store-price="true" className="text-sky-400 font-bold text-xs sm:text-sm">{formatPaise(pricePaise)}</span>
                        <button
                          type="button"
                          data-store-button="true"
                          onClick={(e) => handleQuickAdd(e, p)}
                          disabled={isAdding}
                          className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold rounded-sm transition flex items-center gap-1"
                        >
                          {isAdded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          <span>{t('storefront.addToCart')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              {/* --- E. HABITAT LIFESTYLE CARD --- */}
              if (themeCode === 'habitat') {
                return (
                  <div
                    key={p.id}
                    className="bg-[var(--store-surface)] store-surface border border-[var(--store-border)] overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between group relative"
                  >
                    <Link
                      href={getLink(`/store/${slug}/product/${p.id}`)}
                      className="block relative aspect-[4/5] bg-[var(--store-surface)] store-surface overflow-hidden"
                    >
                      <SafeImage
                        src={coverImage}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        fallbackTitle={title}
                      />
                      <span className="absolute top-2 left-2 bg-stone-900/80 text-white text-[9px] font-serif uppercase tracking-wider px-2 py-0.5">
                        Living Sanctuary
                      </span>
                    </Link>

                    <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <Link
                          href={getLink(`/store/${slug}/product/${p.id}`)}
                          className="font-serif text-xs sm:text-sm font-semibold text-[var(--store-text-primary)] hover:text-[var(--store-text-secondary)] transition line-clamp-1"
                        >
                          {title}
                        </Link>
                        <div className="text-[10px] text-[var(--store-text-secondary)]">Solid Wood • Hand-Finished</div>
                      </div>

                      <div className="pt-2 border-t border-[var(--store-border)] flex items-center justify-between">
                        <div data-store-price="true" className="font-serif text-xs sm:text-sm font-bold text-[var(--store-text-primary)]">
                          {formatPaise(pricePaise)}
                        </div>
                        <button
                          type="button"
                          data-store-button="true"
                          onClick={(e) => handleQuickAdd(e, p)}
                          disabled={isAdding}
                          className="px-3 py-1 rounded-lg bg-[var(--store-button-bg)] store-inverse hover:bg-[var(--store-button-bg)] store-inverse text-white font-medium text-[11px] shadow-sm transition flex items-center gap-1"
                        >
                          {isAdded ? <Check className="w-3 h-3 text-emerald-400" /> : <Plus className="w-3 h-3" />}
                          <span>{t('storefront.addToCart')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              {/* --- F. LOCAL HIGH-DENSITY CARD (Default Fallback) --- */}
              return (
                <div
                  key={p.id}
                  className="bg-[var(--store-surface)] store-surface rounded-xl border border-[var(--store-border)] overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between group relative"
                >
                  <Link
                    href={getLink(`/store/${slug}/product/${p.id}`)}
                    className="block relative aspect-square bg-[var(--store-surface)] store-surface overflow-hidden"
                  >
                    <SafeImage
                      src={coverImage}
                      alt={title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      fallbackTitle={title}
                    />
                    {hasDiscount && (
                      <span className="absolute top-2 left-2 bg-green-600 text-white text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                        SAVE {Math.round(((comparePaise - pricePaise) / comparePaise) * 100)}%
                      </span>
                    )}
                  </Link>

                  <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      {p.category?.name && (
                        <span className="text-[9px] text-[var(--store-text-secondary)] uppercase font-mono block mb-0.5">
                          {p.category.name}
                        </span>
                      )}
                      <Link
                        href={getLink(`/store/${slug}/product/${p.id}`)}
                        className="font-bold text-xs sm:text-sm text-[var(--store-text-primary)] hover:text-blue-600 transition line-clamp-2"
                      >
                        {title}
                      </Link>
                    </div>

                    <div className="pt-2 border-t border-[var(--store-border)] flex items-center justify-between gap-1">
                      <div>
                        <div data-store-price="true" className="font-bold text-xs sm:text-sm text-[var(--store-text-primary)] font-mono">
                          {formatPaise(pricePaise)}
                        </div>
                        {hasDiscount && (
                          <div className="text-[10px] text-[var(--store-text-secondary)] font-mono line-through">
                            {formatPaise(comparePaise)}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        data-store-button="true"
                          onClick={(e) => handleQuickAdd(e, p)}
                        disabled={isAdding}
                        className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[var(--store-button-bg)] store-inverse hover:bg-[var(--store-button-bg)] store-inverse text-white font-bold text-[10px] sm:text-xs shadow-xs transition flex items-center gap-1 shrink-0"
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Added</span>
                          </>
                        ) : isAdding ? (
                          <span>...</span>
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
        <nav className="flex items-center justify-center gap-4 py-6" aria-label={t('storefront.products')} aria-busy={catalogLoading}>
          <button type="button" className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" disabled={catalogLoading || catalogPage <= 1} onClick={() => setCatalogPage(page => page - 1)}>{t('common.previous')}</button>
          <span className="text-sm tabular-nums">{catalogPage} / {catalogPages}</span>
          <button type="button" className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" disabled={catalogLoading || catalogPage >= catalogPages} onClick={() => setCatalogPage(page => page + 1)}>{t('common.next')}</button>
        </nav>
      </main>

      <StoreFooter store={store} themeConfig={themeConfig} />
    </ThemeWrapper>
  );
}
