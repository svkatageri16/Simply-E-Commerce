import { LANDING_ANCHORS, scrollToLandingAnchor } from './anchors';
import React from 'react';
import { ShieldCheck, Mail, Globe } from 'lucide-react';
import { useLandingI18n } from '@simply/i18n';

interface LandingFooterProps {
  sellerUrl: string;
}

export const LandingFooter: React.FC<LandingFooterProps> = ({ sellerUrl }) => {
  const { t, locale, setLocale } = useLandingI18n();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    scrollToLandingAnchor(href);
  };

  return (
    <footer className="border-t border-slate-200 bg-white py-14 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-left">
          {/* Col 1: Brand Info */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-xs relative overflow-hidden">
                <span>LS</span>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-orange-500" />
              </div>
              <span className="font-extrabold text-base text-slate-900 tracking-tight">LetZshop</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                .store
              </span>
            </div>
            <p className="text-slate-500 text-xs leading-relaxed max-w-xs">
              {t('landing.footerDesc')}
            </p>
          </div>

          {/* Col 2: Navigation Links */}
          <div className="space-y-2.5">
            <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
              {t('landing.footerColNav')}
            </p>
            <ul className="space-y-2 text-slate-600">
              <li>
                <a href={`#${LANDING_ANCHORS.features}`} onClick={(e) => handleNavClick(e, `#${LANDING_ANCHORS.features}`)} className="hover:text-blue-600 transition">
                  {t('landing.navFeatures')}
                </a>
              </li>
              <li>
                <a href={`#${LANDING_ANCHORS.themes}`} onClick={(e) => handleNavClick(e, `#${LANDING_ANCHORS.themes}`)} className="hover:text-blue-600 transition">
                  {t('landing.navThemes')}
                </a>
              </li>
              <li>
                <a href={`#${LANDING_ANCHORS.journey}`} onClick={(e) => handleNavClick(e, `#${LANDING_ANCHORS.journey}`)} className="hover:text-blue-600 transition">
                  {t('landing.navHowItWorks')}
                </a>
              </li>
              <li>
                <a href={`#${LANDING_ANCHORS.pricing}`} onClick={(e) => handleNavClick(e, `#${LANDING_ANCHORS.pricing}`)} className="hover:text-blue-600 transition">
                  {t('landing.navPricing')}
                </a>
              </li>
              <li>
                <a href={`#${LANDING_ANCHORS.faq}`} onClick={(e) => handleNavClick(e, `#${LANDING_ANCHORS.faq}`)} className="hover:text-blue-600 transition">
                  {t('landing.navFaq')}
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Merchant Portal */}
          <div className="space-y-2.5">
            <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
              {t('landing.footerColAccount')}
            </p>
            <ul className="space-y-2 text-slate-600">
              <li>
                <a href={`${sellerUrl}/register`} className="hover:text-blue-600 transition font-semibold text-blue-700">
                  {t('landing.createStore')}
                </a>
              </li>
              <li>
                <a href={`${sellerUrl}/login`} className="hover:text-blue-600 transition">
                  {t('landing.merchantLogin')}
                </a>
              </li>
              <li>
                <a href={`#${LANDING_ANCHORS.faq}`} onClick={(e) => handleNavClick(e, `#${LANDING_ANCHORS.faq}`)} className="hover:text-blue-600 transition">
                  {t('landing.navFaq')}
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Contact & Organization */}
          <div className="space-y-2.5">
            <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
              {t('landing.footerColContact')}
            </p>
            <div className="space-y-1.5 text-slate-600">
              <p className="font-semibold text-slate-800">{t('landing.footerCompany')}</p>
              <p className="text-slate-500">{t('landing.footerSupport')}</p>
              <a
                href="mailto:business@aikyamaisystems.com"
                className="inline-flex items-center gap-1.5 text-blue-600 hover:underline pt-1"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>business@aikyamaisystems.com</span>
              </a>
            </div>

            <div className="pt-2 flex items-center gap-2 text-emerald-700 font-semibold text-[11px]">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Free SSL & Trusted Checkout</span>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Language Selector */}
        <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500 text-xs">
          <p>{t('landing.footerRights')}</p>

          <div className="flex items-center gap-4">
            <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setLocale('en-IN')}
                className={`px-2 py-0.5 rounded transition ${locale === 'en-IN' ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'text-slate-600'}`}
              >
                English
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => setLocale('mr-IN')}
                className={`px-2 py-0.5 rounded transition ${locale === 'mr-IN' ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'text-slate-600'}`}
              >
                मराठी
              </button>
            </div>

            <div className="flex items-center gap-3">
              <a href={`#${LANDING_ANCHORS.features}`} onClick={(e) => handleNavClick(e, `#${LANDING_ANCHORS.features}`)} className="hover:text-slate-700 transition">
                {t('landing.terms')}
              </a>
              <span>•</span>
              <a href={`#${LANDING_ANCHORS.features}`} onClick={(e) => handleNavClick(e, `#${LANDING_ANCHORS.features}`)} className="hover:text-slate-700 transition">
                {t('landing.privacy')}
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
