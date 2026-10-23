/**
 * Environment-safe URL configuration helpers for Storefront.
 * Resolves Seller Portal origin without hardcoding localhost in production
 * and without routing to suspended or deprecated endpoints.
 */

export function getSellerUrl(): string {
  // 1. Explicit build/runtime environment variable
  const envSeller =
    process.env.NEXT_PUBLIC_SELLER_URL ||
    process.env.SELLER_PUBLIC_URL ||
    process.env.SELLER_URL ||
    process.env.SELLER_DASHBOARD_URL;

  if (envSeller && envSeller.trim() !== '') {
    return envSeller.trim().replace(/\/+$/, '');
  }

  // 2. Client-side dynamic origin resolution based on actual browser location
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname.toLowerCase();

    // Localhost / local development
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.endsWith('.local')
    ) {
      return `http://${host}:3001`;
    }

    // Letz Shop production domain (e.g. letzshop.store, *.letzshop.store)
    if (host === 'letzshop.store' || host.endsWith('.letzshop.store')) {
      return 'https://seller.letzshop.store';
    }

    // Dynamic sibling resolution if deployed on a custom domain with subdomains
    if (host.includes('.')) {
      const parts = host.split('.');
      if (parts.length >= 2) {
        return `${window.location.protocol}//seller.${parts.slice(-2).join('.')}`;
      }
    }
  }

  // 3. Server-side SSR / SSG build fallback:
  // Production HTML must have a valid merchant destination even before hydration.
  return process.env.NODE_ENV === 'production' ? 'https://seller.letzshop.store' : 'http://localhost:3001';
}

export function getSellerStorePreviewUrl(): string {
  const sellerOrigin = getSellerUrl();
  return `${sellerOrigin}/store-preview`;
}

export function getApiUrl(): string {
  const envApi =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.API_URL;
  if (envApi && envApi.trim() !== '') {
    return envApi.trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.endsWith('.local')
    ) {
      return `http://${host}:4000`;
    }
    if (host === 'letzshop.store' || host.endsWith('.letzshop.store')) {
      return 'https://api.letzshop.store';
    }
  }
  return 'http://localhost:4000';
}
