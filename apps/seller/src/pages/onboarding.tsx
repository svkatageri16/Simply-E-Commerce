import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth, apiClient } from '../context/AuthContext';
import {
  Store,
  ArrowRight,
  CheckCircle,
  Building2,
  Tag,
  Upload,
  RefreshCw,
} from 'lucide-react';
import {
  getIndianStateNames,
  getCitiesForState,
  OTHER_CITY_OPTION,
  isValidIndianPhone,
  isValidEmail,
  isValidBusinessName,
} from '@simply/validation';
import { IndianPhoneInput } from '../components/IndianPhoneInput';
import { SearchableSelect } from '../components/SearchableSelect';
import { ThemeToggle } from '../components/ui/MerchantUi';
import { getPublicStoreUrl } from '@simply/types';
import { getStorefrontUrl } from '../utils/config';

const CATEGORIES = [
  'Fashion',
  'Jewellery',
  'Beauty',
  'Food',
  'Grocery',
  'Furniture',
  'Manufacturing / Industrial',
  'Electronics',
  'General Retail',
  'Other',
];

export default function OnboardingPage() {
  const { user, store, loading: authLoading, login } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [businessName, setBusinessName] = useState('');
  const [businessNameTouched, setBusinessNameTouched] = useState(false);
  const [slugSuggestion, setSlugSuggestion] = useState<{ slug: string; available: boolean } | null>(null);
  useEffect(() => {
    setSlugSuggestion(null);
    if (!isValidBusinessName(businessName)) return;
    let current = true;
    const timer = setTimeout(() => {
      apiClient.stores.slugAvailability(businessName.trim()).then((result: any) => {
        if (current) setSlugSuggestion(result);
      }).catch(() => { /* The database reserves the URL on submission. */ });
    }, 400);
    return () => { current = false; clearTimeout(timer); };
  }, [businessName]);
  const [category, setCategory] = useState('Fashion');
  const [logoUrl, setLogoUrl] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [selectedState, setSelectedState] = useState('');
  const [stateTouched, setStateTouched] = useState(false);
  const [selectedCity, setSelectedCity] = useState('');
  const [cityTouched, setCityTouched] = useState(false);
  const [customCity, setCustomCity] = useState('');
  const [customCityTouched, setCustomCityTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createdStore, setCreatedStore] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const indianStates = getIndianStateNames();
  const availableCities = selectedState ? getCitiesForState(selectedState) : [];

  // Route protection & state determination
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (!authLoading && user && store) {
      router.push('/');
      return;
    }

    if (user?.phone && !contactPhone) {
      setContactPhone(user.phone);
    }
  }, [authLoading, user, store]);

  // Restore draft onboarding progress if available
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const draft = sessionStorage.getItem('simply_onboarding_draft');
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.businessName) setBusinessName(parsed.businessName);
        if (parsed.category) setCategory(parsed.category);
        if (parsed.logoUrl) setLogoUrl(parsed.logoUrl);
        if (parsed.contactPhone) setContactPhone(parsed.contactPhone);
        if (parsed.contactEmail) setContactEmail(parsed.contactEmail);
        if (parsed.selectedState) setSelectedState(parsed.selectedState);
        if (parsed.selectedCity) setSelectedCity(parsed.selectedCity);
        if (parsed.customCity) setCustomCity(parsed.customCity);
        if (parsed.step && parsed.step >= 1 && parsed.step <= 4) setStep(parsed.step);
      }
    } catch {
      // Ignore sessionStorage parsing errors
    }
  }, []);

  // Save draft state on progress change
  const saveDraft = (updatedStep: 1 | 2 | 3 | 4) => {
    setStep(updatedStep);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(
          'simply_onboarding_draft',
          JSON.stringify({
            step: updatedStep,
            businessName,
            category,
            logoUrl,
            contactPhone,
            contactEmail,
            selectedState,
            selectedCity,
            customCity,
          })
        );
      } catch {
        // Ignore storage errors
      }
    }
  };

  const handleStateChange = (newState: string) => {
    setSelectedState(newState);
    setStateTouched(true);
    setSelectedCity('');
    setCustomCity('');
    setCityTouched(false);
  };

  const handleCityChange = (newCity: string) => {
    setSelectedCity(newCity);
    setCityTouched(true);
    if (newCity !== OTHER_CITY_OPTION) {
      setCustomCity('');
    }
  };

  const handleSubmitOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const resolvedCity = selectedCity === OTHER_CITY_OPTION ? customCity.trim() : selectedCity.trim();
    const locationString = resolvedCity && selectedState ? `${resolvedCity}, ${selectedState}` : (resolvedCity || selectedState || undefined);

    if (!isValidBusinessName(businessName)) {
      setError('Business name is required and must be valid.');
      return;
    }
    if (!isValidIndianPhone(contactPhone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (contactEmail.trim() && !isValidEmail(contactEmail.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!selectedState) {
      setError('Select a state.');
      return;
    }
    if (!selectedCity || (selectedCity === OTHER_CITY_OPTION && !customCity.trim())) {
      setError('Select or enter a valid city.');
      return;
    }

    setLoading(true);

    try {
      const res = await apiClient.stores.onboard({
        businessName: businessName.trim(),
        category,
        logoUrl: logoUrl.trim() || undefined,
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim().toLowerCase() || undefined,
        address: locationString,
        city: resolvedCity || undefined,
        state: selectedState.trim() || undefined,
      });

      // Update auth session with the new tenant and store tokens
      login(res.accessToken, res.user, res.store, res.refreshToken);
      setCreatedStore(res.store);

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('simply_onboarding_draft');
      }

      setStep(5); // "Your Store Is Ready" screen
    } catch (err: any) {
      if (err.details && Array.isArray(err.details) && err.details.length > 0) {
        setError(err.details.join('. '));
      } else {
        setError(err.message || 'Failed to complete store setup. Please check your inputs.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
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
      className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative transition-colors duration-200"
      style={{ backgroundColor: 'var(--merchant-bg)', color: 'var(--merchant-text)' }}
    >
      {/* Theme Toggle Top-Right */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl text-white shadow mb-3"
            style={{ backgroundColor: 'var(--merchant-primary)' }}
          >
            <Store className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--merchant-text)' }}>
            Create Your Digital Store
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--merchant-text-muted)' }}>
            Get your business online in under 60 seconds
          </p>
        </div>

        {/* Step Progress Indicators */}
        {step < 5 && (
          <div className="mb-6 flex items-center justify-between px-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors border"
                  style={
                    step >= s
                      ? { backgroundColor: 'var(--merchant-primary)', borderColor: 'var(--merchant-primary)', color: '#ffffff' }
                      : { backgroundColor: 'var(--merchant-surface-raised)', borderColor: 'var(--merchant-border)', color: 'var(--merchant-text-muted)' }
                  }
                >
                  {s}
                </div>
                {s < 4 && (
                  <div
                    className="h-0.5 w-12 sm:w-20 transition-colors"
                    style={{ backgroundColor: step > s ? 'var(--merchant-primary)' : 'var(--merchant-border)' }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div
          className="border rounded-2xl p-6 sm:p-8 shadow-2xl transition-colors duration-200"
          style={{ backgroundColor: 'var(--merchant-surface)', borderColor: 'var(--merchant-border)' }}
        >
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          {/* STEP 1: Business Name */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--merchant-primary)' }}>
                  Step 1 of 4
                </span>
                <h2 className="text-lg font-bold mt-1" style={{ color: 'var(--merchant-text)' }}>
                  What is your Business Name?
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--merchant-text-secondary)' }}>
                  This will appear on your storefront, orders, and customer receipts.
                </p>
              </div>

              <div>
                <label htmlFor="business-name" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--merchant-text-secondary)' }}>
                  Business Name <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--merchant-text-muted)' }}>
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    id="business-name"
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => {
                      setBusinessName(e.target.value);
                      setBusinessNameTouched(true);
                    }}
                    onBlur={() => setBusinessNameTouched(true)}
                    placeholder="e.g. Shree Ganesh Foods, Maa's Kitchen"
                    style={inputStyle}
                    className={`block w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm placeholder:opacity-40 focus:outline-none focus:ring-2 ${
                      businessNameTouched && !isValidBusinessName(businessName)
                        ? 'border-rose-500 focus:ring-rose-500/30'
                        : 'focus:ring-[var(--merchant-focus-ring)]'
                    }`}
                  />
                </div>
                {slugSuggestion && (
                  <div className="mt-3 text-xs break-all" style={{ color: 'var(--merchant-text-secondary)' }} aria-live="polite">
                    <p>{slugSuggestion.available ? '✓ Available' : 'This URL is taken or reserved. Suggested URL:'}</p>
                    <p className="mt-1 font-mono">{getPublicStoreUrl(slugSuggestion.slug, getStorefrontUrl())}</p>
                    <p className="mt-1">Your URL is reserved when you finish setup. Different stores can share a business name.</p>
                  </div>
                )}
                {businessNameTouched && !businessName.trim() && (
                  <p className="mt-1 text-xs text-rose-400 font-medium">Business name is required.</p>
                )}
                {businessNameTouched && businessName.trim().length > 0 && (businessName.trim().length < 2 || businessName.trim().length > 100) && (
                  <p className="mt-1 text-xs text-rose-400 font-medium">Business name must be between 2 and 100 characters.</p>
                )}
                {businessNameTouched && businessName.trim().length >= 2 && businessName.trim().length <= 100 && !isValidBusinessName(businessName) && (
                  <p className="mt-1 text-xs text-rose-400 font-medium">Business name contains invalid characters.</p>
                )}
              </div>

              <button
                type="button"
                disabled={!isValidBusinessName(businessName)}
                onClick={() => saveDraft(2)}
                style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Continue to Category
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          )}

          {/* STEP 2: Business Category */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--merchant-primary)' }}>
                  Step 2 of 4
                </span>
                <h2 className="text-lg font-bold mt-1" style={{ color: 'var(--merchant-text)' }}>
                  Select Your Primary Category
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--merchant-text-secondary)' }}>
                  Our Brand Studio will automatically select the perfect theme for your industry.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {CATEGORIES.map((cat) => {
                  const isSelected = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      style={
                        isSelected
                          ? { backgroundColor: 'var(--merchant-primary-soft)', borderColor: 'var(--merchant-primary)', color: 'var(--merchant-text)' }
                          : { backgroundColor: 'var(--merchant-surface-raised)', borderColor: 'var(--merchant-border)', color: 'var(--merchant-text-secondary)' }
                      }
                      className="p-3 rounded-xl border text-left text-xs font-medium transition-all"
                    >
                      <Tag className="w-3.5 h-3.5 mb-1.5" style={{ color: isSelected ? 'var(--merchant-primary)' : 'var(--merchant-text-muted)' }} />
                      {cat}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => saveDraft(1)}
                  style={{ backgroundColor: 'var(--merchant-surface-raised)', borderColor: 'var(--merchant-border)', color: 'var(--merchant-text)' }}
                  className="w-1/3 py-2.5 px-4 rounded-lg text-xs font-semibold border hover:opacity-90 transition-opacity"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => saveDraft(3)}
                  style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                  className="w-2/3 flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Continue to Logo
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Logo Upload (Optional) */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--merchant-primary)' }}>
                  Step 3 of 4
                </span>
                <h2 className="text-lg font-bold mt-1" style={{ color: 'var(--merchant-text)' }}>
                  Add Business Logo (Optional)
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--merchant-text-secondary)' }}>
                  If you don&apos;t have a logo yet, we will generate an elegant typography wordmark.
                </p>
              </div>

              <div>
                <label htmlFor="logo-url" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--merchant-text-secondary)' }}>
                  Logo URL or Image Link
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: 'var(--merchant-text-muted)' }}>
                    <Upload className="w-4 h-4" />
                  </div>
                  <input
                    id="logo-url"
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png (or leave blank for wordmark)"
                    style={inputStyle}
                    className="block w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm placeholder:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--merchant-focus-ring)]"
                  />
                </div>
              </div>

              <div
                className="p-4 rounded-xl border text-center"
                style={{ backgroundColor: 'var(--merchant-surface-raised)', borderColor: 'var(--merchant-border)' }}
              >
                <span className="text-xs block mb-1" style={{ color: 'var(--merchant-text-muted)' }}>
                  Preview Wordmark:
                </span>
                <span className="text-lg font-bold tracking-wider uppercase font-serif" style={{ color: 'var(--merchant-text)' }}>
                  {businessName || 'Your Brand'}
                </span>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => saveDraft(2)}
                  style={{ backgroundColor: 'var(--merchant-surface-raised)', borderColor: 'var(--merchant-border)', color: 'var(--merchant-text)' }}
                  className="w-1/3 py-2.5 px-4 rounded-lg text-xs font-semibold border hover:opacity-90 transition-opacity"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => saveDraft(4)}
                  style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                  className="w-2/3 flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Continue to Contact Info
                  <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Business Contact Information */}
          {step === 4 && (
            <form onSubmit={handleSubmitOnboarding} className="space-y-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--merchant-primary)' }}>
                  Step 4 of 4
                </span>
                <h2 className="text-lg font-bold mt-1" style={{ color: 'var(--merchant-text)' }}>
                  Contact Information
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--merchant-text-secondary)' }}>
                  Shown in your storefront footer and customer invoices.
                </p>
              </div>

              {/* Contact Phone */}
              <IndianPhoneInput
                id="contact-phone"
                label="Contact Phone"
                value={contactPhone}
                onChange={(canonical, raw10, valid) => {
                  setContactPhone(canonical);
                }}
                required
              />

              {/* Contact Email */}
              <div>
                <label htmlFor="contact-email" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--merchant-text-secondary)' }}>
                  Contact Email (Optional)
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => {
                    setContactEmail(e.target.value);
                    setEmailTouched(true);
                  }}
                  onBlur={() => setEmailTouched(true)}
                  placeholder="contact@yourbusiness.com"
                  style={inputStyle}
                  className={`block w-full px-3 py-2.5 border rounded-lg text-sm placeholder:opacity-40 focus:outline-none focus:ring-2 ${
                    emailTouched && contactEmail.trim().length > 0 && !isValidEmail(contactEmail.trim())
                      ? 'border-rose-500 focus:ring-rose-500/30'
                      : 'focus:ring-[var(--merchant-focus-ring)]'
                  }`}
                />
                {emailTouched && contactEmail.trim().length > 0 && !isValidEmail(contactEmail.trim()) && (
                  <p className="mt-1 text-xs text-rose-400 font-medium">Enter a valid email address.</p>
                )}
              </div>

              {/* State Select */}
              <SearchableSelect
                id="onboard-state"
                label="State"
                options={indianStates}
                value={selectedState}
                onChange={handleStateChange}
                placeholder="Select State / UT"
                searchPlaceholder="Search state or territory..."
                required
                error={stateTouched && !selectedState ? 'Select a state.' : null}
              />

              {/* City Select */}
              <SearchableSelect
                id="onboard-city"
                label="City"
                options={availableCities}
                value={selectedCity}
                onChange={handleCityChange}
                placeholder={selectedState ? 'Select City' : 'Select a state first'}
                searchPlaceholder="Search city..."
                disabled={!selectedState}
                required
                error={cityTouched && selectedState && !selectedCity ? 'Select a city.' : null}
              />

              {/* Other city custom input */}
              {selectedCity === OTHER_CITY_OPTION && (
                <div>
                  <label htmlFor="custom-city" className="block text-xs font-medium mb-1.5" style={{ color: 'var(--merchant-text-secondary)' }}>
                    Enter City Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="custom-city"
                    type="text"
                    required
                    value={customCity}
                    onChange={(e) => {
                      setCustomCity(e.target.value);
                      setCustomCityTouched(true);
                    }}
                    onBlur={() => setCustomCityTouched(true)}
                    placeholder="Enter your city / town name"
                    style={inputStyle}
                    className={`block w-full px-3 py-2.5 border rounded-lg text-sm placeholder:opacity-40 focus:outline-none focus:ring-2 ${
                      customCityTouched && !customCity.trim()
                        ? 'border-rose-500 focus:ring-rose-500/30'
                        : 'focus:ring-[var(--merchant-focus-ring)]'
                    }`}
                  />
                  {customCityTouched && !customCity.trim() && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">City name is required.</p>
                  )}
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => saveDraft(3)}
                  style={{ backgroundColor: 'var(--merchant-surface-raised)', borderColor: 'var(--merchant-border)', color: 'var(--merchant-text)' }}
                  className="w-1/3 py-2.5 px-4 rounded-lg text-xs font-semibold border hover:opacity-90 transition-opacity"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={
                    loading ||
                    !isValidIndianPhone(contactPhone) ||
                    (contactEmail.trim().length > 0 && !isValidEmail(contactEmail.trim())) ||
                    !selectedState ||
                    !selectedCity ||
                    (selectedCity === OTHER_CITY_OPTION && !customCity.trim())
                  }
                  style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                  className="w-2/3 flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity shadow-sm"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : 'Create My Store Now'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 5: Store Ready Instant Preview */}
          {step === 5 && (
            <div className="text-center space-y-5 py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mb-2">
                <CheckCircle className="w-10 h-10" />
              </div>

              <h2 className="text-2xl font-bold" style={{ color: 'var(--merchant-text)' }}>
                Your Store Is Ready!
              </h2>
              <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--merchant-text-secondary)' }}>
                <span className="font-semibold" style={{ color: 'var(--merchant-text)' }}>{businessName}</span> has been configured with the{' '}
                <span className="font-semibold" style={{ color: 'var(--merchant-primary)' }}>{category}</span> theme preset.
              </p>

              <div
                className="p-4 rounded-xl border text-left space-y-2 text-xs"
                style={{ backgroundColor: 'var(--merchant-surface-raised)', borderColor: 'var(--merchant-border)' }}
              >
                <div className="flex justify-between" style={{ color: 'var(--merchant-text-muted)' }}>
                  <span>Store Status:</span>
                  <span className="font-semibold text-emerald-400">PRIVATE PREVIEW</span>
                </div>
                <div className="flex justify-between" style={{ color: 'var(--merchant-text-muted)' }}>
                  <span>Store Slug:</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--merchant-text)' }}>{createdStore?.slug}</span>
                </div>
                <div className="flex justify-between" style={{ color: 'var(--merchant-text-muted)' }}>
                  <span>Public Visibility:</span>
                  <span className="text-amber-400">Available after plan subscription</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  style={{ backgroundColor: 'var(--merchant-primary)', color: '#ffffff' }}
                  className="flex-1 py-3 px-4 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Go to Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/brand-studio')}
                  style={{ backgroundColor: 'var(--merchant-surface-raised)', borderColor: 'var(--merchant-border)', color: 'var(--merchant-text)' }}
                  className="flex-1 py-3 px-4 rounded-lg text-sm font-semibold border hover:opacity-90 transition-opacity"
                >
                  Customize Brand Studio
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
