import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Menu, X, LogOut } from 'lucide-react';
import { AdminThemeToggle } from '../context/AdminThemeContext';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useAdminAttention } from '../context/AdminAttentionContext';

interface NavItem {
  label: string;
  href: string;
  badgeKey?: 'suspendedStores' | 'reviewReports' | 'failedPayments';
  requiredPermission?: string;
}

const nav: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  { label: 'Merchants', href: '/merchants', badgeKey: 'suspendedStores', requiredPermission: 'MERCHANTS_VIEW' },
  { label: 'Orders', href: '/orders', requiredPermission: 'ORDERS_VIEW' },
  { label: 'Reviews & Reports', href: '/reviews', badgeKey: 'reviewReports', requiredPermission: 'REVIEWS_VIEW' },
  { label: 'Subscriptions', href: '/billing', requiredPermission: 'SUBSCRIPTIONS_VIEW' },
  { label: 'Payments', href: '/payments', badgeKey: 'failedPayments', requiredPermission: 'PAYMENTS_VIEW' },
  { label: 'Users', href: '/users', requiredPermission: 'USERS_VIEW' },
  { label: 'Analytics', href: '/analytics', requiredPermission: 'ANALYTICS_VIEW' },
  { label: 'Settings', href: '/settings', requiredPermission: 'SETTINGS_VIEW' },
  { label: 'Sub Admins', href: '/sub-admins', requiredPermission: 'SUB_ADMINS_MANAGE' },
  { label: 'Audit Logs', href: '/audit-logs', requiredPermission: 'AUDIT_LOGS_VIEW' },
];

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, logout } = useAdminAuth(),
    { attention } = useAdminAttention(),
    router = useRouter(),
    [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-admin-bg">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 bg-admin-header px-4 text-white">
        <div className="flex items-center gap-3">
          <AdminThemeToggle />
          <button
            className="md:hidden p-2"
            aria-label="Toggle admin navigation"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
          <Link
            href="/"
            className="font-bold tracking-wide text-sm sm:text-base text-white"
          >
            LETZSHOP ADMIN
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs text-slate-200 font-medium">
              {user?.fullName || user?.email || user?.phone || 'Platform Admin'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono uppercase">
              {user?.isSuperAdmin ? 'Super Admin' : 'Delegated Admin'}
            </span>
          </div>
          <button
            onClick={() => void logout()}
            className="flex items-center gap-2 rounded-lg bg-admin-primary text-admin-on-primary px-3 py-2 text-xs"
            aria-label="Logout"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>
      <div className="flex min-w-0">
        <aside
          aria-label="Admin navigation"
          className={`${open ? 'block' : 'hidden'} fixed inset-y-16 left-0 z-30 w-56 overflow-y-auto border-r bg-admin-surface p-4 md:sticky md:top-16 md:block md:h-[calc(100dvh-4rem)] md:shrink-0`}
        >
          <nav className="space-y-1">
            {nav
              .filter((item) => {
                if (!item.requiredPermission) return true;
                if (user?.isSuperAdmin) return true;
                return Boolean(user?.adminPermissions?.includes(item.requiredPermission));
              })
              .map(({ label, href, badgeKey }) => {
                const count = badgeKey && attention ? attention[badgeKey] : 0;
                const isActive =
                  href === '/'
                    ? router.pathname === '/'
                    : router.pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-admin-soft text-admin-accent'
                      : 'text-admin-secondary hover:bg-admin-raised hover:text-admin-text'
                  }`}
                >
                  <span>{label}</span>
                  {count > 0 && (
                    <span
                      data-badge-for={label}
                      className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 tabular-nums ml-2"
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0 flex-1 flex flex-col min-h-[calc(100dvh-4rem)]">
          <main className="min-w-0 flex-1 max-w-7xl w-full mx-auto p-4 lg:p-7">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};
