import React, { useState, useEffect } from 'react';
import { getStorefrontUrl } from '../utils/config';
import { useRouter } from 'next/router';
import { useAuth, apiClient } from '../context/AuthContext';
import { Smartphone, Lock, KeyRound, ArrowRight, Store, RefreshCw, ShieldCheck, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { IndianPhoneInput } from '../components/IndianPhoneInput';
import { isValidIndianPhone, isValidPin } from '@simply/validation';
import { ThemeToggle } from '../components/ui/MerchantUi';
import { useActionNotification } from '../hooks/useActionNotification';

type AuthMode =
  | 'PIN_LOGIN'
  | 'REGISTER_OTP'
  | 'REGISTER_VERIFY'
  | 'REGISTER_PIN'
  | 'RECOVERY_OTP'
  | 'RECOVERY_VERIFY'
  | 'RECOVERY_PIN';

export default function LoginPage({ initialMode }: { initialMode?: AuthMode } = {}) {
  const [mode, setMode] = useState<AuthMode>(initialMode || 'PIN_LOGIN');
  const [phone, setPhone] = useState('');
  const [registrationEmail, setRegistrationEmail] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resendUntil, setResendUntil] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [phoneValid, setPhoneValid] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [showLoginPin, setShowLoginPin] = useState(false);
  const [otp, setOtp] = useState('');
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notification, notify, clearNotification } = useActionNotification();
  const [accountExists, setAccountExists] = useState(false);

  const { user, store, loading: authLoading, login } = useAuth();
  const router = useRouter();
  const [homeUrl, setHomeUrl] = useState('/');
  useEffect(() => setHomeUrl(`${getStorefrontUrl()}/`), []);
  useEffect(() => {
    const tick = () => setResendSeconds(Math.max(0, Math.ceil((resendUntil - Date.now()) / 1000)));
    tick(); const interval = setInterval(tick, 1000); return () => clearInterval(interval);
  }, [resendUntil]);

  // Route protection: authenticated users must not see login or registration again
  useEffect(() => {
    if (!authLoading && user) {
      if (store) {
        router.replace('/');
      } else {
        router.replace('/onboarding');
      }
    }
  }, [authLoading, user, store, router]);

  useEffect(() => {
    if (!router.isReady) return;
    setMode(router.pathname === '/register' || router.query.mode === 'register'
      ? 'REGISTER_OTP' : router.query.mode === 'recovery' ? 'RECOVERY_OTP' : 'PIN_LOGIN');
  }, [router.isReady, router.pathname, router.query.mode]);

  // Clean PIN state on mode change
  const resetFormState = (newMode: AuthMode) => {
    setError(null);
    clearNotification();
    setAccountExists(false);
    setPin('');
    setConfirmPin('');
    setShowPin(false);
    setShowConfirmPin(false);
    setShowLoginPin(false);
    setMode(newMode);
    const destination = newMode === 'PIN_LOGIN' ? '/login' : newMode.startsWith('REGISTER') ? '/register' : '/login?mode=recovery';
    if (router.asPath !== destination) void router.replace(destination, undefined, { shallow: true });
  };

  const switchToPinLogin = () => {
    resetFormState('PIN_LOGIN');
    setTimeout(() => {
      document.getElementById('login-pin')?.focus();
    }, 50);
  };

  // 1. PIN Login (Returning Seller)
  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearNotification();

    if (!isValidIndianPhone(phone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (!isValidPin(pin)) {
      setError('PIN must be exactly 6 digits.');
      return;
    }

    setLoading(true);

    try {
      const data = await apiClient.auth.loginWithPin(phone, pin);
      login(data.accessToken, data.user, data.store, data.refreshToken);
      if (!data.store) {
        router.push('/onboarding');
      } else {
        router.push('/');
      }
    } catch (err: any) {
      if (err.code === 'PIN_LOCKED') {
        notify('error', err.message || 'Account temporarily locked due to too many failed attempts. Please use PIN Recovery.');
      } else if (err.code === 'PIN_INVALID') {
        notify('error', err.message || 'Invalid phone number or PIN. Please verify your credentials.');
      } else {
        notify('error', err.message || 'Login failed. Please verify your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. Request OTP for Registration
  const handleRequestRegisterOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearNotification();

    if (!isValidIndianPhone(phone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registrationEmail.trim())) { setError('Invalid email address'); return; }

    setLoading(true);

    try {
      const result = await apiClient.auth.requestRegisterOtp(phone, registrationEmail.trim().toLowerCase());
      setMaskedEmail(result.maskedEmail || `${registrationEmail.trim()[0]}***@${registrationEmail.trim().split('@')[1]}`);
      setResendUntil(Date.now() + (result.resendAfterSeconds || 60) * 1000);
      setOtp('');
      setAccountExists(false);
      setMode('REGISTER_VERIFY');
      notify('success', result.message || 'Verification code sent to your email.');
    } catch (err: any) {
      if (err.code === 'ACCOUNT_EXISTS' || err.status === 409) {
        setAccountExists(true);
        setError(null);
        clearNotification();
      } else {
        setAccountExists(false);
        notify('error', err.message || 'Failed to send registration OTP.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 3. Verify OTP for Registration
  const handleVerifyRegisterOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearNotification();
    setLoading(true);

    try {
      const res = await apiClient.auth.verifyRegisterOtp(phone, otp, registrationEmail.trim().toLowerCase());
      setTempToken(res.tempToken || null);
      setPin('');
      setConfirmPin('');
      setMode('REGISTER_PIN');
      clearNotification();
    } catch (err: any) {
      notify('error', err.message || 'Invalid or expired OTP.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Setup PIN & Complete Registration
  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearNotification();

    if (!isValidPin(pin)) {
      setError('PIN must be exactly 6 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }

    setLoading(true);

    try {
      const data = await apiClient.auth.setupPin(pin, tempToken || undefined);
      login(data.accessToken, data.user, data.store, data.refreshToken);
      if (!data.store) {
        router.push('/onboarding');
      } else {
        router.push('/');
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to setup PIN.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Request OTP for Recovery (Forgot PIN)
  const handleRequestRecoveryOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearNotification();

    if (!isValidIndianPhone(phone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);

    try {
      const result = await apiClient.auth.requestRecoveryOtp(phone);
      setMaskedEmail(result.maskedEmail || phone);
      setMode('RECOVERY_VERIFY');
      notify('success', result.message || 'Recovery code sent to your registered contact.');
    } catch (err: any) {
      notify('error', err.message || 'Failed to send recovery OTP.');
    } finally {
      setLoading(false);
    }
  };

  // 6. Verify OTP for Recovery
  const handleVerifyRecoveryOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearNotification();
    setLoading(true);

    try {
      const res = await apiClient.auth.verifyRecoveryOtp(phone, otp);
      setTempToken(res.tempToken || null);
      setPin('');
      setConfirmPin('');
      setMode('RECOVERY_PIN');
      clearNotification();
    } catch (err: any) {
      notify('error', err.message || 'Invalid or expired OTP.');
    } finally {
      setLoading(false);
    }
  };

  // 7. Reset PIN (Recovery)
  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearNotification();

    if (!isValidPin(pin)) {
      setError('PIN must be exactly 6 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }

    setLoading(true);

    try {
      const data = await apiClient.auth.setupPin(pin, tempToken || undefined);
      login(data.accessToken, data.user, data.store, data.refreshToken);
      if (!data.store) {
        router.push('/onboarding');
      } else {
        router.push('/');
      }
    } catch (err: any) {
      notify('error', err.message || 'Failed to reset PIN.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center transition-colors duration-200"
        style={{ backgroundColor: 'var(--merchant-bg)', color: 'var(--merchant-text)' }}
      >
        <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--merchant-primary)' }} />
      </div>
    );
  }

  const inputStyle = {
    backgroundColor: 'var(--merchant-input-bg)',
    borderColor: 'var(--merchant-input-border)',
    color: 'var(--merchant-text)',
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative transition-colors duration-200"
      style={{ backgroundColor: 'var(--merchant-bg)', color: 'var(--merchant-text)' }}
    >
      {/* Theme Toggle Top-Right */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Brand Logo & Header */}
        <div className="text-center">
          <a href={homeUrl} aria-label="Go to LetzShop home" className="inline-flex items-center justify-center rounded-xl bg-white p-2 mb-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
            <img src="/images/letzshop-logo.png" alt="LetzShop" width={180} height={64} className="h-12 w-auto object-contain" />
          </a>
          <p className="mt-1 text-sm" style={{ color: 'var(--merchant-text-muted)' }}>
            Merchant Operations Portal
          </p>
        </div>

        {/* Card */}
        <div
          className="mt-6 border py-8 px-6 shadow-xl rounded-2xl sm:px-10 transition-colors duration-200"
          style={{ backgroundColor: 'var(--merchant-surface)', borderColor: 'var(--merchant-border)' }}
        >
          {error && (
            <div role="alert" data-field-validation className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          {notification && (
            <div data-action-notification role={notification.type === 'error' ? 'alert' : 'status'} className={`mb-5 p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${notification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
              {notification.type === 'success' && <CheckCircle className="w-4 h-4 shrink-0" />}
              <span>{notification.message}</span>
            </div>
          )}

          {/* MODE 1: Standard PIN Login (Returning Merchant) */}
          {mode === 'PIN_LOGIN' && (
            <form onSubmit={handlePinLogin} className="space-y-4">
              <IndianPhoneInput
                id="login-phone"
                label="Registered Mobile Number"
                value={phone}
                onChange={(canonical, raw10, valid) => {
                  setPhone(canonical);
                  setPhoneValid(valid);
                }}
                required
              />

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-pin" className="block text-xs font-medium" style={{ color: 'var(--merchant-text-secondary)' }}>
                    Security PIN (6 Digits)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      resetFormState('RECOVERY_OTP');
                    }}
                    className="text-xs hover:underline font-medium"
                    style={{ color: 'var(--merchant-primary)' }}
                  >
                    Forgot PIN?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--merchant-text-muted)' }}>
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="login-pin"
                    type={showLoginPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    style={inputStyle}
                    className="block w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm placeholder:opacity-40 tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-[var(--merchant-focus-ring)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPin(!showLoginPin)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center opacity-60 hover:opacity-100"
                    style={{ color: 'var(--merchant-text)' }}
                    aria-label={showLoginPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showLoginPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pin.length > 0 && pin.length < 6 && (
                  <p className="mt-1 text-xs text-rose-400 font-medium">PIN must be exactly 6 digits.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !isValidIndianPhone(phone) || !isValidPin(pin)}
                style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm mt-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'Log In to Dashboard'}
              </button>

              <div className="pt-4 border-t text-center" style={{ borderColor: 'var(--merchant-border)' }}>
                <p className="text-xs" style={{ color: 'var(--merchant-text-muted)' }}>
                  New seller?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      resetFormState('REGISTER_OTP');
                    }}
                    className="font-semibold hover:underline"
                    style={{ color: 'var(--merchant-primary)' }}
                  >
                    Register with Email OTP
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* MODE 2: Registration - Enter Mobile */}
          {mode === 'REGISTER_OTP' && (
            <form onSubmit={handleRequestRegisterOtp} className="space-y-4">
              {accountExists && (
                <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/30 space-y-3" style={{ color: 'var(--merchant-text)' }}>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-violet-500/20 shrink-0 mt-0.5" style={{ color: 'var(--merchant-primary)' }}>
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold" style={{ color: 'var(--merchant-text)' }}>Account already exists</h3>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--merchant-text-secondary)' }}>
                        An account is already registered with this mobile number. Log in with your 6-digit PIN.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      onClick={switchToPinLogin}
                      style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                      className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm text-center"
                    >
                      Log In with PIN
                    </button>
                    <button
                      type="button"
                      onClick={() => resetFormState('RECOVERY_OTP')}
                      style={{ backgroundColor: 'var(--merchant-surface-raised)', borderColor: 'var(--merchant-border)', color: 'var(--merchant-text)' }}
                      className="py-2 px-3 rounded-lg text-xs font-medium border hover:opacity-90 transition-opacity text-center"
                    >
                      Forgot PIN?
                    </button>
                  </div>
                </div>
              )}

              <div>
                <IndianPhoneInput
                  id="register-phone"
                  label="Mobile Number for Registration"
                  value={phone}
                  onChange={(canonical, raw10, valid) => {
                    setPhone(canonical);
                    setPhoneValid(valid);
                    if (accountExists) setAccountExists(false);
                  }}
                  required
                />
                <p className="mt-1.5 text-[11px]" style={{ color: 'var(--merchant-text-muted)' }}>
                  A one-time verification code will be sent to your email.
                </p>
              </div>

              <div>
                <label htmlFor="register-email" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--merchant-text-secondary)' }}>Email Address</label>
                <input id="register-email" type="email" autoComplete="email" required maxLength={254}
                  value={registrationEmail} onChange={e => setRegistrationEmail(e.target.value)}
                  style={inputStyle} className="w-full px-3 py-2.5 border rounded-lg text-sm" />
              </div>

              <button
                type="submit"
                disabled={loading || !isValidIndianPhone(phone)}
                style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'Send Verification OTP'}
              </button>

              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    resetFormState('PIN_LOGIN');
                  }}
                  className="text-xs hover:underline"
                  style={{ color: 'var(--merchant-text-muted)' }}
                >
                  ← Back to PIN Login
                </button>
              </div>
            </form>
          )}

          {/* MODE 3: Registration - Verify OTP */}
          {mode === 'REGISTER_VERIFY' && (
            <form onSubmit={handleVerifyRegisterOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--merchant-text-secondary)' }}>
                  Enter 6-Digit OTP sent to {maskedEmail}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--merchant-text-muted)' }}>
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    style={inputStyle}
                    className="block w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm tracking-widest text-center font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[var(--merchant-focus-ring)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'Verify Code'}
              </button>

              <p className="text-xs" data-testid="otp-sent-destination">Verification code sent to {maskedEmail}</p>
              <button type="button" disabled={loading || resendSeconds > 0} onClick={handleRequestRegisterOtp}
                className="text-xs disabled:opacity-50" style={{ color: 'var(--merchant-primary)' }}>
                {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
              </button>
              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    resetFormState('REGISTER_OTP');
                  }}
                  className="text-xs hover:underline"
                  style={{ color: 'var(--merchant-text-muted)' }}
                >
                  Change Email / Mobile
                </button>
              </div>
            </form>
          )}

          {/* MODE 4: Registration - Create Security PIN */}
          {mode === 'REGISTER_PIN' && (
            <form onSubmit={handleSetupPin} className="space-y-4">
              <div className="text-left mb-2">
                <h2 className="text-base font-bold mb-1" style={{ color: 'var(--merchant-text)' }}>Add PIN for easy access</h2>
                <p className="text-xs" style={{ color: 'var(--merchant-text-muted)' }}>
                  Create a 6-digit PIN. You&apos;ll use this for quick merchant login.
                </p>
              </div>

              {/* PIN Field */}
              <div>
                <label htmlFor="register-pin" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--merchant-text-secondary)' }}>
                  PIN
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--merchant-text-muted)' }}>
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="register-pin"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    maxLength={6}
                    value={pin}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setPin(clean);
                    }}
                    placeholder="••••••"
                    style={inputStyle}
                    className="block w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm placeholder:opacity-40 tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-[var(--merchant-focus-ring)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center opacity-60 hover:opacity-100"
                    style={{ color: 'var(--merchant-text)' }}
                    aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pin.length > 0 && pin.length < 6 && (
                  <p className="mt-1 text-xs text-rose-400 font-medium">PIN must be exactly 6 digits.</p>
                )}
              </div>

              {/* Confirm PIN Field */}
              <div>
                <label htmlFor="register-confirm-pin" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--merchant-text-secondary)' }}>
                  Confirm PIN
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--merchant-text-muted)' }}>
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="register-confirm-pin"
                    type={showConfirmPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setConfirmPin(clean);
                    }}
                    placeholder="••••••"
                    style={inputStyle}
                    className="block w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm placeholder:opacity-40 tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-[var(--merchant-focus-ring)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPin(!showConfirmPin)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center opacity-60 hover:opacity-100"
                    style={{ color: 'var(--merchant-text)' }}
                    aria-label={showConfirmPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showConfirmPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPin.length > 0 && confirmPin !== pin && (
                  <p className="mt-1 text-xs text-rose-400 font-medium">PINs do not match.</p>
                )}
                {confirmPin.length > 0 && confirmPin === pin && confirmPin.length < 6 && (
                  <p className="mt-1 text-xs text-rose-400 font-medium">PIN must be exactly 6 digits.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || pin.length !== 6 || confirmPin.length !== 6 || pin !== confirmPin}
                style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm mt-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'Set PIN'}
              </button>
            </form>
          )}

          {/* MODE 5: Recovery - Enter Mobile */}
          {mode === 'RECOVERY_OTP' && (
            <form onSubmit={handleRequestRecoveryOtp} className="space-y-4">
              <div>
                <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--merchant-text)' }}>Reset Your Security PIN</h2>
                <p className="text-xs mb-3" style={{ color: 'var(--merchant-text-muted)' }}>
                  Enter your registered mobile number. We will send an OTP to verify your identity.
                </p>
                <IndianPhoneInput
                  id="recovery-phone"
                  label="Registered Mobile Number"
                  value={phone}
                  onChange={(canonical, raw10, valid) => {
                    setPhone(canonical);
                    setPhoneValid(valid);
                  }}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !isValidIndianPhone(phone)}
                style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'Send Recovery OTP'}
              </button>

              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    resetFormState('PIN_LOGIN');
                  }}
                  className="text-xs hover:underline"
                  style={{ color: 'var(--merchant-text-muted)' }}
                >
                  ← Back to PIN Login
                </button>
              </div>
            </form>
          )}

          {/* MODE 6: Recovery - Verify OTP */}
          {mode === 'RECOVERY_VERIFY' && (
            <form onSubmit={handleVerifyRecoveryOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--merchant-text-secondary)' }}>
                  Enter 6-Digit Recovery OTP sent to {maskedEmail || phone}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--merchant-text-muted)' }}>
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    style={inputStyle}
                    className="block w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm tracking-widest text-center font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[var(--merchant-focus-ring)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'Verify Recovery OTP'}
              </button>

              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    resetFormState('RECOVERY_OTP');
                  }}
                  className="text-xs hover:underline"
                  style={{ color: 'var(--merchant-text-muted)' }}
                >
                  Change Mobile Number
                </button>
              </div>
            </form>
          )}

          {/* MODE 7: Recovery - Create New Security PIN */}
          {mode === 'RECOVERY_PIN' && (
            <form onSubmit={handleResetPin} className="space-y-4">
              <div className="text-left mb-2">
                <h2 className="text-base font-bold mb-1" style={{ color: 'var(--merchant-text)' }}>Reset Your Security PIN</h2>
                <p className="text-xs" style={{ color: 'var(--merchant-text-muted)' }}>
                  Create a new 6-digit PIN for your merchant account.
                </p>
              </div>

              {/* PIN Field */}
              <div>
                <label htmlFor="recovery-pin" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--merchant-text-secondary)' }}>
                  PIN
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--merchant-text-muted)' }}>
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="recovery-pin"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    maxLength={6}
                    value={pin}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setPin(clean);
                    }}
                    placeholder="••••••"
                    style={inputStyle}
                    className="block w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm placeholder:opacity-40 tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-[var(--merchant-focus-ring)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center opacity-60 hover:opacity-100"
                    style={{ color: 'var(--merchant-text)' }}
                    aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pin.length > 0 && pin.length < 6 && (
                  <p className="mt-1 text-xs text-rose-400 font-medium">PIN must be exactly 6 digits.</p>
                )}
              </div>

              {/* Confirm PIN Field */}
              <div>
                <label htmlFor="recovery-confirm-pin" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--merchant-text-secondary)' }}>
                  Confirm PIN
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--merchant-text-muted)' }}>
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="recovery-confirm-pin"
                    type={showConfirmPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setConfirmPin(clean);
                    }}
                    placeholder="••••••"
                    style={inputStyle}
                    className="block w-full pl-9 pr-10 py-2.5 border rounded-lg text-sm placeholder:opacity-40 tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-[var(--merchant-focus-ring)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPin(!showConfirmPin)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center opacity-60 hover:opacity-100"
                    style={{ color: 'var(--merchant-text)' }}
                    aria-label={showConfirmPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showConfirmPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPin.length > 0 && confirmPin !== pin && (
                  <p className="mt-1 text-xs text-rose-400 font-medium">PINs do not match.</p>
                )}
                {confirmPin.length > 0 && confirmPin === pin && confirmPin.length < 6 && (
                  <p className="mt-1 text-xs text-rose-400 font-medium">PIN must be exactly 6 digits.</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || pin.length !== 6 || confirmPin.length !== 6 || pin !== confirmPin}
                style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm mt-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'Set New PIN & Log In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
