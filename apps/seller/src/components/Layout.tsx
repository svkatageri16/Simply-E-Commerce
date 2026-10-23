import { getPublicStoreUrl } from '@simply/types';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { useSellerI18n, SellerLanguageSelect } from '@simply/i18n';
import {
  LayoutDashboard,
  Eye,
  Package,
  ShoppingBag,
  BarChart3,
  FileSpreadsheet,
  Palette,
  Settings as SettingsIcon,
  LogOut,
  ExternalLink,
  Menu,
  X,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Star,
} from 'lucide-react';
import { ThemeToggle } from './ui/MerchantUi';
import { getStorefrontUrl } from '../utils/config';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children, title, actions }) => {
  const { user, store, logout } = useAuth();
  const { t } = useSellerI18n();
  const router = useRouter();

  // Mobile off-canvas drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  // Tablet collapsed icon rail state (default collapsed on tablet, expandable)
  const [tabletCollapsed, setTabletCollapsed] = useState(true);

  const drawerRef = useRef<HTMLDivElement>(null);

  // Canonical Primary Navigation Items
  const navItems = [
    { label: t('navigation.dashboard'), href: '/', icon: LayoutDashboard },
    { label: t('navigation.storePreview'), href: '/store-preview', icon: Eye },
    { label: t('navigation.inventory'), href: '/products', icon: Package },
    { label: t('navigation.orders'), href: '/orders', icon: ShoppingBag },
    { label: t('navigation.reviews'), href: '/reviews', icon: Star },
    { label: t('navigation.analytics'), href: '/analytics', icon: BarChart3 },
    { label: t('navigation.reports'), href: '/reports', icon: FileSpreadsheet },
    { label: t('navigation.themes'), href: '/brand-studio', icon: Palette },
    { label: t('navigation.settings'), href: '/settings', icon: SettingsIcon },
  ];

  // Helper for active route including nested routes
  const isRouteActive = (itemHref: string) => {
    if (itemHref === '/') return router.pathname === '/';
    if (itemHref === '/products') return router.pathname.startsWith('/products');
    if (itemHref === '/orders') return router.pathname.startsWith('/orders');
    if (itemHref === '/reviews') return router.pathname.startsWith('/reviews');
    if (itemHref === '/reports') return router.pathname.startsWith('/reports');
    if (itemHref === '/brand-studio') {
      return router.pathname.startsWith('/brand-studio') || router.pathname.startsWith('/themes');
    }
    if (itemHref === '/settings') {
      return (
        router.pathname.startsWith('/settings') ||
        router.pathname.startsWith('/more') ||
        router.pathname.startsWith('/coupons') ||
        router.pathname.startsWith('/marketing') ||
        router.pathname.startsWith('/subscription')
      );
    }
    return router.pathname.startsWith(itemHref);
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [router.pathname]);

  useEffect(() => { drawerRef.current?.toggleAttribute('inert', !mobileDrawerOpen); }, [mobileDrawerOpen]);

  // Handle Escape key to close mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileDrawerOpen]);

  const isStorePublic = store?.publicVisibility?.isPublic === true;
  const getStatusBadge = (_compact = false) => (
    <span data-testid="store-visibility" data-public={isStorePublic} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${isStorePublic ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'}`}>
      <span className={`w-1.5 h-1.5 mr-1.5 rounded-full ${isStorePublic ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      {t(isStorePublic ? 'navigation.storePublic' : 'navigation.storePrivate')}
    </span>
  );

  const baseStorefrontUrl = getStorefrontUrl();
  const storefrontUrl = store?.slug
    ? isStorePublic
      ? getPublicStoreUrl(store.slug, baseStorefrontUrl)
      : getPublicStoreUrl(store.slug, baseStorefrontUrl, { preview: true })
    : null;

  return (
    <div className="min-h-screen bg-merchant-bg text-merchant-text flex flex-col md:flex-row w-full max-w-full overflow-x-clip">
      {/* =========================================================================
          1. DESKTOP & TABLET LEFT SIDEBAR (Sticky/Fixed)
          - Tablet (768px-1023px): Collapsible icon rail (68px or 240px)
          - Desktop (>= 1024px): 240px expanded sidebar
      ========================================================================= */}
      <aside
        aria-label="Merchant Primary Navigation"
        className={`hidden md:flex flex-col bg-merchant-sidebar text-merchant-sidebar-text min-h-screen fixed left-0 top-0 bottom-0 z-30 border-r border-merchant-sidebar-border transition-all duration-200 ${
          tabletCollapsed ? 'md:w-[68px] lg:w-60' : 'w-60'
        }`}
      >
        {/* Top Header / Store Identity */}
        <div className="p-4 border-b border-merchant-sidebar-border flex items-center justify-between min-h-[64px]">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <span className="w-8 h-8 rounded-lg bg-merchant-primary text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
              L
            </span>
            <div className={`overflow-hidden transition-opacity duration-200 ${tabletCollapsed ? 'md:hidden lg:block' : 'block'}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-merchant-sidebar-text-muted uppercase tracking-wider">LetzShop</span>
                <span className="text-merchant-sidebar-text-muted opacity-60">•</span>
                <span className="text-[10px] text-merchant-sidebar-text truncate font-semibold">{store?.name || 'Store'}</span>
              </div>
              <div className="mt-0.5">{getStatusBadge(true)}</div>
            </div>
          </div>

          {/* Tablet Collapse / Expand Toggle Button (visible only on md) */}
          <button
            type="button"
            onClick={() => setTabletCollapsed(!tabletCollapsed)}
            className="hidden md:flex lg:hidden text-merchant-sidebar-text-muted hover:text-merchant-sidebar-text p-1 rounded-md hover:bg-merchant-sidebar-hover transition-colors"
            title={tabletCollapsed ? 'Expand Navigation' : 'Collapse Navigation'}
            aria-label={tabletCollapsed ? 'Expand Navigation' : 'Collapse Navigation'}
          >
            {tabletCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* 7 Primary Navigation Links */}
        <nav className="flex-1 px-2.5 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(item.href);
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => router.push(item.href)}
                title={item.label}
                aria-label={item.label}
                className={`w-full flex items-center rounded-xl text-xs font-medium transition-all group relative ${
                  tabletCollapsed ? 'md:justify-center md:px-0 lg:justify-start lg:px-3' : 'justify-start px-3'
                } py-2.5 ${
                  active
                    ? 'bg-merchant-sidebar-active text-white font-semibold shadow-xs'
                    : 'text-merchant-sidebar-text-muted hover:bg-merchant-sidebar-hover hover:text-merchant-sidebar-text'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${tabletCollapsed ? 'md:mr-0 lg:mr-3' : 'mr-3'}`} />
                <span className={`truncate ${tabletCollapsed ? 'md:hidden lg:inline' : 'inline'}`}>
                  {item.label}
                </span>

                {/* Floating tooltip on tablet collapsed rail */}
                {tabletCollapsed && (
                  <span className="hidden md:group-hover:block lg:group-hover:hidden absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-semibold rounded-md shadow-xl whitespace-nowrap z-50 border border-slate-700 pointer-events-none">
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Area: Merchant Profile, Language Switcher, Theme Switcher & Logout */}
        <div className="p-3 border-t border-merchant-sidebar-border space-y-2.5">
          {/* Language Switcher */}
          <div className={`merchant-navigation-controls space-y-2.5 ${tabletCollapsed ? 'hidden lg:block' : ''}`}>
            <SellerLanguageSelect />
            <ThemeToggle />
          </div>

          {/* Subscription link */}
          <button
            type="button"
            onClick={() => router.push('/subscription')}
            title={t('navigation.plan')}
            className={`w-full flex items-center rounded-xl text-xs font-medium transition-colors ${
              tabletCollapsed ? 'md:justify-center md:px-0 lg:justify-between lg:px-3' : 'justify-between px-3'
            } py-2 text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20`}
          >
            <span className="flex items-center">
              <CreditCard className={`w-3.5 h-3.5 ${tabletCollapsed ? 'md:mr-0 lg:mr-2' : 'mr-2'}`} />
              <span className={`truncate ${tabletCollapsed ? 'md:hidden lg:inline' : 'inline'}`}>{t('navigation.plan')}</span>
            </span>
            <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-200 ${tabletCollapsed ? 'md:hidden lg:inline' : 'inline'}`}>
              {store?.status === 'LIVE' ? 'ACTIVE' : 'UPGRADE'}
            </span>
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={logout}
            title={t('navigation.logout')}
            className={`w-full flex items-center rounded-xl text-xs font-medium text-merchant-sidebar-text-muted hover:text-rose-500 hover:bg-merchant-sidebar-hover transition-colors ${
              tabletCollapsed ? 'md:justify-center md:px-0 lg:justify-start lg:px-3' : 'justify-start px-3'
            } py-2`}
          >
            <LogOut className={`w-3.5 h-3.5 ${tabletCollapsed ? 'md:mr-0 lg:mr-2' : 'mr-2'}`} />
            <span className={`truncate ${tabletCollapsed ? 'md:hidden lg:inline' : 'inline'}`}>
              {t('navigation.logout')}
            </span>
          </button>
        </div>
      </aside>

      {/* =========================================================================
          2. MOBILE TOP APP BAR & OFF-CANVAS LEFT DRAWER (< 768px)
          - NO bottom navigation!
          - Hamburger opens left slide-in drawer
      ========================================================================= */}
      {/* Top App Bar for Mobile */}
      <div className="md:hidden sticky top-0 z-30 bg-merchant-sidebar text-merchant-sidebar-text px-3 py-2 border-b border-merchant-sidebar-border flex items-center justify-between shadow-xs w-full max-w-full gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Open Navigation Drawer"
            className="p-1.5 -ml-1 text-merchant-sidebar-text-muted hover:text-merchant-sidebar-text hover:bg-merchant-sidebar-hover rounded-lg transition-colors shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-6 h-6 rounded-md bg-merchant-primary text-white flex items-center justify-center font-bold text-xs shrink-0">
              L
            </span>
            <span className="font-bold text-xs sm:text-sm tracking-tight text-merchant-sidebar-text truncate max-w-[120px] sm:max-w-[200px]">
              {title || 'Dashboard'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Quick language switcher on mobile top bar */}
          <SellerLanguageSelect showIcon={false} compact className="shrink-0" />
          {/* Quick theme toggle on mobile app bar beside language */}
          <ThemeToggle collapsed className="w-8 h-8 !p-1.5 shrink-0" />
        </div>
      </div>

      {/* Off-Canvas Backdrop */}
      {mobileDrawerOpen && (
        <div
          role="presentation"
          onClick={() => setMobileDrawerOpen(false)}
          className="md:hidden fixed inset-0 bg-merchant-overlay backdrop-blur-xs z-40 transition-opacity animate-in fade-in duration-200"
        />
      )}

      {/* Left Off-Canvas Drawer */}
      <aside
        ref={drawerRef}
        aria-label="Mobile Left Navigation Drawer"
        aria-hidden={!mobileDrawerOpen}
        aria-modal={mobileDrawerOpen || undefined}
        role={mobileDrawerOpen ? 'dialog' : undefined}
        className={`md:hidden fixed top-0 bottom-0 left-0 w-72 max-w-[85vw] bg-merchant-sidebar text-merchant-sidebar-text z-50 shadow-2xl flex flex-col transition-transform duration-200 ease-in-out border-r border-merchant-sidebar-border ${
          mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-merchant-sidebar-border flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-6 h-6 rounded-md bg-merchant-primary text-white flex items-center justify-center font-bold text-xs">
                L
              </span>
              <span className="text-[10px] font-bold text-merchant-sidebar-text-muted uppercase tracking-wider">LetzShop</span>
            </div>
            <h2 className="text-sm font-bold text-merchant-sidebar-text truncate">{store?.name || 'Merchant'}</h2>
            <div className="mt-1">{getStatusBadge(false)}</div>
          </div>
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(false)}
            aria-label="Close Navigation Drawer"
            className="p-2 text-merchant-sidebar-text-muted hover:text-merchant-sidebar-text rounded-lg hover:bg-merchant-sidebar-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Navigation Links (Touch targets >= 44px) */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(item.href);
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => {
                  router.push(item.href);
                  setMobileDrawerOpen(false);
                }}
                className={`w-full flex items-center px-3.5 py-3 rounded-xl text-sm font-medium transition-colors min-h-[44px] ${
                  active
                    ? 'bg-merchant-sidebar-active text-white font-semibold shadow-xs'
                    : 'text-merchant-sidebar-text-muted hover:bg-merchant-sidebar-hover hover:text-merchant-sidebar-text'
                }`}
              >
                <Icon className="w-5 h-5 mr-3 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Drawer Bottom Actions */}
        <div className="p-4 border-t border-merchant-sidebar-border space-y-2.5">
          <SellerLanguageSelect fullWidth />
          <ThemeToggle showLabel />

          {storefrontUrl && (
            <a
              href={storefrontUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-merchant-primary-soft text-merchant-primary border border-merchant-primary/30 hover:opacity-90 transition-opacity min-h-[44px]"
            >
              <ExternalLink className="w-4 h-4" />
              <span>{t('navigation.viewStorefront')}</span>
            </a>
          )}

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-merchant-sidebar-text-muted hover:text-rose-500 hover:bg-merchant-sidebar-hover transition-colors min-h-[44px]"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('navigation.logout')} ({user?.phone || 'Seller'})</span>
          </button>
        </div>
      </aside>

      {/* =========================================================================
          3. MAIN CONTENT AREA
          - Offset margin on desktop/tablet to accommodate fixed left sidebar
      ========================================================================= */}
      <div
        className={`flex-1 flex flex-col min-w-0 w-full max-w-full overflow-x-clip transition-all duration-200 ${
          tabletCollapsed ? 'md:ml-[68px] lg:ml-60' : 'md:ml-60'
        }`}
      >
        {/* The collapsed tablet rail cannot contain a readable language select. */}
        {tabletCollapsed && (
          <div className="hidden md:flex lg:hidden items-center justify-end gap-2 px-4 pt-3 merchant-navigation-controls">
            <SellerLanguageSelect />
            <ThemeToggle collapsed />
          </div>
        )}
        {/* Main Content Viewport */}
        <main className="p-2.5 sm:p-4 lg:py-3.5 lg:px-6 flex-1 max-w-7xl w-full mx-auto box-border">{children}</main>
      </div>
    </div>
  );
};
