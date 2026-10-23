import { getPublicStoreUrl } from '@simply/types';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { RefreshCw, Smartphone, Monitor, Tablet } from 'lucide-react';
import { useSellerI18n } from '@simply/i18n';
import { getStorefrontUrl } from '../utils/config';

interface MiniStorePreviewProps {
  store: any;
  products?: any[];
  iframeRef?: React.RefObject<HTMLIFrameElement>;
  activePage?: 'home' | 'products' | 'about';
  themeName?: string;
  onPageChange?: (page: 'home' | 'products' | 'about') => void;
}

export const MiniStorePreview: React.FC<MiniStorePreviewProps> = ({
  store,
  iframeRef,
  activePage = 'home',
  themeName,
  onPageChange,
}) => {
  const router = useRouter();
  const { t } = useSellerI18n();
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [localPage, setLocalPage] = useState<'home' | 'products' | 'about'>(activePage);
  const currentPage = onPageChange ? activePage : localPage;
  const internalFrameRef = useRef<HTMLIFrameElement>(null);
  const frameRef = iframeRef || internalFrameRef;
  const [refreshKey, setRefreshKey] = useState(0);

  const slug = store?.slug || 'sk-general-stores';
  const [storefrontUrl, setStorefrontUrl] = useState(getStorefrontUrl());

  useEffect(() => {
    setStorefrontUrl(getStorefrontUrl());
  }, []);

  const previewIframeUrl = `${getPublicStoreUrl(slug, storefrontUrl, { preview: true })}&embedded=true`;
  const pagePath = getPublicStoreUrl(slug, '', { page: currentPage === 'home' ? undefined : currentPage });

  const handlePageSwitch = (page: 'home' | 'products' | 'about') => {
    if (onPageChange) onPageChange(page); else setLocalPage(page);
  };

  const navigateFrame = () => frameRef.current?.contentWindow?.postMessage(
    { type: 'PREVIEW_NAVIGATE', page: currentPage, slug }, new URL(storefrontUrl).origin);
  useEffect(() => { navigateFrame(); }, [currentPage, slug, storefrontUrl]);
  useEffect(() => {
    const changed = (event: MessageEvent) => {
      if (event.origin !== new URL(storefrontUrl).origin || event.source !== frameRef.current?.contentWindow || event.data.slug !== slug) return;
      if (event.data.type === 'PREVIEW_BRIDGE_READY') { navigateFrame(); return; }
      if (event.data.type !== 'PREVIEW_ROUTE_CHANGED') return;
      if (['home', 'products', 'about'].includes(event.data.page)) handlePageSwitch(event.data.page);
    };
    window.addEventListener('message', changed);
    return () => window.removeEventListener('message', changed);
  }, [storefrontUrl, slug, currentPage, onPageChange]);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="w-full h-full flex flex-col rounded-2xl border border-merchant-border overflow-hidden bg-merchant-surface shadow-xl transition-colors duration-150">
      {/* 1. Universal Preview Toolbar (Fixed at top of preview panel) */}
      <div className="bg-merchant-surface-raised px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 border-b border-merchant-border shrink-0 select-none">
        {/* Left: Window Controls & Live Indicator */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center space-x-1.5 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          {themeName ? (
            <span className="hidden xl:inline-flex items-center gap-1.5 text-[11px] font-bold text-merchant-text-muted truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{t('brandStudio.live')}{' '}{themeName}</span>
            </span>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{t('brandStudio.livePreview')}</span>
            </span>
          )}
        </div>

        {/* Center: 3 Page Tabs Switcher (Home, Products, About Us) */}
        <div className="flex items-center bg-merchant-surface p-0.5 rounded-xl border border-merchant-border text-xs shadow-2xs shrink-0">
          <button
            type="button"
            id="preview-nav-home"
            onClick={() => handlePageSwitch('home')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg transition font-medium flex items-center gap-1.5 cursor-pointer text-xs ${
              currentPage === 'home'
                ? 'bg-merchant-primary text-white font-bold shadow-xs'
                : 'text-merchant-text-muted hover:text-merchant-text hover:bg-merchant-surface-muted'
            }`}
          >
            <span>{t('brandStudio.home')}</span>
          </button>
          <button
            type="button"
            id="preview-nav-products"
            onClick={() => handlePageSwitch('products')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg transition font-medium flex items-center gap-1.5 cursor-pointer text-xs ${
              currentPage === 'products'
                ? 'bg-merchant-primary text-white font-bold shadow-xs'
                : 'text-merchant-text-muted hover:text-merchant-text hover:bg-merchant-surface-muted'
            }`}
          >
            <span>{t('brandStudio.products')}</span>
          </button>
          <button
            type="button"
            id="preview-nav-about"
            onClick={() => handlePageSwitch('about')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg transition font-medium flex items-center gap-1.5 cursor-pointer text-xs ${
              currentPage === 'about'
                ? 'bg-merchant-primary text-white font-bold shadow-xs'
                : 'text-merchant-text-muted hover:text-merchant-text hover:bg-merchant-surface-muted'
            }`}
          >
            <span>{t('brandStudio.aboutUs')}</span>
          </button>
        </div>

        {/* Right: Device Modes (Desktop, Tablet, Mobile) & Refresh */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            id="preview-device-desktop"
            onClick={() => setDeviceMode('desktop')}
            className={`p-1.5 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 ${
              deviceMode === 'desktop'
                ? 'bg-merchant-primary text-white font-semibold shadow-xs'
                : 'text-merchant-text-muted hover:text-merchant-text hover:bg-merchant-surface'
            }`}
            title={t('brandStudio.desktopViewFullWidth')}
            aria-label={t('brandStudio.desktopView')}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline text-[11px]">{t('brandStudio.desktop')}</span>
          </button>
          <button
            type="button"
            id="preview-device-tablet"
            onClick={() => setDeviceMode('tablet')}
            className={`p-1.5 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 ${
              deviceMode === 'tablet'
                ? 'bg-merchant-primary text-white font-semibold shadow-xs'
                : 'text-merchant-text-muted hover:text-merchant-text hover:bg-merchant-surface'
            }`}
            title={t('brandStudio.tabletView768px')}
            aria-label={t('brandStudio.tabletView')}
          >
            <Tablet className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline text-[11px]">{t('brandStudio.tablet')}</span>
          </button>
          <button
            type="button"
            id="preview-device-mobile"
            onClick={() => setDeviceMode('mobile')}
            className={`p-1.5 rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 ${
              deviceMode === 'mobile'
                ? 'bg-merchant-primary text-white font-semibold shadow-xs'
                : 'text-merchant-text-muted hover:text-merchant-text hover:bg-merchant-surface'
            }`}
            title={t('brandStudio.mobileView390px')}
            aria-label={t('brandStudio.mobileView')}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline text-[11px]">{t('brandStudio.mobile')}</span>
          </button>
          <button
            type="button"
            id="preview-device-refresh"
            onClick={handleRefresh}
            className="p-1.5 rounded-lg text-merchant-text-muted hover:text-merchant-text hover:bg-merchant-surface transition cursor-pointer ml-0.5"
            title={t('brandStudio.refreshPreview')}
            aria-label={t('brandStudio.refreshPreview')}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Interactive Storefront Viewport (Begins immediately below toolbar) */}
      <div
        className={`flex-1 min-h-0 w-full overflow-hidden transition-colors ${
          deviceMode === 'desktop'
            ? 'bg-white p-0 flex flex-col'
            : 'bg-slate-900/20 dark:bg-slate-950/40 p-2 sm:p-4 flex items-center justify-center'
        }`}
      >
        <div
          className={`transition-all duration-300 flex flex-col ${
            deviceMode === 'desktop'
              ? 'w-full h-full bg-white'
              : deviceMode === 'tablet'
              ? 'w-[768px] max-w-full h-full rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-700/80 dark:border-slate-800 bg-white'
              : 'w-[390px] max-w-full h-full rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-800 dark:border-slate-900 bg-white'
          }`}
        >
          <iframe
            ref={frameRef}
            key={`${slug}_${refreshKey}`}
            src={previewIframeUrl}
            onLoad={navigateFrame}
            className="w-full h-full flex-1 border-0 bg-white"
            title={t('brandStudio.storefrontInteractiveBuyerPreview')}
          />
        </div>
      </div>
    </div>
  );
};
