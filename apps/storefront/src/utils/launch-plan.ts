import { getApiUrl } from './config';
export interface LaunchPlan { code: string; name: string; pricePaise: number; billingCycle: string; billingPeriodDays: number; baseAmountPaise: number; taxPaise: number; totalPaise: number; gstRate: number }
export async function fetchLaunchPlan(): Promise<LaunchPlan | null> {
  try {
    const response = await fetch(`${getApiUrl()}/subscriptions/plans`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const payload = await response.json();
    const plans = Array.isArray(payload) ? payload : payload.data;
    const plan = plans?.find((p: any) => p.code === 'STARTER_MONTHLY' && p.purchasable && p.billingCycle === 'MONTHLY' && Number.isInteger(p.billingPeriodDays) && p.billingPeriodDays > 0 && Number.isInteger(p.pricePaise) && p.pricePaise > 0);
    return plan ? { code: plan.code, name: plan.name, pricePaise: plan.pricePaise, billingCycle: plan.billingCycle, billingPeriodDays: plan.billingPeriodDays, baseAmountPaise: plan.baseAmountPaise, taxPaise: plan.taxPaise, totalPaise: plan.totalPaise, gstRate: plan.gstRate } : null;
  } catch { return null; }
}
