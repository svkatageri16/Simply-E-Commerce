import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  MapPin,
  Phone,
  MessageSquare,
  CreditCard,
  Truck,
  CheckCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  Check,
  Ban,
  ArrowRight,
  Store as StoreIcon,
  Printer,
  Loader2,
  RefreshCw,
  Copy,
  UserCheck,
  Send,
  Mail,
  UserPlus,
  Sparkles,
  MessageCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSellerI18n } from '@simply/i18n';
import { formatPaise, getPaymentDisplayDetails, formatPaymentMethod, formatCollectionMode, resolveVariantDisplayMedia } from '@simply/ui';
import {
  buildOrderAcceptedMessage,
  buildOrderReadyMessage,
  buildOrderDispatchedBuyerMessage,
  buildOrderDeliveredMessage,
  buildOrderCancelledMessage,
  buildOrderOutForDeliveryMessage,
  sanitizeWhatsAppOrderMessage,
  buildRiderAssignmentMessage,
  buildWhatsAppDeepLink,
  normalizeIndianPhone,
  buildPublicTrackingUrl,
  buildPublicReviewUrl,
  buildGoogleMapsUrl,
} from '@simply/api-contracts';
import { SafeImage } from './ui/SafeImage';
import { InvoiceModal } from './InvoiceModal';
import { getStorefrontUrl } from '../utils/config';

interface OrderDetailsDrawerProps {
  order: any | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated: () => void;
}

const ORDER_STATUS_CONFIG: Record<
  string,
  { label: string; bgClass: string; textClass: string }
> = {
  NEW: { label: 'New', bgClass: 'bg-blue-500/10 border border-blue-500/30', textClass: 'text-blue-600 dark:text-blue-400' },
  CONFIRMED: { label: 'Confirmed', bgClass: 'bg-indigo-500/10 border border-indigo-500/30', textClass: 'text-indigo-600 dark:text-indigo-400' },
  ACCEPTED: { label: 'Accepted', bgClass: 'bg-cyan-500/10 border border-cyan-500/30', textClass: 'text-cyan-600 dark:text-cyan-400' },
  READY: { label: 'Ready to Ship', bgClass: 'bg-amber-500/10 border border-amber-500/30', textClass: 'text-amber-700 dark:text-amber-400' },
  DISPATCHED: { label: 'Dispatched', bgClass: 'bg-purple-500/10 border border-purple-500/30', textClass: 'text-purple-600 dark:text-purple-400' },
  COMPLETED: { label: 'Completed', bgClass: 'bg-emerald-500/10 border border-emerald-500/30', textClass: 'text-emerald-600 dark:text-emerald-400' },
  CANCELLED: { label: 'Cancelled', bgClass: 'bg-rose-500/10 border border-rose-500/30', textClass: 'text-rose-600 dark:text-rose-400' },
  RETURN_REQUESTED: { label: 'Return Requested', bgClass: 'bg-amber-500/10 border border-amber-500/30', textClass: 'text-amber-700 dark:text-amber-400' },
  RETURNED: { label: 'Returned', bgClass: 'bg-slate-500/10 border border-slate-500/30', textClass: 'text-slate-600 dark:text-slate-400' },
};

const PAYMENT_STATUS_CONFIG: Record<
  string,
  { label: string; bgClass: string; textClass: string }
> = {
  PAID: { label: 'Paid', bgClass: 'bg-emerald-500/10 border border-emerald-500/30', textClass: 'text-emerald-600 dark:text-emerald-400' },
  PENDING: { label: 'Pending', bgClass: 'bg-amber-500/10 border border-amber-500/30', textClass: 'text-amber-700 dark:text-amber-400' },
  AUTHORIZED: { label: 'Authorized', bgClass: 'bg-blue-500/10 border border-blue-500/30', textClass: 'text-blue-600 dark:text-blue-400' },
  FAILED: { label: 'Failed', bgClass: 'bg-rose-500/10 border border-rose-500/30', textClass: 'text-rose-600 dark:text-rose-400' },
  REFUNDED: { label: 'Refunded', bgClass: 'bg-slate-500/10 border border-slate-500/30', textClass: 'text-slate-600 dark:text-slate-400' },
  PARTIALLY_REFUNDED: { label: 'Partially Refunded', bgClass: 'bg-slate-500/10 border border-slate-500/30', textClass: 'text-slate-600 dark:text-slate-400' },
};

const CANCELLATION_REASONS = [
  'Customer requested cancellation',
  'Out of stock',
  'Unable to fulfill at this time',
  'Duplicate order',
  'Other',
];

const STATUS_MESSAGE_SUGGESTIONS: Record<string, string[]> = {
  ACCEPTED: [
    'Order accepted! We are packing your items right now.',
    'Items confirmed in stock. Will prepare and pack shortly.',
  ],
  CONFIRMED: [
    'Order confirmed by our store! Packing has begun.',
    'Thank you! Your order is confirmed and in progress.',
  ],
  READY: [
    'Order is packed and ready for delivery/pickup!',
    'All items checked and sealed. Awaiting rider handover.',
  ],
  DISPATCHED: [
    'Out for delivery now! Expected arrival in 15-20 minutes.',
    'Please keep exact cash ready for COD payment.',
    'Delivery rider will call upon arriving at your gate/door.',
  ],
  COMPLETED: [
    'Package delivered! Thank you for supporting our local business.',
    'Order delivered successfully! Hope you enjoy your purchase.',
  ],
  CANCELLED: [
    'Order cancelled as requested by customer.',
    'Item temporarily out of stock. Apologies for the inconvenience.',
  ],
};

export const OrderDetailsDrawer: React.FC<OrderDetailsDrawerProps> = ({
  order,
  isOpen,
  onClose,
  onStatusUpdated,
}) => {
  const { api, store, user } = useAuth();
  const { t, locale } = useSellerI18n();
  const [updating, setUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // WhatsApp manual sending follow-up panel state after order status updates
  const [whatsappFollowUp, setWhatsappFollowUp] = useState<{
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    buyerWaUrl: string;
    buyerText?: string;
    stageName?: string;
    buyerOpened: boolean;
    riderName?: string;
    riderPhone?: string;
    riderWaUrl?: string;
    riderOpened: boolean;
  } | null>(null);
  const [copiedBuyerMsg, setCopiedBuyerMsg] = useState(false);

  // Delivery Partners Directory from Store
  const [deliveryPartners, setDeliveryPartners] = useState<
    Array<{ id: string; name: string; phone: string; email?: string; vehicle?: string; isDefault?: boolean }>
  >([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [isAddingNewRiderInline, setIsAddingNewRiderInline] = useState(false);
  const [saveRiderToDirectory, setSaveRiderToDirectory] = useState(true);
  const [riderName, setRiderName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [riderEmail, setRiderEmail] = useState('');
  const [riderVehicle, setRiderVehicle] = useState('Motorcycle');
  const [isSavingPartnerInline, setIsSavingPartnerInline] = useState(false);
  const [inlinePartnerMsg, setInlinePartnerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Two-Step Status Confirmation & Automated Notification Modal State
  const [statusConfirmModal, setStatusConfirmModal] = useState<{
    targetStatus: string;
    title: string;
    subtitle: string;
    badgeLabel?: string;
    defaultReason: string;
    themeColor: 'blue' | 'cyan' | 'amber' | 'purple' | 'emerald' | 'rose';
  } | null>(null);

  const [customMessage, setCustomMessage] = useState('');
  const [cancellationReason, setCancellationReason] = useState(CANCELLATION_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [sendEmailNotification, setSendEmailNotification] = useState(true);
  const [sendWhatsAppNotification, setSendWhatsAppNotification] = useState(true);

  // Shipping & Dispatch Mode State
  const [selectedFulfillmentMode, setSelectedFulfillmentMode] = useState<'SELF_DELIVERY' | 'SHIPROCKET'>('SELF_DELIVERY');
  const [syncingTracking, setSyncingTracking] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);
  const [copiedTracking, setCopiedTracking] = useState(false);

  // Invoice & COD Collection Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [codModalOpen, setCodModalOpen] = useState(false);
  const [codMethod, setCodMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'OTHER'>('CASH');
  const [isCollectingCod, setIsCollectingCod] = useState(false);
  const [codActionError, setCodActionError] = useState<string | null>(null);

  const handleCollectCodPayment = async () => {
    if (!order) return;
    setIsCollectingCod(true);
    setCodActionError(null);
    try {
      await api.orders.collectCod(order.id, { collectionMethod: codMethod });
      setCodModalOpen(false);
      onStatusUpdated();
    } catch (err: any) {
      console.error('Failed to collect COD payment', err);
      setCodActionError(err.message || 'Failed to record COD payment collection.');
    } finally {
      setIsCollectingCod(false);
    }
  };

  // Load registered delivery partners when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    const fetchPartners = async () => {
      try {
        const res: any = await api.deliveryPartners.list();
        const list: any[] = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
        if (list.length > 0) {
          const uniqueMap = new Map();
          for (const p of list) {
            const key = `${(p.name || '').trim().toLowerCase()}_${(p.phone || '').replace(/[^0-9]/g, '')}`;
            if (!uniqueMap.has(key) || p.isDefault) {
              uniqueMap.set(key, p);
            }
          }
          const uniquePartners = Array.from(uniqueMap.values());
          setDeliveryPartners(uniquePartners);

          // Check if order already has an assigned rider in shipment
          const existingCourier = order?.shipments?.[0]?.courierName;
          let matchedExisting = null;
          if (existingCourier) {
            const cleanCourier = existingCourier.replace('Store Team:', '').trim().toLowerCase();
            matchedExisting = uniquePartners.find(
              (p: any) => p.name?.trim().toLowerCase() === cleanCourier
            );
          }

          const def = matchedExisting || uniquePartners.find((p: any) => p.isDefault) || uniquePartners[0];
          if (def) {
            setSelectedPartnerId(def.id);
            setRiderName(def.name);
            setRiderPhone(def.phone);
            setRiderEmail(def.email || '');
            setRiderVehicle(def.vehicle || 'Motorcycle');
            setIsAddingNewRiderInline(false);
          } else {
            setSelectedPartnerId('NEW');
            setIsAddingNewRiderInline(true);
          }
        } else {
          setDeliveryPartners([]);
          setSelectedPartnerId('NEW');
          setIsAddingNewRiderInline(true);
        }
      } catch (e) {
        // ignore fallback
      }
    };
    fetchPartners();
  }, [isOpen, order?.id, order?.status]);

  // Load persisted WhatsApp follow-up state from localStorage
  useEffect(() => {
    if (!order?.orderNumber) {
      setWhatsappFollowUp(null);
      return;
    }
    try {
      const stored = localStorage.getItem(`simply_wa_followup_${order.orderNumber}`);
      if (stored) {
        const saved = JSON.parse(stored);
        const savedText = saved.buyerText || new URL(saved.buyerWaUrl).searchParams.get('text') || '';
        const buyerText = sanitizeWhatsAppOrderMessage(savedText);
        const cleaned = { ...saved, buyerText, buyerWaUrl: buildWhatsAppDeepLink(saved.customerPhone, buyerText) };
        setWhatsappFollowUp(cleaned);
        localStorage.setItem(`simply_wa_followup_${order.orderNumber}`, JSON.stringify(cleaned));
      } else {
        setWhatsappFollowUp(null);
      }
    } catch {
      setWhatsappFollowUp(null);
    }
  }, [order?.orderNumber]);

  if (!isOpen || !order) return null;

  const handlePartnerSelect = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
    if (partnerId === 'NEW') {
      setIsAddingNewRiderInline(true);
      setRiderName('');
      setRiderPhone('');
      setRiderEmail('');
      setRiderVehicle('Motorcycle');
    } else {
      setIsAddingNewRiderInline(false);
      const found = deliveryPartners.find((p) => p.id === partnerId);
      if (found) {
        setRiderName(found.name);
        setRiderPhone(found.phone);
        setRiderEmail(found.email || '');
        setRiderVehicle(found.vehicle || 'Motorcycle');
      }
    }
  };

  const handleSavePartnerInline = async () => {
    if (!riderName.trim() || !riderPhone.trim()) {
      setInlinePartnerMsg({ type: 'error', text: 'Delivery partner name and mobile number are required.' });
      return;
    }
    const cleanNumber = riderPhone.replace(/[^0-9]/g, '');
    if (cleanNumber.length < 10) {
      setInlinePartnerMsg({ type: 'error', text: 'Please enter a valid 10-digit mobile number.' });
      return;
    }

    setIsSavingPartnerInline(true);
    setInlinePartnerMsg(null);
    try {
      const savedRes: any = await api.deliveryPartners.save({
        name: riderName.trim(),
        phone: cleanNumber,
        email: riderEmail.trim() || undefined,
        vehicle: riderVehicle.trim() || 'Motorcycle',
        isDefault: deliveryPartners.length === 0,
      });

      const res: any = await api.deliveryPartners.list();
      const list: any[] = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      const uniqueMap = new Map();
      for (const p of list) {
        const key = `${(p.name || '').trim().toLowerCase()}_${(p.phone || '').replace(/[^0-9]/g, '')}`;
        if (!uniqueMap.has(key) || p.isDefault) {
          uniqueMap.set(key, p);
        }
      }
      const uniquePartners = Array.from(uniqueMap.values());
      setDeliveryPartners(uniquePartners);

      const matched =
        uniquePartners.find(
          (p: any) =>
            p.phone?.replace(/[^0-9]/g, '') === cleanNumber ||
            p.id === savedRes?.data?.id ||
            p.id === savedRes?.id
        ) || uniquePartners[uniquePartners.length - 1];

      if (matched) {
        setSelectedPartnerId(matched.id);
        setRiderName(matched.name);
        setRiderPhone(matched.phone);
        setRiderEmail(matched.email || '');
        setRiderVehicle(matched.vehicle || 'Motorcycle');
        setIsAddingNewRiderInline(false);
      }
      setInlinePartnerMsg({
        type: 'success',
        text: `"${riderName.trim()}" added to directory and assigned to this order!`,
      });
      setTimeout(() => setInlinePartnerMsg(null), 4000);
    } catch (err: any) {
      setInlinePartnerMsg({ type: 'error', text: err.message || 'Failed to save delivery partner.' });
    } finally {
      setIsSavingPartnerInline(false);
    }
  };

  const openStatusConfirmation = (config: {
    targetStatus: string;
    title: string;
    subtitle: string;
    badgeLabel?: string;
    defaultReason: string;
    themeColor: 'blue' | 'cyan' | 'amber' | 'purple' | 'emerald' | 'rose';
  }) => {
    setActionError(null);
    setCustomMessage('');
    setStatusConfirmModal(config);
  };

  const cleanPhone = (p?: string) => {
    if (!p) return '';
    return p.replace(/[^0-9]/g, '').replace(/^91/, '');
  };

  const customerName =
    order.customerName ||
    order.customer?.fullName ||
    order.customer?.name ||
    order.orderAddress?.fullName ||
    order.deliveryAddress?.fullName ||
    'Guest Customer';

  const customerPhone =
    order.customerPhone ||
    order.customer?.phone ||
    order.orderAddress?.phoneNumber ||
    order.orderAddress?.phone ||
    order.deliveryAddress?.phoneNumber ||
    order.deliveryAddress?.phone ||
    '';

  const customerEmail =
    order.customerEmail ||
    order.customer?.email ||
    order.deliveryAddress?.email ||
    '';

  const addr =
    order.orderAddress ||
    (order.deliveryAddress as any) ||
    {};

  const isPickup = order.fulfillmentMode === 'PICKUP';
  const shipment = order.shipments?.[0];

  const isSelfDelivery =
    shipment?.provider === 'SELF_DELIVERY' ||
    order.fulfillmentMode === 'PICKUP' ||
    (shipment?.awbNumber && shipment.awbNumber.startsWith('SELF_')) ||
    (shipment?.courierName && shipment.courierName.startsWith('Store Team')) ||
    Boolean(order.riderName || order.riderPhone);

  // Canonical public storefront tracking URL (Points to Storefront Port 3000, NOT Seller Port 3001)
  const trackingUrl = order.trackingToken
    ? buildPublicTrackingUrl(order.orderNumber, order.trackingToken)
    : undefined;

  const handleCopyTrackingLink = async () => {
    if (!trackingUrl) return;
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopiedTracking(true);
      setTimeout(() => setCopiedTracking(false), 2500);
    } catch (e) {
      // ignore clipboard error
    }
  };

  const getRiderAssignmentWhatsAppUrl = (pPhone?: string | null, pName?: string | null) => {
    const targetPhone = pPhone || riderPhone;
    if (!targetPhone) return '#';
    const itemsSummary =
      order.itemsSummary ||
      (order.items && order.items.map((it: any) => `${it.quantity}x ${it.productName}`).join(', ')) ||
      'Items';

    const text = buildRiderAssignmentMessage({
      orderNumber: order.orderNumber,
      storeName: store?.name || 'Our Store',
      storePhone: store?.supportPhone || null,
      riderName: pName || riderName || 'Delivery Partner',
      riderPhone: targetPhone,
      customerName,
      customerPhone,
      address: {
        addressLine1: addr.addressLine1,
        addressLine2: addr.addressLine2,
        landmark: addr.landmark,
        city: addr.city,
        state: addr.state,
        pincode: addr.pincode || addr.postalCode,
        country: addr.country || 'India',
      },
      itemsSummary,
      totalPaise: order.totalPaise,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      codCollectionMethod: order.codCollectionMethod,
      deliveryNote: customMessage.trim() || undefined,
    });
    return buildWhatsAppDeepLink(targetPhone, text);
  };

  const getWhatsAppLinkForStatus = (
    status: string,
    customMsg?: string,
    riderN?: string,
    riderP?: string
  ) => {
    const itemsSummary =
      order.itemsSummary ||
      (order.items && order.items.map((it: any) => `${it.quantity}x ${it.productName}`).join(', ')) ||
      'Items';

    const effReviewToken = order.reviewToken || order.trackingToken;
    const reviewUrl = effReviewToken && store?.slug
      ? buildPublicReviewUrl(store.slug, order.orderNumber, effReviewToken, getStorefrontUrl())
      : undefined;

    const ctx = {
      orderNumber: order.orderNumber,
      storeName: store?.name || 'Our Store',
      customerName,
      customerPhone,
      totalPaise: order.totalPaise,
      itemsSummary,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      codCollectionMethod: order.codCollectionMethod,
      trackingUrl,
      reviewUrl,
      deliveryMode: isSelfDelivery ? 'SELF_DELIVERY' : 'SHIPROCKET',
      courierName: isSelfDelivery
        ? (riderN || riderName ? `Store Team: ${riderN || riderName}` : 'Store Delivery Team')
        : (shipment?.courierName || 'Shiprocket Logistics'),
      awbNumber: shipment?.awbNumber,
      riderName: riderN || riderName || undefined,
      riderPhone: riderP || riderPhone || undefined,
      customMessage: customMsg?.trim() || customMessage.trim() || undefined,
    };

    let text = '';
    if (status === 'OUT_FOR_DELIVERY') {
      text = buildOrderOutForDeliveryMessage(ctx);
    } else if (status === 'DISPATCHED' || status === 'SHIPPED') {
      text = buildOrderDispatchedBuyerMessage(ctx);
    } else if (status === 'COMPLETED' || status === 'DELIVERED') {
      text = buildOrderDeliveredMessage(ctx);
    } else if (status === 'ACCEPTED' || status === 'CONFIRMED') {
      text = buildOrderAcceptedMessage(ctx);
    } else if (status === 'READY' || status === 'READY_TO_SHIP') {
      text = buildOrderReadyMessage(ctx);
    } else if (status === 'CANCELLED') {
      text = buildOrderCancelledMessage(ctx);
    } else {
      text = buildOrderAcceptedMessage(ctx);
    }

    return buildWhatsAppDeepLink(customerPhone, text);
  };

  const handleConfirmStatusUpdate = async () => {
    if (!statusConfirmModal) return;
    setUpdating(true);
    setActionError(null);

    const { targetStatus, defaultReason } = statusConfirmModal;
    const effectiveReason =
      targetStatus === 'CANCELLED' && cancellationReason === 'Other' && customReason
        ? customReason
        : defaultReason;

    const isSelfDeliveryAction =
      (targetStatus === 'DISPATCHED' || targetStatus === 'COMPLETED') &&
      selectedFulfillmentMode === 'SELF_DELIVERY';

    const effectiveRiderName = isSelfDeliveryAction && riderName.trim() ? riderName.trim() : undefined;
    const effectiveRiderPhone = isSelfDeliveryAction && riderPhone.trim() ? riderPhone.trim() : undefined;
    const effectiveRiderEmail = isSelfDeliveryAction && riderEmail.trim() ? riderEmail.trim() : undefined;

    try {
      // 1. If adding a new rider on the fly and saving to store directory
      if (
        isSelfDeliveryAction &&
        isAddingNewRiderInline &&
        effectiveRiderName &&
        effectiveRiderPhone &&
        saveRiderToDirectory
      ) {
        api.deliveryPartners
          .save({
            name: effectiveRiderName,
            phone: effectiveRiderPhone,
            email: effectiveRiderEmail,
            vehicle: riderVehicle.trim() || 'Motorcycle',
            isDefault: deliveryPartners.length === 0,
          })
          .catch(() => {});
      }

      // 2. If dispatching via Shiprocket
      if (targetStatus === 'DISPATCHED' && selectedFulfillmentMode === 'SHIPROCKET') {
        await api.shipping.shipOrder(order.id, {
          mode: 'SHIPROCKET',
          notes: customMessage.trim() || undefined,
        });
      }

      // 3. Atomically update order status, reason, custom note, and rider info
      await api.orders.updateStatus(order.id, targetStatus, effectiveReason, {
        customMessage: customMessage.trim() || undefined,
        riderName: effectiveRiderName,
        riderPhone: effectiveRiderPhone,
        riderEmail: effectiveRiderEmail,
      });

      // Close status confirmation modal
      setStatusConfirmModal(null);
      onStatusUpdated();

      // Show reliable WhatsApp follow-up panel with stage-specific message & manual send actions
      const itemsSummary =
        order.itemsSummary ||
        (order.items && order.items.map((it: any) => `${it.quantity}x ${it.productName}`).join(', ')) ||
        'Items';

      let buyerText = '';
      if (targetStatus === 'DISPATCHED') {
        buyerText = buildOrderDispatchedBuyerMessage({
          orderNumber: order.orderNumber,
          storeName: store?.name || 'Our Store',
          customerName,
          customerPhone,
          totalPaise: order.totalPaise,
          itemsSummary,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          codCollectionMethod: order.codCollectionMethod,
          trackingUrl,
          deliveryMode: selectedFulfillmentMode === 'SELF_DELIVERY' ? 'SELF_DELIVERY' : 'SHIPROCKET',
          courierName: selectedFulfillmentMode === 'SELF_DELIVERY'
            ? (effectiveRiderName ? `Store Team: ${effectiveRiderName}` : 'Store Delivery Team')
            : 'Shiprocket Logistics',
          riderName: effectiveRiderName,
          riderPhone: effectiveRiderPhone,
          customMessage: customMessage.trim() || undefined,
        });
      } else if (targetStatus === 'COMPLETED') {
        const effReviewToken = order.reviewToken || order.trackingToken;
        const reviewUrl = effReviewToken && store?.slug
          ? buildPublicReviewUrl(store.slug, order.orderNumber, effReviewToken, getStorefrontUrl())
          : undefined;
        buyerText = buildOrderDeliveredMessage({
          orderNumber: order.orderNumber,
          storeName: store?.name || 'Our Store',
          customerName,
          customerPhone,
          totalPaise: order.totalPaise,
          itemsSummary,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          codCollectionMethod: order.codCollectionMethod,
          trackingUrl,
          reviewUrl,
          customMessage: customMessage.trim() || undefined,
        });
      } else if (targetStatus === 'ACCEPTED' || targetStatus === 'CONFIRMED') {
        buyerText = buildOrderAcceptedMessage({
          orderNumber: order.orderNumber,
          storeName: store?.name || 'Our Store',
          customerName,
          customerPhone,
          totalPaise: order.totalPaise,
          itemsSummary,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          codCollectionMethod: order.codCollectionMethod,
          trackingUrl,
          customMessage: customMessage.trim() || undefined,
        });
      } else if (targetStatus === 'READY') {
        buyerText = buildOrderReadyMessage({
          orderNumber: order.orderNumber,
          storeName: store?.name || 'Our Store',
          customerName,
          customerPhone,
          totalPaise: order.totalPaise,
          itemsSummary,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          codCollectionMethod: order.codCollectionMethod,
          trackingUrl,
          customMessage: customMessage.trim() || undefined,
        });
      } else if (targetStatus === 'CANCELLED') {
        buyerText = buildOrderCancelledMessage({
          orderNumber: order.orderNumber,
          storeName: store?.name || 'Our Store',
          customerName,
          customerPhone,
          totalPaise: order.totalPaise,
          itemsSummary,
          cancellationReason: effectiveReason || customMessage.trim() || undefined,
        });
      } else {
        buyerText = buildOrderAcceptedMessage({
          orderNumber: order.orderNumber,
          storeName: store?.name || 'Our Store',
          customerName,
          customerPhone,
          totalPaise: order.totalPaise,
          itemsSummary,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          codCollectionMethod: order.codCollectionMethod,
          trackingUrl,
          customMessage: customMessage.trim() || undefined,
        });
      }

      if (buyerText && customerPhone) {
        const buyerWaUrl = buildWhatsAppDeepLink(customerPhone, buyerText);

        let riderWaUrl = '';
        if (targetStatus === 'DISPATCHED' && effectiveRiderPhone) {
          const riderText = buildRiderAssignmentMessage({
            orderNumber: order.orderNumber,
            storeName: store?.name || 'Our Store',
            storePhone: store?.supportPhone || null,
            riderName: effectiveRiderName || 'Delivery Partner',
            riderPhone: effectiveRiderPhone,
            customerName,
            customerPhone,
            address: {
              addressLine1: addr.addressLine1,
              addressLine2: addr.addressLine2,
              landmark: addr.landmark,
              city: addr.city,
              state: addr.state,
              pincode: addr.pincode || addr.postalCode,
              country: addr.country || 'India',
            },
            itemsSummary,
            totalPaise: order.totalPaise,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            codCollectionMethod: order.codCollectionMethod,
            deliveryNote: customMessage.trim() || undefined,
          });
          riderWaUrl = buildWhatsAppDeepLink(effectiveRiderPhone, riderText);
        }

        const followUpPayload = {
          orderNumber: order.orderNumber,
          customerName,
          customerPhone,
          buyerWaUrl,
          buyerText,
          stageName: targetStatus,
          buyerOpened: false,
          riderName: effectiveRiderName,
          riderPhone: effectiveRiderPhone,
          riderWaUrl,
          riderOpened: false,
        };
        try {
          localStorage.setItem(`simply_wa_followup_${order.orderNumber}`, JSON.stringify(followUpPayload));
        } catch (e) {
          console.error('Failed to persist WhatsApp follow-up state', e);
        }
        setWhatsappFollowUp(followUpPayload);
      }
    } catch (err: any) {
      console.error('Failed to update status', err);
      setActionError(err.message || 'Status transition rejected by server.');
    } finally {
      setUpdating(false);
    }
  };

  const handleSyncTracking = async () => {
    setSyncingTracking(true);
    setActionError(null);
    setSyncSuccessMessage(null);
    try {
      const res: any = await api.shipping.syncTracking(order.id);
      setSyncSuccessMessage(
        res?.tracking?.status
          ? `Status pulled from Shiprocket: ${res.tracking.status}${res.tracking.location ? ` (${res.tracking.location})` : ''}`
          : 'Live tracking synchronized successfully.'
      );
      onStatusUpdated();
    } catch (err: any) {
      setActionError(err.message || 'Failed to pull live tracking from Shiprocket API.');
    } finally {
      setSyncingTracking(false);
    }
  };

  const rawStatusConfig = ORDER_STATUS_CONFIG[order.status] || {
    label: order.status,
    bgClass: 'bg-merchant-surface-raised border border-merchant-border',
    textClass: 'text-merchant-text',
  };
  const statusMeta = {
    ...rawStatusConfig,
    label: t(`orderStatus.${order.status}`, {}, rawStatusConfig.label),
  };

  const rawPaymentConfig = PAYMENT_STATUS_CONFIG[order.paymentStatus] || {
    label: order.paymentStatus,
    bgClass: 'bg-merchant-surface-raised border border-merchant-border',
    textClass: 'text-merchant-text',
  };
  const paymentMeta = {
    ...rawPaymentConfig,
    label: t(`paymentStatus.${order.paymentStatus}`, {}, rawPaymentConfig.label),
  };

  // Payment details
  const paymentDisplay = getPaymentDisplayDetails(order);
  const paymentOrder = order.paymentOrders?.[0];
  const paymentTransaction = paymentOrder?.transactions?.[0];
  const paymentMethodDisplay = paymentDisplay.methodLabel;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-drawer-title"
        className="fixed inset-0 z-50 flex justify-end bg-merchant-overlay backdrop-blur-xs"
      >
        <div className="w-full sm:max-w-xl md:max-w-2xl bg-merchant-surface text-merchant-text h-full flex flex-col shadow-2xl overflow-hidden border-l border-merchant-border animate-in slide-in-from-right duration-200">
          {/* =========================================================================
              DRAWER HEADER
          ========================================================================= */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-merchant-border bg-merchant-surface-raised">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2
                  id="order-drawer-title"
                  className="text-base sm:text-lg font-bold text-merchant-text font-mono tracking-tight"
                >
                  Order #{order.orderNumber}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${statusMeta.bgClass} ${statusMeta.textClass}`}
                >
                  {statusMeta.label}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${paymentMeta.bgClass} ${paymentMeta.textClass}`}
                >
                  {paymentMeta.label}
                </span>
              </div>
              <p className="text-xs text-merchant-text-muted mt-1">
                Placed on {new Date(order.createdAt).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowInvoiceModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-merchant-surface border border-merchant-border hover:bg-merchant-surface-muted text-merchant-text rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
                title="View & Print Official Tax Invoice"
              >
                <Printer className="w-3.5 h-3.5 text-merchant-primary" />
                <span className="hidden sm:inline">Invoice</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 text-merchant-text-muted hover:text-merchant-text rounded-xl hover:bg-merchant-surface transition shrink-0 cursor-pointer"
                aria-label="Close Order Details Drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Action Error Banner if status transition fails */}
          {actionError && (
            <div className="px-6 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {actionError}
              </span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-rose-500 hover:text-rose-700 ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* =========================================================================
              DRAWER BODY (Scrollable)
          ========================================================================= */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {/* 1. ORDER PROGRESS TRACKER TIMELINE (Requirement 17 & 18) */}
            {(() => {
              const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
              const findTime = (statuses: string[]) => {
                const item = history.find((h: any) => statuses.includes(h.toStatus));
                return item?.createdAt || null;
              };

              const placedTime = order.createdAt || findTime(['NEW']);
              const confirmedTime = findTime(['CONFIRMED', 'ACCEPTED']);
              const readyTime = findTime(['READY']);
              const dispatchedTime = findTime(['DISPATCHED']);
              const deliveredTime = findTime(['COMPLETED']);

              const formatMilestoneDate = (d?: string | null) => {
                if (!d) return null;
                try {
                  return new Date(d).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  });
                } catch {
                  return null;
                }
              };

              const isCancelled = order.status === 'CANCELLED';

              const stages = [
                {
                  key: 'PLACED',
                  label: 'Placed',
                  time: formatMilestoneDate(placedTime),
                  isDone: true,
                  isCurrent: order.status === 'NEW',
                },
                {
                  key: 'CONFIRMED',
                  label: 'Confirmed',
                  time: formatMilestoneDate(confirmedTime),
                  isDone: ['CONFIRMED', 'ACCEPTED', 'READY', 'DISPATCHED', 'COMPLETED'].includes(order.status),
                  isCurrent: ['CONFIRMED', 'ACCEPTED'].includes(order.status),
                },
                {
                  key: 'READY',
                  label: 'Ready',
                  time: formatMilestoneDate(readyTime),
                  isDone: ['READY', 'DISPATCHED', 'COMPLETED'].includes(order.status),
                  isCurrent: order.status === 'READY',
                },
                {
                  key: 'DISPATCHED',
                  label: 'Dispatched',
                  time: formatMilestoneDate(dispatchedTime),
                  isDone: ['DISPATCHED', 'COMPLETED'].includes(order.status),
                  isCurrent: order.status === 'DISPATCHED',
                },
                {
                  key: 'DELIVERED',
                  label: 'Delivered',
                  time: formatMilestoneDate(deliveredTime),
                  isDone: order.status === 'COMPLETED',
                  isCurrent: order.status === 'COMPLETED',
                },
              ];

              return (
                <div className="bg-merchant-surface-raised border border-merchant-border rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-merchant-text-muted uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-merchant-primary" />
                      Order Progress Timeline
                    </span>
                    {isCancelled && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                        Order Cancelled
                      </span>
                    )}
                  </div>

                  {isCancelled ? (
                    <div className="p-3 bg-rose-500/5 border border-rose-500/20 rounded-xl text-xs space-y-1">
                      <p className="font-bold text-rose-600 dark:text-rose-400">Order was cancelled</p>
                      {order.cancelledAt && (
                        <p className="text-[11px] text-merchant-text-muted">
                          Cancelled on {formatMilestoneDate(order.cancelledAt)}
                        </p>
                      )}
                      {order.notes && <p className="text-[11px] text-merchant-text-secondary italic">"{order.notes}"</p>}
                    </div>
                  ) : (
                    <div className="pt-2 pb-1 overflow-x-auto">
                      <div className="min-w-[460px] flex items-center justify-between relative px-2">
                        {/* Connecting Track */}
                        <div className="absolute top-4 left-8 right-8 h-0.5 bg-merchant-border -z-0" />

                        {stages.map((stage, idx) => {
                          const isPastOrCurrent = stage.isDone || stage.isCurrent;
                          return (
                            <div key={stage.key} className="flex flex-col items-center text-center relative z-10 w-20">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                                  stage.isDone
                                    ? 'bg-emerald-600 text-white shadow-xs ring-4 ring-emerald-500/20'
                                    : stage.isCurrent
                                    ? 'bg-merchant-primary text-white shadow-md ring-4 ring-merchant-primary/20 animate-pulse'
                                    : 'bg-merchant-surface border-2 border-merchant-border text-merchant-text-muted'
                                }`}
                              >
                                {stage.isDone ? <Check className="w-4 h-4 stroke-[3]" /> : idx + 1}
                              </div>
                              <span
                                className={`mt-2 text-xs font-bold ${
                                  isPastOrCurrent ? 'text-merchant-text' : 'text-merchant-text-muted'
                                }`}
                              >
                                {stage.label}
                              </span>
                              {stage.time ? (
                                <span className="text-[10px] text-merchant-text-muted font-medium mt-0.5 leading-tight">
                                  {stage.time}
                                </span>
                              ) : (
                                <span className="text-[10px] text-merchant-text-muted/40 mt-0.5">Pending</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 2. POST-ACTION WHATSAPP & EMAIL NOTIFICATION PANEL */}
            {whatsappFollowUp && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 space-y-3 animate-in fade-in">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                      ✓
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-merchant-text">
                        Order Updated: {whatsappFollowUp.stageName || 'Saved'}
                      </h4>
                      <p className="text-xs text-merchant-text-muted">
                        Buyer email notification queued via reliable outbox.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (whatsappFollowUp) {
                        try {
                          localStorage.removeItem(`simply_wa_followup_${whatsappFollowUp.orderNumber}`);
                        } catch {}
                      }
                      setWhatsappFollowUp(null);
                    }}
                    className="text-merchant-text-muted hover:text-merchant-text text-xs p-1 cursor-pointer"
                  >
                    Dismiss ✕
                  </button>
                </div>

                <div className="p-2.5 bg-merchant-surface/60 border border-merchant-border rounded-xl text-xs text-merchant-text-secondary">
                  <span className="font-semibold text-merchant-text">Instruction: </span>
                  WhatsApp will open with a prepared message for this customer. Review the message and press Send in WhatsApp to notify them.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Buyer Action */}
                  <div className="bg-merchant-surface p-3.5 rounded-xl border border-merchant-border space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-merchant-text">Buyer</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          whatsappFollowUp.buyerOpened
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {whatsappFollowUp.buyerOpened ? 'WhatsApp Opened ✓' : 'Ready to Send'}
                      </span>
                    </div>
                    <div className="text-xs">
                      <p className="font-medium text-merchant-text">{whatsappFollowUp.customerName}</p>
                      <p className="text-[11px] font-mono text-merchant-text-muted">
                        +{normalizeIndianPhone(whatsappFollowUp.customerPhone)}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          window.open(whatsappFollowUp.buyerWaUrl, '_blank');
                          setWhatsappFollowUp((prev) => {
                            if (!prev) return null;
                            const updated = { ...prev, buyerOpened: true };
                            try {
                              localStorage.setItem(`simply_wa_followup_${prev.orderNumber}`, JSON.stringify(updated));
                            } catch {}
                            return updated;
                          });
                        }}
                        className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-[#25D366] hover:bg-[#20bd5a] text-white flex items-center justify-center gap-2 shadow-2xs transition cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>{whatsappFollowUp.buyerOpened ? 'Open Buyer WhatsApp Again' : 'Open WhatsApp Message'}</span>
                      </button>

                      {whatsappFollowUp.buyerText && (
                        <button
                          type="button"
                          onClick={() => {
                            if (navigator.clipboard) {
                              navigator.clipboard.writeText(whatsappFollowUp.buyerText || '');
                              setCopiedBuyerMsg(true);
                              setTimeout(() => setCopiedBuyerMsg(false), 2500);
                            }
                          }}
                          className="w-full py-1.5 px-3 rounded-xl text-xs font-semibold bg-merchant-surface border border-merchant-border hover:bg-merchant-surface-muted text-merchant-text flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{copiedBuyerMsg ? 'Message Copied ✓' : 'Copy Prepared Message'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Rider Action (if assigned) */}
                  {whatsappFollowUp.riderPhone && (
                    <div className="bg-merchant-surface p-3.5 rounded-xl border border-merchant-border space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-merchant-text">Delivery Partner</span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            whatsappFollowUp.riderOpened
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                              : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {whatsappFollowUp.riderOpened ? 'WhatsApp Opened ✓' : 'Ready to Send'}
                        </span>
                      </div>
                      <div className="text-xs">
                        <p className="font-medium text-merchant-text">
                          {whatsappFollowUp.riderName || 'Store Delivery Partner'}
                        </p>
                        <p className="text-[11px] font-mono text-merchant-text-muted">
                          +{normalizeIndianPhone(whatsappFollowUp.riderPhone)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (whatsappFollowUp.riderWaUrl) {
                            window.open(whatsappFollowUp.riderWaUrl, '_blank');
                            setWhatsappFollowUp((prev) => {
                              if (!prev) return null;
                              const updated = { ...prev, riderOpened: true };
                              try {
                                localStorage.setItem(`simply_wa_followup_${prev.orderNumber}`, JSON.stringify(updated));
                              } catch {}
                              return updated;
                            });
                          }
                        }}
                        className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-merchant-primary hover:bg-merchant-primary-hover text-white flex items-center justify-center gap-2 shadow-2xs transition cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>{whatsappFollowUp.riderOpened ? 'Open Rider WhatsApp Again' : 'Open Rider WhatsApp'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* NEXT WORKFLOW ACTIONS CARD */}
            <div className="bg-merchant-surface-raised border border-merchant-border rounded-2xl p-4 sm:p-5 text-merchant-text space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-merchant-text-muted uppercase tracking-wider">
                  Next Order Action
                </span>
                <span className="text-xs text-merchant-text-muted font-mono">
                  State: <strong className="text-merchant-text">{order.status}</strong>
                </span>
              </div>

              {/* Action Buttons: 2-step confirmation with auto-notify */}
              <div className="flex flex-wrap gap-2.5 pt-1">
                {order.status === 'NEW' && (
                  <>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() =>
                        openStatusConfirmation({
                          targetStatus: 'ACCEPTED',
                          title: 'Accept & Prepare Order',
                          subtitle: 'Confirm order receipt and begin packing. Buyer will receive email and WhatsApp alerts.',
                          badgeLabel: 'ACCEPTED',
                          defaultReason: 'Order accepted by merchant',
                          themeColor: 'cyan',
                        })
                      }
                      className="px-4 py-2 bg-merchant-primary hover:bg-merchant-primary-hover text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <Check className="w-4 h-4" /> Accept Order
                    </button>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() =>
                        openStatusConfirmation({
                          targetStatus: 'CONFIRMED',
                          title: 'Confirm Order',
                          subtitle: 'Confirm order and lock stock.',
                          badgeLabel: 'CONFIRMED',
                          defaultReason: 'Order confirmed by merchant',
                          themeColor: 'blue',
                        })
                      }
                      className="px-4 py-2 bg-merchant-surface hover:bg-merchant-surface-muted text-merchant-text border border-merchant-border rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                    >
                      Confirm Order
                    </button>
                  </>
                )}

                {order.status === 'CONFIRMED' && (
                  <>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() =>
                        openStatusConfirmation({
                          targetStatus: 'ACCEPTED',
                          title: 'Start Preparation',
                          subtitle: 'Notify buyer that packing and preparing items has begun.',
                          badgeLabel: 'PREPARING',
                          defaultReason: 'Order accepted for preparation',
                          themeColor: 'cyan',
                        })
                      }
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <Check className="w-4 h-4" /> Start Preparation
                    </button>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() =>
                        openStatusConfirmation({
                          targetStatus: 'DISPATCHED',
                          title: 'Dispatch Order & Assign Rider',
                          subtitle: 'Assign a delivery partner and notify buyer & rider simultaneously on WhatsApp and Email in 1 click.',
                          badgeLabel: 'DISPATCHED',
                          defaultReason: 'Handed over for delivery',
                          themeColor: 'purple',
                        })
                      }
                      className="px-4 py-2 bg-merchant-primary hover:bg-merchant-primary-hover text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <Truck className="w-4 h-4" /> Dispatch Order
                    </button>
                  </>
                )}

                {order.status === 'ACCEPTED' && (
                  <>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() =>
                        openStatusConfirmation({
                          targetStatus: 'READY',
                          title: 'Mark Ready to Ship',
                          subtitle: 'Confirm items are packed and waiting for delivery partner pickup.',
                          badgeLabel: 'READY TO SHIP',
                          defaultReason: 'Items packed and ready for dispatch',
                          themeColor: 'amber',
                        })
                      }
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <Package className="w-4 h-4" /> Mark Ready to Ship
                    </button>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() =>
                        openStatusConfirmation({
                          targetStatus: 'DISPATCHED',
                          title: 'Dispatch Order & Assign Rider',
                          subtitle: 'Assign a delivery partner and notify buyer & rider simultaneously on WhatsApp and Email in 1 click.',
                          badgeLabel: 'DISPATCHED',
                          defaultReason: 'Handed over for delivery',
                          themeColor: 'purple',
                        })
                      }
                      className="px-4 py-2 bg-merchant-primary hover:bg-merchant-primary-hover text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <Truck className="w-4 h-4" /> Dispatch Order
                    </button>
                  </>
                )}

                {order.status === 'READY' && (
                  <>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() =>
                        openStatusConfirmation({
                          targetStatus: 'DISPATCHED',
                          title: 'Dispatch Order & Assign Rider',
                          subtitle: 'Assign a delivery partner and send live delivery details to the buyer.',
                          badgeLabel: 'DISPATCHED',
                          defaultReason: 'Handed over for delivery',
                          themeColor: 'purple',
                        })
                      }
                      className="px-4 py-2 bg-merchant-primary hover:bg-merchant-primary-hover text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      <Truck className="w-4 h-4" /> Dispatch Order
                    </button>
                    {isPickup && (
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() =>
                          openStatusConfirmation({
                            targetStatus: 'COMPLETED',
                            title: 'Confirm Order Picked Up',
                            subtitle: 'Confirm customer collected the package from your physical store.',
                            badgeLabel: 'COMPLETED',
                            defaultReason: 'Customer picked up the order',
                            themeColor: 'emerald',
                          })
                        }
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4" /> Mark Picked Up
                      </button>
                    )}
                  </>
                )}

                {order.status === 'DISPATCHED' && (
                  <button type="button" disabled={updating || order.shipmentStatus === 'OUT_FOR_DELIVERY'} className="px-4 py-2 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-bold" onClick={async () => {
                    setUpdating(true); setActionError(null);
                    try {
                      await api.orders.markOutForDelivery(order.id);
                      const buyerWaUrl = getWhatsAppLinkForStatus('OUT_FOR_DELIVERY');
                      const followUp = { orderNumber: order.orderNumber, customerName, customerPhone, buyerWaUrl, buyerText: new URL(buyerWaUrl).searchParams.get('text') || '', stageName: 'OUT_FOR_DELIVERY', buyerOpened: false, riderOpened: false };
                      setWhatsappFollowUp(followUp);
                      localStorage.setItem(`simply_wa_followup_${order.orderNumber}`, JSON.stringify(followUp));
                      onStatusUpdated();
                    } catch (err: any) { setActionError(err.message || 'Unable to update delivery status.'); }
                    finally { setUpdating(false); }
                  }}>{order.shipmentStatus === 'OUT_FOR_DELIVERY' ? 'Out for Delivery' : 'Mark Out for Delivery'}</button>
                )}
                {order.status === 'DISPATCHED' && (
                  <button
                    type="button"
                    disabled={updating}
                    onClick={() =>
                      openStatusConfirmation({
                        targetStatus: 'COMPLETED',
                        title: 'Confirm Delivery & Complete Order',
                        subtitle: 'Confirm package was received by customer. Sends delivery receipt and finalizes order.',
                        badgeLabel: 'DELIVERED',
                        defaultReason: 'Confirmed delivered to customer',
                        themeColor: 'emerald',
                      })
                    }
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4" /> Complete Order (Delivered)
                  </button>
                )}

                {/* Cancel Action available for unfulfilled active orders */}
                {['NEW', 'CONFIRMED', 'ACCEPTED', 'READY'].includes(order.status) && (
                  <button
                    type="button"
                    disabled={updating}
                    onClick={() =>
                      openStatusConfirmation({
                        targetStatus: 'CANCELLED',
                        title: 'Cancel Order',
                        subtitle: 'Cancel this order and release reserved stock back to available inventory.',
                        badgeLabel: 'CANCELLED',
                        defaultReason: 'Order cancelled by merchant',
                        themeColor: 'rose',
                      })
                    }
                    className="px-3.5 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 ml-auto cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" /> Cancel Order
                  </button>
                )}

                {order.status === 'COMPLETED' && (
                  <div className="w-full space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-bold">
                      <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle className="w-4 h-4" />
                        <span>Order Delivered ✓</span>
                      </div>
                      {order.paymentStatus === 'PAID' ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Payment Settled ✓
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          COD Payment Pending
                        </span>
                      )}
                    </div>
                    {order.paymentStatus !== 'PAID' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCodActionError(null);
                          setCodModalOpen(true);
                        }}
                        className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Mark COD Payment Collected</span>
                      </button>
                    )}
                  </div>
                )}

                {order.status === 'CANCELLED' && (
                  <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4" />
                    <span>This order has been cancelled and inventory released.</span>
                  </div>
                )}
              </div>
            </div>

            {/* DELIVERY PARTNER ASSIGNMENT CARD (Always at top of drawer) */}
            <div className="bg-merchant-surface-raised border border-merchant-border rounded-2xl p-4 sm:p-5 text-merchant-text space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-merchant-primary/10 flex items-center justify-center text-merchant-primary">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-merchant-text block">
                      Delivery Person / Rider Assignment
                    </h3>
                    <p className="text-[10px] text-merchant-text-muted">
                      {['NEW', 'CONFIRMED', 'ACCEPTED', 'READY'].includes(order.status)
                        ? 'Assigned partner will be notified on WhatsApp & Email upon dispatch'
                        : order.status === 'DISPATCHED'
                        ? 'Package is out for delivery. Both buyer & rider notified.'
                        : 'Delivery completed & settled with partner.'}
                    </p>
                  </div>
                </div>

                {['NEW', 'CONFIRMED', 'ACCEPTED', 'READY'].includes(order.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNewRiderInline(true);
                      setSelectedPartnerId('NEW');
                      setRiderName('');
                      setRiderPhone('');
                      setRiderEmail('');
                      setRiderVehicle('Motorcycle');
                      setInlinePartnerMsg(null);
                    }}
                    className="text-[11px] font-semibold text-merchant-primary hover:underline cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    + Add New Partner
                  </button>
                )}
              </div>

              {/* ACTIVE ORDER: Delivery Partner Dropdown & Pre-Selection */}
              {['NEW', 'CONFIRMED', 'ACCEPTED', 'READY'].includes(order.status) ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-merchant-text-secondary block mb-1.5">
                      Select Delivery Person:
                    </label>
                    <select
                      value={isAddingNewRiderInline ? 'NEW' : selectedPartnerId}
                      onChange={(e) => handlePartnerSelect(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-merchant-input-border bg-merchant-input-bg text-merchant-text focus:outline-none"
                    >
                      {deliveryPartners.length > 0 ? (
                        <>
                          {deliveryPartners.map((dp) => (
                            <option key={dp.id} value={dp.id}>
                              {dp.name} — {dp.phone} {dp.vehicle ? `(${dp.vehicle})` : ''} {dp.isDefault ? '★ Default' : ''}
                            </option>
                          ))}
                          <option value="NEW">+ Enter Different / New Delivery Person</option>
                        </>
                      ) : (
                        <option value="NEW">No saved partners yet — Enter rider details below</option>
                      )}
                    </select>
                  </div>

                  {/* Feedback Banner */}
                  {inlinePartnerMsg && (
                    <div
                      className={`p-2.5 rounded-lg text-xs flex items-center justify-between ${
                        inlinePartnerMsg.type === 'success'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                      }`}
                    >
                      <span>{inlinePartnerMsg.text}</span>
                      <button
                        type="button"
                        onClick={() => setInlinePartnerMsg(null)}
                        className="ml-2 font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Selected Partner Preview Card */}
                  {!isAddingNewRiderInline && selectedPartnerId && selectedPartnerId !== 'NEW' && (
                    <div className="p-3 bg-merchant-surface border border-merchant-border rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-merchant-text flex items-center gap-1.5">
                          <span>🛵 {riderName}</span>
                          <span className="text-[10px] text-merchant-text-muted font-normal">({riderVehicle})</span>
                        </span>
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          Ready for dispatch
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-merchant-text-secondary">
                        <div className="flex items-center gap-1.5 font-mono">
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                          <span>WhatsApp: {riderPhone}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="truncate">{riderEmail || 'No email configured'}</span>
                        </div>
                      </div>
                      {riderPhone && (
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <a
                            href={`tel:${riderPhone}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-merchant-surface border border-merchant-border hover:bg-merchant-surface-muted text-merchant-text rounded-lg text-[11px] font-semibold transition"
                          >
                            <Phone className="w-3 h-3 text-merchant-primary" />
                            Call Rider
                          </a>
                          <a
                            href={getRiderAssignmentWhatsAppUrl(riderPhone, riderName)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-lg text-[11px] font-bold transition shadow-2xs"
                          >
                            <MessageSquare className="w-3 h-3" />
                            Send Delivery Details (WhatsApp)
                          </a>
                        </div>
                      )}
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10">
                        When you confirm dispatch, the order updates and customer email is queued. You can then open prepared WhatsApp messages for <strong>{riderName}</strong> and <strong>{customerName}</strong>.
                      </p>
                    </div>
                  )}

                  {/* Inline Add / Edit Rider Form */}
                  {(isAddingNewRiderInline || deliveryPartners.length === 0) && (
                    <div className="p-3 bg-merchant-surface border border-merchant-border rounded-xl space-y-2.5 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-merchant-text flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-merchant-primary" />
                          Add Delivery Person to Directory
                        </span>
                        {deliveryPartners.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const def = deliveryPartners.find((p) => p.isDefault) || deliveryPartners[0];
                              if (def) {
                                handlePartnerSelect(def.id);
                              }
                            }}
                            className="text-[10px] text-merchant-text-muted hover:text-merchant-text cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-semibold text-merchant-text-muted block mb-1">
                            Delivery Person Name <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Bruce Bhai"
                            value={riderName}
                            onChange={(e) => setRiderName(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-merchant-input-border bg-merchant-input-bg text-merchant-text focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-merchant-text-muted block mb-1">
                            Mobile / WhatsApp <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="tel"
                            placeholder="e.g. 8446448450"
                            value={riderPhone}
                            onChange={(e) => setRiderPhone(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-merchant-input-border bg-merchant-input-bg text-merchant-text font-mono focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-merchant-text-muted block mb-1">
                            Email Address (Optional)
                          </label>
                          <input
                            type="email"
                            placeholder="e.g. bruce@example.com"
                            value={riderEmail}
                            onChange={(e) => setRiderEmail(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-merchant-input-border bg-merchant-input-bg text-merchant-text focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-merchant-text-muted block mb-1">
                            Vehicle / Mode
                          </label>
                          <select
                            value={riderVehicle}
                            onChange={(e) => setRiderVehicle(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-merchant-input-border bg-merchant-input-bg text-merchant-text focus:outline-none"
                          >
                            <option value="Motorcycle">Motorcycle / Bike</option>
                            <option value="Scooter">Scooter / Moped</option>
                            <option value="Electric Bike">EV / Electric Scooter</option>
                            <option value="Store Van">Van / Auto</option>
                            <option value="Bicycle">Bicycle</option>
                            <option value="Store Staff">Store Staff (Walking)</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-1.5 text-[11px] text-merchant-text-muted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={saveRiderToDirectory}
                            onChange={(e) => setSaveRiderToDirectory(e.target.checked)}
                            className="h-3.5 w-3.5 text-emerald-500 rounded cursor-pointer"
                          />
                          Save to store directory
                        </label>

                        <button
                          type="button"
                          disabled={isSavingPartnerInline}
                          onClick={handleSavePartnerInline}
                          className="px-3 py-1.5 bg-merchant-primary hover:bg-merchant-primary-hover text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isSavingPartnerInline ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" /> Save & Select Partner
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* DISPATCHED OR COMPLETED ORDER: Partner Status Card */
                <div className="p-3 bg-merchant-surface border border-merchant-border rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-merchant-text flex items-center gap-1.5">
                      <span>🛵 {riderName || shipment?.courierName?.replace('Store Team:', '') || 'Store Delivery Partner'}</span>
                      {riderVehicle && <span className="text-[10px] text-merchant-text-muted">({riderVehicle})</span>}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        order.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                      }`}
                    >
                      {order.status === 'COMPLETED' ? 'Delivered & Settled' : 'Out for Delivery'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-merchant-text-secondary">
                    {riderPhone && (
                      <div className="flex items-center gap-1.5 font-mono">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                        <span>WhatsApp: {riderPhone}</span>
                      </div>
                    )}
                    {riderEmail && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">{riderEmail}</span>
                      </div>
                    )}
                  </div>

                  {/* Rider Contact Actions (Requirements 5 & 25) */}
                  {riderPhone && (
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <a
                        href={`tel:${riderPhone}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-merchant-surface border border-merchant-border hover:bg-merchant-surface-muted text-merchant-text rounded-xl text-xs font-semibold shadow-2xs transition"
                      >
                        <Phone className="w-3.5 h-3.5 text-merchant-primary" />
                        Call Rider
                      </a>
                      <a
                        href={getRiderAssignmentWhatsAppUrl(riderPhone, riderName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-xl text-xs font-bold shadow-2xs transition"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Send Delivery Details
                      </a>
                    </div>
                  )}

                  <p className="text-[10px] text-merchant-text-muted">
                    {order.status === 'COMPLETED'
                      ? 'Delivery completed and confirmed with partner.'
                      : 'Delivery task assigned. Use the actions above to contact rider if needed.'}
                  </p>
                </div>
              )}
            </div>

            {/* CUSTOMER DETAILS & ACTIONS */}
            <div className="bg-merchant-surface-raised border border-merchant-border rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold text-merchant-text-muted uppercase tracking-wider block">
                    Customer Details
                  </span>
                  <p className="text-sm font-bold text-merchant-text mt-0.5">{customerName}</p>
                  {customerPhone && (
                    <p className="text-xs text-merchant-text-secondary font-mono mt-0.5">{customerPhone}</p>
                  )}
                  {customerEmail && (
                    <p className="text-xs text-merchant-text-muted font-mono">{customerEmail}</p>
                  )}
                </div>

                {/* Contact Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {customerPhone && (
                    <>
                      <a
                        href={`tel:${customerPhone}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-merchant-surface border border-merchant-border hover:bg-merchant-surface-muted text-merchant-text rounded-xl text-xs font-semibold shadow-2xs transition"
                      >
                        <Phone className="w-3.5 h-3.5 text-merchant-primary" />
                        Call
                      </a>
                      <a
                        href={getWhatsAppLinkForStatus(order.status)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] hover:bg-[#20ba59] text-white rounded-xl text-xs font-bold shadow-2xs transition"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        WhatsApp
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* DELIVERY / FULFILLMENT INFORMATION */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-merchant-text-muted uppercase tracking-wider flex items-center gap-1.5">
                {isPickup ? <StoreIcon className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                <span>{isPickup ? 'Store Pickup Details' : 'Delivery Address'}</span>
              </h3>

              {isPickup ? (
                <div className="bg-merchant-surface-raised p-4 rounded-xl border border-merchant-border text-xs text-merchant-text space-y-1">
                  <p className="font-bold text-merchant-text">Self Pickup Order</p>
                  <p className="text-merchant-text-secondary">Customer will collect the package from physical store location.</p>
                </div>
              ) : (
                <div className="bg-merchant-surface-raised p-4 rounded-xl border border-merchant-border text-xs text-merchant-text space-y-1">
                  <p className="font-bold text-merchant-text">{addr.fullName || customerName}</p>
                  <p>{addr.addressLine1 || 'Address details'}</p>
                  {addr.addressLine2 && <p>{addr.addressLine2}</p>}
                  {addr.landmark && <p className="text-merchant-text-muted">Landmark: {addr.landmark}</p>}
                  <p>
                    {addr.city}, {addr.state} -{' '}
                    <span className="font-mono font-semibold">{addr.pincode}</span>
                  </p>
                  <p className="text-merchant-text-muted font-mono text-[11px] pt-1">
                    PIN: {addr.pincode || 'N/A'} • {addr.country || 'India'}
                  </p>
                </div>
              )}
            </div>

            {/* ORDER ITEMS LIST */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-merchant-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                <span>Items ({order.items?.length || 0})</span>
              </h3>

              <div className="border border-merchant-border rounded-2xl divide-y divide-merchant-border overflow-hidden bg-merchant-surface shadow-xs">
                {(order.items || []).map((item: any) => {
                  const mediaUrl = resolveVariantDisplayMedia({
                    itemImageUrl: item.imageUrl,
                    variant: item.variant,
                    productMedia: item.variant?.product?.media,
                    selectedOptionValues: item.variant?.optionValues,
                  });
                  const snapshot = item.optionSnapshot || item.selectedOptions;
                  const displayVariantTitle =
                    item.variantTitle && item.variantTitle !== 'Default'
                      ? item.variantTitle
                      : snapshot && Object.keys(snapshot).length > 0
                        ? Object.keys(snapshot)
                            .sort((a, b) => {
                              const order = ['colour', 'color', 'size', 'fit', 'material'];
                              const iA = order.indexOf(a.toLowerCase());
                              const iB = order.indexOf(b.toLowerCase());
                              if (iA !== -1 && iB !== -1) return iA - iB;
                              if (iA !== -1) return -1;
                              if (iB !== -1) return 1;
                              return a.localeCompare(b);
                            })
                            .map((k) => snapshot[k])
                            .join(' · ')
                        : item.variant?.optionValues?.length
                          ? [...item.variant.optionValues]
                              .sort((a: any, b: any) => {
                                const sA = a.optionValue?.option?.sortOrder ?? 0;
                                const sB = b.optionValue?.option?.sortOrder ?? 0;
                                if (sA !== sB) return sA - sB;
                                return (a.optionValue?.option?.name || '').localeCompare(b.optionValue?.option?.name || '');
                              })
                              .map((ov: any) => ov.optionValue?.value || ov.value)
                              .filter(Boolean)
                              .join(' · ')
                          : null;

                  return (
                    <div key={item.id} className="p-3.5 sm:p-4 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 bg-merchant-surface-raised rounded-xl overflow-hidden shrink-0 flex items-center justify-center border border-merchant-border">
                          <SafeImage
                            src={mediaUrl}
                            alt={item.productName}
                            fallbackTitle={item.productName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-merchant-text truncate">{item.productName}</p>
                          {displayVariantTitle && (
                            <p className="text-merchant-text-muted text-[11px] truncate font-medium">{displayVariantTitle}</p>
                          )}
                          {item.sku && (
                            <p className="text-merchant-text-muted font-mono text-[10px]">SKU: {item.sku}</p>
                          )}
                          <p className="text-merchant-text-secondary font-mono text-[11px] mt-0.5">
                            {item.quantity} × {formatPaise(item.unitPricePaise)}
                          </p>
                        </div>
                      </div>

                      <div className="font-mono font-bold text-merchant-text text-sm shrink-0">
                        {formatPaise(item.totalPaise)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* FINANCIAL BREAKDOWN */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-merchant-text-muted uppercase tracking-wider flex items-center gap-1.5">
                <span>Billing & Totals</span>
              </h3>

              <div className="bg-merchant-surface-raised p-4 rounded-xl border border-merchant-border text-xs space-y-2">
                <div className="flex justify-between text-merchant-text-secondary">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatPaise(order.subtotalPaise)}</span>
                </div>
                {order.shippingPaise > 0 && (
                  <div className="flex justify-between text-merchant-text-secondary">
                    <span>Delivery Charge</span>
                    <span className="font-mono">{formatPaise(order.shippingPaise)}</span>
                  </div>
                )}
                {order.discountPaise > 0 && (
                  <div className="flex justify-between text-emerald-500 font-semibold">
                    <span>Discount</span>
                    <span className="font-mono">-{formatPaise(order.discountPaise)}</span>
                  </div>
                )}
                <div className="flex justify-between text-merchant-text font-bold text-sm pt-2 border-t border-merchant-border">
                  <span>Total Amount</span>
                  <span className="font-mono">{formatPaise(order.totalPaise)}</span>
                </div>
              </div>
            </div>

            {/* PAYMENT INFORMATION */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-merchant-text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4" />
                  <span>Payment</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(true)}
                  className="text-xs text-merchant-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  View Invoice
                </button>
              </div>

              <div className="bg-merchant-surface-raised p-4 rounded-xl border border-merchant-border text-xs space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-merchant-text-secondary">Payment Method</span>
                  <span className="font-semibold text-merchant-text">{paymentDisplay.methodLabel}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-merchant-text-secondary">Payment Status</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${paymentMeta.bgClass} ${paymentMeta.textClass}`}>
                    {paymentMeta.label}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-merchant-text-secondary">Amount</span>
                  <span className="font-mono font-bold text-merchant-text">{formatPaise(order.totalPaise)}</span>
                </div>

                {/* Digital Payment Transaction ID (e.g. pay_... from Razorpay or gateway) */}
                {!paymentDisplay.isCod && paymentDisplay.transactionId && (
                  <div className="flex justify-between items-center text-merchant-text-secondary">
                    <span>Transaction ID</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[11px] select-all bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {paymentDisplay.transactionId}
                    </span>
                  </div>
                )}

                {/* COD Specifics */}
                {paymentDisplay.isCod && (
                  <>
                    {order.paymentStatus === 'PAID' ? (
                      <div className="pt-2 border-t border-merchant-border space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-merchant-text-secondary">COD Collected</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">Yes</span>
                        </div>
                        {order.codCollectionMethod && (
                          <div className="flex justify-between items-center">
                            <span className="text-merchant-text-secondary">Collected Via</span>
                            <span className="font-bold text-merchant-text bg-merchant-surface px-2 py-0.5 rounded border border-merchant-border">
                              {paymentDisplay.codCollectionLabel || order.codCollectionMethod}
                            </span>
                          </div>
                        )}
                        {order.codCollectedAt && (
                          <div className="flex justify-between items-center text-merchant-text-muted text-[11px]">
                            <span>Collected At</span>
                            <span>
                              {new Date(order.codCollectedAt).toLocaleString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* COD Pending Collection */
                      <div className="pt-2 border-t border-merchant-border space-y-2.5">
                        <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                          <span className="font-medium">COD Collection</span>
                          <span className="text-[11px] font-bold uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            Pending
                          </span>
                        </div>

                        {/* Show Mark COD as Paid action only when paymentStatus != PAID and order is at fulfillment stage */}
                        {(order.status === 'COMPLETED' || order.status === 'DISPATCHED' || order.status === 'READY') && (
                          <button
                            type="button"
                            onClick={() => {
                              setCodActionError(null);
                              setCodModalOpen(true);
                            }}
                            className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>Mark COD Payment Collected</span>
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* SHIPPING & LOGISTICS DETAILS */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-merchant-text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-amber-500" />
                  <span>Logistics & Fulfillment</span>
                </h3>
                {shipment && (
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    {isSelfDelivery ? 'Self Delivery Active' : 'Shiprocket AWB Active'}
                  </span>
                )}
              </div>

              {/* Sync Success Message */}
              {syncSuccessMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between animate-in fade-in">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    {syncSuccessMessage}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSyncSuccessMessage(null)}
                    className="text-emerald-500 hover:text-emerald-700 ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="bg-merchant-surface-raised p-4 rounded-xl border border-merchant-border text-xs space-y-3">
                {shipment ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-merchant-text-secondary">Delivery Mode</span>
                      <span className="font-bold text-merchant-text">
                        {isSelfDelivery ? '🛵 Self / Store Team Delivery' : '🚀 Shiprocket Logistics'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-merchant-text-secondary">
                        {isSelfDelivery ? 'Assigned Rider' : 'Assigned Courier'}
                      </span>
                      <span className="font-bold text-merchant-text">
                        {isSelfDelivery
                          ? (riderName || shipment.courierName?.replace('Store Team:', '').trim() || 'Store In-house Team')
                          : (shipment.courierName || 'Shiprocket Logistics')}
                      </span>
                    </div>

                    {shipment.awbNumber && (
                      <div className="flex justify-between items-center">
                        <span className="text-merchant-text-secondary">
                          {isSelfDelivery || shipment.awbNumber.startsWith('SELF_') ? 'Reference' : 'AWB Number'}
                        </span>
                        {isSelfDelivery || shipment.awbNumber.startsWith('SELF_') || shipment.provider === 'SELF_DELIVERY' ? (
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{shipment.awbNumber}</span>
                        ) : (
                          <a
                            href={`https://shiprocket.co/tracking/${shipment.awbNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono font-bold text-merchant-primary hover:underline flex items-center gap-1"
                          >
                            {shipment.awbNumber}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="text-merchant-text-secondary">Logistics Status</span>
                      <span className="font-semibold text-merchant-text uppercase px-2 py-0.5 bg-merchant-surface rounded text-[10px] border border-merchant-border">
                        {order.status === 'COMPLETED'
                          ? 'Delivered'
                          : shipment.status === 'OUT_FOR_DELIVERY'
                          ? 'Out for Delivery'
                          : shipment.status}
                      </span>
                    </div>

                    {/* Fulfillment Actions */}
                    <div className="pt-2 border-t border-merchant-border flex flex-wrap gap-2 items-center">
                      {!isSelfDelivery && shipment.provider !== 'SELF_DELIVERY' && (
                        <button
                          type="button"
                          onClick={handleSyncTracking}
                          disabled={syncingTracking}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-merchant-surface border border-merchant-border hover:bg-merchant-surface-muted rounded-lg text-xs font-semibold text-merchant-text shadow-2xs transition disabled:opacity-50 cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${syncingTracking ? 'animate-spin' : ''}`} />
                          {syncingTracking ? 'Pulling Shiprocket API...' : 'Pull Live Tracking from Shiprocket'}
                        </button>
                      )}

                      {/* WhatsApp Buyer Update */}
                      {customerPhone && (
                        <a
                          href={getWhatsAppLinkForStatus(order.status)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/15 border border-emerald-500/30 hover:bg-emerald-600/25 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-semibold transition"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" />
                          WhatsApp Buyer
                        </a>
                      )}

                      {/* WhatsApp Rider Action (Requirements 24 & 25) */}
                      {isSelfDelivery && riderPhone && (
                        <a
                          href={getRiderAssignmentWhatsAppUrl(riderPhone, riderName)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-merchant-primary/15 border border-merchant-primary/30 hover:bg-merchant-primary/25 text-merchant-primary rounded-lg text-xs font-semibold transition"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          WhatsApp Rider
                        </a>
                      )}

                      {shipment.labelUrl && (
                        <a
                          href={shipment.labelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-merchant-surface border border-merchant-border hover:bg-merchant-surface-muted rounded-lg text-[11px] font-semibold text-merchant-text shadow-2xs"
                        >
                          <Printer className="w-3.5 h-3.5 text-merchant-text-muted" /> Print Label
                        </a>
                      )}

                      {shipment.manifestUrl && (
                        <a
                          href={shipment.manifestUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-merchant-surface border border-merchant-border hover:bg-merchant-surface-muted rounded-lg text-[11px] font-semibold text-merchant-text shadow-2xs"
                        >
                          <Printer className="w-3.5 h-3.5 text-merchant-text-muted" /> Print Manifest
                        </a>
                      )}
                    </div>

                    {/* Zero-Login Tracking Link Banner */}
                    {trackingUrl && (
                      <div className="p-2.5 bg-merchant-surface border border-merchant-border rounded-xl space-y-1.5 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-merchant-text-muted uppercase">
                            Zero-Login Customer Tracking Link
                          </span>
                          <button
                            type="button"
                            onClick={handleCopyTrackingLink}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-merchant-primary hover:underline cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedTracking ? 'Copied to Clipboard!' : 'Copy Link'}
                          </button>
                        </div>
                        <p className="text-[11px] text-merchant-text-muted truncate font-mono">
                          {trackingUrl}
                        </p>
                        <p className="text-[10px] text-merchant-text-muted">
                          Customer does not need to log in — this link directly displays live order status, courier info, and receipt.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-3 bg-merchant-surface border border-merchant-border rounded-xl space-y-1">
                    <span className="text-[11px] font-bold text-merchant-text flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-merchant-primary" />
                      Pending Fulfillment & Dispatch
                    </span>
                    <p className="text-[11px] text-merchant-text-muted">
                      Delivery partner assigned above ({riderName || 'Store Delivery Team'}) will be dispatched when you click <strong>Dispatch Order</strong>. Customer email is queued after the update. Open the prepared WhatsApp messages and press Send to notify the buyer or delivery partner.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TWO-STEP STATUS CONFIRMATION & NOTIFICATION MODAL
      ========================================================================= */}
      {statusConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !updating && setStatusConfirmModal(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-merchant-surface border border-merchant-border rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-merchant-text max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-merchant-border pb-3.5">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    statusConfirmModal.targetStatus === 'CANCELLED'
                      ? 'bg-rose-500/15 text-rose-500'
                      : statusConfirmModal.targetStatus === 'COMPLETED'
                      ? 'bg-emerald-500/15 text-emerald-500'
                      : statusConfirmModal.targetStatus === 'DISPATCHED'
                      ? 'bg-purple-500/15 text-purple-500'
                      : 'bg-cyan-500/15 text-cyan-500'
                  }`}
                >
                  {statusConfirmModal.targetStatus === 'CANCELLED' ? (
                    <Ban className="w-5 h-5" />
                  ) : statusConfirmModal.targetStatus === 'COMPLETED' ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : statusConfirmModal.targetStatus === 'DISPATCHED' ? (
                    <Truck className="w-5 h-5" />
                  ) : (
                    <Check className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-merchant-text">
                      {statusConfirmModal.title}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-merchant-surface-raised border border-merchant-border text-merchant-text-muted">
                      Review & Confirm
                    </span>
                  </div>
                  <p className="text-xs text-merchant-text-muted mt-0.5">
                    {statusConfirmModal.subtitle}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => !updating && setStatusConfirmModal(null)}
                className="text-merchant-text-muted hover:text-merchant-text p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick Order Snapshot */}
            <div className="p-3 rounded-xl bg-merchant-surface-raised border border-merchant-border text-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] text-merchant-text-muted block">Order & Buyer</span>
                <span className="font-mono font-bold text-merchant-text">#{order.orderNumber}</span> • {customerName}
                {customerPhone && <span className="font-mono text-merchant-text-muted"> ({customerPhone})</span>}
              </div>
              <div className="text-right">
                <span className="text-[11px] text-merchant-text-muted block">Total Amount</span>
                <span className="font-mono font-bold text-emerald-500">{formatPaise(order.totalPaise)}</span>
              </div>
            </div>

            {/* Cancellation reason if CANCELLED */}
            {statusConfirmModal.targetStatus === 'CANCELLED' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-merchant-text-secondary block">
                  Select Reason:
                </label>
                <select
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-merchant-input-border bg-merchant-input-bg text-merchant-text focus:outline-none"
                >
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r} value={r} className="bg-merchant-surface text-merchant-text">
                      {r}
                    </option>
                  ))}
                </select>
                {cancellationReason === 'Other' && (
                  <input
                    type="text"
                    placeholder="Specify custom reason..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="w-full text-xs p-2.5 mt-2 rounded-xl border border-merchant-input-border bg-merchant-input-bg text-merchant-text placeholder-merchant-text-muted focus:outline-none"
                  />
                )}
              </div>
            )}

            {/* DELIVERY PARTNER ASSIGNMENT (When target is DISPATCHED) */}
            {statusConfirmModal.targetStatus === 'DISPATCHED' && (
              <div className="space-y-2.5 p-3.5 rounded-xl bg-merchant-surface-raised border border-merchant-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-merchant-text flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-amber-500" />
                    Assign Delivery Partner
                  </label>
                  <span className="text-[10px] text-merchant-text-muted">
                    Buyer will receive rider name & contact
                  </span>
                </div>

                {/* Delivery Mode Toggle */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-merchant-surface rounded-lg border border-merchant-border text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedFulfillmentMode('SELF_DELIVERY')}
                    className={`py-1.5 px-2 rounded-md font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                      selectedFulfillmentMode === 'SELF_DELIVERY'
                        ? 'bg-merchant-primary text-white shadow-2xs'
                        : 'text-merchant-text-muted hover:text-merchant-text'
                    }`}
                  >
                    <StoreIcon className="w-3 h-3" /> Store / In-House Rider
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFulfillmentMode('SHIPROCKET')}
                    className={`py-1.5 px-2 rounded-md font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                      selectedFulfillmentMode === 'SHIPROCKET'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-merchant-text-muted hover:text-merchant-text'
                    }`}
                  >
                    <Truck className="w-3 h-3" /> Shiprocket Logistics
                  </button>
                </div>

                {selectedFulfillmentMode === 'SELF_DELIVERY' ? (
                  <div className="space-y-2 pt-1">
                    {/* Saved Riders Dropdown */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-merchant-text-secondary block">
                          Select from Registered Delivery Partners:
                        </label>
                        {!isAddingNewRiderInline && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingNewRiderInline(true);
                              setSelectedPartnerId('NEW');
                              setRiderName('');
                              setRiderPhone('');
                              setRiderEmail('');
                              setRiderVehicle('Motorcycle');
                            }}
                            className="text-[11px] font-semibold text-merchant-primary hover:underline cursor-pointer"
                          >
                            + Add New Partner
                          </button>
                        )}
                      </div>
                      <select
                        value={isAddingNewRiderInline ? 'NEW' : selectedPartnerId}
                        onChange={(e) => handlePartnerSelect(e.target.value)}
                        className="w-full text-xs p-2 rounded-lg border border-merchant-input-border bg-merchant-input-bg text-merchant-text focus:outline-none"
                      >
                        {deliveryPartners.length > 0 ? (
                          <>
                            {deliveryPartners.map((dp) => (
                              <option key={dp.id} value={dp.id}>
                                {dp.name} — {dp.phone} {dp.vehicle ? `(${dp.vehicle})` : ''} {dp.isDefault ? '★ Default' : ''}
                              </option>
                            ))}
                            <option value="NEW">+ Enter Different / New Rider</option>
                          </>
                        ) : (
                          <>
                            <option value="NEW">No saved partners yet — Enter rider details below</option>
                          </>
                        )}
                      </select>
                    </div>

                    {/* Inline Rider Details Inputs if adding new or editing */}
                    {(isAddingNewRiderInline || deliveryPartners.length === 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="text-[11px] font-semibold text-merchant-text-muted block mb-1">
                            Rider Name <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Ramesh"
                            value={riderName}
                            onChange={(e) => setRiderName(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-merchant-input-border bg-merchant-input-bg text-merchant-text focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-merchant-text-muted block mb-1">
                            Rider Mobile Number <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="tel"
                            placeholder="e.g. 9876543210"
                            value={riderPhone}
                            onChange={(e) => setRiderPhone(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-merchant-input-border bg-merchant-input-bg text-merchant-text font-mono focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-merchant-text-muted block mb-1">
                            Rider Email Address (Optional)
                          </label>
                          <input
                            type="email"
                            placeholder="e.g. rider@example.com"
                            value={riderEmail}
                            onChange={(e) => setRiderEmail(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-merchant-input-border bg-merchant-input-bg text-merchant-text focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-merchant-text-muted block mb-1">
                            Vehicle / Mode
                          </label>
                          <select
                            value={riderVehicle}
                            onChange={(e) => setRiderVehicle(e.target.value)}
                            className="w-full text-xs p-2 rounded-lg border border-merchant-input-border bg-merchant-input-bg text-merchant-text focus:outline-none"
                          >
                            <option value="Motorcycle">Motorcycle / Bike</option>
                            <option value="Scooter">Scooter / Moped</option>
                            <option value="Electric Bike">EV / Electric Scooter</option>
                            <option value="Store Van">Van / Auto</option>
                            <option value="Bicycle">Bicycle</option>
                            <option value="Store Staff">Store Staff (Walking)</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2 flex items-center justify-between pt-1">
                          <label htmlFor="save-rider-dir" className="flex items-center gap-1.5 text-[11px] text-merchant-text-muted cursor-pointer">
                            <input
                              type="checkbox"
                              id="save-rider-dir"
                              checked={saveRiderToDirectory}
                              onChange={(e) => setSaveRiderToDirectory(e.target.checked)}
                              className="h-3.5 w-3.5 text-emerald-500 rounded cursor-pointer"
                            />
                            Save this rider to store directory
                          </label>

                          <button
                            type="button"
                            disabled={isSavingPartnerInline}
                            onClick={handleSavePartnerInline}
                            className="px-2.5 py-1 bg-merchant-surface border border-merchant-border hover:bg-merchant-surface-muted text-merchant-text rounded-lg text-[11px] font-semibold transition cursor-pointer"
                          >
                            {isSavingPartnerInline ? 'Saving...' : 'Save to Directory Now'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-500 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                    Will request doorstep pickup and generate AWB via configured Shiprocket courier network.
                  </p>
                )}
              </div>
            )}

            {/* CUSTOM MESSAGE TO BUYER */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-merchant-text flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-merchant-primary" />
                  Custom Note / Message for Buyer (Optional)
                </label>
                <span className="text-[10px] text-merchant-text-muted">Included in email & WhatsApp</span>
              </div>

              <textarea
                rows={2}
                placeholder="Type any personal message, ETA, or instructions for the buyer..."
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-merchant-input-border bg-merchant-input-bg text-merchant-text placeholder-merchant-text-muted focus:outline-none focus:ring-1 focus:ring-merchant-primary resize-none"
              />

              {/* Suggestion Chips */}
              <div className="flex flex-wrap gap-1 pt-0.5">
                {(STATUS_MESSAGE_SUGGESTIONS[statusConfirmModal.targetStatus] || []).map((sugg, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCustomMessage(sugg)}
                    className="text-[10px] px-2 py-0.5 bg-merchant-surface-raised hover:bg-merchant-surface-muted text-merchant-text-muted hover:text-merchant-text border border-merchant-border rounded-md transition cursor-pointer"
                  >
                    + {sugg}
                  </button>
                ))}
              </div>
            </div>

            {/* AUTOMATED NOTIFICATION CHANNELS (HEADLESS 1-CLICK) */}
            <div className="p-3.5 rounded-xl bg-merchant-surface-raised border border-merchant-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-merchant-text-muted uppercase tracking-wider block">
                  {statusConfirmModal.targetStatus === 'DISPATCHED' || statusConfirmModal.targetStatus === 'COMPLETED'
                    ? 'Buyer email and prepared WhatsApp messages'
                    : 'Buyer email and prepared WhatsApp message'}
                </span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  Email queued; WhatsApp requires Send
                </span>
              </div>

              {/* Buyer Channel */}
              <div className="p-2.5 rounded-lg bg-merchant-surface border border-merchant-border text-xs space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-merchant-text-muted block">
                  👤 Buyer Channels: {customerName}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1.5 text-merchant-text">
                    <Mail className="w-3.5 h-3.5 text-blue-500" />
                    Email: {customerEmail || 'Registered Email'}
                  </span>
                  {customerPhone && (
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" />
                      WhatsApp: {customerPhone}
                    </span>
                  )}
                </div>
              </div>

              {/* Delivery Partner Channel (for DISPATCHED or COMPLETED) */}
              {(statusConfirmModal.targetStatus === 'DISPATCHED' || statusConfirmModal.targetStatus === 'COMPLETED') && (
                <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
                    🛵 Delivery Partner Channels: {riderName || 'Store Delivery Partner'}
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    {riderPhone ? (
                      <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                        <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" />
                        WhatsApp: {riderPhone} (Pickup & Destination Task)
                      </span>
                    ) : (
                      <span className="text-amber-500 text-[11px]">
                        ⚠️ No partner mobile provided — Enter partner phone above to notify on WhatsApp
                      </span>
                    )}
                    {riderEmail && (
                      <span className="flex items-center gap-1.5 text-merchant-text">
                        <Mail className="w-3.5 h-3.5 text-blue-500" />
                        Email: {riderEmail}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Error banner if action fails */}
            {actionError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* STEP 2: CONFIRMATION FOOTER BUTTONS */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-merchant-border">
              <button
                type="button"
                onClick={() => setStatusConfirmModal(null)}
                disabled={updating}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-merchant-surface hover:bg-merchant-surface-muted text-merchant-text border border-merchant-border transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={handleConfirmStatusUpdate}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-merchant-primary hover:bg-merchant-primary-hover text-white shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {updating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating & Notifying Both...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {statusConfirmModal.targetStatus === 'DISPATCHED'
                      ? 'Confirm Dispatch'
                      : statusConfirmModal.targetStatus === 'COMPLETED'
                      ? 'Confirm Delivery'
                      : 'Confirm Update'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* =========================================================================
          COD PAYMENT COLLECTION CONFIRMATION MODAL
      ========================================================================= */}
      {codModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !isCollectingCod && setCodModalOpen(false)}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-merchant-surface border border-merchant-border rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-merchant-text"
          >
            <div className="flex items-start justify-between border-b border-merchant-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-merchant-text">Confirm COD Payment</h3>
                  <p className="text-xs text-merchant-text-muted">Record collected cash or digital payment at delivery</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isCollectingCod}
                onClick={() => setCodModalOpen(false)}
                className="text-merchant-text-muted hover:text-merchant-text p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-merchant-surface-raised border border-merchant-border text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-merchant-text-muted">Order:</span>
                <span className="font-mono font-bold text-merchant-text">#{order.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-merchant-text-muted">Amount to Collect:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  {formatPaise(order.totalPaise)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-merchant-text-muted">Order Payment Mode:</span>
                <span className="font-semibold text-merchant-text">Cash on Delivery (COD)</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-merchant-text block">
                Actual Collection Method:
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(['CASH', 'UPI', 'CARD', 'OTHER'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCodMethod(m)}
                    className={`py-2 px-3 rounded-xl border font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      codMethod === m
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                        : 'border-merchant-border bg-merchant-surface-raised text-merchant-text-secondary hover:text-merchant-text'
                    }`}
                  >
                    <span>{m === 'CASH' ? '💵 Cash' : m === 'UPI' ? '📱 UPI' : m === 'CARD' ? '💳 Card' : '📦 Other'}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-merchant-text-muted pt-1">
                Preserves both the original order mode (COD) and how payment was physically received upon delivery.
              </p>
            </div>

            {codActionError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{codActionError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-merchant-border">
              <button
                type="button"
                disabled={isCollectingCod}
                onClick={() => setCodModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-merchant-surface hover:bg-merchant-surface-muted text-merchant-text border border-merchant-border transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCollectingCod}
                onClick={handleCollectCodPayment}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isCollectingCod ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Recording Payment...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirm Payment Received
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Printable Tax Invoice Modal */}
      {showInvoiceModal && (
        <InvoiceModal
          isOpen={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
          order={order}
          store={store || order.store}
          user={user}
        />
      )}
    </>
  );
};
