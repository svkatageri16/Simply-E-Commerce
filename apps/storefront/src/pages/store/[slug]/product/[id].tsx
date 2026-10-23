import { beginDirectCheckout } from '../../../../utils/direct-checkout';
import { getPublicStoreUrl } from '@simply/types';
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  ShoppingBag, 
  ArrowLeft, 
  Check, 
  ShieldCheck, 
  Truck, 
  MessageSquare, 
  Share2, 
  AlertTriangle,
  Send,
  X,
  Plus,
  Minus
} from 'lucide-react';
import { useCart } from '../../../../context/CartContext';
import { useToast } from '../../../../components/ui/Toast';
import { ThemeWrapper } from '../../../../components/ThemeWrapper';
import { StoreHeader } from '../../../../components/StoreHeader';
import { StoreFooter } from '../../../../components/StoreFooter';
import { SafeImage } from '../../../../components/ui/SafeImage';
import { formatPaise } from '@simply/ui';
import { getSellerStorePreviewUrl } from '../../../../utils/config';
import { ProductReviewsSection } from '../../../../components/ProductReviewsSection';
import { useStorefrontI18n } from '@simply/i18n';
import { normalizeIndianPhone } from '@simply/api-contracts';
import { logWhatsappEnquiry } from '../../../../utils/enquiry';
import { getProductTranslation } from '../../../../utils/productTranslation';

export default function ProductDetailPage() {
  const router = useRouter();
  const { slug, id, preview } = router.query;
  const { api, setStoreId, addItem } = useCart();
  const { locale, t, initStoreLocales } = useStorefrontI18n();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState<any | null>(null);
  const [product, setProduct] = useState<any | null>(null);

  // Variant & Gallery State
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [activeVariant, setActiveVariant] = useState<any | null>(null);
  const [activeGallery, setActiveGallery] = useState<any[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartSuccess, setCartSuccess] = useState(false);

  // Enquiry Modal State
  const [enquiryModalOpen, setEnquiryModalOpen] = useState(false);
  const [enquiryName, setEnquiryName] = useState('');
  const [enquiryPhone, setEnquiryPhone] = useState('');
  const [enquiryQty, setEnquiryQty] = useState(1);
  const [enquiryMsg, setEnquiryMsg] = useState('');
  const [submittingEnquiry, setSubmittingEnquiry] = useState(false);
  const [enquirySuccess, setEnquirySuccess] = useState(false);

  const getColourOptionName = (optsList: any[]) => {
    return optsList?.find(
      (o: any) => o.name?.toLowerCase() === 'colour' || o.name?.toLowerCase() === 'color'
    )?.name;
  };

  const getSizeOptionName = (optsList: any[]) => {
    return optsList?.find((o: any) => o.name?.toLowerCase() === 'size')?.name;
  };

  const isVariantAvailable = (variant: any): boolean => {
    if (!variant) return false;
    if (variant.status && variant.status !== 'ACTIVE') return false;
    const stock =
      variant.inventory?.stockOnHand ??
      variant.inventory?.availableQuantity ??
      (variant.stock !== undefined ? variant.stock : 10);
    return Number(stock) > 0;
  };

  const findVariantForOptions = (variantsList: any[], opts: Record<string, string>) => {
    if (!variantsList || variantsList.length === 0) return null;
    return (
      variantsList.find((v: any) => {
        const vOpts = v.optionValues || {};
        return Object.entries(opts).every(([k, val]) => {
          const vVal = vOpts[k];
          return vVal && vVal.toLowerCase() === val.toLowerCase();
        });
      }) || null
    );
  };

  const resolveGalleryForSelection = (
    prod: any,
    opts: Record<string, string>,
    variant: any
  ) => {
    const colourOptName = getColourOptionName(prod.options);
    const selectedColour = colourOptName ? opts[colourOptName] : null;

    let gallery: any[] = [];

    // Priority 1: Exact variant-specific media
    if (variant?.id) {
      const varMedia = (prod.images || []).filter(
        (img: any) => img.variantId === variant.id
      );
      if (varMedia.length > 0) {
        gallery = varMedia;
      }
    }

    // Priority 2: Selected colour media
    if (gallery.length === 0 && selectedColour) {
      const colMedia = (prod.images || []).filter((img: any) => {
        if (
          img.optionValueName &&
          img.optionValueName.toLowerCase() === selectedColour.toLowerCase()
        ) {
          return true;
        }
        return false;
      });
      if (colMedia.length > 0) {
        const general = (prod.images || []).filter(
          (img: any) => !img.variantId && !img.optionValueId && !img.optionValueName
        );
        gallery = [...colMedia, ...general];
      }
    }

    // Priority 3: General / default product media
    if (gallery.length === 0) {
      const general = (prod.images || []).filter(
        (img: any) => !img.variantId && !img.optionValueId && !img.optionValueName
      );
      if (general.length > 0) {
        gallery = general;
      }
    }

    // Priority 4: First available product images
    if (gallery.length === 0) {
      gallery = prod.images || [];
    }

    if (gallery.length === 0) {
      gallery = [
        {
          id: 'fallback-placeholder',
          url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
        },
      ];
    }

    return gallery;
  };

  const resolveVariantAndGallery = (
    prod: any,
    opts: Record<string, string>,
    explicitVariant?: any
  ) => {
    if (!prod.variants || prod.variants.length === 0) return;

    const matched =
      explicitVariant ||
      findVariantForOptions(prod.variants, opts) ||
      prod.variants[0];

    setActiveVariant(matched);

    const newGallery = resolveGalleryForSelection(prod, opts, matched);
    setActiveGallery(newGallery);
    setSelectedMediaId(newGallery[0]?.id || null);
  };

  const handleOptionChange = (optionName: string, value: string) => {
    if (!product) return;
    const isColour =
      optionName.toLowerCase() === 'colour' || optionName.toLowerCase() === 'color';
    const sizeOptName = getSizeOptionName(product.options);

    let nextOpts = { ...selectedOptions, [optionName]: value };

    // If Colour changed, verify if current size is available in new colour
    if (isColour && sizeOptName) {
      const targetVariant = findVariantForOptions(product.variants, nextOpts);

      if (!isVariantAvailable(targetVariant)) {
        // Find all available variants for this new colour
        const colourOptName = optionName;
        const availableVariantsForColour = product.variants.filter((v: any) => {
          return (
            v.optionValues?.[colourOptName]?.toLowerCase() === value.toLowerCase() &&
            isVariantAvailable(v)
          );
        });

        if (availableVariantsForColour.length > 0) {
          const newSize = availableVariantsForColour[0].optionValues?.[sizeOptName];
          if (newSize) {
            nextOpts[sizeOptName] = newSize;
          }
        }
      }
    }

    setSelectedOptions(nextOpts);

    const matched =
      findVariantForOptions(product.variants, nextOpts) || product.variants[0];
    setActiveVariant(matched);

    const newGallery = resolveGalleryForSelection(product, nextOpts, matched);
    setActiveGallery(newGallery);

    if (isColour) {
      // Switching colour resets selected media to the first image for this colour
      setSelectedMediaId(newGallery[0]?.id || null);
    } else {
      // Switching size retains current image if still in gallery, else resets to first
      if (!newGallery.some((m) => m.id === selectedMediaId)) {
        setSelectedMediaId(newGallery[0]?.id || null);
      }
    }
  };

  useEffect(() => {
    if (!slug || !id) return;
    loadData(String(slug), String(id), preview ? String(preview) : undefined);
  }, [slug, id, preview]);

  const loadData = async (storeSlug: string, productId: string, previewSecret?: string) => {
    setLoading(true);
    try {
      const sRes = await api.stores.getPublicStorefront(storeSlug, previewSecret);
      setStoreData(sRes);
      if (sRes.store && initStoreLocales) {
        initStoreLocales(sRes.store.storefrontDefaultLocale, sRes.store.enabledStorefrontLocales);
      }
      if (sRes.store?.id) {
        setStoreId(sRes.store.id);
      }

      let found = (sRes.products || []).find(
        (p: any) => p.id === productId || p.slug === productId
      );

      if (!found) found = (await api.stores.getPublicProduct(storeSlug, productId, previewSecret)).product;

      // Format options with id, name, and values
      const formattedOptions = (found.options || []).map((opt: any) => ({
        id: opt.id,
        name: opt.name,
        values: (opt.values || []).map((v: any) =>
          typeof v === 'string' ? { id: v, value: v } : { id: v.id, value: v.value, colorHex: v.colorHex }
        ),
      }));

      // Format variants and map optionValues to key-value pairs
      const formattedVariants = (found.variants || []).map((v: any) => {
        const optionMap: Record<string, string> = {};
        if (v.optionValues && Array.isArray(v.optionValues)) {
          v.optionValues.forEach((ov: any) => {
            const optName = ov.optionValue?.option?.name || ov.optionName;
            const optVal = ov.optionValue?.value || ov.value;
            if (optName && optVal) {
              optionMap[optName] = optVal;
            }
          });
        }
        return {
          ...v,
          optionValues: optionMap,
        };
      });

      // Map optionValueId to value name for media resolution
      const optValIdToName = new Map<string, string>();
      for (const opt of formattedOptions) {
        for (const val of opt.values) {
          if (val.id && val.value) {
            optValIdToName.set(val.id, val.value);
          }
        }
      }

      // Format images with optionValue association
      const formattedImages = (found.media || []).map((m: any, idx: number) => {
        const optValName =
          m.optionValue?.value ||
          (m.optionValueId ? optValIdToName.get(m.optionValueId) : undefined);
        return {
          id: m.id || m.mediaAssetId || String(idx),
          mediaAssetId: m.mediaAssetId,
          url:
            m.publicUrl ||
            (m.storageKey ? `/media/file/${m.storageKey}` : undefined) ||
            m.url,
          variantId: m.variantId,
          optionValueId: m.optionValueId,
          optionValueName: optValName,
          sortOrder: m.sortOrder ?? idx,
          isPrimary: idx === 0,
        };
      });

      const fullProd = {
        ...found,
        title: found.name || found.title || 'Product',
        name: found.name || found.title || 'Product',
        options: formattedOptions,
        variants: formattedVariants,
        images: formattedImages,
      };

      setProduct(fullProd);

      // Select deterministic first available variant (Part 28)
      if (fullProd.options && fullProd.options.length > 0) {
        const firstAvail =
          fullProd.variants.find((v: any) => isVariantAvailable(v)) ||
          fullProd.variants[0];

        let initialOpts: Record<string, string> = {};
        if (firstAvail?.optionValues && Object.keys(firstAvail.optionValues).length > 0) {
          initialOpts = { ...firstAvail.optionValues };
        } else {
          fullProd.options.forEach((opt: any) => {
            if (opt.values && opt.values.length > 0) {
              const vObj = opt.values[0];
              initialOpts[opt.name] = typeof vObj === 'string' ? vObj : vObj.value;
            }
          });
        }
        setSelectedOptions(initialOpts);
        resolveVariantAndGallery(fullProd, initialOpts, firstAvail);
      } else {
        const defaultImages =
          fullProd.images.length > 0
            ? fullProd.images
            : [
                {
                  id: 'fallback-placeholder',
                  url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
                },
              ];
        setActiveGallery(defaultImages);
        setSelectedMediaId(defaultImages[0].id);
        if (fullProd.variants && fullProd.variants.length > 0) {
          setActiveVariant(fullProd.variants[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load product details', err);
    } finally {
      setLoading(false);
    }
  };

  const isEmbedded = router.query.embedded === 'true';
  const isPreviewMode = Boolean(
    storeData?.isPreview ||
    preview === 'true' ||
    (typeof window !== 'undefined' && sessionStorage.getItem('simply_merchant_preview') === 'true')
  );

  const getLink = (path: string) => {
    const params = new URLSearchParams();
    if (isPreviewMode) params.set('preview', 'true');
    if (isEmbedded) params.set('embedded', 'true');
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };

  const handleAddToCart = async () => {
    const variant = activeVariant || product.variants?.[0];
    if (!variant?.id || variant.id.startsWith('var_')) {
      toast.warning('Variant Unavailable', 'Please select an available product variant/size.');
      return;
    }

    setAddingToCart(true);
    try {
      const currentMain = activeGallery.find((m) => m.id === selectedMediaId) || activeGallery[0];
      const primaryImg = currentMain?.url || product.images?.[0]?.url;
      await addItem(variant.id, quantity, {
        productId: product.id,
        productName: product.title || product.name || 'Product',
        variantName: variant.title || variant.name || 'Standard',
        pricePaise: variant.pricePaise || product.basePricePaise || 0,
        compareAtPricePaise: variant.compareAtPricePaise || product.compareAtPricePaise,
        imageUrl: primaryImg,
        sku: variant.sku || '',
      });
      setCartSuccess(true);
      toast.cartAdded(t('cartToast.added'));
      setTimeout(() => setCartSuccess(false), 2500);
    } catch (err: any) {
      toast.error('Could Not Add Item', err.message || 'Failed to add item to cart');
    } finally {
      setAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    const variant = activeVariant || product.variants?.[0];
    if (!variant?.id || variant.id.startsWith('var_')) {
      toast.warning('Variant Unavailable', 'Please select an available product variant/size.');
      return;
    }

    try {
      if (isOutOfStock || variant.status !== 'ACTIVE') return;
      const token = beginDirectCheckout({ storeId: storeData.store.id, productId: product.id, variantId: variant.id, quantity });
      const checkoutUrl = getLink(`/store/${slug}/checkout`);
      router.push(`${checkoutUrl}${checkoutUrl.includes('?') ? '&' : '?'}direct=${token}`);
    } catch (err: any) {
      toast.error('Checkout Error', err.message || 'Failed to initiate checkout');
    }
  };

  const handleSubmitEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !enquiryPhone) return;

    setSubmittingEnquiry(true);
    try {
      await api.enquiries.create({
        storeId: storeData.store.id,
        productId: product.id,
        customerName: enquiryName || 'Prospective Buyer',
        customerPhone: enquiryPhone,
        quantity: enquiryQty,
        message: enquiryMsg || `Inquiry for ${product.title} (${activeVariant?.title || 'Default'})`,
      });
      setEnquirySuccess(true);
      toast.success('Inquiry Submitted', 'The store merchant will get back to you soon.');
    } catch (err: any) {
      toast.error('Inquiry Failed', err.message || 'Failed to submit enquiry');
    } finally {
      setSubmittingEnquiry(false);
    }
  };

  if (loading || !storeData || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--store-surface)] store-surface">
        <div className="w-8 h-8 border-4 border-[var(--store-border)] border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  const { store, themeConfig } = storeData;
  const isEnquiryOnly = product.mode === 'ENQUIRY_ONLY' || product.productType === 'ENQUIRY_ONLY';
  const isSellAndEnquiry = product.mode === 'SELL_AND_ENQUIRY' || product.productType === 'SELL_AND_ENQUIRY';
  const allowsEnquiry = isEnquiryOnly || isSellAndEnquiry;

  const rawMerchantPhone = store?.whatsappNumber || store?.supportPhone || store?.contactPhone;
  const normalizedMerchantPhone = normalizeIndianPhone(rawMerchantPhone);
  const hasValidPhone = Boolean(normalizedMerchantPhone && normalizedMerchantPhone.length >= 10);

  const currentPricePaise = activeVariant?.pricePaise || product.basePricePaise;
  const comparePricePaise = activeVariant?.compareAtPricePaise || product.compareAtPricePaise;
  const stockQuantity = activeVariant?.inventory?.availableQuantity ?? 10;
  const isOutOfStock = stockQuantity <= 0;
  const isLowStock = stockQuantity > 0 && stockQuantity < 5;

  const trans = getProductTranslation(product.translations, locale);
  const displayTitle = trans?.name?.trim() || product.title || product.name || 'Product';
  const displayDescription = trans?.description?.trim() || product.description || '';

  const buildWhatsAppEnquiryUrl = () => {
    if (!hasValidPhone) return null;

    const variantDetails: string[] = [];
    if (selectedOptions && Object.keys(selectedOptions).length > 0) {
      Object.entries(selectedOptions).forEach(([k, v]) => {
        variantDetails.push(`${k}: ${v}`);
      });
    } else if (activeVariant?.title && activeVariant.title !== 'Default' && activeVariant.title !== 'Standard') {
      variantDetails.push(activeVariant.title);
    }

    const priceText = formatPaise(currentPricePaise);

    const greeting = `${t('storefront.enquiryGreeting')} ${store?.name || ''},`.trim();
    const interested = t('storefront.enquiryInterested');
    const priceLine = `${t('storefront.enquiryPrice')}: ${priceText}`;
    const prompt = t('storefront.enquiryPrompt');
    const sentVia = t('storefront.enquirySentVia');

    const lines = [
      greeting,
      '',
      interested,
      '',
      displayTitle,
      ...(variantDetails.length > 0 ? [variantDetails.join('\n')] : []),
      ...(!isEnquiryOnly ? [priceLine] : []),
      '',
      '',
      prompt,
      '',
      sentVia,
    ];

    return `https://wa.me/${normalizedMerchantPhone}?text=${encodeURIComponent(lines.join('\n'))}`;
  };

  const handleWhatsAppEnquiry = () => {
    const url = buildWhatsAppEnquiryUrl();
    if (url) {
      if (store?.id) {
        logWhatsappEnquiry({
          storeId: store.id,
          productId: product.id,
          customerName: 'WhatsApp Buyer',
          customerPhone: normalizedMerchantPhone || undefined,
          message: `WhatsApp enquiry for ${displayTitle}${activeVariant ? ` (${activeVariant.title || activeVariant.sku})` : ''}`,
        });
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (!hasValidPhone && isPreviewMode) {
      toast.warning('WhatsApp Missing', t('storefront.whatsappMissingWarning'));
    }
  };

  return (
    <ThemeWrapper themeConfig={themeConfig} branding={themeConfig?.branding}>
      <Head>
        <title>{displayTitle} | {store.name}</title>
        <meta name="description" content={displayDescription || `Buy ${displayTitle} from ${store.name}`} />
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Breadcrumb */}
        <div data-testid="product-breadcrumb" className="flex items-center gap-2 text-xs text-[var(--store-text-secondary)]">
          <Link href={getLink(getPublicStoreUrl(String(slug)))} className="hover:text-[var(--store-text-primary)]">
            {t('storefront.home')}
          </Link>
          <span>/</span>
          <Link href={getLink(`/store/${slug}/search`)} className="hover:text-[var(--store-text-primary)]">
            {t('storefront.products')}
          </Link>
          <span>/</span>
          <span className="font-semibold text-[var(--store-text-primary)] line-clamp-1">{displayTitle}</span>
        </div>

        {/* Product Hero Split (Gallery Left / Commercials Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          {/* LEFT: Dynamic Image Gallery */}
          <div className="lg:col-span-5 xl:col-span-5 space-y-3 lg:sticky lg:top-24">
            {/* Primary Main Viewport */}
            <div className="aspect-square max-h-[460px] w-full bg-[var(--store-surface)] store-surface rounded-2xl overflow-hidden border border-[var(--store-border)] shadow-xs relative group flex items-center justify-center p-4 sm:p-6">
              <SafeImage
                data-testid="product-main-image"
                src={
                  (activeGallery.find((m) => m.id === selectedMediaId) || activeGallery[0])?.url ||
                  product.images?.[0]?.url ||
                  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80'
                }
                alt={product.title}
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                fallbackTitle={product.title}
              />
              {comparePricePaise && !isEnquiryOnly && (
                <span
                  className="absolute top-3.5 left-3.5 text-white text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs"
                  style={{ backgroundColor: 'var(--theme-accent, #D97706)', color: 'var(--theme-on-accent)' }}
                >
                  Save {Math.round(((comparePricePaise - currentPricePaise) / comparePricePaise) * 100)}%
                </span>
              )}
            </div>

            {/* Thumbnail Navigation Row */}
            {activeGallery.length > 1 && (
              <div className="flex gap-2.5 overflow-x-auto pb-1">
                {activeGallery.map((m: any, idx: number) => {
                  const isSelected = m.id === (selectedMediaId || activeGallery[0]?.id);
                  return (
                    <button
                      key={m.id || idx}
                      type="button"
                      onClick={() => setSelectedMediaId(m.id)}
                      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 flex-shrink-0 transition bg-[var(--store-surface)] store-surface p-1.5 flex items-center justify-center cursor-pointer ${
                        isSelected
                          ? 'border-gray-900 ring-2 ring-gray-900/15 shadow-xs'
                          : 'border-[var(--store-border)] hover:border-[var(--store-border)] opacity-70 hover:opacity-100'
                      }`}
                    >
                      <SafeImage src={m.url} alt="thumbnail" className="w-full h-full object-contain" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT: Product Details, Variant Selectors, Pricing & CTA */}
          <div className="lg:col-span-7 xl:col-span-7 space-y-6">
            {/* Title & Category */}
            <div>
              {product.category?.name && (
                <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full mb-2">
                  {product.category.name}
                </span>
              )}
              <h1 data-testid="product-title" className="text-2xl sm:text-3xl lg:text-4xl font-bold font-theme-heading text-[var(--store-text-primary)] tracking-tight leading-tight">
                {displayTitle}
              </h1>
            </div>

            {/* Price Display */}
            {!isEnquiryOnly && (
              <div className="flex items-baseline gap-3">
                <span data-testid="product-price" className="text-3xl font-black text-[var(--store-text-primary)] font-mono">
                  {formatPaise(currentPricePaise)}
                </span>
                {comparePricePaise && (
                  <span className="text-base text-[var(--store-text-secondary)] font-mono line-through">
                    {formatPaise(comparePricePaise)}
                  </span>
                )}
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold">
                  {t('storefront.inclusiveOfTaxes')}
                </span>
              </div>
            )}

            {/* Stock Availability Indicator */}
            {!isEnquiryOnly && (
              <div>
                {isOutOfStock ? (
                  <span data-store-stock className="text-xs font-bold text-red-800 bg-red-50 rounded px-2 py-1 flex items-center gap-1.5">
                    <X className="w-4 h-4" /> {t('storefront.outOfStock')}
                  </span>
                ) : isLowStock ? (
                  <span data-store-stock className="text-xs font-bold text-amber-800 bg-amber-50 rounded px-2 py-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> {t('storefront.lowStock', { count: stockQuantity })}
                  </span>
                ) : (
                  <span data-store-stock className="text-xs font-bold text-emerald-800 bg-emerald-50 rounded px-2 py-1 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> {t('storefront.readyForDispatch')}
                  </span>
                )}
              </div>
            )}

            {/* DYNAMIC OPTION SELECTORS (Colour, Size, Material, Custom) */}
            {product.options && product.options.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-[var(--store-border)]">
                {product.options.map((opt: any) => {
                  const isColourOption =
                    opt.name.toLowerCase() === 'colour' || opt.name.toLowerCase() === 'color';
                  const isSizeOption = opt.name.toLowerCase() === 'size';
                  const selectedVal = selectedOptions[opt.name];

                  const isSizeAvailableForColour = (sizeVal: string) => {
                    const colourOptName = getColourOptionName(product.options);
                    const testOpts = { ...selectedOptions };
                    if (colourOptName) {
                      testOpts[colourOptName] = selectedOptions[colourOptName];
                    }
                    testOpts[opt.name] = sizeVal;
                    const v = findVariantForOptions(product.variants, testOpts);
                    return isVariantAvailable(v);
                  };

                  return (
                    <div key={opt.name} className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-[var(--store-text-primary)] uppercase tracking-wide">
                          {isColourOption ? t('storefront.selectColour') : isSizeOption ? t('storefront.selectSize') : `Select ${opt.name}`}
                        </span>
                        <span className="font-semibold text-[var(--store-text-secondary)]">{selectedVal}</span>
                      </div>

                      {/* Colour Image Swatches */}
                      {isColourOption ? (
                        <div className="flex flex-wrap gap-2.5">
                          {opt.values.map((vObj: any) => {
                            const val = typeof vObj === 'string' ? vObj : vObj.value;
                            const isSelected = selectedVal === val;

                            // Find swatch image for this colour
                            const swatchImg = product.images?.find(
                              (img: any) =>
                                img.optionValueName &&
                                img.optionValueName.toLowerCase() === val.toLowerCase()
                            )?.url;

                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => handleOptionChange(opt.name, val)}
                                className={`group relative flex items-center gap-2 p-1.5 pr-3 rounded-xl border-2 transition cursor-pointer ${
                                  isSelected
                                    ? 'border-gray-900 bg-[var(--store-surface)] store-surface shadow-xs ring-1 ring-gray-900'
                                    : 'border-[var(--store-border)] bg-[var(--store-surface)] store-surface hover:border-gray-400'
                                }`}
                              >
                                {swatchImg ? (
                                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-[var(--store-surface)] store-surface flex-shrink-0 border border-[var(--store-border)]">
                                    <SafeImage
                                      src={swatchImg}
                                      alt={val}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div
                                    className="w-6 h-6 rounded-full border border-[var(--store-border)] flex-shrink-0"
                                    style={{
                                      backgroundColor:
                                        val.toLowerCase() === 'white'
                                          ? '#ffffff'
                                          : val.toLowerCase() === 'black'
                                          ? '#000000'
                                          : '#e5e7eb',
                                    }}
                                  />
                                )}
                                <span className="text-xs font-bold text-[var(--store-text-primary)]">{val}</span>
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-[var(--store-text-primary)] ml-1" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : isSizeOption ? (
                        /* Size options with computed availability */
                        <div className="flex flex-wrap gap-2">
                          {opt.values.map((vObj: any) => {
                            const val = typeof vObj === 'string' ? vObj : vObj.value;
                            const isSelected = selectedVal === val;
                            const available = isSizeAvailableForColour(val);

                            return (
                              <button
                                key={val}
                                type="button"
                                disabled={!available}
                                aria-disabled={!available}
                                onClick={() => available && handleOptionChange(opt.name, val)}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition ${
                                  isSelected
                                    ? 'border-gray-900 bg-[var(--store-button-bg)] store-inverse text-white shadow-sm cursor-pointer'
                                    : !available
                                    ? 'border-[var(--store-border)] bg-[var(--store-surface)] store-surface text-[var(--store-text-secondary)] cursor-not-allowed opacity-50 line-through'
                                    : 'border-[var(--store-border)] bg-[var(--store-surface)] store-surface text-[var(--store-text-primary)] hover:border-gray-400 cursor-pointer'
                                }`}
                              >
                                {val}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        /* Other options (Material, Style, etc.) */
                        <div className="flex flex-wrap gap-2">
                          {opt.values.map((vObj: any) => {
                            const val = typeof vObj === 'string' ? vObj : vObj.value;
                            const isSelected = selectedVal === val;

                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => handleOptionChange(opt.name, val)}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                                  isSelected
                                    ? 'border-gray-900 bg-[var(--store-button-bg)] store-inverse text-white shadow-sm'
                                    : 'border-[var(--store-border)] bg-[var(--store-surface)] store-surface text-[var(--store-text-primary)] hover:border-gray-400'
                                }`}
                              >
                                {val}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quantity Selector (for ecommerce products) */}
            {!isEnquiryOnly && !isOutOfStock && (
              <div className="flex items-center gap-4 pt-2">
                <span data-testid="product-quantity" className="text-xs font-bold text-[var(--store-text-primary)] uppercase">{t('storefront.quantity')}</span>
                <div className="flex items-center border border-[var(--store-border)] rounded-xl bg-[var(--store-surface)] store-surface overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-2 text-[var(--store-text-secondary)] hover:bg-[var(--store-surface)] store-surface transition"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-4 py-1.5 text-xs font-bold font-mono text-[var(--store-text-primary)]">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="p-2 text-[var(--store-text-secondary)] hover:bg-[var(--store-surface)] store-surface transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Call to Actions */}
            <div className="space-y-3 pt-2">
              {/* SELL_ONLINE or SELL_AND_ENQUIRY: Add to Cart & Buy Now */}
              {!isEnquiryOnly && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      data-testid="add-to-cart-button"
                      type="button"
                      disabled={addingToCart || isOutOfStock}
                      onClick={handleAddToCart}
                      data-theme-btn="true"
                      className="w-full py-3.5 px-4 bg-[var(--store-surface)] store-surface hover:bg-[var(--store-surface)] store-surface text-[var(--store-text-primary)] font-bold rounded-xl text-xs shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      {cartSuccess ? t('storefront.addedToCart') : addingToCart ? t('storefront.adding') : t('storefront.addToCart')}
                    </button>

                    <button data-theme-tone="primary"
                      type="button"
                      disabled={isOutOfStock}
                      data-testid="buy-now-button"
                      onClick={handleBuyNow}
                      data-theme-btn="true"
                      className="w-full py-3.5 px-4 text-white font-bold rounded-xl text-xs shadow-md transition hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ backgroundColor: 'var(--theme-primary, #111827)', color: 'var(--theme-on-primary)' }}
                    >
                      {t('storefront.buyNow')}
                    </button>
                  </div>
                </div>
              )}

              {/* ENQUIRY_ONLY or SELL_AND_ENQUIRY: WhatsApp Enquiry */}
              {allowsEnquiry && (
                <div className="space-y-2">
                  {hasValidPhone ? (
                    <button
                      type="button"
                      onClick={handleWhatsAppEnquiry}
                      data-theme-btn="true"
                      className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4" />
                      {t('storefront.enquiryButton')}
                    </button>
                  ) : isPreviewMode ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>{t('storefront.whatsappMissingWarning')}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Merchant Guarantee & Logistics Trust */}
            <div className="p-4 bg-[var(--store-surface)] store-surface rounded-2xl border border-[var(--store-border)] space-y-2.5 text-xs text-[var(--store-text-secondary)]">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Pan-India Delivery via Shiprocket couriers</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span>100% Secure Razorpay checkout & Cash on Delivery</span>
              </div>
            </div>

            {/* Description Tab */}
            {displayDescription && (
              <div className="space-y-2 pt-4 border-t border-[var(--store-border)]">
                <h3 className="text-xs font-bold text-[var(--store-text-primary)] uppercase tracking-wider">
                  {t('storefront.description')}
                </h3>
                <div className="text-xs text-[var(--store-text-secondary)] leading-relaxed whitespace-pre-line">
                  {displayDescription}
                </div>
              </div>
            )}

            {/* Technical Specification Table for B2B/Foundry or Industrial items */}
            {(themeConfig?.themeId === 'foundry' || isEnquiryOnly) && (
              <div className="space-y-3 pt-4 border-t border-[var(--store-border)] font-mono">
                <h3 className="text-xs font-bold text-[var(--store-text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-sky-500 rounded-sm" />
                  Technical Datasheet & Compliance
                </h3>
                <div className="bg-[var(--store-surface)] store-surface border border-[var(--store-border)] rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="p-2.5 font-semibold text-[var(--store-text-secondary)] w-1/3">Part ID / SKU</td>
                        <td className="p-2.5 text-[var(--store-text-primary)] font-bold">PRD-{product.id.slice(0, 8).toUpperCase()}</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-semibold text-[var(--store-text-secondary)]">Material Grade</td>
                        <td className="p-2.5 text-[var(--store-text-primary)]">AISI 316 / Industrial Standard</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-semibold text-[var(--store-text-secondary)]">Standard MOQ</td>
                        <td className="p-2.5 text-[var(--store-text-primary)] font-bold">25 Units</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-semibold text-[var(--store-text-secondary)]">Dispatch Window</td>
                        <td className="p-2.5 text-[var(--store-text-primary)]">3-5 Business Days</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-semibold text-[var(--store-text-secondary)]">Quality Cert</td>
                        <td className="p-2.5 text-[var(--store-text-primary)] font-semibold">MTC Provided with Invoicing</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Customer Reviews Section (Requirements 31, 32, 33, 64) */}
        <ProductReviewsSection
          slug={String(slug)}
          productId={product.id}
          productName={product.name || product.title}
        />
      </main>

      {/* MODAL: Request Quotation / Product Enquiry */}
      {enquiryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-[var(--store-surface)] store-surface rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-[var(--store-border)] pb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--store-text-primary)]">Request Commercial Quotation</h3>
                <p className="text-xs text-[var(--store-text-secondary)]">Direct enquiry to {store.name}</p>
              </div>
              <button
                onClick={() => {
                  setEnquiryModalOpen(false);
                  setEnquirySuccess(false);
                }}
                className="text-[var(--store-text-secondary)] hover:text-[var(--store-text-secondary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {enquirySuccess ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-[var(--store-text-primary)]">Enquiry Received!</h4>
                <p className="text-xs text-[var(--store-text-secondary)]">
                  The merchant has received your quotation request and will contact you via WhatsApp / Phone shortly.
                </p>
                <button
                  onClick={() => {
                    setEnquiryModalOpen(false);
                    setEnquirySuccess(false);
                  }}
                  data-theme-btn="true"
                  className="px-4 py-2 bg-[var(--store-button-bg)] store-inverse text-white rounded-lg text-xs font-semibold"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitEnquiry} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--store-text-primary)] mb-1">Your Name *</label>
                  <input
                    type="text"
                    required
                    value={enquiryName}
                    onChange={(e) => setEnquiryName(e.target.value)}
                    placeholder="e.g. Ramesh Patel"
                    className="w-full px-3 py-2 border border-[var(--store-border)] rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--store-text-primary)] mb-1">
                    Mobile Number (for WhatsApp quote) *
                  </label>
                  <input
                    type="tel"
                    required
                    value={enquiryPhone}
                    onChange={(e) => setEnquiryPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-3 py-2 border border-[var(--store-border)] rounded-lg text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--store-text-primary)] mb-1">
                    Estimated Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={enquiryQty}
                    onChange={(e) => setEnquiryQty(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[var(--store-border)] rounded-lg text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--store-text-primary)] mb-1">
                    Customization / Inquiries
                  </label>
                  <textarea
                    rows={3}
                    value={enquiryMsg}
                    onChange={(e) => setEnquiryMsg(e.target.value)}
                    placeholder="Dimensions, required delivery timeline, special packaging requirements..."
                    className="w-full px-3 py-2 border border-[var(--store-border)] rounded-lg text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[var(--store-border)]">
                  <button
                    type="button"
                    onClick={() => setEnquiryModalOpen(false)}
                    className="px-4 py-2 border border-[var(--store-border)] text-xs font-medium rounded-lg text-[var(--store-text-primary)] hover:bg-[var(--store-surface)] store-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingEnquiry}
                    data-theme-btn="true"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-xs font-semibold rounded-lg text-white flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {submittingEnquiry ? 'Sending...' : 'Send Enquiry'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Mobile Sticky Bottom CTA Bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--store-surface)] store-surface backdrop-blur-md border-t border-[var(--store-border)] p-3 shadow-2xl flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] text-[var(--store-text-secondary)] font-mono line-clamp-1">
            {activeVariant?.title || 'Selected'}
          </div>
          <div className="text-base font-black text-[var(--store-text-primary)] font-mono">
            {formatPaise(currentPricePaise)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEnquiryOnly ? (
            <>
              <button
                type="button"
                disabled={addingToCart || isOutOfStock}
                onClick={handleAddToCart}
                className="px-3 py-2.5 bg-[var(--store-surface)] store-surface hover:bg-[var(--store-surface)] store-surface text-[var(--store-text-primary)] font-bold text-xs rounded-xl transition"
                aria-label={t('storefront.addToCart')}
              >
                {cartSuccess ? '✓' : addingToCart ? '...' : <ShoppingBag className="w-4 h-4" />}
              </button>
              <button data-theme-tone="primary"
                type="button"
                disabled={isOutOfStock}
                data-testid="buy-now-button"
                      onClick={handleBuyNow}
                data-theme-btn="true"
                className="px-4 py-2.5 text-white font-bold text-xs rounded-xl shadow-md transition"
                style={{ backgroundColor: 'var(--theme-primary, #111827)', color: 'var(--theme-on-primary)' }}
              >
                {t('storefront.buyNow')}
              </button>
              {allowsEnquiry && hasValidPhone && (
                <button
                  type="button"
                  onClick={handleWhatsAppEnquiry}
                  className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center"
                  aria-label={t('storefront.enquiryButton')}
                  title={t('storefront.enquiryButton')}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            hasValidPhone && (
              <button
                type="button"
                onClick={handleWhatsAppEnquiry}
                data-theme-btn="true"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4" />
                {t('storefront.enquiryButton')}
              </button>
            )
          )}
        </div>
      </div>

      <StoreFooter store={store} themeConfig={themeConfig} />
    </ThemeWrapper>
  );
}
