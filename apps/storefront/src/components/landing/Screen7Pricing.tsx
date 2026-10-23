import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Sparkles, Clock, Mail, ShieldCheck } from 'lucide-react';
import { useLandingI18n } from '@simply/i18n';
import { fetchLandingPackages, LandingPlanPackage, FALLBACK_PACKAGES } from '../../utils/launch-plan';
import { LANDING_ANCHORS } from './anchors';

interface Screen7PricingProps {
  sellerUrl: string;
  initialPlan?: any;
}

export const Screen7Pricing: React.FC<Screen7PricingProps> = ({ sellerUrl }) => {
  const { t, locale } = useLandingI18n();
  const tr = (key: string) => t(`pricingValue.${key}`);
  const [packages, setPackages] = useState<LandingPlanPackage[]>(FALLBACK_PACKAGES);

  useEffect(() => {
    let active = true;
    fetchLandingPackages().then((items) => {
      if (active && items) {
        setPackages(items);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const formatPrice = (paise: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: paise % 100 ? 2 : 0,
    }).format(paise / 100);
  };

  return (
    <section
      id={LANDING_ANCHORS.pricing}
      className="relative bg-slate-50/60 py-20 md:py-28 px-4 sm:px-6 lg:px-8 border-y border-slate-100 scroll-mt-16 overflow-hidden"
      aria-labelledby="pricing-title"
      data-testid="screen7-pricing"
    >
      <div className="max-w-7xl mx-auto space-y-14">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>{tr('eyebrow')}</span>
          </div>

          <h2
            id="pricing-title"
            className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight"
          >
            {tr('title')} <span className="text-orange-600">{tr('highlight')}</span>
          </h2>

          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            {tr('support')}
          </p>
        </div>

        {/* 3 Package Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
          {packages.map((pkg) => {
            const isSolo = pkg.code === 'STARTER_MONTHLY';
            const isPro = pkg.isComingSoon;
            const isScale = pkg.isContact || pkg.code === 'CUSTOM' || pkg.pricePaise <= 0;

            const badgeText = isPro
              ? tr('comingSoon')
              : isScale ? tr('contactSales') : pkg.badge || pkg.name;

            return (
              <div
                key={pkg.code}
                className={`relative rounded-3xl p-7 sm:p-8 flex flex-col justify-between transition-all duration-200 ${
                  isSolo
                    ? 'bg-white border-2 border-orange-500 shadow-xl ring-4 ring-orange-500/10'
                    : 'bg-white border border-slate-200 shadow-sm'
                }`}
              >
                {/* Header Badge */}
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span
                    className={`text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${
                      isSolo
                        ? 'bg-orange-100 text-orange-700 border border-orange-200'
                        : isPro
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : 'bg-blue-100 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {isSolo ? 'Available' : badgeText}
                  </span>
                  {isSolo && (
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                      Most Popular
                    </span>
                  )}
                </div>

                {/* Plan Info */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">
                      {isSolo ? tr('solopreneur') : isPro ? tr('professional') : tr('scale')}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 min-h-[32px] leading-relaxed">
                      {pkg.description || tr('connected')}
                    </p>
                  </div>

                  {/* Price Box */}
                  <div className="pt-2 pb-4 border-b border-slate-100">
                    {isScale ? (
                      <div className="space-y-1">
                        <div className="text-3xl font-black text-slate-900 tracking-tight">
                          {tr('customPrice')}
                        </div>
                        <p className="text-xs font-semibold text-slate-500">+ {pkg.gstRate}% GST</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight font-mono">
                            {formatPrice(pkg.baseAmountPaise)}
                          </span>
                          <span className="text-xs font-bold text-slate-500">+ {pkg.gstRate}% GST</span>
                        </div>
                        <p className="text-xs font-bold text-slate-700">
                          {tr('totalPrice')}: <span className="text-emerald-700 font-mono font-black">{formatPrice(pkg.totalPaise)}</span> / {pkg.billingPeriodDays || 30} days
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Feature Checklist */}
                  <div className="space-y-2.5 text-xs text-slate-600 pt-2">
                    <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                      Included with plan:
                    </p>
                    <ul className="space-y-2.5">
                      {(pkg.features || [
                        tr('f1'),
                        tr('f2'),
                        tr('f3'),
                        tr('f4'),
                        tr('f5'),
                        tr('f6'),
                        tr('f7'),
                      ]).map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="leading-snug">{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Action CTA Button */}
                <div className="pt-8 mt-auto">
                  {pkg.purchasable ? (
                    <a
                      data-testid="pricing-cta"
                      href={`${sellerUrl}/register`}
                      className="w-full py-3.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition flex items-center justify-center gap-2"
                    >
                      <span>{tr('cta')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  ) : isPro ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-3.5 px-4 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 text-xs font-bold uppercase tracking-wider cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <Clock className="w-4 h-4" />
                      <span>{tr('comingSoon')}</span>
                    </button>
                  ) : (
                    <a
                      href="mailto:business@aikyamaisystems.com?subject=LetzShop%20Scale%20Enterprise%20Plan%20Inquiry"
                      className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider shadow-sm transition flex items-center justify-center gap-2"
                    >
                      <Mail className="w-4 h-4 text-blue-400" />
                      <span>{tr('contactSales')}</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Disclaimer / Fees Footnote */}
        <p className="text-center text-xs text-slate-500 max-w-2xl mx-auto leading-relaxed">
          {tr('fees')}
        </p>
      </div>
    </section>
  );
};
