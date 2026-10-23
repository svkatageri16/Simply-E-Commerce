export const INDIAN_PHONE_REGEX = /^(?:\+91|91)?[6-9]\d{9}$/;
export const INDIAN_PINCODE_REGEX = /^[1-9][0-9]{5}$/;
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const RESERVED_SLUGS = new Set([
  'merchant', 'logout', 'signup', 'register', 'payments', 'static', 'cdn',
  'support', 'status', 'mail', 'system', 'docs', '_next', 'favicon',
  'next', 'track', 'onboarding', 'favicon-ico', 'robots-txt', 'sitemap-xml',
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'cart',
  'checkout',
  'dashboard',
  'health',
  'help',
  'login',
  'media',
  'metrics',
  'order',
  'orders',
  'payment',
  'privacy',
  'root',
  'seller',
  'settings',
  'shipping',
  'simply',
  'store',
  'stores',
  'terms',
  'webhook',
  'webhooks',
  'www',
]);

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  return phone;
}

export function isValidIndianPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  return INDIAN_PHONE_REGEX.test(phone.trim());
}

export function isValidIndianPincode(pincode: string): boolean {
  return INDIAN_PINCODE_REGEX.test(pincode.trim());
}

export function normalizeSlug(rawSlug: string): string {
  return rawSlug
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '-')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase().trim());
}

export const PIN_REGEX = /^\d{6}$/;

export function isValidPin(pin: string): boolean {
  return PIN_REGEX.test(pin.trim());
}

export function isValidIndianMobile(phone10Digits: string): boolean {
  return /^[6-9]\d{9}$/.test(phone10Digits.trim());
}

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function isValidEmail(email: string): boolean {
  if (!email) return false;
  return EMAIL_REGEX.test(email.trim());
}

export const BUSINESS_NAME_REGEX = /^[\p{L}\p{N}\s&'\-.,/()]{2,100}$/u;

export function isValidBusinessName(name: string): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 100 && BUSINESS_NAME_REGEX.test(trimmed);
}

export function validateMoneyAmount(amountPaise: number): boolean {
  return Number.isInteger(amountPaise) && amountPaise >= 0;
}

/**
 * Normalizes any phone input representation into up to 10 local digits for display.
 *
 * Rules:
 * - If string starts with +91 (e.g. +91XXXXXXXXXX or +911), strips +91 country prefix.
 * - If string has > 10 digits and starts with 91 (e.g. 919876543210), strips country code 91.
 * - If string has exactly 10 digits starting with 91 (e.g. 9123456789), preserves all 10 digits.
 * - Extracts only numeric digits, ignoring letters/symbols.
 * - Clamps at maximum 10 local digits (11th digit ignored).
 */
export function toLocalDigits(value: string): string {
  if (!value) return '';

  const trimmed = value.trim();

  // If input explicitly has +91 country prefix (e.g. canonical payload +919876543210 or partial +911)
  if (trimmed.startsWith('+91')) {
    const afterPrefix = trimmed.slice(3).replace(/\D/g, '');
    return afterPrefix.slice(0, 10);
  }

  // If input starts with +, strip + and extract digits
  if (trimmed.startsWith('+')) {
    let digits = trimmed.replace(/\D/g, '');
    if (digits.length > 10 && digits.startsWith('91')) {
      digits = digits.slice(2);
    }
    return digits.slice(0, 10);
  }

  // Unprefixed string: strip non-digits
  let digits = trimmed.replace(/\D/g, '');

  // Strip country code 91 ONLY when incoming numeric value has MORE THAN 10 digits
  if (digits.length > 10 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }

  return digits.slice(0, 10);
}

export function parseRupeesToPaise(rupeeStringOrNumber: string | number): number {
  if (typeof rupeeStringOrNumber === 'number') {
    return Math.round(rupeeStringOrNumber * 100);
  }

  const clean = rupeeStringOrNumber.replace(/[^0-9.]/g, '');
  const val = parseFloat(clean);
  if (isNaN(val)) return 0;
  return Math.round(val * 100);
}

export function resolveMediaUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  // Determine media / API origin
  let configuredOrigin = '';
  if (typeof process !== 'undefined' && process.env) {
    configuredOrigin =
      process.env.NEXT_PUBLIC_MEDIA_URL ||
      process.env.STORAGE_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.MEDIA_PUBLIC_URL_PREFIX ||
      '';
  }

  // If URL has localhost or 127.0.0.1 and configuredOrigin is set and not localhost, rebase to production origin
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/(.*)$/i.test(trimmed)) {
    if (configuredOrigin && !/localhost|127\.0\.0\.1/i.test(configuredOrigin)) {
      const path = trimmed.replace(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?/i, '');
      const cleanOrigin = configuredOrigin.replace(/\/+$/, '');
      return `${cleanOrigin}/${path}`;
    }
  }

  // Absolute protocol URLs or protocol-relative URLs
  if (/^(?:https?:)?\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Data URIs or Blob URLs
  if (/^(?:data|blob):/i.test(trimmed)) {
    return trimmed;
  }

  // Strip machine-specific Windows/local drive letters
  let cleanPath = trimmed;
  if (/^(?:file:\/\/\/?)?[a-zA-Z]:[\\/]/i.test(trimmed)) {
    const fsNormalized = trimmed.replace(/^(?:file:\/\/\/?)?[a-zA-Z]:[\\/]/i, '').replace(/\\/g, '/');
    const mediaRelMatch = fsNormalized.match(/(?:media-storage|media\/file|media)\/(.+)$/);
    cleanPath = mediaRelMatch ? `media/file/${mediaRelMatch[1]}` : fsNormalized;
  }

  if (!configuredOrigin) {
    configuredOrigin = 'http://localhost:4000';
  }

  const cleanOrigin = configuredOrigin.replace(/\/+$/, '');
  cleanPath = cleanPath.replace(/^\/+/, '');

  return `${cleanOrigin}/${cleanPath}`;
}

export * from './india-locations';
export * from './image-validation';
