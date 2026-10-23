export type AdminRange =
  | '7d'
  | '30d'
  | '90d'
  | 'custom'
  | '3m'
  | '6m'
  | '12m'
  | 'ALL';
export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
export interface AdminStore {
  id: string;
  name: string;
  slug: string;
  status: string;
  isPubliclyAccessible?: boolean;
  previewSecret?: string;
  fulfillmentMode?: string;
  supportPhone?: string | null;
  supportEmail?: string | null;
  whatsappNumber?: string | null;
  createdAt?: string;
  _count?: {
    orders: number;
    products: number;
    customers: number;
    productReviews: number;
  };
}
export interface PlanHighlightItem {
  id?: string;
  planId?: string;
  text: string;
  sortOrder: number;
}
export interface AdminPlan {
  id: string;
  name: string;
  code: string;
  description: string | null;
  pricePaise: number;
  gstBasisPoints?: number;
  status?: 'ACTIVE' | 'COMING_SOON' | 'CONTACT_SALES' | 'INACTIVE';
  displayOrder?: number;
  badge?: string | null;
  isPurchasable?: boolean;
  billingCycle: string;
  maxProducts: number;
  maxStaff: number;
  maxStorageMb: number;
  customDomainAllowed: boolean;
  isPublic: boolean;
  availability: 'AVAILABLE' | 'HIDDEN' | 'COMING_SOON' | 'CONTACT' | 'CONTACT_SALES';
  purchasable: boolean;
  merchantCount: number;
  activeSubscribersCount: number;
  highlights?: PlanHighlightItem[];
}
export interface AdminOwner {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
}
export interface AdminSubscription {
  id: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
  plan: Pick<AdminPlan, 'id' | 'name' | 'code' | 'pricePaise'> & { billingCycle?: string };
  tenant: { id: string; name: string; slug?: string };
  invoices?: Array<{
    id?: string;
    invoiceNumber?: string;
    amountPaise?: number;
    status: string;
    paidAt: string | null;
    pdfUrl?: string | null;
  }>;
}
export interface AdminMerchant {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  owner: AdminOwner | null;
  store: AdminStore | null;
  subscription: Omit<AdminSubscription, 'tenant' | 'createdAt'> | null;
}
export interface AdminInvoice {
  id: string;
  invoiceNumber: string;
  amountPaise: number;
  currency?: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  subscription?: {
    currentPeriodStart: string;
    currentPeriodEnd: string;
    plan: { name: string; code: string };
  };
  payments?: Array<{
    id: string;
    paymentMethod: string;
    providerPaymentId: string | null;
    status: string;
    createdAt: string;
  }>;
}
export interface AdminMerchantDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  memberships: Array<{ id: string; role: string; user: AdminOwner }>;
  stores: Array<AdminStore & { _count: NonNullable<AdminStore['_count']> }>;
  subscriptions: Array<Omit<AdminSubscription, 'tenant'>>;
  paymentHistory: AdminInvoice[];
  reportedReviewCount: number;
  communicationHistory?: AdminCommunicationLog[];
  suspensionHistory?: Array<{
    id: string;
    date: string;
    action: string;
    target: string;
    reason: string;
    adminName: string;
  }>;
  recentOrders?: Array<{
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    totalPaise: number;
    currency: string;
    createdAt: string;
    customer?: { fullName: string; phone?: string | null } | null;
    store: { name: string; slug: string };
  }>;
  reviewStats?: {
    activeCount: number;
    avgRating: number | null;
  };
  businessType?: string | null;
  gstRegistered?: boolean | null;
  gstin?: string | null;
  panNumberMasked?: string | null;
  udyamNumber?: string | null;
  businessVerificationStatus?: BusinessVerificationStatus;
  verification?: AdminBusinessVerification;
}
export interface AdminCommunicationLog {
  id: string;
  date: string;
  channel: string;
  subject: string;
  message?: string | null;
  status: string;
  adminName: string;
}
export interface AdminOrdersSummary {
  totalOrders: number;
  newOrders: number;
  inFulfillmentOrders: number;
  completedOrders: number;
  cancelledOrders: number;
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  totalPaise: number;
  subtotalPaise?: number;
  shippingPaise?: number;
  taxPaise?: number;
  discountPaise?: number;
  currency: string;
  paymentMethod: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  shipmentStatus: string;
  status: string;
  createdAt: string;
  itemsCount?: number;
  store: { id: string; name: string; slug?: string };
  tenant?: { id: string; name: string; slug?: string };
  customer: { id?: string; fullName: string; phone?: string; email?: string | null };
}

export interface AdminOrdersResponse extends AdminPage<AdminOrder> {
  summary: AdminOrdersSummary;
}

export interface AdminOrderDetailItem {
  id: string;
  productId?: string | null;
  productName: string;
  variantId?: string | null;
  variantTitle: string;
  sku: string;
  selectedOptions?: any;
  quantity: number;
  unitPricePaise: number;
  taxPaise: number;
  totalPaise: number;
  imageUrl?: string | null;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  shipmentStatus: string;
  fulfillmentStatus: string;
  fulfillmentMode: string;
  subtotalPaise: number;
  taxPaise: number;
  shippingPaise: number;
  discountPaise: number;
  totalPaise: number;
  currency: string;
  notes?: string | null;
  paymentMethod: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string | null;
  tenant: { id: string; name: string; slug?: string };
  store: { id: string; name: string; slug?: string };
  customer: { id: string; fullName: string; phone: string; email?: string | null };
  orderAddress?: {
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string | null;
    landmark?: string | null;
    city: string;
    state: string;
    pincode: string;
    country: string;
  } | null;
  items: AdminOrderDetailItem[];
  shipments: Array<{
    id: string;
    trackingNumber?: string | null;
    carrier?: string | null;
    status: string;
    awbCode?: string | null;
    shippedAt?: string | null;
    deliveredAt?: string | null;
  }>;
  paymentOrders: Array<{
    id: string;
    provider: string;
    gatewayOrderId?: string | null;
    status: string;
    amountPaise: number;
    createdAt: string;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus?: string | null;
    toStatus: string;
    reason?: string | null;
    actorId?: string | null;
    createdAt: string;
  }>;
}
export interface AdminUser extends AdminOwner {
  role: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
  tenant?: { id: string; name: string; slug?: string } | null;
  store: AdminStore | null;
  stores?: Array<{ id: string; name: string; slug: string }>;
  recentActivity?: Array<{
    id: string;
    action: string;
    date: string;
    adminName?: string;
    reason?: string | null;
  }>;
}

export interface AdminUserKpis {
  totalUsers: number;
  merchantOwners: number;
  staffUsers: number;
  platformAdmins: number;
  suspendedUsers: number;
}

export interface AdminUsersResponse extends AdminPage<AdminUser> {
  kpis: AdminUserKpis;
}
export interface AdminReport {
  id: string;
  reviewId: string;
  reason: string;
  merchantNote: string | null;
  status: 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED';
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
export interface AdminReview {
  id: string;
  reviewerName: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedPurchase: boolean;
  status: 'ACTIVE' | 'REMOVED';
  moderationReason: string | null;
  moderatedAt?: string | null;
  moderatedBy?: string | null;
  createdAt: string;
  updatedAt?: string;
  store: { id: string; name: string; slug: string; tenantId?: string; tenant?: { id: string; name: string } };
  product: { id: string; name: string; slug: string; media?: Array<{ publicUrl: string }> };
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    createdAt: string;
    customer?: { id?: string; fullName: string; email?: string | null; phone?: string | null } | null;
  };
  reports: AdminReport[];
}
export interface AdminReviewsSummary {
  pendingReports: number;
  underReviewReports: number;
  removedReviews: number;
  resolvedThisMonth: number;
  activeReviews: number;
  totalReviews: number;
}
export interface AdminReviewTimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  actor: string;
  date: string;
  timestamp?: string;
  details?: Record<string, any> | string | null;
}
export interface AdminReviewFilters {
  merchants: Array<{
    id: string;
    name: string;
    slug?: string;
    ownerName?: string | null;
    email?: string | null;
    phone?: string | null;
  }>;
  stores: Array<{ id: string; name: string; slug?: string; tenantId: string }>;
  products: Array<{ id: string; name: string; slug?: string; storeId: string }>;
}
export interface AdminChangeSubscriptionPlanDto {
  planId: string;
  reason?: string;
}
export interface AdminExtendSubscriptionExpiryDto {
  currentPeriodEnd: string;
  reason?: string;
}
export interface AdminCancelSubscriptionDto {
  reason: string;
}
export interface AdminPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface AdminPaginatedResult<T> {
  data: T[];
  pagination: AdminPagination;
}
export interface AdminMerchantSubscriptionItem {
  id: string;
  plan: { id?: string; name: string; code?: string; pricePaise?: number; billingCycle?: string };
  amountPaise: number;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  paymentStatus: string;
  createdAt: string;
}
export interface AdminMerchantInvoiceItem {
  id: string;
  invoiceNumber: string;
  billingPeriod: string;
  plan: string;
  amountPaise: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
}
export interface AdminMerchantOrderItem {
  id: string;
  orderNumber: string;
  customerName: string;
  amountPaise: number;
  status: string;
  createdAt: string;
}
export interface AdminMerchantModerationSummary {
  stats: {
    activeReviews: number;
    avgRating: number | null;
    pendingReports: number;
    underReviewReports: number;
    removedReviews: number;
  };
  reviewModerationActivity: AdminPaginatedResult<{
    id: string;
    date: string;
    action: string;
    reason: string | null;
    adminName: string;
  }>;
  statusHistory: AdminPaginatedResult<{
    id: string;
    date: string;
    action: string;
    target: string;
    reason: string | null;
    adminName: string;
  }>;
}
export interface AdminPayment {
  id: string;
  invoiceId?: string;
  amountPaise: number;
  status: string;
  paymentMethod: string;
  providerPaymentId: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
  invoice: {
    id?: string;
    invoiceNumber: string;
    currency: string;
    amountPaise?: number;
    status?: string;
    paidAt: string | null;
    invoicePdfUrl?: string | null;
    tenant: {
      id: string;
      name: string;
      slug?: string;
      stores?: Array<{ id: string; name: string; slug: string }>;
    };
    subscription?: {
      id?: string;
      currentPeriodStart?: string;
      currentPeriodEnd?: string;
      plan: {
        id?: string;
        name: string;
        code?: string;
        pricePaise?: number;
        billingCycle?: string;
      };
    } | null;
  };
}

export interface AdminPaymentKpis {
  collectedRevenuePaise: number;
  successfulCount: number;
  pendingCount: number;
  failedCount: number;
  refundedCount?: number;
}

export interface AdminPaymentsResponse extends AdminPage<AdminPayment> {
  kpis: AdminPaymentKpis;
}
export interface AdminAudit {
  id: string;
  actorId: string | null;
  actorName: string;
  actorRole?: string;
  actorEmail?: string | null;
  action: string;
  module?: string;
  entityType: string;
  entityId: string | null;
  targetName?: string | null;
  result?: 'SUCCESS' | 'DENIED' | 'FAILED';
  createdAt: string;
  reason: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, any> | null;
  previousStatus?: string;
  status?: string;
  beforeValue?: any;
  afterValue?: any;
}

export interface AdminAuditKpis {
  actionsToday: number;
  adminActions: number;
  securityEvents: number;
  failedActions: number;
}

export interface AdminAuditPageResult {
  items: AdminAudit[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  kpis: AdminAuditKpis;
}
export interface AdminCharts {
  merchantGrowth: Array<{ date: string; count: number }>;
  subscriptionRevenueTrends: Array<{ date: string; amountPaise: number }>;
  orderTrends: Array<{ date: string; count: number; gmvPaise: number }>;
  reportTrends: Array<{ date: string; count: number; resolved: number }>;
}
export interface AdminOverview {
  generatedAt: string;
  kpis: {
    totalMerchants: number;
    liveStores: number;
    privateStores: number;
    suspendedStores: number;
    activeSubscriptions: number;
    totalProducts: number;
    totalOrders: number;
    totalCustomers: number;
    totalReviews: number;
    pendingReviewReports: number;
    subscriptionRevenuePaise: number;
  };
  growth?: {
    merchantsThisMonth: number;
    ordersThisMonth: number;
    revenueThisMonthPaise: number;
  };
  recentlyJoinedMerchants: Array<{
    id: string;
    name: string;
    createdAt: string;
    plan: string | null;
    store: { name: string; status: string } | null;
  }>;
  recentOrders: Array<
    Pick<
      AdminOrder,
      | 'id'
      | 'orderNumber'
      | 'totalPaise'
      | 'currency'
      | 'paymentStatus'
      | 'status'
      | 'createdAt'
    > & { store: { name: string } }
  >;
  reviewModeration: {
    pendingOnlyReports: number;
    underReviewReports: number;
    resolvedThisMonth: number;
    pendingReports: number;
    removedThisMonth: number;
    resolvedReports: number;
    latestPendingReports: Array<
      Pick<AdminReport, 'id' | 'reason' | 'status' | 'createdAt'> & {
        review: {
          id: string;
          rating: number;
          reviewerName: string;
          store: { name: string };
          product: { name: string };
        };
      }
    >;
  };
  range: AdminRange;
  attention: { failedSubscriptionPayments: number };
  attentionSummary: AdminAttentionSummary;
  charts: AdminCharts;
  definitions: Record<string, string>;
}
export interface AdminAttentionSummary {
  total: number;
  reviewReports: number;
  pendingReviewReports: number;
  underReviewReports: number;
  suspendedStores: number;
  failedPayments: number;
}
export interface AdminAnalyticsPerformanceSeries {
  date: string;
  gmvPaise: number;
  ordersCount: number;
  subscriptionRevenuePaise: number;
  merchantsCount: number;
}

export interface AdminAnalyticsOrderStatusItem {
  status: string;
  count: number;
  percentage: number;
  totalPaise: number;
}

export interface AdminAnalyticsPaymentMixItem {
  method: string;
  count: number;
  percentage: number;
  totalPaise: number;
}

export interface AdminAnalyticsTopStoreItem {
  id: string;
  name: string;
  slug: string;
  tenantId?: string;
  merchantName?: string;
  ordersCount: number;
  gmvPaise?: number;
  aovPaise?: number;
}

export interface AdminAnalyticsTopProductItem {
  productId?: string | null;
  productName: string;
  sku: string;
  storeId: string;
  storeName: string;
  unitsSold: number;
  revenuePaise: number;
  ordersCount: number;
}

export interface AdminAnalyticsReviewModeration {
  reviewsCreated: number;
  reportsCreated: number;
  reportsResolved: number;
  reviewsRemoved: number;
  averageResolutionMinutes?: number | null;
}

export interface AdminAnalyticsFilterOptions {
  merchants: Array<{ id: string; name: string }>;
  stores: Array<{ id: string; name: string; tenantId: string }>;
  plans: Array<{ id: string; name: string; code: string }>;
}

export interface AdminAnalytics {
  range: AdminRange | string;
  from?: string | null;
  to?: string | null;
  kpis: {
    totalOrders: number;
    paidOrdersCount: number;
    totalGmvPaise: number;
    averageOrderValuePaise: number;
    subscriptionRevenuePaise: number;
    merchantsCreated?: number;
    activeStores?: number;
  };
  charts: AdminCharts;
  performanceChart?: {
    interval: 'day' | 'week' | 'month';
    series: AdminAnalyticsPerformanceSeries[];
  };
  orderStatusMix?: AdminAnalyticsOrderStatusItem[];
  paymentMix?: AdminAnalyticsPaymentMixItem[];
  topStores: AdminAnalyticsTopStoreItem[];
  topProducts?: AdminAnalyticsTopProductItem[];
  reviewModeration?: AdminAnalyticsReviewModeration;
  filterOptions?: AdminAnalyticsFilterOptions;
}
export interface AdminOperations {
  outbox: { totalEvents: number; pendingEvents: number; failedEvents: number };
  failedOutbox: Array<{
    id: string;
    eventType: string;
    status: string;
    retryCount: number;
    maxRetries: number;
  }>;
}

export interface AdminSettings {
  // Flat / legacy fields
  platformName: string;
  supportEmail: string;
  currency: string;
  timezone: string;
  source: string;
  plansSource: string;
  growthPurchaseEnabled: boolean;

  // Grouped section fields
  general: {
    platformName: string;
    supportEmail: string;
    supportPhone: string;
    defaultCurrency: string;
    defaultTimezone: string;
    defaultLocale: string;
  };
  brand: {
    platformDisplayName: string;
    supportEmail: string;
    supportPhone: string;
    businessEmail: string;
    websiteUrl: string;
    helpCenterUrl: string;
  };
  notifications: {
    emailServiceStatus: 'CONNECTED' | 'SIMULATION_MODE' | 'MISCONFIGURED';
    notifyMerchantOnAccountSuspension: boolean;
    notifyAdminOnReviewReport: boolean;
    notifyMerchantOnFailedSubscription: boolean;
    notifyAdminOnBusinessVerification?: boolean;
  };
  whatsapp: {
    mode: 'CLOUD_API' | 'DEEP_LINK';
    defaultTemplateGreeting: string;
  };
  commerce: {
    defaultCurrency: string;
    subscriptionGracePeriodDays: number;
    orderNumberPrefix: string;
    taxInclusivePricing: boolean;
  };
  security: {
    adminSessionTimeoutMinutes: number;
    subAdminInviteExpiryDays: number;
    maxFailedLoginAttempts: number;
    requirePinChangeFirstLogin: boolean;
    mfaPolicy: string;
  };
  moderation: {
    reviewModerationPolicy: string;
    autoHideAfterReports: number;
    policyExplanation: string;
  };
  integrations: {
    razorpay: 'CONNECTED' | 'MISCONFIGURED' | 'NOT_CONFIGURED';
    razorpayEnvironment?: 'TEST' | 'LIVE' | 'NOT_CONFIGURED';
    smtp: 'CONNECTED' | 'SIMULATION_MODE' | 'MISCONFIGURED';
    smtpHost?: string;
    smtpSenderEmail?: string;
    shiprocket: 'CONNECTED' | 'NOT_CONFIGURED';
    whatsapp: 'CONNECTED' | 'DEEP_LINK_ONLY';
  };
  adminDelegation?: {
    activeSubAdmins: number;
    pendingInvites: number;
    suspendedSubAdmins: number;
  };
  system: {
    maintenanceMode: boolean;
    environment: string;
    apiVersion: string;
    databaseStatus: string;
    lastDeployedAt: string;
  };
}

export interface AdminSubAdmin {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  role: 'PLATFORM_ADMIN' | 'SUB_ADMIN';
  isSuperAdmin: boolean;
  isActive: boolean;
  adminPermissions: string[];
  permissions: string[];
  lastLoginAt: string | null;
  activatedAt?: string | null;
  mustChangePassword?: boolean;
  isDeactivated?: boolean;
  createdAt: string;
  updatedAt: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED' | 'PENDING_INVITE' | 'DEACTIVATED';
  inviteId?: string;
  inviteExpiresAt?: string;
  recentActionsCount?: number;
}

export interface CreateSubAdminDto {
  fullName: string;
  email: string;
  phone?: string;
  temporaryPassword?: string;
  forcePasswordChange?: boolean;
  permissions: string[];
}

export interface UpdateSubAdminDto {
  fullName?: string;
  phone?: string;
  permissions?: string[];
  isActive?: boolean;
  isDeactivated?: boolean;
}

export interface ActivateSubAdminDto {
  token: string;
  pin: string;
  fullName?: string;
  phone?: string;
}

export interface AdminChangePasswordDto {
  currentPassword?: string;
  newPassword: string;
}

export interface AdminResetTempPasswordDto {
  temporaryPassword?: string;
}

export interface AdminTheme {
  id: string;
  name: string;
  code: string;
  isDefault: boolean;
  updatedAt: string;
  _count: { storeConfigs: number };
}

export interface AdminSubscriptionKpi {
  activeSubscriptions: number;
  paidRevenuePaise: number;
  expiringSoon: number;
  failedPayments: number;
}

export type BusinessType =
  | 'SOLE_PROPRIETORSHIP'
  | 'PARTNERSHIP'
  | 'LLP'
  | 'PRIVATE_LIMITED'
  | 'PUBLIC_LIMITED'
  | 'OTHER';

export type BusinessVerificationStatus =
  | 'INCOMPLETE'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'NEEDS_CHANGES';

export type MerchantDocumentType =
  | 'PAN'
  | 'BUSINESS_REGISTRATION'
  | 'OWNER_ID'
  | 'UDYAM'
  | 'GST_CERTIFICATE'
  | 'OTHER';

export type MerchantDocumentStatus =
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REUPLOAD_REQUIRED';

export interface AdminMerchantDocument {
  id: string;
  tenantId: string;
  type: MerchantDocumentType;
  documentNumberMasked: string | null;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  status: MerchantDocumentStatus;
  isCurrent: boolean;
  rejectionReason: string | null;
  adminNote: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessDocumentRequirement {
  type: MerchantDocumentType;
  title: string;
  description: string;
  required: boolean;
  requiresDocumentNumber: boolean;
  numberLabel?: string;
  numberPlaceholder?: string;
  numberPattern?: string;
}

export interface AdminBusinessVerification {
  businessType: BusinessType;
  gstRegistered: boolean;
  gstin: string | null;
  panNumberMasked: string | null;
  udyamNumber: string | null;
  overallStatus: BusinessVerificationStatus;
  requirements: BusinessDocumentRequirement[];
  documents: AdminMerchantDocument[];
}

export function getBusinessDocumentRequirements(
  businessType?: string | null,
  gstRegistered?: boolean | null,
): BusinessDocumentRequirement[] {
  const isGst = Boolean(gstRegistered);
  const type = (businessType as BusinessType) || 'SOLE_PROPRIETORSHIP';

  const reqs: BusinessDocumentRequirement[] = [];

  switch (type) {
    case 'SOLE_PROPRIETORSHIP':
      reqs.push({
        type: 'PAN',
        title: 'PAN Card (Business or Owner)',
        description: 'Permanent Account Number of the sole proprietor or registered entity',
        required: true,
        requiresDocumentNumber: true,
        numberLabel: 'PAN Number',
        numberPlaceholder: 'ABCDE1234F',
        numberPattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$',
      });
      reqs.push({
        type: 'OWNER_ID',
        title: 'Owner Identity Proof',
        description: 'Government photo ID of the sole proprietor (Aadhaar / Passport / Voter ID)',
        required: true,
        requiresDocumentNumber: true,
        numberLabel: 'ID Number (Last 4 Digits)',
        numberPlaceholder: '1234',
        numberPattern: '^[0-9]{4}$',
      });
      reqs.push({
        type: 'UDYAM',
        title: 'Udyam Registration Certificate',
        description: 'MSME / Udyam registration certificate if applicable',
        required: false,
        requiresDocumentNumber: true,
        numberLabel: 'Udyam Number',
        numberPlaceholder: 'UDYAM-XX-00-0000000',
        numberPattern: '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$',
      });
      break;

    case 'PARTNERSHIP':
      reqs.push({
        type: 'PAN',
        title: 'Partnership Firm PAN',
        description: 'Permanent Account Number registered in the name of the partnership firm',
        required: true,
        requiresDocumentNumber: true,
        numberLabel: 'Firm PAN',
        numberPlaceholder: 'ABCDE1234F',
        numberPattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$',
      });
      reqs.push({
        type: 'BUSINESS_REGISTRATION',
        title: 'Partnership Deed / Registration',
        description: 'Notarized Partnership Deed or Registrar of Firms Certificate',
        required: true,
        requiresDocumentNumber: false,
      });
      reqs.push({
        type: 'OWNER_ID',
        title: 'Managing Partner Identity Proof',
        description: 'Photo identification proof of authorized managing partner',
        required: true,
        requiresDocumentNumber: true,
        numberLabel: 'Partner ID (Last 4 Digits)',
        numberPlaceholder: '1234',
        numberPattern: '^[0-9]{4}$',
      });
      reqs.push({
        type: 'UDYAM',
        title: 'Udyam Registration Certificate',
        description: 'MSME registration certificate for the partnership firm if applicable',
        required: false,
        requiresDocumentNumber: true,
        numberLabel: 'Udyam Number',
        numberPlaceholder: 'UDYAM-XX-00-0000000',
        numberPattern: '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$',
      });
      break;

    case 'LLP':
      reqs.push({
        type: 'PAN',
        title: 'LLP PAN Card',
        description: 'Permanent Account Number of the Limited Liability Partnership entity',
        required: true,
        requiresDocumentNumber: true,
        numberLabel: 'LLP PAN',
        numberPlaceholder: 'ABCDE1234F',
        numberPattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$',
      });
      reqs.push({
        type: 'BUSINESS_REGISTRATION',
        title: 'LLP Certificate of Incorporation',
        description: 'MCA Certificate of Incorporation or LLP Agreement',
        required: true,
        requiresDocumentNumber: false,
      });
      reqs.push({
        type: 'OWNER_ID',
        title: 'Designated Partner Identity Proof',
        description: 'Photo ID and DPIN confirmation of authorized designated partner',
        required: true,
        requiresDocumentNumber: true,
        numberLabel: 'Partner ID (Last 4 Digits)',
        numberPlaceholder: '1234',
        numberPattern: '^[0-9]{4}$',
      });
      reqs.push({
        type: 'UDYAM',
        title: 'Udyam Registration Certificate',
        description: 'MSME registration certificate for the LLP if applicable',
        required: false,
        requiresDocumentNumber: true,
        numberLabel: 'Udyam Number',
        numberPlaceholder: 'UDYAM-XX-00-0000000',
        numberPattern: '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$',
      });
      break;

    case 'PRIVATE_LIMITED':
    case 'PUBLIC_LIMITED':
      reqs.push({
        type: 'PAN',
        title: 'Company PAN Card',
        description: 'Corporate PAN registered with Ministry of Corporate Affairs',
        required: true,
        requiresDocumentNumber: true,
        numberLabel: 'Company PAN',
        numberPlaceholder: 'ABCDE1234F',
        numberPattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$',
      });
      reqs.push({
        type: 'BUSINESS_REGISTRATION',
        title: 'Certificate of Incorporation (CIN)',
        description: 'MCA Certificate of Incorporation and Memorandum of Association',
        required: true,
        requiresDocumentNumber: false,
      });
      reqs.push({
        type: 'OWNER_ID',
        title: 'Authorized Director Identity Proof',
        description: 'Photo ID and DIN confirmation of authorized signing director',
        required: true,
        requiresDocumentNumber: true,
        numberLabel: 'Director ID (Last 4 Digits)',
        numberPlaceholder: '1234',
        numberPattern: '^[0-9]{4}$',
      });
      reqs.push({
        type: 'UDYAM',
        title: 'Udyam Registration Certificate',
        description: 'MSME registration certificate if company is registered under MSMED',
        required: false,
        requiresDocumentNumber: true,
        numberLabel: 'Udyam Number',
        numberPlaceholder: 'UDYAM-XX-00-0000000',
        numberPattern: '^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$',
      });
      break;

    default: // OTHER
      reqs.push({
        type: 'PAN',
        title: 'Entity / Owner PAN Card',
        description: 'Permanent Account Number for legal tax entity',
        required: true,
        requiresDocumentNumber: true,
        numberLabel: 'PAN Number',
        numberPlaceholder: 'ABCDE1234F',
        numberPattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$',
      });
      reqs.push({
        type: 'BUSINESS_REGISTRATION',
        title: 'Business Registration Document',
        description: 'Shop & Establishment license, Trust deed, or trade license',
        required: false,
        requiresDocumentNumber: false,
      });
      reqs.push({
        type: 'OWNER_ID',
        title: 'Authorized Signatory Identity Proof',
        description: 'Photo identification proof of authorized operator',
        required: true,
        requiresDocumentNumber: true,
        numberLabel: 'Signatory ID (Last 4 Digits)',
        numberPlaceholder: '1234',
        numberPattern: '^[0-9]{4}$',
      });
      break;
  }

  // GST Registration Condition
  if (isGst) {
    reqs.push({
      type: 'GST_CERTIFICATE',
      title: 'GST Registration Certificate (REG-06)',
      description: 'Official Goods and Services Tax Identification Certificate',
      required: true,
      requiresDocumentNumber: true,
      numberLabel: 'GSTIN (15 Digits)',
      numberPlaceholder: '27ABCDE1234F1Z5',
      numberPattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
    });
  }

  return reqs;
}

export function calculateOverallVerificationStatus(
  requirements: BusinessDocumentRequirement[],
  documents: Array<{ type: MerchantDocumentType; status: MerchantDocumentStatus }>,
): BusinessVerificationStatus {
  const currentDocs = new Map<MerchantDocumentType, MerchantDocumentStatus>();
  for (const d of documents) {
    currentDocs.set(d.type, d.status);
  }

  const requiredReqs = requirements.filter((r) => r.required);

  let hasRejected = false;
  let allRequiredVerified = true;
  let allRequiredUploaded = true;

  for (const r of requiredReqs) {
    const docStatus = currentDocs.get(r.type);
    if (!docStatus) {
      allRequiredUploaded = false;
      allRequiredVerified = false;
    } else if (docStatus === 'REJECTED' || docStatus === 'REUPLOAD_REQUIRED') {
      hasRejected = true;
      allRequiredVerified = false;
    } else if (docStatus !== 'VERIFIED') {
      allRequiredVerified = false;
    }
  }

  if (hasRejected) {
    return 'NEEDS_CHANGES';
  }

  if (allRequiredVerified && requiredReqs.length > 0) {
    return 'VERIFIED';
  }

  if (allRequiredUploaded && requiredReqs.length > 0) {
    return 'PENDING_REVIEW';
  }

  return 'INCOMPLETE';
}

