import { getApiUrl } from './config';

export interface LaunchPlan {
  code: string;
  name: string;
  pricePaise: number;
  billingCycle: string;
  billingPeriodDays: number;
  baseAmountPaise: number;
  taxPaise: number;
  totalPaise: number;
  gstRate: number;
}

export interface LandingPlanPackage {
  id?: string;
  code: string;
  name: string;
  description?: string;
  pricePaise: number;
  baseAmountPaise: number;
  taxPaise: number;
  totalPaise: number;
  gstRate: number;
  billingPeriodDays: number;
  status: string;
  isComingSoon: boolean;
  isContact: boolean;
  purchasable: boolean;
  badge?: string;
  features?: string[];
}

export const FALLBACK_PACKAGES: LandingPlanPackage[] = [
  {
    code: 'STARTER_MONTHLY',
    name: 'Solopreneur',
    description: 'Complete cloud ecommerce system for ambitious solopreneurs and direct sellers.',
    pricePaise: 99900,
    baseAmountPaise: 99900,
    taxPaise: 17982,
    totalPaise: 117882,
    gstRate: 18,
    billingPeriodDays: 30,
    status: 'ACTIVE',
    isComingSoon: false,
    isContact: false,
    purchasable: true,
    badge: 'Available',
    features: [
      'Sell unlimited products & variants',
      'Direct WhatsApp checkout & enquiries',
      'Razorpay card, UPI & netbanking + COD',
      'Automated buyer email notifications',
      'Self-delivery & Shiprocket logistics',
      'Mobile store builder & theme editor',
      'Zero platform transaction cut',
    ],
  },
  {
    code: 'GROWTH_MONTHLY',
    name: 'Professional',
    description: 'Advanced scale tools, custom domains, and team collaboration for established brands.',
    pricePaise: 299900,
    baseAmountPaise: 299900,
    taxPaise: 53982,
    totalPaise: 353882,
    gstRate: 18,
    billingPeriodDays: 30,
    status: 'COMING_SOON',
    isComingSoon: true,
    isContact: false,
    purchasable: false,
    badge: 'Coming Soon',
    features: [
      'Everything in Solopreneur',
      'Custom brand domain (yourbrand.com)',
      'Up to 10 staff accounts & roles',
      'Advanced sales analytics & reports',
      'Priority phone & WhatsApp support',
    ],
  },
  {
    code: 'CUSTOM',
    name: 'Scale',
    description: 'Dedicated architecture, high-concurrency clusters, and bespoke integrations for enterprise retail.',
    pricePaise: 0,
    baseAmountPaise: 0,
    taxPaise: 0,
    totalPaise: 0,
    gstRate: 18,
    billingPeriodDays: 30,
    status: 'CONTACT_SALES',
    isComingSoon: false,
    isContact: true,
    purchasable: false,
    badge: 'Contact Sales',
    features: [
      'Everything in Professional',
      'Dedicated database cluster & retail SLA',
      'Custom ERP, warehouse & inventory sync',
      'Dedicated AIKYAM account manager',
      'Bespoke feature development',
    ],
  },
];

export async function fetchLandingPackages(): Promise<LandingPlanPackage[]> {
  try {
    const response = await fetch(`${getApiUrl()}/subscriptions/plans`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return FALLBACK_PACKAGES;
    const payload = await response.json();
    const plans = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(plans)) return FALLBACK_PACKAGES;

    return plans.map((p: any) => {
      const codeUpper = (p.code || '').toUpperCase();
      const statusUpper = (p.status || '').toUpperCase();
      const isComingSoon = statusUpper === 'COMING_SOON' || (!statusUpper && codeUpper.includes('GROWTH'));
      const isContact = statusUpper === 'CONTACT_SALES' || codeUpper.includes('CUSTOM') || p.pricePaise <= 0;
      const purchasable = Boolean(p.purchasable && !isComingSoon && !isContact && p.pricePaise > 0);

      const baseAmount = p.baseAmountPaise ?? p.pricePaise;
      const taxAmount = p.taxPaise ?? Math.round(baseAmount * 0.18);
      const totalAmount = p.totalPaise ?? (baseAmount + taxAmount);

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        pricePaise: p.pricePaise,
        baseAmountPaise: baseAmount,
        taxPaise: taxAmount,
        totalPaise: totalAmount,
        gstRate: p.gstRate ?? 18,
        billingPeriodDays: p.billingPeriodDays || 30,
        status: isComingSoon ? 'COMING_SOON' : isContact ? 'CONTACT_SALES' : 'ACTIVE',
        isComingSoon,
        isContact,
        purchasable,
        badge: isComingSoon ? 'Coming Soon' : isContact ? 'Contact Sales' : (p.badge || 'Available'),
        features: Array.isArray(p.features) && p.features.every((value: unknown) => typeof value === 'string') ? p.features : Array.isArray(p.highlights) && p.highlights.length > 0
          ? p.highlights.map((h: any) => (typeof h === 'string' ? h : h.text))
          : undefined,
      };
    });
  } catch {
    return FALLBACK_PACKAGES;
  }
}

export async function fetchLaunchPlan(): Promise<LaunchPlan | null> {
  try {
    const packages = await fetchLandingPackages();
    const solo = packages.find((p) => p.purchasable);
    if (!solo) return null;
    return {
      code: solo.code,
      name: solo.name,
      pricePaise: solo.pricePaise,
      billingCycle: 'MONTHLY',
      billingPeriodDays: solo.billingPeriodDays,
      baseAmountPaise: solo.baseAmountPaise,
      taxPaise: solo.taxPaise,
      totalPaise: solo.totalPaise,
      gstRate: solo.gstRate,
    };
  } catch {
    return null;
  }
}
