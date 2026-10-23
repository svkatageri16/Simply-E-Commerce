import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { getPublicStoreUrl } from '@simply/types';
import { getSellerUrl } from '../utils/config';

/** Only the configured merchant origin and the actual parent window may control this preview. */
export function PreviewNavigationBridge() {
  const router = useRouter();
  const initialized = useRef(false);
  useEffect(() => {
    if (!router.isReady || router.query.embedded !== 'true' || router.query.preview !== 'true' || window.parent === window || typeof router.query.slug !== 'string') return;
    const origin = new URL(getSellerUrl()).origin, slug = router.query.slug;
    const current = router.pathname === '/store/[slug]' ? 'home' : router.pathname === '/store/[slug]/products' ? 'products' : router.pathname === '/store/[slug]/about' ? 'about' : null;
    if (!initialized.current) {
      initialized.current = true;
      window.parent.postMessage({ type: 'PREVIEW_BRIDGE_READY', slug }, origin);
    } else if (current) window.parent.postMessage({ type: 'PREVIEW_ROUTE_CHANGED', page: current, slug }, origin);
    const navigate = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== window.parent || event.data?.type !== 'PREVIEW_NAVIGATE' || event.data.slug !== slug || !['home','products','about'].includes(event.data.page) || event.data.page === current) return;
      const url = getPublicStoreUrl(slug, '', { preview: true, page: event.data.page === 'home' ? undefined : event.data.page });
      void router.push(`${url}&embedded=true`);
    };
    window.addEventListener('message', navigate);
    return () => window.removeEventListener('message', navigate);
  }, [router.isReady, router.asPath]);
  return null;
}
