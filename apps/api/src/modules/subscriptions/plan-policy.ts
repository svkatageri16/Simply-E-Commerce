export function planAvailability(plan: {
  code: string;
  isPublic: boolean;
  pricePaise: number;
  status?: string;
  isPurchasable?: boolean;
}) {
  const statusUpper = (plan.status || '').toUpperCase();
  const codeUpper = (plan.code || '').toUpperCase();

  if (!plan.isPublic || statusUpper === 'INACTIVE') return { availability: 'HIDDEN', purchasable: false };
  if (statusUpper === 'COMING_SOON' || (!statusUpper && codeUpper.includes('GROWTH')))
    return { availability: 'COMING_SOON', purchasable: false };
  if (statusUpper === 'CONTACT_SALES' || codeUpper.includes('CUSTOM') || plan.pricePaise <= 0)
    return { availability: 'CONTACT_SALES', purchasable: false };
  const purchasable = plan.isPurchasable !== false && plan.isPublic && plan.pricePaise > 0;
  return {
    availability: purchasable ? 'AVAILABLE' : 'HIDDEN',
    purchasable,
  };
}
