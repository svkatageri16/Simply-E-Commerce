import type { AdminPlan, AdminSubscriptionKpi } from '@simply/api-contracts';
import { Feedback, errorMessage } from '../components/AdminUI';
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { SubscriptionList } from '../components/SubscriptionList';
import {
  CreditCard,
  Check,
  Plus,
  Edit3,
  Trash2,
  ShieldCheck,
  TrendingUp,
  Globe,
  Package,
  Users,
  HardDrive,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Clock,
  Layers,
  HelpCircle,
  ShieldAlert,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { AdminLayout } from '../components/AdminLayout';
import { useAdminAuth } from '../context/AdminAuthContext';
import { formatPaise } from '@simply/ui';

interface PlanFormData {
  id?: string;
  name: string;
  code: string;
  description: string;
  priceRupees: number;
  gstRate: number;
  status: 'ACTIVE' | 'COMING_SOON' | 'CONTACT_SALES' | 'INACTIVE';
  displayOrder: number;
  badge: string;
  isPurchasable: boolean;
  billingCycle: string;
  availability: 'PURCHASABLE' | 'COMING_SOON' | 'CONTACT';
  maxProducts: number;
  maxStaff: number;
  maxStorageMb: number;
  customDomainAllowed: boolean;
  isPublic: boolean;
  highlights: Array<{ text: string; sortOrder: number }>;
}

const initialFormData: PlanFormData = {
  name: '',
  code: '',
  description: '',
  priceRupees: 0,
  gstRate: 18,
  status: 'ACTIVE',
  displayOrder: 0,
  badge: '',
  isPurchasable: true,
  billingCycle: 'MONTHLY',
  availability: 'PURCHASABLE',
  maxProducts: 100,
  maxStaff: 5,
  maxStorageMb: 2048,
  customDomainAllowed: false,
  isPublic: true,
  highlights: [],
};

export default function AdminBillingPage() {
  const { api } = useAdminAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [kpis, setKpis] = useState<AdminSubscriptionKpi | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<PlanFormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [plansRes, kpisRes] = await Promise.all([
        api.admin.getPlans(),
        api.admin.getSubscriptionKpis().catch(() => null),
      ]);

      // Canonical sort: Numeric prices ascending, Contact/Custom placed strictly last
      const sorted = [...plansRes].sort((a, b) => {
        if ((a.displayOrder || 0) !== (b.displayOrder || 0)) return (a.displayOrder || 0) - (b.displayOrder || 0);
        const isCustomA = a.availability === 'CONTACT' || a.code === 'CUSTOM' || a.pricePaise <= 0;
        const isCustomB = b.availability === 'CONTACT' || b.code === 'CUSTOM' || b.pricePaise <= 0;
        if (isCustomA && !isCustomB) return 1;
        if (!isCustomA && isCustomB) return -1;
        return a.pricePaise - b.pricePaise;
      });

      setPlans(sorted);
      if (kpisRes) {
        setKpis(kpisRes);
      }
    } catch (err) {
      setPlans([]);
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setFormData(initialFormData);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (plan: AdminPlan) => {
    setIsEditing(true);
    setFormData({
      id: plan.id,
      name: plan.name,
      code: plan.code,
      description: plan.description || '',
      priceRupees: plan.pricePaise / 100,
      gstRate: (plan.gstBasisPoints ?? 1800) / 100,
      status: plan.status || 'ACTIVE',
      displayOrder: plan.displayOrder || 0,
      badge: plan.badge || '',
      isPurchasable: plan.isPurchasable !== false,
      billingCycle: plan.billingCycle,
      availability: (plan.availability as any) || (plan.purchasable ? 'PURCHASABLE' : 'COMING_SOON'),
      maxProducts: plan.maxProducts,
      maxStaff: plan.maxStaff,
      maxStorageMb: plan.maxStorageMb,
      customDomainAllowed: Boolean(plan.customDomainAllowed),
      isPublic: Boolean(plan.isPublic),
      highlights: (plan.highlights || []).map((h, idx) => ({
        text: h.text,
        sortOrder: typeof h.sortOrder === 'number' ? h.sortOrder : idx,
      })),
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleAddHighlight = () => {
    setFormData((prev) => ({
      ...prev,
      highlights: [...prev.highlights, { text: '', sortOrder: prev.highlights.length }],
    }));
  };

  const handleUpdateHighlightText = (index: number, text: string) => {
    setFormData((prev) => {
      const updated = [...prev.highlights];
      if (updated[index]) {
        updated[index] = { ...updated[index], text };
      }
      return { ...prev, highlights: updated };
    });
  };

  const handleDeleteHighlight = (index: number) => {
    setFormData((prev) => {
      const updated = prev.highlights.filter((_, i) => i !== index);
      return {
        ...prev,
        highlights: updated.map((item, idx) => ({ ...item, sortOrder: idx })),
      };
    });
  };

  const handleMoveHighlight = (index: number, direction: 'UP' | 'DOWN') => {
    setFormData((prev) => {
      const list = [...prev.highlights];
      const targetIdx = direction === 'UP' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIdx];
      list[targetIdx] = temp;
      return {
        ...prev,
        highlights: list.map((item, idx) => ({ ...item, sortOrder: idx })),
      };
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim()) {
      setFormError('Please enter a plan name.');
      return;
    }

    setSubmitting(true);
    try {
      const pricePaise = Math.round(Number(formData.priceRupees) * 100);
      const highlights = formData.highlights
        .filter((h) => h.text.trim())
        .map((h, idx) => ({ text: h.text.trim(), sortOrder: idx }));

      if (isEditing && formData.id) {
        await api.admin.updatePlan(formData.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          pricePaise,
          gstBasisPoints: Math.round(formData.gstRate * 100),
          status: formData.status,
          displayOrder: formData.displayOrder,
          badge: formData.badge,
          isPurchasable: formData.isPurchasable,
          billingCycle: formData.billingCycle,
          maxProducts: Number(formData.maxProducts),
          maxStaff: Number(formData.maxStaff),
          maxStorageMb: Number(formData.maxStorageMb),
          customDomainAllowed: formData.customDomainAllowed,
          isPublic: formData.isPublic,
          highlights,
        });
        showNotification(
          'success',
          `Plan "${formData.name}" successfully updated.`,
        );
      } else {
        await api.admin.createPlan({
          name: formData.name.trim(),
          code: formData.code.trim() || undefined,
          description: formData.description.trim() || undefined,
          pricePaise,
          gstBasisPoints: Math.round(formData.gstRate * 100),
          status: formData.status,
          displayOrder: formData.displayOrder,
          badge: formData.badge,
          isPurchasable: formData.isPurchasable,
          billingCycle: formData.billingCycle,
          maxProducts: Number(formData.maxProducts),
          maxStaff: Number(formData.maxStaff),
          maxStorageMb: Number(formData.maxStorageMb),
          customDomainAllowed: formData.customDomainAllowed,
          isPublic: formData.isPublic,
          highlights,
        });
        showNotification(
          'success',
          `New plan "${formData.name}" successfully created.`,
        );
      }

      setModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      console.error('Plan save error:', err);
      setFormError(
        errorMessage(err) || 'Failed to save plan. Please check inputs.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePlan = async (plan: AdminPlan) => {
    const subscriberWarning =
      plan.activeSubscribersCount > 0
        ? `\n\nNotice: This plan currently has ${plan.activeSubscribersCount} merchant subscription record(s). To protect running stores and preserve historical billing records, it will be safely archived and hidden from new signups instead of hard-deleted.`
        : '';

    const confirm = window.confirm(
      `Are you sure you want to deactivate or archive the plan "${plan.name}" (${plan.code})?${subscriberWarning}`,
    );
    if (!confirm) return;

    try {
      const res = await api.admin.deletePlan(plan.id);
      showNotification(
        'success',
        res.message || `Plan "${plan.name}" processed.`,
      );
      await loadData();
    } catch (err: unknown) {
      console.error('Failed to delete plan:', err);
      showNotification('error', errorMessage(err) || 'Failed to delete plan.');
    }
  };

  return (
    <AdminLayout>
      <Head>
        <title>Plans & Subscriptions | LetzShop Admin</title>
      </Head>

      <div className="space-y-6 font-sans max-w-7xl mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-admin-text tracking-tight">
              Plans & Subscriptions
            </h1>
            <p className="text-xs text-admin-muted mt-1">
              Manage plans, billing and merchant subscriptions
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-admin-surface hover:bg-admin-bg text-admin-secondary text-xs font-semibold rounded-xl border border-admin-border shadow-xs transition cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-admin-accent' : ''}`}
              />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-admin-primary text-admin-on-primary text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Plan</span>
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedbackMessage && (
          <div
            className={`p-4 rounded-2xl text-xs font-semibold flex items-center gap-2.5 animate-in fade-in ${
              feedbackMessage.type === 'success'
                ? 'bg-admin-soft border border-admin-border text-admin-accent'
                : 'bg-admin-danger-soft border border-admin-border text-admin-danger'
            }`}
          >
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-admin-accent shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-admin-danger shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
        )}

        {/* 2. REAL POSTGRESQL-BACKED SUBSCRIPTION KPI ROW */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Subscriptions */}
          <div className="bg-admin-surface p-4 rounded-2xl border border-admin-border shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-admin-muted uppercase tracking-wider block">
                Active Subscriptions
              </span>
              <span className="text-2xl font-black text-admin-text block tabular-nums">
                {kpis ? kpis.activeSubscriptions : 0}
              </span>
              <span className="text-[10px] text-admin-muted block">
                Platform-wide live SaaS tiers
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-emerald-500" />
            </div>
          </div>

          {/* Paid Revenue */}
          <div className="bg-admin-surface p-4 rounded-2xl border border-admin-border shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-admin-muted uppercase tracking-wider block">
                Paid Revenue
              </span>
              <span className="text-2xl font-black font-mono text-admin-text block tabular-nums">
                {kpis ? formatPaise(kpis.paidRevenuePaise) : '₹0'}
              </span>
              <span className="text-[10px] text-admin-muted block">
                SaaS subscription revenue
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-admin-accent/10 border border-admin-accent/20 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5 text-admin-accent" />
            </div>
          </div>

          {/* Expiring Soon */}
          <div className="bg-admin-surface p-4 rounded-2xl border border-admin-border shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-admin-muted uppercase tracking-wider block">
                Expiring Soon
              </span>
              <span className="text-2xl font-black text-admin-text block tabular-nums">
                {kpis ? kpis.expiringSoon : 0}
              </span>
              <span className="text-[10px] text-admin-muted block">
                Valid through next 7 days
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
          </div>

          {/* Failed / Pending Payments */}
          <div className="bg-admin-surface p-4 rounded-2xl border border-admin-border shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-admin-muted uppercase tracking-wider block">
                Failed Payments
              </span>
              <span className="text-2xl font-black text-admin-text block tabular-nums">
                {kpis ? kpis.failedPayments : 0}
              </span>
              <span className="text-[10px] text-admin-muted block">
                Requires administrative attention
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
          </div>
        </div>

        {/* 3 & 4. PLANS SECTION WITH CONSISTENT CARD DIMENSIONS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-admin-text">Configured SaaS Tiers</h2>
            <span className="text-xs text-admin-muted">
              Sorted by price ascending · Contact tier placed last
            </span>
          </div>

          {loadError ? (
            <Feedback error={loadError} onRetry={loadData} />
          ) : loading ? (
            <div className="p-16 text-center text-xs text-admin-muted bg-admin-surface rounded-3xl border border-admin-border">
              <span className="w-5 h-5 border-2 border-admin-border border-t-transparent rounded-full animate-spin inline-block mr-2" />
              Loading subscription tiers...
            </div>
          ) : plans.length === 0 ? (
            <div className="p-16 text-center bg-admin-surface rounded-3xl border border-admin-border space-y-3">
              <CreditCard className="w-8 h-8 text-admin-muted mx-auto" />
              <h3 className="font-bold text-admin-secondary text-sm">
                No Subscription Plans Configured
              </h3>
              <p className="text-xs text-admin-muted max-w-sm mx-auto">
                Create your first SaaS subscription tier so merchants can choose
                and subscribe to your platform.
              </p>
              <button
                onClick={handleOpenCreateModal}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-admin-primary text-admin-on-primary rounded-xl text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Plan</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
              {plans.map((p) => {
                const isCustomContact =
                  p.availability === 'CONTACT' || p.code === 'CUSTOM' || p.pricePaise <= 0;
                const isComingSoon = p.availability === 'COMING_SOON';

                return (
                  <div
                    key={p.id}
                    className="bg-admin-surface rounded-2xl border border-admin-border shadow-xs overflow-hidden flex flex-col justify-between hover:shadow-md transition-all h-full"
                  >
                    {/* Top Content Area */}
                    <div className="p-5 space-y-4 flex-1">
                      {/* Header with Title & subtle Code */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-black text-lg text-admin-text truncate">
                            {p.name}
                          </h3>
                          <span className="text-[10px] font-mono text-admin-muted tracking-wider block mt-0.5">
                            CODE: {p.code}
                          </span>
                        </div>
                        {/* Status / Availability Pill */}
                        <div>
                          {isComingSoon ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              Coming Soon
                            </span>
                          ) : isCustomContact ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              Custom Quote
                            </span>
                          ) : p.purchasable ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              Purchasable
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-admin-raised text-admin-muted border border-admin-border">
                              Hidden
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Standard Pricing Area: Height-Consistent */}
                      <div className="h-14 flex flex-col justify-center border-b border-admin-border/50 pb-2">
                        {isCustomContact ? (
                          <div>
                            <span className="text-xl font-black text-admin-text block">
                              Contact Aikyam
                            </span>
                            <span className="text-[11px] font-medium text-admin-muted block">
                              Custom Quote
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-2xl font-black font-mono text-admin-text block">
                              {formatPaise(p.pricePaise)}
                            </span>
                            <span className="text-[11px] font-medium text-admin-muted block">
                              /{p.billingCycle.toLowerCase()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Description & Availability Summary (consistent 44px height) */}
                      <div className="h-11">
                        <p className="text-xs text-admin-muted line-clamp-2 leading-relaxed">
                          {p.description || 'Standard subscription tier with defined catalog boundaries.'}
                        </p>
                      </div>

                      {/* Feature Caps List: Height-Consistent */}
                      <div className="space-y-2 pt-2 border-t border-admin-border/50 text-xs text-admin-secondary">
                        <div className="flex items-center justify-between">
                          <span className="text-admin-muted flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-admin-muted" />
                            <span>Product Catalog:</span>
                          </span>
                          <span className="font-bold font-mono text-admin-text">
                            Up to {p.maxProducts} items
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-admin-muted flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-admin-muted" />
                            <span>Staff Accounts:</span>
                          </span>
                          <span className="font-bold font-mono text-admin-text">
                            {p.maxStaff} members
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-admin-muted flex items-center gap-1.5">
                            <HardDrive className="w-3.5 h-3.5 text-admin-muted" />
                            <span>Media Storage:</span>
                          </span>
                          <span className="font-bold font-mono text-admin-text">
                            {p.maxStorageMb >= 1024
                              ? `${p.maxStorageMb / 1024} GB`
                              : `${p.maxStorageMb} MB`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-admin-muted flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-admin-muted" />
                            <span>Custom Domain:</span>
                          </span>
                          <span
                            className={`font-semibold ${p.customDomainAllowed ? 'text-admin-accent' : 'text-admin-muted'}`}
                          >
                            {p.customDomainAllowed ? 'Included' : 'Not Allowed'}
                          </span>
                        </div>
                      </div>

                      {/* Admin-defined Highlights */}
                      {p.highlights && p.highlights.length > 0 && (
                        <div className="pt-2 border-t border-admin-border/50 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-admin-muted">
                            Highlights ({p.highlights.length})
                          </span>
                          <ul className="space-y-1">
                            {p.highlights.slice(0, 4).map((h, i) => (
                              <li key={i} className="text-[11px] text-admin-secondary flex items-start gap-1.5 truncate">
                                <Check className="w-3 h-3 text-admin-accent shrink-0 mt-0.5" />
                                <span className="truncate">{h.text}</span>
                              </li>
                            ))}
                            {p.highlights.length > 4 && (
                              <span className="text-[10px] text-admin-muted block pl-4">
                                +{p.highlights.length - 4} more
                              </span>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Card Footer: Real merchant counts & actions */}
                    <div className="p-3.5 bg-admin-raised/40 border-t border-admin-border flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-admin-muted">
                        merchants: <strong className="text-admin-text font-bold">{p.merchantCount}</strong>
                        {p.activeSubscribersCount !== p.merchantCount && (
                          <span className="text-[10px] ml-1">({p.activeSubscribersCount} active)</span>
                        )}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(p)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-admin-surface hover:bg-admin-raised text-admin-secondary border border-admin-border transition cursor-pointer inline-flex items-center gap-1"
                          title="Edit Plan"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => handleDeletePlan(p)}
                          className="p-1.5 rounded-lg bg-admin-surface hover:bg-admin-danger-soft text-admin-muted hover:text-admin-danger border border-admin-border transition cursor-pointer"
                          title="Archive / Deactivate Plan"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 8. STRUCTURED CREATE / EDIT PLAN MODAL */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-admin-overlay backdrop-blur-sm animate-in fade-in">
            <div
              role="dialog"
              aria-modal="true"
              aria-label={
                isEditing
                  ? 'Edit Subscription Tier'
                  : 'Create New Subscription Tier'
              }
              className="bg-admin-surface rounded-3xl border border-admin-border shadow-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto animate-in zoom-in-95 duration-200"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-admin-border flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-admin-text">
                    {isEditing
                      ? 'Edit Subscription Tier'
                      : 'Create New Subscription Tier'}
                  </h2>
                  <p className="text-xs text-admin-muted mt-0.5">
                    Configure pricing, product boundaries, and merchant capabilities
                  </p>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-1.5 rounded-xl text-admin-muted hover:text-admin-secondary hover:bg-admin-raised transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form with 4 Clean Sections */}
              <form onSubmit={handleFormSubmit} className="p-6 space-y-5 text-xs">
                {formError && (
                  <div className="p-3 rounded-2xl bg-admin-danger-soft border border-admin-border text-admin-danger text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* SECTION 1: BASIC DETAILS */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-admin-accent flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    1. Basic Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-admin-secondary mb-1">
                        Plan Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Growth Tier"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-xl text-xs font-medium text-admin-text focus:outline-none focus:ring-2 focus:ring-admin-border focus:bg-admin-surface"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-admin-secondary mb-1">
                        Plan Code {!isEditing && '(Optional)'}
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. GROWTH_MONTHLY"
                        value={formData.code}
                        onChange={(e) =>
                          setFormData({ ...formData, code: e.target.value })
                        }
                        disabled={isEditing}
                        className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-xl text-xs font-mono text-admin-text focus:outline-none focus:ring-2 focus:ring-admin-border focus:bg-admin-surface disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-admin-secondary mb-1">
                      Description / Tagline
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Essential tools for growing regional retail businesses"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-xl text-xs font-medium text-admin-text focus:outline-none focus:ring-2 focus:ring-admin-border focus:bg-admin-surface"
                    />
                  </div>
                </div>

                {/* SECTION 2: PRICING */}
                <div className="space-y-3 pt-3 border-t border-admin-border">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-admin-accent flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    2. Pricing
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-admin-secondary mb-1">
                        Price in INR (₹) *
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="Price in rupees"
                        value={formData.priceRupees}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            priceRupees: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-xl text-xs font-medium text-admin-text focus:outline-none focus:ring-2 focus:ring-admin-border focus:bg-admin-surface"
                        required
                      />
                      <span className="text-[10px] text-admin-muted mt-0.5 block">
                        Changing price applies to future subscriptions only; historical invoices remain strictly immutable.
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-admin-secondary mb-1">
                        Billing Interval
                      </label>
                      <select
                        value={formData.billingCycle}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            billingCycle: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 bg-admin-bg border border-admin-border rounded-xl text-xs font-medium text-admin-text focus:outline-none focus:ring-2 focus:ring-admin-border focus:bg-admin-surface"
                      >
                        <option value="MONTHLY">Monthly</option>
                        <option value="YEARLY">Yearly</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: AVAILABILITY */}
                <div className="space-y-3 pt-3 border-t border-admin-border">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-admin-accent flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    3. Availability
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <label>GST (%)<input aria-label="GST rate" type="number" min="0" max="100" step="0.01" value={formData.gstRate} onChange={e => setFormData({ ...formData, gstRate: Number(e.target.value) })} className="w-full p-2 bg-admin-raised rounded" /></label>
                    <label>Status<select aria-label="Package status" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as PlanFormData['status'] })} className="w-full p-2 bg-admin-raised rounded"><option value="ACTIVE">Active</option><option value="COMING_SOON">Coming Soon</option><option value="CONTACT_SALES">Contact Sales</option><option value="INACTIVE">Inactive</option></select></label>
                    <label>Display order<input type="number" min="0" value={formData.displayOrder} onChange={e => setFormData({ ...formData, displayOrder: Number(e.target.value) })} className="w-full p-2 bg-admin-raised rounded" /></label>
                    <label>Badge<input maxLength={50} value={formData.badge} onChange={e => setFormData({ ...formData, badge: e.target.value })} className="w-full p-2 bg-admin-raised rounded" /></label>
                    <label><input type="checkbox" checked={formData.isPurchasable} onChange={e => setFormData({ ...formData, isPurchasable: e.target.checked })} /> Allow purchase when active</label>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-admin-secondary">
                      <input
                        type="checkbox"
                        checked={formData.isPublic}
                        onChange={(e) =>
                          setFormData({ ...formData, isPublic: e.target.checked })
                        }
                        className="w-4 h-4 text-admin-accent rounded focus:ring-admin-border"
                      />
                      <span>Visible to merchants</span>
                    </label>
                    <span className="text-[10px] text-admin-muted block pl-6">
                      Hidden, Coming Soon, and Contact Sales packages cannot be purchased.
                    </span>
                  </div>
                </div>

                {/* SECTION 4: PLAN HIGHLIGHTS */}
                <div className="space-y-3 pt-3 border-t border-admin-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-admin-accent flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      4. Plan Highlights
                    </h4>
                    <button
                      type="button"
                      onClick={handleAddHighlight}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-admin-raised hover:bg-admin-border text-admin-primary transition cursor-pointer inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Highlight</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-admin-muted">
                    Point-wise merchant-facing bullets displayed on the subscription card. There are no hardcoded bullets.
                  </p>

                  {formData.highlights.length === 0 ? (
                    <div className="p-3 rounded-xl border border-dashed border-admin-border text-center text-admin-muted text-xs">
                      No highlights added yet. Click &ldquo;+ Add Highlight&rdquo; to add merchant-facing benefit points.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formData.highlights.map((h, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-admin-muted w-5 shrink-0 text-right">
                            {idx + 1}.
                          </span>
                          <input
                            type="text"
                            placeholder="e.g. 0% transaction fees on all orders"
                            value={h.text}
                            onChange={(e) => handleUpdateHighlightText(idx, e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-admin-bg border border-admin-border rounded-xl text-xs font-medium text-admin-text focus:outline-none focus:ring-2 focus:ring-admin-border focus:bg-admin-surface"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveHighlight(idx, 'UP')}
                              className="p-1 rounded-lg text-admin-muted hover:text-admin-secondary hover:bg-admin-raised disabled:opacity-30 cursor-pointer"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === formData.highlights.length - 1}
                              onClick={() => handleMoveHighlight(idx, 'DOWN')}
                              className="p-1 rounded-lg text-admin-muted hover:text-admin-secondary hover:bg-admin-raised disabled:opacity-30 cursor-pointer"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteHighlight(idx)}
                              className="p-1 rounded-lg text-admin-muted hover:text-admin-danger hover:bg-admin-danger-soft cursor-pointer"
                              title="Delete Highlight"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SECTION 5: OPERATIONAL LIMITS */}
                <div className="space-y-3 pt-3 border-t border-admin-border">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-admin-accent flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    5. Operational Limits (Backend Enforcement)
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-admin-secondary mb-1">
                        Product Count
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.maxProducts}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            maxProducts: Number(e.target.value),
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-admin-bg border border-admin-border rounded-xl text-xs text-admin-text font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-admin-secondary mb-1">
                        Staff Seats
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.maxStaff}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            maxStaff: Number(e.target.value),
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-admin-bg border border-admin-border rounded-xl text-xs text-admin-text font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-admin-secondary mb-1">
                        Storage (MB)
                      </label>
                      <input
                        type="number"
                        min="100"
                        value={formData.maxStorageMb}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            maxStorageMb: Number(e.target.value),
                          })
                        }
                        className="w-full px-2.5 py-1.5 bg-admin-bg border border-admin-border rounded-xl text-xs text-admin-text font-mono"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-admin-secondary pt-1">
                    <input
                      type="checkbox"
                      checked={formData.customDomainAllowed}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          customDomainAllowed: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-admin-accent rounded focus:ring-admin-border"
                    />
                    <span>Allow Custom Domain Mapping (e.g. mystore.com)</span>
                  </label>
                </div>

                {/* Action Buttons */}
                <div className="pt-4 border-t border-admin-border flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-admin-secondary hover:bg-admin-raised transition cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-admin-primary hover:bg-admin-primary text-admin-on-primary shadow-md transition disabled:opacity-60 cursor-pointer"
                  >
                    {submitting
                      ? 'Saving Plan...'
                      : isEditing
                        ? 'Update Plan'
                        : 'Create Plan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MERCHANT SUBSCRIPTIONS TABLE & TOOLBAR */}
        <SubscriptionList
          tenantId={
            typeof router.query.tenantId === 'string'
              ? router.query.tenantId
              : undefined
          }
        />
      </div>
    </AdminLayout>
  );
}
