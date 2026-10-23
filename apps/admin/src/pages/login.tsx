import React, { useState } from 'react';
import Head from 'next/head';
import { errorMessage } from '../components/AdminUI';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { AdminThemeToggle } from '../context/AdminThemeContext';
import { useAdminAuth } from '../context/AdminAuthContext';
export default function Login() {
  const { login } = useAdminAuth();
  const [identifier, setIdentifier] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [visible, setVisible] = useState(false);
  return (
    <>
      <Head>
        <title>LetzShop Admin — Login</title>
      </Head>
      <main className="min-h-screen flex items-center justify-center bg-admin-bg px-4 py-12">
        <div className="w-full max-w-sm rounded-2xl bg-admin-surface p-7 shadow-xl">
          <div className="flex justify-end mb-3">
            <AdminThemeToggle />
          </div>
          <ShieldCheck className="h-10 w-10 text-admin-accent mb-4" />
          <h1 className="text-2xl font-bold">LetzShop Admin</h1>
          <p className="mt-2 mb-6 text-sm text-admin-muted">
            Sign in to manage the platform.
          </p>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await login(identifier.trim(), password);
              } catch (err: unknown) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-admin-danger-soft text-admin-danger p-3 text-sm"
              >
                {error}
              </p>
            )}
            <label className="block text-sm font-medium">
              Email / Phone
              <input
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                disabled={busy}
                className="admin-input mt-1"
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <div className="relative mt-1">
                <input
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={busy}
                  className="admin-input pr-12"
                />
                <button
                  type="button"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  onClick={() => setVisible(!visible)}
                  className="absolute right-3 top-2.5"
                >
                  {visible ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>
            <button className="admin-button w-full" disabled={busy}>
              {busy ? 'Logging in…' : 'Login'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
