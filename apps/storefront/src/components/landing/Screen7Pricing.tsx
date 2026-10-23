import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Layers, Sparkles } from 'lucide-react';
import { useLandingI18n } from '@simply/i18n';
import { fetchLaunchPlan, LaunchPlan } from '../../utils/launch-plan';
import { LANDING_ANCHORS } from './anchors';
import styles from './Screen7Pricing.module.css';

export const Screen7Pricing: React.FC<{ sellerUrl: string; initialPlan: LaunchPlan | null }> = ({ sellerUrl, initialPlan }) => {
  const { t, locale } = useLandingI18n();
  const tr = (key: string) => t(`pricingValue.${key}`);
  const [plan, setPlan] = useState(initialPlan);
  useEffect(() => {
    let active = true;
    // Revalidate stale static output once, without a polling/refetch loop.
    fetchLaunchPlan().then(current => { if (active) setPlan(current); });
    return () => { active = false; };
  }, []);
  const price = plan ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'INR', maximumFractionDigits: plan.pricePaise % 100 ? 2 : 0 }).format(plan.pricePaise / 100) : null;
  return (
    <section id={LANDING_ANCHORS.pricing} className={styles.section} aria-labelledby="pricing-title" data-testid="screen7-pricing">
      <div className={styles.inner}>
        <div className={styles.header}>
          <span className={styles.eyebrow}><Sparkles size={14} />{tr('eyebrow')}</span>
          <h2 id="pricing-title">{tr('title')}<br /><em>{tr('highlight')}</em></h2>
          <p>{tr('support')}</p>
        </div>
        <div className={styles.comparison}>
          <div className={styles.separate}>
            <div className={styles.separateIcon}><Layers size={24} /></div>
            <h3>{tr('separate')}</h3><p>{tr('separateNote')}</p>
            <ul>{Array.from({ length: 6 }, (_, i) => <li key={i}><span>{tr(`s${i + 1}`)}</span><small>{tr('separateTag')}</small></li>)}</ul>
          </div>
          <div className={styles.card}>
            <div className={styles.cardTop}><span>{tr('with')}</span><span className={styles.plan}>{plan?.name || 'Launch'}</span></div>
            <p className={styles.connected}>{tr('connected')}</p>
            <div className={styles.price} data-testid="launch-price" data-price-paise={plan?.pricePaise} data-period-days={plan?.billingPeriodDays}>
              {price ? <><strong>{price}</strong><span>{tr('taxSuffix')} / </span><span>{t('pricingValue.period', { days: new Intl.NumberFormat(locale).format(plan!.billingPeriodDays) })}</span></> : <span>{tr('unavailable')}</span>}
            </div>
            <ul className={styles.features}>{Array.from({ length: 9 }, (_, i) => <li key={i}><Check size={16} aria-hidden="true" /><span>{tr(`f${i + 1}`)}</span></li>)}</ul>
            <a data-testid="pricing-cta" href={`${sellerUrl}/register`} className={styles.cta}>{tr('cta')}<ArrowRight size={18} /></a>
            <a className={styles.how} href={`#${LANDING_ANCHORS.journey}`}>{tr('how')} <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <p className={styles.fees}>{tr('fees')}</p>
      </div>
    </section>
  );
};
