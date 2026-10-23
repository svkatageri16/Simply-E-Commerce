import type {
  AdminOverview,
  AdminPage,
  AdminMerchant,
  AdminMerchantDetail,
  AdminPlan,
  AdminUser,
  AdminOrder,
  AdminOrdersResponse,
  AdminOrderDetail,
  AdminOperations,
  AdminAnalytics,
  AdminCommunicationLog,
  AdminReviewsSummary,
  AdminReviewTimelineEvent,
  AdminSubscriptionKpi,
  AdminBusinessVerification,
  PlanHighlightItem,
  AdminPayment,
  AdminSettings,
  AdminSubAdmin,
  CreateSubAdminDto,
  UpdateSubAdminDto,
  ActivateSubAdminDto,
  AdminAudit,
  AdminAuditPageResult,
  AdminChangePasswordDto,
  AdminResetTempPasswordDto,
} from './admin';
// ==============================================================================
// Simply E-Commerce: Unified Type-Safe REST API Client
// Consumed by apps/seller, apps/storefront, and apps/admin
// ==============================================================================

import { ApiResponse, ApiErrorResponse } from './index';

export class SimplyApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing = false;
  private onTokenRefreshed?: (accessToken: string, refreshToken: string) => void;
  private onAuthFailure?: () => void;
  private onSessionExpired?: () => void;
  private refreshPromise: Promise<boolean> | null = null;

  public setOnAuthFailure(callback?: () => void) {
    this.onAuthFailure = callback;
  }

  public setOnSessionExpired(callback?: () => void) {
    this.onSessionExpired = callback;
  }

  public async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) {
      this.onSessionExpired?.();
      return false;
    }
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const refreshRes = await this.auth.refreshSession(this.refreshToken!);
        if (!this.refreshToken) {
          return false;
        }
        if (refreshRes?.accessToken) {
          this.setToken(refreshRes.accessToken);
          if (refreshRes.refreshToken) {
            this.setRefreshToken(refreshRes.refreshToken);
          }
          this.onTokenRefreshed?.(refreshRes.accessToken, refreshRes.refreshToken || this.refreshToken);
          return true;
        }
        this.onSessionExpired?.();
        return false;
      } catch {
        this.onSessionExpired?.();
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  constructor(baseUrl?: string) {
    let resolvedUrl = baseUrl;
    if (!resolvedUrl || resolvedUrl === 'http://localhost:4000') {
      const envUrl = typeof process !== 'undefined'
        ? (process.env?.NEXT_PUBLIC_API_URL || process.env?.API_PUBLIC_URL || process.env?.API_URL)?.trim()
        : undefined;

      if (envUrl && envUrl !== '' && envUrl !== 'http://localhost:4000') {
        resolvedUrl = envUrl;
      } else if (typeof window !== 'undefined' && window.location) {
        const host = window.location.hostname.toLowerCase();
        if (host === 'letzshop.store' || host.endsWith('.letzshop.store')) {
          resolvedUrl = 'https://api.letzshop.store';
        } else if (envUrl && envUrl !== '') {
          resolvedUrl = envUrl;
        }
      } else if (envUrl && envUrl !== '') {
        resolvedUrl = envUrl;
      }
    }
    const defaultUrl = resolvedUrl || 'http://localhost:4000';
    this.baseUrl = defaultUrl
      .replace(/\/api\/v1\/?$/, '')
      .replace(/\/+$/, '');
  }

  public setToken(token: string | null) {
    this.token = token;
  }

  public getToken(): string | null {
    return this.token;
  }

  public setRefreshToken(token: string | null) {
    this.refreshToken = token;
  }

  public getRefreshToken(): string | null {
    return this.refreshToken;
  }

  public setOnTokenRefreshed(cb?: (accessToken: string, refreshToken: string) => void) {
    this.onTokenRefreshed = cb;
  }

  public async request<T = any>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: any;
      headers?: Record<string, string>;
      params?: Record<string, any>;
      _isRetry?: boolean;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, headers = {}, params, _isRetry = false } = options;

    let activeBase = this.baseUrl;
    if (
      typeof window !== 'undefined' &&
      window.location &&
      (activeBase.includes('localhost:4000') || !activeBase)
    ) {
      const host = window.location.hostname.toLowerCase();
      if (host === 'letzshop.store' || host.endsWith('.letzshop.store')) {
        activeBase = 'https://api.letzshop.store';
      }
    }

    let url = `${activeBase}/${path.replace(/^\/+/, '')}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const reqHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...headers,
    };

    if (body !== undefined) {
      reqHeaders['Content-Type'] = 'application/json';
    }

    if (this.token && !reqHeaders['Authorization']) {
      reqHeaders['Authorization'] = `Bearer ${this.token}`;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: reqHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr: any) {
      const err = new Error('Unable to connect to Simply E-Commerce API servers.') as any;
      err.code = 'NETWORK_OFFLINE';
      err.status = 0;
      err.details = networkErr?.message;
      throw err;
    }

    const isUnrefreshableRoute =
      path.startsWith('auth/session/refresh') ||
      path.startsWith('auth/otp') ||
      path.startsWith('auth/pin') ||
      path.startsWith('auth/register') ||
      path.startsWith('auth/admin/login') ||
      path.startsWith('auth/admin/activate');

    // Auto-refresh token if 401 Unauthorized occurs on a protected route and refreshToken is present
    if (res.status === 401 && !_isRetry && this.refreshToken && !isUnrefreshableRoute) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return this.request<T>(path, { ...options, _isRetry: true });
      }
    }

    const json = await res.json().catch(() => ({}));

    if (!res.ok || json.success === false) {
      if (res.status === 401) {
        if (!this.refreshToken && !isUnrefreshableRoute) {
          this.onSessionExpired?.();
        }
        this.onAuthFailure?.();
      } else if (res.status === 403) {
        this.onAuthFailure?.();
      }
      let defaultCode = 'API_ERROR';
      if (res.status === 404) defaultCode = 'NOT_FOUND';
      else if (res.status === 401) defaultCode = 'UNAUTHORIZED';
      else if (res.status === 403) defaultCode = 'FORBIDDEN';
      else if (res.status === 503) defaultCode = 'API_UNAVAILABLE';
      else if (res.status >= 500) defaultCode = 'INTERNAL_ERROR';

      const errorMsg = json?.error?.message || json?.message || `Request failed with status ${res.status}`;
      const err = new Error(errorMsg) as any;
      err.code = json?.error?.code || defaultCode;
      err.status = res.status;
      err.details = json?.error?.details;
      throw err;
    }

    // Unpack standard envelope if present
    if (json && typeof json === 'object' && 'data' in json && json.success === true) {
      return json.data;
    }

    return json;
  }

  // --- Canonical Seller Auth (OTP -> PIN -> Session) ---
  public auth = {
    requestAccountEmailOtp: (email: string) => this.request('auth/email/request-otp', { method: 'POST', body: { email } }),
    verifyAccountEmailOtp: (email: string, code: string) => this.request('auth/email/verify-otp', { method: 'POST', body: { email, code } }),
    // Canonical OTP + PIN
    requestRegisterOtp: (phone: string, email: string) =>
      this.request('auth/register/request-otp', { method: 'POST', body: { phone, email } }),
    verifyRegisterOtp: (phone: string, otp: string, email: string) =>
      this.request('auth/register/verify-otp', { method: 'POST', body: { phone, otp, email } }),
    setupPin: (pin: string, tempToken?: string) =>
      this.request('auth/pin/setup', {
        method: 'POST',
        body: { pin },
        headers: tempToken ? { Authorization: `Bearer ${tempToken}` } : {},
      }),
    loginWithPin: (phone: string, pin: string, device?: any) =>
      this.request('auth/pin/login', { method: 'POST', body: { phone, pin, device } }),
    refreshSession: (refreshToken: string) =>
      this.request('auth/session/refresh', { method: 'POST', body: { refreshToken } }),
    requestRecoveryOtp: (phone: string) =>
      this.request('auth/recovery/request-otp', { method: 'POST', body: { phone } }),
    verifyRecoveryOtp: (phone: string, otp: string) =>
      this.request('auth/recovery/verify-otp', { method: 'POST', body: { phone, otp } }),
    loginAdmin: (identifier: string, secret: string) =>
      this.request('auth/admin/login', { method: 'POST', body: { identifier, secret } }),

    // Backward-compat aliases
    sendOtp: (phone: string) => this.request('auth/otp/send', { method: 'POST', body: { phone } }),
    verifyOtp: (phone: string, code: string) =>
      this.request('auth/otp/verify', { method: 'POST', body: { phone, code } }),
    refresh: (refreshToken: string) =>
      this.request('auth/refresh', { method: 'POST', body: { refreshToken } }),
    logout: () => this.request('auth/logout', { method: 'POST' }),
    me: () => this.request('auth/me'),
  };

  // --- Stores ---
  public stores = {
    getPublicProducts: (slug: string, params?: { page?: number; limit?: number; category?: string; q?: string; sort?: string; previewSecret?: string }) =>
      this.request(`storefront/${encodeURIComponent(slug)}/products`, { params }),
    getPublicProduct: (slug: string, productId: string, previewSecret?: string) =>
      this.request(`storefront/${encodeURIComponent(slug)}/products/${encodeURIComponent(productId)}`, { params: { previewSecret } }),
    slugAvailability: (name: string) => this.request('stores/slug-availability?name=' + encodeURIComponent(name)),
    onboard: (data: {
      businessName: string;
      category: string;
      logoUrl?: string;
      contactPhone?: string;
      contactEmail?: string;
      address?: string;
      city?: string;
      state?: string;
    }) => this.request('stores/onboard', { method: 'POST', body: data }),
    getMyStore: () => this.request('stores/my-store'),
    updateStore: (data: any) =>
      this.request('seller/store', { method: 'PATCH', body: data }),
    getMetrics: (params?: { period?: string; startDate?: string; endDate?: string }) =>
      this.request('seller/dashboard', { params }),
    getPrivatePreview: () => this.request('stores/my-store/preview'),
    getPublicStorefront: (slug: string, previewSecret?: string) =>
      this.request(`storefront/${slug}`, { params: { previewSecret, _t: Date.now() } }),
  };

  // --- Seller Analytics ---
  public seller = {
    getDashboard: (params?: { period?: string; startDate?: string; endDate?: string }) =>
      this.request('seller/dashboard', { params }),
    updatePreferences: (data: { preferredLocale: string }) =>
      this.request('seller/preferences', { method: 'PATCH', body: data }),
  };

  // --- Catalog ---
  public catalog = {
    getProducts: (params?: { search?: string; categoryId?: string; page?: number; limit?: number }) =>
      this.request('catalog/products', { params }),
    getProduct: (id: string) => this.request(`catalog/products/${id}`),
    createProduct: (data: any) => this.request('catalog/products', { method: 'POST', body: data }),
    updateProduct: (id: string, data: any) =>
      this.request(`catalog/products/${id}`, { method: 'PUT', body: data }),
    duplicateProduct: (id: string) =>
      this.request(`catalog/products/${id}/duplicate`, { method: 'POST' }),
    deleteProduct: (id: string) => this.request(`catalog/products/${id}`, { method: 'DELETE' }),
    getCategories: () => this.request('catalog/categories'),
    createCategory: (data: { name: string; description?: string }) =>
      this.request('catalog/categories', { method: 'POST', body: data }),
    updateCategory: (id: string, data: { name?: string; description?: string }) =>
      this.request(`catalog/categories/${id}`, { method: 'PATCH', body: data }),
    deleteCategory: (id: string) =>
      this.request(`catalog/categories/${id}`, { method: 'DELETE' }),
  };

  // --- Inventory ---
  public inventory = {
    getInventory: () => this.request('inventory'),
    adjustStock: (variantId: string, quantity: number, reason?: string) =>
      this.request('inventory/adjust', { method: 'POST', body: { variantId, quantity, reason } }),
  };

  // --- Media ---
  public media = {
    upload: (data: {
      productId: string;
      variantId?: string;
      filename: string;
      mimeType: string;
      base64Data: string;
      altText?: string;
    }) => this.request('media/upload', { method: 'POST', body: data }),
    uploadAsset: (data: {
      type: 'logo' | 'banner';
      filename: string;
      mimeType: string;
      base64Data: string;
    }) => this.request('media/store-asset', { method: 'POST', body: data }),
    uploadMediaAsset: (data: {
      filename: string;
      mimeType: string;
      base64Data: string;
      altText?: string;
    }) => this.request('media/asset', { method: 'POST', body: data }),
    delete: (id: string) => this.request(`media/${id}`, { method: 'DELETE' }),
  };

  // --- Cart ---
  public cart = {
    init: (storeId: string, guestToken?: string) =>
      this.request('cart/init', { method: 'POST', body: { storeId, guestToken } }),
    get: (cartId: string) => this.request(`cart/${cartId}`),
    addItem: (cartId: string, variantId: string, quantity = 1) =>
      this.request(`cart/${cartId}/items`, { method: 'POST', body: { variantId, quantity } }),
    updateQuantity: (cartId: string, variantId: string, quantity: number) =>
      this.request(`cart/${cartId}/items/${variantId}`, { method: 'POST', body: { quantity } }),
    removeItem: (cartId: string, variantId: string) =>
      this.request(`cart/${cartId}/items/${variantId}/remove`, { method: 'POST', body: {} }),
  };

  // --- Orders (Merchant Canonical: /seller/orders; Public Buyer: /orders/checkout, /orders/track) ---
  public orders = {
    checkout: (data: any) => this.request('orders/checkout', { method: 'POST', body: data }),
    validateCoupon: (data: { storeId: string; code: string; subtotalPaise: number }) =>
      this.request('orders/coupon/validate', { method: 'POST', body: data }),
    getOrders: (params?: {
      page?: number;
      limit?: number;
      pageSize?: number;
      status?: string;
      orderStatus?: string;
      paymentStatus?: string;
      fulfillmentStatus?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
    }) => this.request('seller/orders', { params }),
    getOrder: (id: string) => this.request(`seller/orders/${id}`),
    markOutForDelivery: (id: string) => this.request(`orders/${id}/out-for-delivery`, { method: 'POST' }),
    updateStatus: (
      id: string,
      status: string,
      reason?: string,
      extra?: {
        customMessage?: string;
        riderName?: string;
        riderPhone?: string;
        riderEmail?: string;
      }
    ) =>
      this.request(`seller/orders/${id}/status`, {
        method: 'PATCH',
        body: { status, reason, ...(extra || {}) },
      }),
    trackOrder: (orderNumber: string, token?: string) =>
      this.request(`orders/track/${orderNumber}`, { params: token ? { t: token } : undefined }),
    collectCod: (
      id: string,
      data: { collectionMethod: 'CASH' | 'UPI' | 'CARD' | 'OTHER' | string; amountPaise?: number; note?: string }
    ) =>
      this.request(`seller/orders/${id}/collect-cod`, {
        method: 'POST',
        body: data,
      }),
  };

  // --- Reports ---
  public reports = {
    getReport: (params?: {
      type?: 'sales' | 'orders' | 'products' | 'customers';
      startDate?: string;
      endDate?: string;
      status?: string;
      paymentStatus?: string;
    }) => this.request('seller/reports', { params }),
  };

  // --- Enquiries ---
  public enquiries = {
    create: (data: any) => this.request('enquiries', { method: 'POST', body: data }),
    getEnquiries: () => this.request('enquiries'),
    respond: (id: string, data: { quotationAmountPaise?: number; notes?: string; status?: string }) =>
      this.request(`enquiries/${id}/quotation`, { method: 'PUT', body: data }),
  };

  // --- Customers ---
  public customers = {
    getCustomers: () => this.request('customers'),
    getCustomer: (id: string) => this.request(`customers/${id}`),
  };

  // --- Themes & Studio ---
  public themes = {
    getAvailableThemes: () => this.request('themes/available'),
    getBranding: () => this.request('themes/branding'),
    updateBranding: (data: any) => this.request('themes/branding', { method: 'PUT', body: data }),
    getThemeConfig: () => this.request('themes/config'),
    updateThemeConfig: (data: any) => this.request('themes/config', { method: 'PUT', body: data }),
  };

  // --- Subscriptions ---
  public subscriptions = {
    getPlans: () => this.request('subscriptions/plans'),
    getCurrent: () => this.request('subscriptions/current'),
    createAutoPay: (planId: string) => this.request<any>('subscriptions/autopay', { method: 'POST', body: { planId } }),
    verifyAutoPay: (body: { razorpay_subscription_id: string; razorpay_payment_id: string; razorpay_signature: string }) => this.request('subscriptions/autopay/verify', { method: 'POST', body }),
    createOrder: (planId: string, billingCycle = 'MONTHLY') =>
      this.request('subscriptions/create-order', {
        method: 'POST',
        body: { planId, billingCycle },
      }),
    verify: (data: {
      paymentOrderId?: string;
      providerPaymentId?: string;
      providerOrderId?: string;
      providerSignature?: string;
      razorpay_payment_id?: string;
      razorpay_order_id?: string;
      razorpay_signature?: string;
    }) =>
      this.request('subscriptions/verify', {
        method: 'POST',
        body: data,
      }),
    activate: (planId: string, durationDays = 30, paymentOrderId?: string, providerSignature?: string) =>
      this.request('subscriptions/activate', {
        method: 'POST',
        body: { planId, durationDays, paymentOrderId, providerSignature },
      }),
    devActivate: (planId: string, durationDays = 30) =>
      this.request('subscriptions/dev-activate', { method: 'POST', body: { planId, durationDays } }),
    getBillingProfile: () => this.request('subscriptions/billing-profile'),
    updateBillingProfile: (data: {
      legalName?: string;
      gstin?: string;
      billingAddress?: string;
      state?: string;
      pincode?: string;
      billingEmail?: string;
    }) =>
      this.request('subscriptions/billing-profile', {
        method: 'PUT',
        body: data,
      }),
  };

  // --- Admin ---
  public admin = {
    getOverview: (range?: string) =>
      this.request<AdminOverview>('admin/overview', { params: { range } }),
    getMerchants: (
      params?:
        | string
        | {
            search?: string;
            status?: string;
            planId?: string;
            subscriptionStatus?: string;
            sort?: string;
            page?: number;
            pageSize?: number;
          },
    ) => {
      const q = typeof params === 'string' ? { search: params } : params || {};
      return this.request<AdminPage<AdminMerchant>>('admin/merchants', {
        params: q,
      });
    },
    getMerchant: (id: string) => this.request<AdminMerchantDetail>(`admin/merchants/${id}`),
    suspendMerchant: (
      id: string,
      data:
        | string
        | {
            reason: string;
            internalNote?: string;
            merchantMessage?: string;
            notifyEmail?: boolean;
            notifyWhatsApp?: boolean;
            storeId?: string;
          },
    ) =>
      this.request(`admin/merchants/${id}/suspend`, {
        method: 'POST',
        body: typeof data === 'string' ? { reason: data } : data,
      }),
    reactivateMerchant: (
      id: string,
      data?:
        | string
        | {
            reason?: string;
            merchantMessage?: string;
            notifyEmail?: boolean;
            notifyWhatsApp?: boolean;
            storeId?: string;
          },
    ) =>
      this.request(`admin/merchants/${id}/reactivate`, {
        method: 'POST',
        body: typeof data === 'string' ? { reason: data } : (data || {}),
      }),
    archiveMerchant: (
      id: string,
      data?: {
        reason?: string;
        internalNote?: string;
        merchantMessage?: string;
        notifyEmail?: boolean;
        notifyWhatsApp?: boolean;
      },
    ) =>
      this.request(`admin/merchants/${id}/archive`, {
        method: 'POST',
        body: data || {},
      }),
    sendMessageToMerchant: (
      id: string,
      data: {
        channels: Array<'EMAIL' | 'WHATSAPP'>;
        subject: string;
        message: string;
      },
    ) =>
      this.request<{
        success: boolean;
        emailSent: boolean;
        whatsAppUrl: string | null;
        status: string;
      }>(`admin/merchants/${id}/message`, {
        method: 'POST',
        body: data,
      }),
    getMerchantCommunicationHistory: (id: string) =>
      this.request<AdminCommunicationLog[]>(
        `admin/merchants/${id}/communication-history`,
      ),
    getCommerce: () => this.request<AdminPage<AdminOrder>>('admin/commerce'),
    getOrders: (params?: any) =>
      this.request<AdminOrdersResponse>('admin/orders', { params }),
    getOrderDetail: (id: string) =>
      this.request<AdminOrderDetail>(`admin/orders/${id}`),
    getOperations: () => this.request<AdminOperations>('admin/operations'),
    retryOutbox: (id: string) =>
      this.request(`admin/operations/retry-outbox/${id}`, { method: 'POST' }),
    reconcilePayment: (paymentOrderId: string) =>
      this.request(`admin/operations/reconcile-payment/${paymentOrderId}`, {
        method: 'POST',
      }),
    reconcileSubscriptionPayment: (paymentId: string) =>
      this.request<{
        success: boolean;
        payment: AdminPayment;
        status: string;
        message: string;
      }>(`admin/payments/${paymentId}/reconcile`, {
        method: 'POST',
      }),
    getUsers: (search?: string, role?: string) =>
      this.request<AdminPage<AdminUser>>('admin/users', {
        params: { search, role },
      }),
    toggleUserStatus: (
      userId: string,
      data?: { reason: string; internalNote?: string },
    ) =>
      this.request<{ id: string; isActive: boolean }>(
        `admin/users/${userId}/toggle-status`,
        {
          method: 'POST',
          body: data || { reason: 'Status updated by administrator' },
        },
      ),
    getAnalytics: (params?: any) =>
      this.request<AdminAnalytics>('admin/analytics', { params }),
    getPlans: () => this.request<AdminPlan[]>('admin/plans'),
    createPlan: (data: {
      name: string;
      code?: string;
      description?: string;
      pricePaise: number;
      billingCycle?: string;
      maxProducts?: number;
      maxStaff?: number;
      maxStorageMb?: number;
      customDomainAllowed?: boolean;
      isPublic?: boolean;
      gstBasisPoints?: number;
      status?: 'ACTIVE' | 'COMING_SOON' | 'CONTACT_SALES' | 'INACTIVE';
      displayOrder?: number;
      badge?: string;
      isPurchasable?: boolean;
      highlights?: PlanHighlightItem[];
    }) => this.request('admin/plans', { method: 'POST', body: data }),
    updatePlan: (
      id: string,
      data: Partial<
        Omit<
          AdminPlan,
          | 'id'
          | 'availability'
          | 'purchasable'
          | 'merchantCount'
          | 'activeSubscribersCount'
        >
      >,
    ) => this.request(`admin/plans/${id}`, { method: 'PUT', body: data }),
    deletePlan: (id: string) =>
      this.request<{ success: boolean; archived: boolean; message: string }>(
        `admin/plans/${id}`,
        { method: 'DELETE' },
      ),
    changeSubscriptionPlan: (id: string, body: { planId: string; reason?: string }) =>
      this.request(`admin/subscriptions/${id}/plan`, { method: 'PATCH', body }),
    extendSubscriptionExpiry: (id: string, body: { currentPeriodEnd: string; reason?: string }) =>
      this.request(`admin/subscriptions/${id}/expiry`, { method: 'PATCH', body }),
    cancelSubscription: (id: string, body: { reason: string }) =>
      this.request(`admin/subscriptions/${id}/cancel`, { method: 'POST', body }),
    getSubscriptionDetail: (id: string) =>
      this.request(`admin/subscriptions/${id}`),
    getSubscriptionKpis: () =>
      this.request<AdminSubscriptionKpi>('admin/subscriptions/kpis'),
    getMerchantVerification: (id: string) =>
      this.request<AdminBusinessVerification>(`admin/merchants/${id}/verification`),
    reviewMerchantDocument: (
      tenantId: string,
      docId: string,
      data: {
        status: 'VERIFIED' | 'REJECTED';
        rejectionReason?: string;
        adminNote?: string;
      },
    ) =>
      this.request(`admin/merchants/${tenantId}/documents/${docId}/review`, {
        method: 'POST',
        body: data,
      }),
    getSettings: () => this.request<AdminSettings>('admin/settings'),
    updateSettings: (category: string, data: any) =>
      this.request<AdminSettings>(`admin/settings/${category}`, {
        method: 'PUT',
        body: data,
      }),
    testSmtpConnection: (targetEmail?: string) =>
      this.request<{ success: boolean; message: string }>(
        'admin/settings/test-smtp',
        { method: 'POST', body: { targetEmail } },
      ),
    getSubAdmins: (params?: any) =>
      this.request<AdminPage<AdminSubAdmin>>('admin/sub-admins', { params }),
    getSubAdminDetail: (id: string) =>
      this.request<AdminSubAdmin & { auditActions: AdminAudit[]; sessions: any[]; inviteHistory?: any[] }>(
        `admin/sub-admins/${id}`,
      ),
    createSubAdmin: (data: CreateSubAdminDto) =>
      this.request<{ subAdmin: AdminSubAdmin; activationUrl?: string; temporaryPasswordGenerated?: boolean }>(
        'admin/sub-admins',
        { method: 'POST', body: data },
      ),
    updateSubAdmin: (id: string, data: UpdateSubAdminDto) =>
      this.request<AdminSubAdmin>(`admin/sub-admins/${id}`, {
        method: 'PUT',
        body: data,
      }),
    toggleSubAdminStatus: (id: string, data?: { reason?: string }) =>
      this.request<AdminSubAdmin>(`admin/sub-admins/${id}/toggle-status`, {
        method: 'POST',
        body: data,
      }),
    resetSubAdminTempPassword: (id: string, data?: AdminResetTempPasswordDto) =>
      this.request<{ success: boolean; message: string; temporaryPassword?: string }>(
        `admin/sub-admins/${id}/reset-temp-password`,
        { method: 'POST', body: data },
      ),
    resendSubAdminInvite: (inviteId: string) =>
      this.request<{ success: boolean; activationUrl: string }>(
        `admin/sub-admins/invites/${inviteId}/resend`,
        { method: 'POST' },
      ),
    revokeSubAdminSessions: (id: string) =>
      this.request<{ success: boolean; revokedCount: number }>(
        `admin/sub-admins/${id}/revoke-sessions`,
        { method: 'POST' },
      ),
    deactivateSubAdmin: (id: string, data?: { reason?: string }) =>
      this.request<{ success: boolean; message: string }>(
        `admin/sub-admins/${id}/deactivate`,
        { method: 'POST', body: data },
      ),
    deleteSubAdmin: (id: string, data?: { reason?: string }) =>
      this.request<{ success: boolean; message: string; deleted?: boolean }>(
        `admin/sub-admins/${id}`,
        { method: 'DELETE', body: data },
      ),
    sendMessageToSubAdmin: (
      id: string,
      data: { subject: string; message: string; openWhatsApp?: boolean },
    ) =>
      this.request<{ success: boolean; message: string; emailSent: boolean; whatsAppUrl?: string | null }>(
        `admin/sub-admins/${id}/message`,
        { method: 'POST', body: data },
      ),
    activateSubAdmin: (data: ActivateSubAdminDto) =>
      this.request<{ success: boolean; message: string }>(
        'auth/admin/activate',
        { method: 'POST', body: data },
      ),
    changePassword: (data: AdminChangePasswordDto) =>
      this.request<{ success: boolean; message: string }>(
        'admin/change-password',
        { method: 'POST', body: data },
      ),
    getAuditLogs: (params?: any) =>
      this.request<AdminAuditPageResult>('admin/audit-logs', { params }),
    getAuditLogDetail: (id: string) =>
      this.request<AdminAudit>(`admin/audit-logs/${id}`),
  };

  // --- Merchant Business Verification & Documents ---
  public verification = {
    getVerification: () =>
      this.request<AdminBusinessVerification>('seller/verification'),
    updateProfile: (data: {
      businessType?: string;
      gstRegistered?: boolean;
      gstin?: string;
      panNumber?: string;
      udyamNumber?: string;
    }) =>
      this.request('seller/verification/profile', {
        method: 'PATCH',
        body: data,
      }),
    uploadDocument: (data: {
      type: string;
      documentNumber?: string;
      filename: string;
      mimeType: string;
      base64Data: string;
    }) =>
      this.request('seller/verification/documents', {
        method: 'POST',
        body: data,
      }),
  };

  // --- Buyer Payments (Merchant Razorpay Checkout) ---
  public payments = {
    createOrder: (orderId: string) =>
      this.request('payments/orders', { method: 'POST', body: { orderId } }),
    verify: (data: {
      paymentOrderId: string;
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }) =>
      this.request('payments/verify', { method: 'POST', body: data }),
  };

  // --- Merchant Razorpay & Payment Settings ---
  public paymentSettings = {
    get: () => this.request('seller/payment-settings'),
    save: (data: { keyId: string; keySecret: string; isEnabled?: boolean; codEnabled?: boolean }) =>
      this.request('seller/payment-settings', { method: 'POST', body: data }),
    toggleCod: (codEnabled: boolean) =>
      this.request('seller/payment-settings/cod', { method: 'POST', body: { codEnabled } }),
  };

  // --- Merchant Shiprocket & Shipping Settings ---
  public shippingSettings = {
    get: () => this.request('seller/shipping-settings'),
    save: (data: {
      email?: string;
      password?: string;
      pickupLocation?: string;
      isEnabled?: boolean;
      deliveryMode?: 'self' | 'shiprocket';
      isSelfDelivery?: boolean;
    }) =>
      this.request('seller/shipping-settings', { method: 'POST', body: data }),
    test: (data: { email: string; password?: string }) =>
      this.request('seller/shipping-settings/test', { method: 'POST', body: data }),
    toggle: (isEnabled: boolean) =>
      this.request('seller/shipping-settings/toggle', { method: 'POST', body: { isEnabled } }),
  };

  // --- Merchant Delivery Charges & Free Shipping Rules ---
  public deliveryRates = {
    get: () => this.request('seller/delivery-rates'),
    save: (data: { deliveryChargeRupees: number; freeDeliveryThresholdRupees?: number | null; freeDeliveryEnabled?: boolean }) =>
      this.request('seller/delivery-rates', { method: 'POST', body: data }),
  };

  // --- Orders Shipping Fulfillment & Public Tracking ---
  public shipping = {
    shipOrder: (
      orderId: string,
      options?: {
        mode?: 'SHIPROCKET' | 'SELF_DELIVERY';
        riderName?: string;
        riderPhone?: string;
        notes?: string;
      }
    ) =>
      this.request(`shipping/orders/${orderId}/ship`, {
        method: 'POST',
        body: options,
      }),
    syncTracking: (orderId: string) =>
      this.request(`shipping/orders/${orderId}/sync-tracking`, { method: 'POST' }),
    track: (awb: string) => this.request(`shipping/track/${awb}`),
  };

  // --- Delivery Partners & Riders Directory ---
  public deliveryPartners = {
    list: () =>
      this.request<{
        success: boolean;
        data: Array<{
          id: string;
          name: string;
          phone: string;
          email?: string;
          vehicle?: string;
          notes?: string;
          isDefault?: boolean;
        }>;
      }>('seller/delivery-partners'),
    save: (data: {
      id?: string;
      name: string;
      phone: string;
      email?: string;
      vehicle?: string;
      notes?: string;
      isDefault?: boolean;
    }) =>
      this.request<{ success: boolean; data: any; all: any[] }>('seller/delivery-partners', {
        method: 'POST',
        body: data,
      }),
    delete: (id: string) =>
      this.request<{ success: boolean; data: any[] }>(`seller/delivery-partners/${id}`, {
        method: 'DELETE',
      }),
  };

  // --- Product Reviews (Storefront, Seller, Admin Moderation) ---
  public reviews = {
    getEligible: (slug: string, orderNumber: string, token: string) =>
      this.request(`storefront/${slug}/reviews/eligible`, {
        params: { orderNumber, token },
      }),
    submit: (
      slug: string,
      data: {
        orderNumber: string;
        token: string;
        orderItemId: string;
        productId: string;
        reviewerName?: string;
        rating: number;
        title?: string;
        body: string;
      }
    ) =>
      this.request(`storefront/${slug}/reviews`, {
        method: 'POST',
        body: data,
      }),
    getProductReviews: (slug: string, productId: string) =>
      this.request(`storefront/${slug}/products/${productId}/reviews`),
    getSellerReviews: (params?: {
      page?: number;
      pageSize?: number;
      limit?: number;
      rating?: number | string;
      productId?: string;
      verified?: boolean | string;
      status?: string;
      sort?: string;
      search?: string;
      dateRange?: string;
    }) => this.request('seller/reviews', { params }),
    reportSellerReview: (id: string, data: { reason: string; details?: string }) =>
      this.request(`seller/reviews/${id}/report`, {
        method: 'POST',
        body: data,
      }),
    getAdminReviews: (params?: { page?: number; limit?: number; status?: string; search?: string; storeId?: string }) =>
      this.request('admin/reviews', { params }),
    getAdminReviewSummary: () =>
      this.request<AdminReviewsSummary>('admin/reviews/summary'),
    getAdminReviewTimeline: (id: string) =>
      this.request<AdminReviewTimelineEvent[]>(`admin/reviews/${id}/timeline`),
    moderateAdminReview: (
      id: string,
      data: {
        status: 'ACTIVE' | 'REMOVED';
        reason?: string;
        internalNote?: string;
        buyerFacingMessage?: string;
        merchantFacingMessage?: string;
        notifyBuyerEmail?: boolean;
        notifyMerchantEmail?: boolean;
        notifyBuyerWhatsApp?: boolean;
        notifyMerchantWhatsApp?: boolean;
      },
    ) =>
      this.request(`admin/reviews/${id}/moderate`, {
        method: 'PATCH',
        body: data,
      }),
  };
}

export const createApiClient = (baseUrl?: string) => new SimplyApiClient(baseUrl);
