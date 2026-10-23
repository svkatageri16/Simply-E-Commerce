import { LANDING_ANCHORS, scrollToLandingAnchor } from './anchors';
import React, { useState } from 'react';
import { Menu, X, ArrowRight, Store, Globe } from 'lucide-react';
import { useLandingI18n } from '@simply/i18n';
import { LetZshopLogo } from './LetZshopLogo';

interface LandingNavbarProps {
  sellerUrl: string;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({ sellerUrl }) => {
  const { t, locale, setLocale } = useLandingI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: `#${LANDING_ANCHORS.features}`, label: t('landing.navFeatures') },
    { href: `#${LANDING_ANCHORS.themes}`, label: t('landing.navThemes') },
    { href: `#${LANDING_ANCHORS.journey}`, label: t('landing.navHowItWorks') },
    { href: `#${LANDING_ANCHORS.pricing}`, label: t('landing.navPricing') },
    { href: `#${LANDING_ANCHORS.faq}`, label: t('landing.navFaq') },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    scrollToLandingAnchor(href);
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 transition-all">
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8 h-[68px] flex items-center justify-between gap-4">
        {/* Brand Logo - Official 3D LetZshop mark in top-left corner */}
        <a href="/" className="flex items-center gap-2 group shrink-0">
          <LetZshopLogo size="lg" />
        </a>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-8 text-[13px] font-semibold text-slate-600" aria-label="Main Navigation">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
              className="hover:text-blue-600 transition-colors py-1"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right Section: Language Switcher & CTAs */}
        <div className="hidden sm:flex items-center gap-2.5">
          {/* Simple English | मराठी | हिंदी Language Switcher */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5 text-xs font-semibold" aria-label="Language Selector">
            <button
              type="button"
              onClick={() => setLocale('en-IN')}
              className={`px-2 py-1 rounded-md transition-all ${
                locale === 'en-IN'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              English
            </button>
            <span className="text-slate-300 select-none">|</span>
            <button
              type="button"
              onClick={() => setLocale('mr-IN')}
              className={`px-2 py-1 rounded-md transition-all ${
                locale === 'mr-IN'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              मराठी
            </button>
            <span className="text-slate-300 select-none">|</span>
            <button
              type="button"
              onClick={() => setLocale('hi-IN')}
              className={`px-2 py-1 rounded-md transition-all ${
                locale === 'hi-IN'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              हिंदी
            </button>
          </div>

          {/* Secondary Action: Merchant Login */}
          <a
            href={`${sellerUrl}/login`}
            className="px-3 py-2 text-xs font-semibold text-slate-700 hover:text-blue-700 hover:bg-slate-50 rounded-lg transition border border-transparent hover:border-slate-200"
          >
            {t('landing.merchantLogin')}
          </a>

          {/* Primary Action: Create Store */}
          <a
            href={`${sellerUrl}/register`}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white rounded-full text-xs font-bold transition-all shadow-md shadow-orange-500/20 hover:shadow-orange-500/30 flex items-center gap-1.5 active:scale-[0.98]"
          >
            <span>{t('landing.createStore')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>

          {/* Tablet hamburger button (between 640px and 1024px) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition lg:hidden"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex items-center gap-2 sm:hidden">
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setLocale('en-IN')}
              className={`px-1.5 py-0.5 rounded transition ${locale === 'en-IN' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-600'}`}
            >
              EN
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => setLocale('mr-IN')}
              className={`px-1.5 py-0.5 rounded transition ${locale === 'mr-IN' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-600'}`}
            >
              मराठी
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => setLocale('hi-IN')}
              className={`px-1.5 py-0.5 rounded transition ${locale === 'hi-IN' ? 'bg-white text-blue-700 font-bold shadow-xs' : 'text-slate-600'}`}
            >
              हिंदी
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-slate-200 bg-white px-4 pt-3 pb-6 space-y-4 shadow-lg animate-fadeInDown">
          <nav className="flex flex-col space-y-2 text-sm font-semibold text-slate-700">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="px-3 py-2 rounded-lg hover:bg-slate-50 hover:text-blue-600 transition"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
            <a
              href={`${sellerUrl}/login`}
              className="w-full text-center py-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              {t('landing.merchantLogin')}
            </a>
            <a
              href={`${sellerUrl}/register`}
              className="w-full text-center py-2.5 rounded-lg bg-blue-600 text-white text-xs font-bold shadow-sm hover:bg-blue-700 transition flex items-center justify-center gap-1.5"
            >
              <span>{t('landing.createStore')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </header>
  );
};
