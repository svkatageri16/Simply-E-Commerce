import React, { useState } from 'react';
import { ChevronDown, ArrowRight, Sparkles, Store, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useLandingI18n } from '@simply/i18n';

interface Screen8StepsFaqCtaProps {
  sellerUrl: string;
}

export const Screen8StepsFaqCta: React.FC<Screen8StepsFaqCtaProps> = ({ sellerUrl }) => {
  const { t } = useLandingI18n();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const steps = [
    {
      num: '1',
      title: t('landing.step1Title'),
      desc: t('landing.step1Desc'),
      color: 'bg-blue-600',
    },
    {
      num: '2',
      title: t('landing.step2Title'),
      desc: t('landing.step2Desc'),
      color: 'bg-orange-600',
    },
    {
      num: '3',
      title: t('landing.launchStep3Title'),
      desc: t('landing.launchStep3Desc'),
      color: 'bg-emerald-600',
    },
    { num: '4', title: t('landing.launchStep4Title'), desc: t('landing.launchStep4Desc'), color: 'bg-blue-600' },
    { num: '5', title: t('landing.launchStep5Title'), desc: t('landing.launchStep5Desc'), color: 'bg-orange-600' },
  ];

  const faqs = [
    { q: t('landing.faqQ1'), a: t('landing.faqA1') },
    { q: t('landing.faqQ2'), a: t('landing.faqA2') },
    { q: t('landing.faqQ3'), a: t('landing.faqA3') },
    { q: t('landing.faqQ4'), a: t('landing.faqA4') },
    { q: t('landing.faqQ5'), a: t('landing.faqA5') },
    { q: t('landing.faqQ6'), a: t('landing.faqA6') },
  ];

  return (
    <div className="bg-white">
      {/* 1. How It Works Section */}
      <section id="legacy-steps" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-16 scroll-mt-16">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-bold tracking-wide">
            <span>{t('landing.howItWorksEyebrow')}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
            {t('landing.launchStepsTitle')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {steps.map((st, idx) => (
            <div
              key={idx}
              className="p-8 rounded-3xl bg-slate-50 border border-slate-200/80 shadow-xs space-y-4 relative flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className={`w-12 h-12 rounded-2xl ${st.color} text-white font-black text-lg flex items-center justify-center shadow-sm`}>
                  {st.num}
                </div>
                <h3 className="text-lg font-bold text-slate-900">{st.title}</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {st.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. FAQ Section */}
      <section id="faq" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8 bg-slate-50/60 border-y border-slate-100 scroll-mt-16">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              {t('landing.navFaq')}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {t('landing.faqTitle')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
              {t('landing.faqSubtitle')}
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl bg-white border border-slate-200 shadow-2xs overflow-hidden transition"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 text-sm font-bold text-slate-900 hover:text-blue-600 transition"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                        isOpen ? 'rotate-180 text-blue-600' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Final Conversion Call-to-Action Block */}
      <section className="py-20 md:py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto rounded-3xl p-8 sm:p-14 bg-gradient-to-r from-blue-900 via-blue-950 to-slate-950 text-white text-center space-y-6 shadow-2xl relative overflow-hidden border border-blue-800">
          {/* Subtle Ambient Orbs */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-4 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>LetZshop Direct Commerce</span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight whitespace-pre-line">
              {t('landing.finalCtaHeading')}
            </h2>

            <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
              {t('landing.finalCtaSubtitle')}
            </p>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-md mx-auto">
              <a
                href={`${sellerUrl}/register`}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white hover:bg-slate-100 text-slate-950 text-xs font-black uppercase tracking-wider transition shadow-xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>{t('landing.finalCtaCreate')}</span>
                <ArrowRight className="w-4 h-4 text-slate-950" />
              </a>

              <a
                href={`${sellerUrl}/login`}
                className="w-full sm:w-auto px-6 py-4 rounded-xl bg-blue-950/80 hover:bg-blue-900/80 text-white border border-blue-700/80 text-xs font-bold transition flex items-center justify-center gap-2"
              >
                <span>{t('landing.finalCtaLogin')}</span>
              </a>
            </div>

            <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-center gap-4">
              <span>✓ Direct Bank Settlement</span>
              <span>•</span>
              <span>✓ WhatsApp Commerce Ready</span>
              <span>•</span>
              <span>✓ Free SSL Included</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
