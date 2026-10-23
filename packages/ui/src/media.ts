/**
 * Shared Canonical Media URL Resolver
 *
 * Environment-safe method for resolving MediaAsset / image URLs:
 * - Absolute URLs (https://, http://, //): returned unchanged.
 * - Data & Blob URLs (data:, blob:): returned unchanged.
 * - Relative media paths (/media/..., media/...): prepends configured origin
 *   (NEXT_PUBLIC_MEDIA_URL, NEXT_PUBLIC_API_URL, or local dev fallback http://localhost:4000).
 * - Empty / null / undefined / whitespace: returns empty string (triggers UI fallback).
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  // Resolve configured media/API origin
  let configuredOrigin = '';
  if (typeof process !== 'undefined' && process.env) {
    configuredOrigin =
      process.env.NEXT_PUBLIC_MEDIA_URL ||
      process.env.STORAGE_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.MEDIA_PUBLIC_URL_PREFIX ||
      '';
  }

  // If URL has localhost or 127.0.0.1 and configuredOrigin is set and not localhost, rebase to production origin
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/(.*)$/i.test(trimmed)) {
    if (configuredOrigin && !/localhost|127\.0\.0\.1/i.test(configuredOrigin)) {
      const path = trimmed.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?/i, '');
      const cleanOrigin = configuredOrigin.replace(/\/+$/, '');
      return `${cleanOrigin}/${path}`;
    }
  }

  // 1. If already an absolute URL with scheme (http:// or https://) or protocol-relative (//)
  if (/^(?:https?:)?\/\//i.test(trimmed)) {
    return trimmed;
  }

  // 2. If data URI (e.g. inline base64 preview) or blob URI (e.g. FileReader object URL)
  if (/^(?:data|blob):/i.test(trimmed)) {
    return trimmed;
  }

  // Strip machine-specific Windows/local drive letters
  let cleanPath = trimmed;
  if (/^(?:file:\/\/\/?)?[a-zA-Z]:[\\/]/i.test(trimmed)) {
    const fsNormalized = trimmed.replace(/^(?:file:\/\/\/?)?[a-zA-Z]:[\\/]/i, '').replace(/\\/g, '/');
    const mediaRelMatch = fsNormalized.match(/(?:media-storage|media\/file|media)\/(.+)$/);
    cleanPath = mediaRelMatch ? `media/file/${mediaRelMatch[1]}` : fsNormalized;
  }

  if (!configuredOrigin) {
    configuredOrigin = 'http://localhost:4000';
  }

  const cleanOrigin = configuredOrigin.replace(/\/+$/, '');
  cleanPath = cleanPath.replace(/^\/+/, '');

  return `${cleanOrigin}/${cleanPath}`;
}

export interface ResolveVariantDisplayMediaParams {
  productMedia?: any[];
  variant?: any;
  selectedOptionValues?: Record<string, string>;
  itemImageUrl?: string | null;
  fallbackUrl?: string;
}

/**
 * Deterministic Variant Display Media Resolver
 *
 * Implements the canonical media priority for Cart, Checkout, Merchant Orders, Invoices, and Tracking:
 * 0. Preserved itemImageUrl snapshot (if already saved on OrderItem)
 * 1. Exact variant-specific media (explicitly associated with variant.id)
 * 2. Media associated with selected colour / visual option value (e.g. "Black" or "White")
 * 3. General product media (not bound to a specific variant or option)
 * 4. First available product media
 * 5. Deterministic fallback placeholder
 */
export function resolveVariantDisplayMedia(params: ResolveVariantDisplayMediaParams): string {
  const {
    productMedia: rawProductMedia,
    variant,
    selectedOptionValues,
    itemImageUrl,
    fallbackUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
  } = params;

  // 0. Use historical snapshot if present
  if (itemImageUrl && typeof itemImageUrl === 'string' && itemImageUrl.trim()) {
    return resolveMediaUrl(itemImageUrl);
  }

  const productMedia = Array.isArray(rawProductMedia)
    ? rawProductMedia
    : Array.isArray(variant?.product?.media)
    ? variant.product.media
    : Array.isArray(variant?.product?.images)
    ? variant.product.images
    : [];

  // 1. Priority 1: Exact variant-specific media
  if (variant?.id) {
    if (Array.isArray(variant.media) && variant.media.length > 0) {
      const vMedia = variant.media[0];
      const url = vMedia.publicUrl || vMedia.url || vMedia.filePath;
      if (url) return resolveMediaUrl(url);
    }
    const matchingVarMedia = productMedia.find(
      (m: any) => m && (m.variantId === variant.id || m.variant?.id === variant.id)
    );
    if (matchingVarMedia) {
      const url = matchingVarMedia.publicUrl || matchingVarMedia.url || matchingVarMedia.filePath;
      if (url) return resolveMediaUrl(url);
    }
  }

  // Extract selected colour value and option value ID
  let colourValue: string | null = null;
  let colourOptionValueId: string | null = null;

  if (selectedOptionValues && typeof selectedOptionValues === 'object') {
    for (const [k, v] of Object.entries(selectedOptionValues)) {
      if (k.toLowerCase() === 'colour' || k.toLowerCase() === 'color') {
        colourValue = String(v);
        break;
      }
    }
  }

  if (!colourValue && variant?.optionValues) {
    if (Array.isArray(variant.optionValues)) {
      for (const ov of variant.optionValues) {
        const optName = ov.optionValue?.option?.name || ov.optionName || ov.name;
        const optVal = ov.optionValue?.value || ov.value;
        const valId = ov.optionValueId || ov.optionValue?.id || ov.id;
        if (optName && (optName.toLowerCase() === 'colour' || optName.toLowerCase() === 'color')) {
          colourValue = optVal;
          colourOptionValueId = valId;
          break;
        }
      }
    } else if (typeof variant.optionValues === 'object') {
      for (const [k, v] of Object.entries(variant.optionValues)) {
        if (k.toLowerCase() === 'colour' || k.toLowerCase() === 'color') {
          colourValue = String(v);
          break;
        }
      }
    }
  }

  // Also inspect variantTitle if available (e.g. "Black · M" or "Black / M")
  if (!colourValue && typeof variant?.title === 'string' && variant.title !== 'Default') {
    const parts = variant.title.split(/[\/·•,-]/).map((p: string) => p.trim());
    if (parts.length > 0) {
      // Find matching media by checking if any media option value matches part
      for (const part of parts) {
        const foundMedia = productMedia.find((m: any) => {
          const valName = m.optionValueName || m.optionValue?.value;
          return valName && valName.toLowerCase() === part.toLowerCase();
        });
        if (foundMedia) {
          colourValue = part;
          break;
        }
      }
    }
  }

  // 2. Priority 2: Media associated with selected colour option value
  if (colourOptionValueId || colourValue) {
    const colMatch = productMedia.find((m: any) => {
      if (!m) return false;
      if (colourOptionValueId && m.optionValueId === colourOptionValueId) {
        return true;
      }
      const mValName = m.optionValueName || m.optionValue?.value;
      if (colourValue && mValName && mValName.toLowerCase() === colourValue.toLowerCase()) {
        return true;
      }
      return false;
    });

    if (colMatch) {
      const url = colMatch.publicUrl || colMatch.url || colMatch.filePath;
      if (url) return resolveMediaUrl(url);
    }
  }

  // 3. Priority 3: General product media (not bound to variant or option)
  const generalMedia = productMedia.find(
    (m: any) => m && !m.variantId && !m.optionValueId && !m.optionValueName && !m.optionValue
  );
  if (generalMedia) {
    const url = generalMedia.publicUrl || generalMedia.url || generalMedia.filePath;
    if (url) return resolveMediaUrl(url);
  }

  // 4. Priority 4: First available product media
  if (productMedia.length > 0 && productMedia[0]) {
    const first = productMedia[0];
    const url = first.publicUrl || first.url || first.filePath;
    if (url) return resolveMediaUrl(url);
  }

  // 5. Fallback placeholder
  return fallbackUrl;
}
