import { getPublicStoreUrl } from '@simply/types';
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import {
  Palette,
  Wand2,
  Sparkles,
  LayoutTemplate,
  Eye,
  Save,
  Check,
  Smartphone,
  Monitor,
  Type,
  Layers,
  UploadCloud,
  AlertTriangle,
  Building,
  MapPin,
  Clock,
  Sliders,
  X,
  ExternalLink,
  ShoppingBag,
  BookOpen,
  Home,
  CheckCircle2,
  Info,
  Phone,
  Mail,
  ShieldCheck,
  Award,
  Instagram,
  Facebook,
  Twitter,
  Youtube,
  Linkedin,
  MessageCircle,
  Share2,
  Globe,
  Link2,
  Trash2,
  Image as ImageIcon,
  Minus,
  Plus,
  ChevronDown,
  ChevronUp,
  Loader2,
  Megaphone,
  Tag,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { ThemeColorField } from '../components/ThemeColorField';
import { MiniStorePreview } from '../components/MiniStorePreview';
import { CatalogTextField } from '../components/CatalogTextField';
import { SocialLinkField } from '../components/SocialLinkField';
import { normalizeSocialLinks, SOCIAL_PLATFORMS, parseSocialLink } from '@simply/types';
import { CATALOG_EYEBROW_MAX, CATALOG_TITLE_MAX, CATALOG_SUBTITLE_MAX, normalizeBrandText, clampCatalogText, BRAND_TEXT_LIMITS, HOME_TEXT_LIMITS, ABOUT_TEXT_LIMITS, ABOUT_VALUE_LIMITS, brandTextLimit } from '@simply/types';
import { useAuth } from '../context/AuthContext';
import {
  FOUNDATIONAL_THEMES,
  STOREFRONT_FONT_FAMILIES,
  resolveStorefrontFont,
  TRUST_BADGE_ICONS,
  resolveTrustBadgeIcon,
  TrustBadgeIconId,
  normalizeHexColor,
  QuickDesigner,
  getContrastRatio,
  getSuggestedTextColor,
  getWordmark,
} from '@simply/ui';
import { SafeImage } from '../components/ui/SafeImage';
import { getStorefrontUrl } from '../utils/config';
import { useSellerI18n } from '@simply/i18n';

export default function BrandStudioPage() {
  const { api } = useAuth();
  const { t } = useSellerI18n();
  const [activeTab, setActiveTab] = useState<'THEME' | 'HOME' | 'PRODUCTS' | 'ABOUT' | 'FOOTER'>('THEME');
  const [activePreviewPage, setActivePreviewPage] = useState<'home' | 'products' | 'about'>('home');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('desktop');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [openMobileAccordion, setOpenMobileAccordion] = useState<string | null>('THEME_STYLE');
  const [store, setStore] = useState<any>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const homeBannerInputRef = useRef<HTMLInputElement>(null);
  const aboutBannerInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadedConfigRef = useRef<any>({});
  const [previewRevision, setPreviewRevision] = useState(0);

  // A newly navigated catalog requests current edits after its data is ready.
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.origin === new URL(getStorefrontUrl()).origin && event.source === iframeRef.current?.contentWindow && ['CATALOG_PREVIEW_READY', 'BRAND_PREVIEW_READY'].includes(event.data?.type)) {
        setPreviewRevision((revision) => revision + 1);
      }
    };
    window.addEventListener('message', ready);
    return () => window.removeEventListener('message', ready);
  }, []);

  // Global Theme & Styling State
  const [selectedThemeId, setSelectedThemeId] = useState('atelier');
  const [primaryColor, setPrimaryColor] = useState('#1C1917');
  const [invalidColors, setInvalidColors] = useState<Record<string, boolean>>({});
  const hasInvalidColors = Object.values(invalidColors).some(Boolean);
  const setColorValidity = (field: string, valid: boolean) => setInvalidColors((current) => current[field] === !valid ? current : { ...current, [field]: !valid });
  const [accentColor, setAccentColor] = useState('#D4AF37');
  const [backgroundColor, setBackgroundColor] = useState('#FAFAF9');
  const [typographyPreset, setTypographyPreset] = useState('Playfair Display');
  const [announcementText, setAnnouncementText] = useState(
    'Complimentary pan-India insured shipping on all orders'
  );
  const [announcementEnabled, setAnnouncementEnabled] = useState(true);
  const [announcementFloating, setAnnouncementFloating] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoSize, setLogoSize] = useState<number>(40);
  const [storeNameSize, setStoreNameSize] = useState<number>(18);
  const [heroBannerUrl, setHeroBannerUrl] = useState('');
  const [aboutBannerUrl, setAboutBannerUrl] = useState('');
  const [uploadingHomeBanner, setUploadingHomeBanner] = useState(false);
  const [uploadingAboutBanner, setUploadingAboutBanner] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadStepMessage, setUploadStepMessage] = useState('');
  const [homeBannerMeta, setHomeBannerMeta] = useState<{
    width: number;
    height: number;
    origWidth: number;
    origHeight: number;
    sizeKb: number;
    status: 'valid' | 'warning';
    message: string;
  } | null>(null);
  const [aboutBannerMeta, setAboutBannerMeta] = useState<{
    width: number;
    height: number;
    origWidth: number;
    origHeight: number;
    sizeKb: number;
    status: 'valid' | 'warning';
    message: string;
  } | null>(null);
  const [logoMeta, setLogoMeta] = useState<{
    width: number;
    height: number;
    origWidth: number;
    origHeight: number;
    sizeKb: number;
    status: 'valid' | 'warning';
    message: string;
  } | null>(null);

  // Extended Customization
  const [headerStyle, setHeaderStyle] = useState('minimal-center');
  const [heroStyle, setHeroStyle] = useState('split-editorial');
  const [cardStyle, setCardStyle] = useState('framed-luxury');
  const [buttonStyle, setButtonStyle] = useState('sharp-pill');
  const [imageRatio, setImageRatio] = useState('3/4');
  const [announcementBarStyle, setAnnouncementBarStyle] = useState('square');

  // HOME PAGE Specific Customization
  const [homeHeroBadge, setHomeHeroBadge] = useState('ARTISANAL ATELIER • HALLMARKED & CERTIFIED');
  const [homeHeroTitle, setHomeHeroTitle] = useState('Timeless Elegance & Handcrafted Luxury');
  const [homeHeroSubtitle, setHomeHeroSubtitle] = useState(
    'Every creation embodies heritage craftsmanship, hand-selected materials, and immaculate proportion. Designed for collectors of fine distinction.'
  );
  const [homeCtaText, setHomeCtaText] = useState('Explore Collection');
  const [homeCtaLink, setHomeCtaLink] = useState('#products');
  const [homeSecondaryCtaText, setHomeSecondaryCtaText] = useState('Our Heritage');
  const [homeSecondaryCtaLink, setHomeSecondaryCtaLink] = useState('#story');

  // PRODUCTS PAGE Specific Customization
  const [productsPageTitle, setProductsPageTitle] = useState('Our Collection');
  const [productsPageSubtitle, setProductsPageSubtitle] = useState(
    'Explore our complete selection of handcrafted offerings sourced with care and delivered directly to your doorstep.'
  );
  const [productsBadgeText, setProductsBadgeText] = useState('Direct from Merchant');

  // ABOUT US PAGE Specific Customization
  const [aboutPageTitle, setAboutPageTitle] = useState('');
  const [aboutTagline, setAboutTagline] = useState(
    'Rooted in authentic tradition, crafted for everyday distinction.'
  );
  const [aboutStoryP1, setAboutStoryP1] = useState(
    'Founded with a steadfast commitment to purity and heritage, our boutique brings you exceptional goods meticulously selected from trusted origins.'
  );
  const [aboutStoryP2, setAboutStoryP2] = useState(
    'Every offering is curated by experienced master specialists who value genuine craftsmanship, ethical supply chains, and transparent customer service.'
  );
  const [aboutMissionTitle, setAboutMissionTitle] = useState('Our Mission');
  const [aboutMissionText, setAboutMissionText] = useState(
    'To deliver genuine, authentic quality directly to discerning customers with zero compromise on integrity and craftsmanship.'
  );
  const [aboutVisionTitle, setAboutVisionTitle] = useState('Our Vision');
  const [aboutVisionText, setAboutVisionText] = useState(
    'Preserving authentic Indian heritage while making premium craftsmanship accessible across the country.'
  );
  const [pillar1Title, setPillar1Title] = useState('100% Authentic Quality');
  const [pillar1Desc, setPillar1Desc] = useState(
    'Directly sourced and inspected for absolute purity and highest benchmark standards.'
  );
  const [pillar2Title, setPillar2Title] = useState('Direct Merchant Care');
  const [pillar2Desc, setPillar2Desc] = useState(
    'Hand-packed with care by our dedicated team with direct support for every customer.'
  );
  const [pillar3Title, setPillar3Title] = useState('Secure Pan-India Delivery');
  const [pillar3Desc, setPillar3Desc] = useState(
    'Reliable express shipping with real-time tracking and verified protective packaging.'
  );
  const [physicalStoreAddress, setPhysicalStoreAddress] = useState(
    'Heritage Arcade, MG Road, Pune, Maharashtra 411001'
  );
  const [physicalStoreTimings, setPhysicalStoreTimings] = useState(
    'Monday – Saturday: 10:30 AM to 8:30 PM (IST)'
  );
  const [aboutPhone, setAboutPhone] = useState('+91 98220 12345');
  const [aboutEmail, setAboutEmail] = useState('contact@sairamteacompany.com');

  // FOOTER & SOCIAL MEDIA Specific Customization
  const [footerDescription, setFooterDescription] = useState(
    'Official digital storefront. Order genuine products online directly with transparent pricing and doorstep delivery.'
  );
  const [socialInstagram, setSocialInstagram] = useState('');
  const [socialWhatsapp, setSocialWhatsapp] = useState('');
  const [socialFacebook, setSocialFacebook] = useState('');
  const [socialYoutube, setSocialYoutube] = useState('');
  const [socialTwitter, setSocialTwitter] = useState('');
  const [socialLinkedin, setSocialLinkedin] = useState('');
  const socialValues = { instagram: socialInstagram, whatsapp: socialWhatsapp, facebook: socialFacebook, youtube: socialYoutube, twitter: socialTwitter, linkedin: socialLinkedin };
  const canonicalSocialLinks = normalizeSocialLinks(socialValues);
  const hasInvalidSocialLinks = SOCIAL_PLATFORMS.some(platform => !parseSocialLink(platform, socialValues[platform]).valid);
  const [showTrustBadges, setShowTrustBadges] = useState(true);
  const [trustBadge1Icon, setTrustBadge1Icon] = useState<TrustBadgeIconId>('payment');
  const [trustBadge1Title, setTrustBadge1Title] = useState('Secure Indian Payments');
  const [trustBadge1Subtitle, setTrustBadge1Subtitle] = useState('UPI, Netbanking & Cards via Razorpay');
  const [trustBadge2Icon, setTrustBadge2Icon] = useState<TrustBadgeIconId>('truck');
  const [trustBadge2Title, setTrustBadge2Title] = useState('Reliable Pan-India Delivery');
  const [trustBadge2Subtitle, setTrustBadge2Subtitle] = useState('Doorstep tracking via premier couriers');
  const [trustBadge3Icon, setTrustBadge3Icon] = useState<TrustBadgeIconId>('shield');
  const [trustBadge3Title, setTrustBadge3Title] = useState('Verified Authentic Goods');
  const [trustBadge3Subtitle, setTrustBadge3Subtitle] = useState('Direct from certified merchant business');
  const [footerCopyright, setFooterCopyright] = useState('');

  useEffect(() => {
    loadStudioData();
  }, []);

  const loadStudioData = async () => {
    setLoading(true);
    try {
      const [storeRes, configRes] = await Promise.all([
        api.stores.getMyStore(),
        api.themes.getThemeConfig().catch(() => null),
      ]);
      setStore(storeRes);

      if (storeRes) {
        if (!aboutPageTitle) setAboutPageTitle(clampCatalogText(`About ${storeRes.name || 'Our Boutique'}`, ABOUT_TEXT_LIMITS.pageTitle));
        if (storeRes.supportPhone) {
          setAboutPhone(clampCatalogText(storeRes.supportPhone, ABOUT_TEXT_LIMITS.contactPhone));
        }
        if (storeRes.supportEmail) setAboutEmail(clampCatalogText(storeRes.supportEmail, ABOUT_TEXT_LIMITS.contactEmail));
        if (storeRes.businessAddress) setPhysicalStoreAddress(clampCatalogText(storeRes.businessAddress, ABOUT_TEXT_LIMITS.storeAddress));
        if (storeRes.socialLinks) {
          setSocialInstagram(typeof storeRes.socialLinks.instagram === 'string' ? storeRes.socialLinks.instagram : '');
          setSocialWhatsapp(typeof storeRes.socialLinks.whatsapp === 'string' ? storeRes.socialLinks.whatsapp : '');
          setSocialFacebook(typeof storeRes.socialLinks.facebook === 'string' ? storeRes.socialLinks.facebook : '');
          setSocialYoutube(typeof storeRes.socialLinks.youtube === 'string' ? storeRes.socialLinks.youtube : '');
          setSocialTwitter(typeof storeRes.socialLinks.twitter === 'string' ? storeRes.socialLinks.twitter : '');
          setSocialLinkedin(typeof storeRes.socialLinks.linkedin === 'string' ? storeRes.socialLinks.linkedin : '');
        }
      }

      if (storeRes?.branding) {
        if (storeRes.branding.logoUrl) setLogoUrl(storeRes.branding.logoUrl);
        if (storeRes.branding.bannerUrl) setHeroBannerUrl(clampCatalogText(storeRes.branding.bannerUrl, brandTextLimit(storeRes.branding.bannerUrl, HOME_TEXT_LIMITS.heroBannerUrl, true)));
        if (normalizeHexColor(storeRes.branding.primaryColor)) setPrimaryColor(normalizeHexColor(storeRes.branding.primaryColor)!);
        if (normalizeHexColor(storeRes.branding.accentColor)) setAccentColor(normalizeHexColor(storeRes.branding.accentColor)!);
        if (storeRes.branding.logoSize) setLogoSize(Number(storeRes.branding.logoSize));
        if (storeRes.branding.storeNameSize) setStoreNameSize(Number(storeRes.branding.storeNameSize));
      }

      if (configRes) {
        const cfg = normalizeBrandText(configRes.configJson || configRes);
        loadedConfigRef.current = cfg;
        const activeThemeCode =
          configRes.activeTheme?.code?.toLowerCase() || cfg.themeId || selectedThemeId;
        if (activeThemeCode) setSelectedThemeId(activeThemeCode);

        if (cfg.logoSize) setLogoSize(Number(cfg.logoSize));
        if (cfg.storeNameSize) setStoreNameSize(Number(cfg.storeNameSize));

        if (normalizeHexColor(cfg.palette?.primary)) setPrimaryColor(normalizeHexColor(cfg.palette.primary)!);
        if (normalizeHexColor(cfg.palette?.accent)) setAccentColor(normalizeHexColor(cfg.palette.accent)!);
        if (normalizeHexColor(cfg.palette?.background)) setBackgroundColor(normalizeHexColor(cfg.palette.background)!);
        if (cfg.typography?.preset) setTypographyPreset(resolveStorefrontFont(cfg.typography.preset));

        if (cfg.announcement) {
          setAnnouncementText(cfg.announcement.text ?? 'Complimentary pan-India insured shipping on all orders');
          setAnnouncementEnabled(cfg.announcement.enabled ?? true);
          setAnnouncementFloating(cfg.announcement.floating ?? false);
        }

        if (cfg.headerStyle) setHeaderStyle(cfg.headerStyle);
        if (cfg.heroStyle) setHeroStyle(cfg.heroStyle);
        if (cfg.cardStyle) setCardStyle(cfg.cardStyle);
        if (cfg.buttonStyle) setButtonStyle(cfg.buttonStyle);
        if (cfg.imageRatio) setImageRatio(cfg.imageRatio);
        if (cfg.announcementBarStyle) setAnnouncementBarStyle(cfg.announcementBarStyle);
        if (cfg.physicalStoreAddress !== undefined) setPhysicalStoreAddress(cfg.physicalStoreAddress);
        if (cfg.physicalStoreTimings !== undefined) setPhysicalStoreTimings(cfg.physicalStoreTimings);

        // Load custom home page fields
        if (cfg.pages?.home) {
          const h = cfg.pages.home;
          if (h.heroBadge !== undefined) setHomeHeroBadge(h.heroBadge);
          if (h.heroTitle !== undefined) setHomeHeroTitle(h.heroTitle);
          if (h.heroSubtitle !== undefined) setHomeHeroSubtitle(h.heroSubtitle);
          if (h.heroCtaText !== undefined) setHomeCtaText(h.heroCtaText);
          if (h.heroCtaLink !== undefined) setHomeCtaLink(h.heroCtaLink);
          if (h.heroSecondaryCtaText !== undefined) setHomeSecondaryCtaText(h.heroSecondaryCtaText);
          if (h.heroSecondaryCtaLink !== undefined) setHomeSecondaryCtaLink(h.heroSecondaryCtaLink);
          if (h.heroBannerUrl !== undefined) setHeroBannerUrl(h.heroBannerUrl);
        }

        // Load custom products page fields
        if (cfg.pages?.products) {
          const p = cfg.pages.products;
          if (p.pageTitle !== undefined) setProductsPageTitle(p.pageTitle);
          if (p.pageSubtitle !== undefined) setProductsPageSubtitle(p.pageSubtitle);
          if (p.badgeText !== undefined) setProductsBadgeText(p.badgeText);
        }

        // Load custom about us page fields
        if (cfg.pages?.about) {
          const a = cfg.pages.about;
          if (a.pageTitle !== undefined) setAboutPageTitle(a.pageTitle);
          if (a.tagline !== undefined) setAboutTagline(a.tagline);
          if (a.storyParagraph1 !== undefined) setAboutStoryP1(a.storyParagraph1);
          if (a.storyParagraph2 !== undefined) setAboutStoryP2(a.storyParagraph2);
          if (a.missionTitle !== undefined) setAboutMissionTitle(a.missionTitle);
          if (a.missionText !== undefined) setAboutMissionText(a.missionText);
          if (a.visionTitle !== undefined) setAboutVisionTitle(a.visionTitle);
          if (a.visionText !== undefined) setAboutVisionText(a.visionText);
          if (Array.isArray(a.values) && a.values.length >= 3) {
            setPillar1Title(a.values[0]?.title ?? pillar1Title);
            setPillar1Desc(a.values[0]?.desc ?? pillar1Desc);
            setPillar2Title(a.values[1]?.title ?? pillar2Title);
            setPillar2Desc(a.values[1]?.desc ?? pillar2Desc);
            setPillar3Title(a.values[2]?.title ?? pillar3Title);
            setPillar3Desc(a.values[2]?.desc ?? pillar3Desc);
          }
          if (a.storeAddress !== undefined) setPhysicalStoreAddress(a.storeAddress);
          if (a.storeHours !== undefined) setPhysicalStoreTimings(a.storeHours);
          if (a.contactPhone !== undefined) setAboutPhone(a.contactPhone);
          if (a.contactEmail !== undefined) setAboutEmail(a.contactEmail);
          if (a.bannerUrl !== undefined) setAboutBannerUrl(a.bannerUrl);
          else if (a.imageUrl !== undefined) setAboutBannerUrl(a.imageUrl);
        } else if (cfg.storeStory) {
          setAboutStoryP1(cfg.storeStory);
        }

        // Load custom footer & social settings
        const f = cfg.footer || cfg.pages?.footer;
        if (f) {
          if (f.description) setFooterDescription(f.description);
          if (f.socialLinks) {
            setSocialInstagram(typeof f.socialLinks.instagram === 'string' ? f.socialLinks.instagram : '');
            setSocialWhatsapp(typeof f.socialLinks.whatsapp === 'string' ? f.socialLinks.whatsapp : '');
            setSocialFacebook(typeof f.socialLinks.facebook === 'string' ? f.socialLinks.facebook : '');
            setSocialYoutube(typeof f.socialLinks.youtube === 'string' ? f.socialLinks.youtube : '');
            setSocialTwitter(typeof f.socialLinks.twitter === 'string' ? f.socialLinks.twitter : '');
            setSocialLinkedin(typeof f.socialLinks.linkedin === 'string' ? f.socialLinks.linkedin : '');
          }
          if (f.showTrustBadges !== undefined) setShowTrustBadges(f.showTrustBadges);
          setTrustBadge1Icon(resolveTrustBadgeIcon(f.trustBadge1Icon, 'payment'));
          if (f.trustBadge1Title) setTrustBadge1Title(f.trustBadge1Title);
          if (f.trustBadge1Subtitle) setTrustBadge1Subtitle(f.trustBadge1Subtitle);
          setTrustBadge2Icon(resolveTrustBadgeIcon(f.trustBadge2Icon, 'truck'));
          if (f.trustBadge2Title) setTrustBadge2Title(f.trustBadge2Title);
          if (f.trustBadge2Subtitle) setTrustBadge2Subtitle(f.trustBadge2Subtitle);
          setTrustBadge3Icon(resolveTrustBadgeIcon(f.trustBadge3Icon, 'shield'));
          if (f.trustBadge3Title) setTrustBadge3Title(f.trustBadge3Title);
          if (f.trustBadge3Subtitle) setTrustBadge3Subtitle(f.trustBadge3Subtitle);
          if (f.copyrightText) setFooterCopyright(f.copyrightText.replace(/\.?\s*DPDPA\s*2023\s*Compliant\.?/gi, '').trim());
        }
      }
    } catch (err) {
      console.error('Failed to load theme studio data', err);
    } finally {
      setLoading(false);
    }
  };

  // Sync state in real time with the live iframe preview
  useEffect(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: 'UPDATE_THEME_PREVIEW',
          themeConfig: {
            themeId: selectedThemeId,
            logoSize,
            storeNameSize,
            palette: {
              primary: primaryColor,
              accent: accentColor,
              background: backgroundColor,
            },
            typography: {
              preset: typographyPreset,
            },
            announcement: {
              enabled: announcementEnabled,
              text: announcementText,
              floating: announcementFloating,
            },
            headerStyle,
            heroStyle,
            cardStyle,
            buttonStyle,
            imageRatio,
            announcementBarStyle,
            storeStory: aboutStoryP1,
            physicalStoreAddress,
            physicalStoreTimings,
            footer: {
              description: footerDescription,
              socialLinks: canonicalSocialLinks,
              showTrustBadges,
              trustBadge1Icon,
              trustBadge1Title,
              trustBadge1Subtitle,
              trustBadge2Icon,
              trustBadge2Title,
              trustBadge2Subtitle,
              trustBadge3Icon,
              trustBadge3Title,
              trustBadge3Subtitle,
              copyrightText: (footerCopyright || `© ${new Date().getFullYear()} ${store?.name || 'Our Store'}. All rights reserved.`).replace(/\.?\s*DPDPA\s*2023\s*Compliant\.?/gi, '').trim(),
              contactPhone: aboutPhone,
              contactEmail: aboutEmail,
              address: physicalStoreAddress,
            },
            pages: {
              home: {
                heroBadge: homeHeroBadge,
                heroTitle: homeHeroTitle,
                heroSubtitle: homeHeroSubtitle,
                heroCtaText: homeCtaText,
                heroCtaLink: homeCtaLink,
                heroSecondaryCtaText: homeSecondaryCtaText,
                heroSecondaryCtaLink: homeSecondaryCtaLink,
                heroBannerUrl: heroBannerUrl,
              },
              products: {
                badgeText: productsBadgeText,
                pageTitle: productsPageTitle,
                pageSubtitle: productsPageSubtitle,
              },
              about: {
                pageTitle: aboutPageTitle,
                tagline: aboutTagline,
                storyParagraph1: aboutStoryP1,
                storyParagraph2: aboutStoryP2,
                missionTitle: aboutMissionTitle,
                missionText: aboutMissionText,
                visionTitle: aboutVisionTitle,
                visionText: aboutVisionText,
                values: [
                  { ...loadedConfigRef.current.pages?.about?.values?.[0], title: pillar1Title, desc: pillar1Desc },
                  { ...loadedConfigRef.current.pages?.about?.values?.[1], title: pillar2Title, desc: pillar2Desc },
                  { ...loadedConfigRef.current.pages?.about?.values?.[2], title: pillar3Title, desc: pillar3Desc },
                ],
                storeAddress: physicalStoreAddress,
                storeHours: physicalStoreTimings,
                contactPhone: aboutPhone,
                contactEmail: aboutEmail,
                bannerUrl: aboutBannerUrl || heroBannerUrl,
              },
              footer: {
                description: footerDescription,
                socialLinks: canonicalSocialLinks,
              },
            },
          },
          branding: {
            logoUrl,
            bannerUrl: heroBannerUrl,
            primaryColor,
            accentColor,
            logoSize,
            storeNameSize,
          },
        },
        new URL(getStorefrontUrl()).origin
      );
    }
  }, [
    previewRevision,
    selectedThemeId,
    primaryColor,
    accentColor,
    backgroundColor,
    typographyPreset,
    announcementEnabled,
    announcementText,
    announcementFloating,
    headerStyle,
    heroStyle,
    cardStyle,
    buttonStyle,
    imageRatio,
    announcementBarStyle,
    homeHeroBadge,
    homeHeroTitle,
    homeHeroSubtitle,
    homeCtaText,
    homeCtaLink,
    homeSecondaryCtaText,
    homeSecondaryCtaLink,
    productsPageTitle,
    productsPageSubtitle,
    productsBadgeText,
    aboutPageTitle,
    aboutTagline,
    aboutStoryP1,
    aboutStoryP2,
    aboutMissionTitle,
    aboutMissionText,
    aboutVisionTitle,
    aboutVisionText,
    pillar1Title,
    pillar1Desc,
    pillar2Title,
    pillar2Desc,
    pillar3Title,
    pillar3Desc,
    physicalStoreAddress,
    physicalStoreTimings,
    aboutPhone,
    aboutEmail,
    footerDescription,
    socialInstagram,
    socialWhatsapp,
    socialFacebook,
    socialYoutube,
    socialTwitter,
    socialLinkedin,
    showTrustBadges,
    trustBadge1Icon,
    trustBadge1Title,
    trustBadge1Subtitle,
    trustBadge2Icon,
    trustBadge2Title,
    trustBadge2Subtitle,
    trustBadge3Icon,
    trustBadge3Title,
    trustBadge3Subtitle,
    footerCopyright,
    logoUrl,
    logoSize,
    storeNameSize,
    heroBannerUrl,
    aboutBannerUrl,
  ]);

  const handleTabSwitch = (tab: 'THEME' | 'HOME' | 'PRODUCTS' | 'ABOUT' | 'FOOTER') => {
    setActiveTab(tab);
    if (tab === 'HOME') setActivePreviewPage('home');
    else if (tab === 'PRODUCTS') setActivePreviewPage('products');
    else if (tab === 'ABOUT') setActivePreviewPage('about');
  };

  const handleApplyQuickPreset = (categoryName: string) => {
    const output = QuickDesigner.designForCategory(categoryName, store?.name || 'Our Store');
    setSelectedThemeId(output.themeCode);
    setPrimaryColor(output.primaryColor);
    setAccentColor(output.accentColor);
    setBackgroundColor(output.theme.palette.background);
    setTypographyPreset(output.theme.typography.heading);
    setHeaderStyle(output.theme.headerStyle);
    setHeroStyle(output.theme.heroStyle);
    setCardStyle(output.theme.cardStyle);
    setButtonStyle(output.theme.buttonStyle);
    setImageRatio(output.theme.imageRatio);
  };

  // Image Size Validation & Layout Normalizer
  const processAndUploadImage = async (
    file: File,
    targetType: 'hero' | 'about' | 'logo',
    onProgress?: (message: string) => void
  ): Promise<{
    url: string;
    meta: {
      width: number;
      height: number;
      origWidth: number;
      origHeight: number;
      sizeKb: number;
      status: 'valid' | 'warning';
      message: string;
    };
  }> => {
    if (!file.type.startsWith('image/')) {
      throw new Error(t('brandStudio.pleaseSelectAValidImageFilePngJpg'));
    }

    const maxSizeBytes = 15 * 1024 * 1024; // 15MB
    if (file.size > maxSizeBytes) {
      throw new Error(t('brandStudio.imageSizeExceeds15mbLimitPleaseChooseAn'));
    }

    onProgress?.(t('brandStudio.step13CheckingImageResolutionDefaultSpecifications'));

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(t('brandStudio.failedToReadImageFile')));
      reader.onload = (e) => {
        const rawDataUrl = e.target?.result as string;
        const img = new Image();
        img.onerror = () => reject(new Error(t('brandStudio.failedToLoadImageFile')));
        img.onload = async () => {
          const origWidth = img.naturalWidth || img.width;
          const origHeight = img.naturalHeight || img.height;

          // High-Definition Responsive Specifications:
          // Hero Showcase Layout: 1920 × 1080 px up to 2560 × 1440 px (16:9 Widescreen Panorama)
          // About Us Story Layout: 1600 × 1200 px (4:3 Standard Story)
          // Store Logo: 512 × 512 px (1:1 High-Res Square)
          let targetW = 1920;
          let targetH = 1080;
          let minRecommendedWidth = 1440;

          if (targetType === 'hero') {
            minRecommendedWidth = 1440;
            // Never crush high-resolution images! Preserve up to 2560px (2K Ultra-HD)
            if (origWidth >= 2560) {
              targetW = 2560;
              targetH = 1440;
            } else if (origWidth >= 1920) {
              targetW = origWidth;
              targetH = Math.round((origWidth * 9) / 16);
            } else if (origWidth >= 1440) {
              targetW = origWidth;
              targetH = Math.round((origWidth * 9) / 16);
            } else {
              targetW = Math.max(1280, origWidth);
              targetH = Math.round((targetW * 9) / 16);
            }
          } else if (targetType === 'about') {
            minRecommendedWidth = 800;
            targetW = Math.min(1600, Math.max(800, origWidth));
            targetH = Math.round((targetW * 3) / 4);
          } else if (targetType === 'logo') {
            minRecommendedWidth = 200;
            targetW = 512;
            targetH = 512;
          }

          onProgress?.(
            t('brandStudio.imageConforming', { from: `${origWidth}×${origHeight}`, to: `${targetW}×${targetH}` })
          );

          // Center-cover crop algorithm: scales and centers the image into the exact target dimensions
          // without distortion, stretching, or black letterbox borders.
          const scale = Math.max(targetW / origWidth, targetH / origHeight);
          const cropW = targetW / scale;
          const cropH = targetH / scale;
          const cropX = Math.max(0, (origWidth - cropW) / 2);
          const cropY = Math.max(0, (origHeight - cropH) / 2);

          let finalDataUrl = rawDataUrl;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

              const exportMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
              // 0.96 high quality prevents compression degradation
              const quality = exportMime === 'image/png' ? undefined : 0.96;
              finalDataUrl = canvas.toDataURL(exportMime, quality);
            }
          } catch (canvasErr) {
            console.warn('Canvas resizing skipped, using raw data', canvasErr);
          }

          const commaIdx = finalDataUrl.indexOf(',');
          const base64Payload = commaIdx !== -1 ? finalDataUrl.slice(commaIdx + 1) : finalDataUrl;
          const approxKb = Math.round((base64Payload.length * 3) / 4 / 1024);

          onProgress?.(t('brandStudio.imageUploading', { width: targetW, height: targetH }));

          let status: 'valid' | 'warning' = 'valid';
          let message = t('brandStudio.imageVerified', { width: targetW, height: targetH, size: approxKb });

          if (origWidth < minRecommendedWidth) {
            status = 'warning';
            message = t('brandStudio.imageLowResolution', { width: origWidth, height: origHeight });
          }

          let uploadedUrl = finalDataUrl;
          try {
            const res = await api.media.uploadMediaAsset({
              filename: file.name.replace(/\.[^/.]+$/, '') + `-${targetW}x${targetH}` + (file.type === 'image/png' ? '.png' : '.jpg'),
              mimeType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
              base64Data: base64Payload,
              altText: file.name,
            });
            if (res && res.publicUrl) {
              uploadedUrl = res.publicUrl;
            }
          } catch (uploadErr) {
            console.warn('API upload fallback to data URL', uploadErr);
          }

          resolve({
            url: uploadedUrl,
            meta: {
              width: targetW,
              height: targetH,
              origWidth,
              origHeight,
              sizeKb: approxKb,
              status,
              message,
            },
          });
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleLogoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingLogo(true);
    setUploadStepMessage(t('brandStudio.checkingLogoSizeConformingTo400400Px'));
    try {
      const { url, meta } = await processAndUploadImage(files[0], 'logo', (msg) => setUploadStepMessage(msg));
      setLogoUrl(url);
      setLogoMeta(meta);
    } catch (err: any) {
      alert(err.message || t('brandStudio.failedToUploadLogo'));
    } finally {
      setUploadingLogo(false);
      setUploadStepMessage('');
    }
  };

  const handleBannerUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingHomeBanner(true);
    setUploadStepMessage(t('brandStudio.checkingImageResolutionConformingToDefaultLayout1200'));
    try {
      const { url, meta } = await processAndUploadImage(files[0], 'hero', (msg) => setUploadStepMessage(msg));
      setHeroBannerUrl(clampCatalogText(url, brandTextLimit(url, HOME_TEXT_LIMITS.heroBannerUrl, true)));
      setHomeBannerMeta(meta);
    } catch (err: any) {
      alert(err.message || t('brandStudio.failedToUploadBanner'));
    } finally {
      setUploadingHomeBanner(false);
      setUploadStepMessage('');
    }
  };

  const handleHomeBannerUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingHomeBanner(true);
    setUploadStepMessage(t('brandStudio.checkingImageResolutionConformingToDefaultLayout1200'));
    try {
      const { url, meta } = await processAndUploadImage(files[0], 'hero', (msg) => setUploadStepMessage(msg));
      setHeroBannerUrl(clampCatalogText(url, brandTextLimit(url, HOME_TEXT_LIMITS.heroBannerUrl, true)));
      setHomeBannerMeta(meta);
    } catch (err: any) {
      alert(err.message || t('brandStudio.failedToUploadHeroShowcaseImage'));
    } finally {
      setUploadingHomeBanner(false);
      setUploadStepMessage('');
    }
  };

  const handleAboutBannerUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingAboutBanner(true);
    setUploadStepMessage(t('brandStudio.checkingImageResolutionConformingToDefaultLayout800'));
    try {
      const { url, meta } = await processAndUploadImage(files[0], 'about', (msg) => setUploadStepMessage(msg));
      setAboutBannerUrl(clampCatalogText(url, brandTextLimit(url, ABOUT_TEXT_LIMITS.bannerUrl, true)));
      setAboutBannerMeta(meta);
    } catch (err: any) {
      alert(err.message || t('brandStudio.failedToUploadAboutStoryImage'));
    } finally {
      setUploadingAboutBanner(false);
      setUploadStepMessage('');
    }
  };

  const imageStatusMessage = (meta: { status: string; width: number; height: number; origWidth: number; origHeight: number; sizeKb: number }) => t(
    meta.status === 'warning' ? 'brandStudio.imageLowResolution' : 'brandStudio.imageVerified',
    { width: meta.status === 'warning' ? meta.origWidth : meta.width, height: meta.status === 'warning' ? meta.origHeight : meta.height, size: meta.sizeKb },
  );

  // Contrast Safety Checks
  const contrastRatio = getContrastRatio(backgroundColor, primaryColor);
  const isAccessible = contrastRatio >= 4.5;

  const fixContrastAutomatically = () => {
    const suggested = getSuggestedTextColor(backgroundColor);
    setPrimaryColor(getContrastRatio(backgroundColor, suggested) >= 4.5 ? suggested : '#000000');
  };

  const handleSaveThemeConfig = async () => {
    if (hasInvalidColors || hasInvalidSocialLinks) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await api.themes.updateThemeConfig({
        themeCode: selectedThemeId,
        configJson: {
          ...loadedConfigRef.current,
          themeId: selectedThemeId,
          logoSize,
          storeNameSize,
          palette: {
            primary: primaryColor,
            accent: accentColor,
            background: backgroundColor,
          },
          typography: {
            preset: typographyPreset,
          },
          announcement: {
            enabled: announcementEnabled,
            text: announcementText,
            floating: announcementFloating,
          },
          headerStyle,
          heroStyle,
          cardStyle,
          buttonStyle,
          imageRatio,
          announcementBarStyle,
          storeStory: aboutStoryP1,
          physicalStoreAddress,
          physicalStoreTimings,
          footer: {
            description: footerDescription,
            socialLinks: canonicalSocialLinks,
            showTrustBadges,
            trustBadge1Icon,
            trustBadge1Title,
            trustBadge1Subtitle,
            trustBadge2Icon,
            trustBadge2Title,
            trustBadge2Subtitle,
            trustBadge3Icon,
            trustBadge3Title,
            trustBadge3Subtitle,
            copyrightText: footerCopyright ? footerCopyright.replace(/\.?\s*DPDPA\s*2023\s*Compliant\.?/gi, '').trim() : undefined,
            contactPhone: aboutPhone,
            contactEmail: aboutEmail,
            address: physicalStoreAddress,
          },
          pages: {
            ...loadedConfigRef.current.pages,
            home: {
              ...loadedConfigRef.current.pages?.home,
              heroBadge: homeHeroBadge,
              heroTitle: homeHeroTitle,
              heroSubtitle: homeHeroSubtitle,
              heroCtaText: homeCtaText,
              heroCtaLink: homeCtaLink,
              heroSecondaryCtaText: homeSecondaryCtaText,
              heroSecondaryCtaLink: homeSecondaryCtaLink,
              heroBannerUrl: heroBannerUrl,
            },
            products: {
              ...loadedConfigRef.current.pages?.products,
              badgeText: productsBadgeText,
              pageTitle: productsPageTitle,
              pageSubtitle: productsPageSubtitle,
            },
            about: {
              ...loadedConfigRef.current.pages?.about,
              pageTitle: aboutPageTitle,
              tagline: aboutTagline,
              storyParagraph1: aboutStoryP1,
              storyParagraph2: aboutStoryP2,
              missionTitle: aboutMissionTitle,
              missionText: aboutMissionText,
              visionTitle: aboutVisionTitle,
              visionText: aboutVisionText,
              values: [
                { ...loadedConfigRef.current.pages?.about?.values?.[0], title: pillar1Title, desc: pillar1Desc },
                { ...loadedConfigRef.current.pages?.about?.values?.[1], title: pillar2Title, desc: pillar2Desc },
                { ...loadedConfigRef.current.pages?.about?.values?.[2], title: pillar3Title, desc: pillar3Desc },
              ],
              storeAddress: physicalStoreAddress,
              storeHours: physicalStoreTimings,
              contactPhone: aboutPhone,
              contactEmail: aboutEmail,
              bannerUrl: aboutBannerUrl || heroBannerUrl,
            },
            footer: {
              description: footerDescription,
              socialLinks: canonicalSocialLinks,
            },
          },
        },
      });

      // Update store branding (logo and colors)
      await api.themes.updateBranding({
        primaryColor,
        accentColor,
        logoUrl: logoUrl || undefined,
        logoSize,
        storeNameSize,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (err: any) {
      alert(t('brandStudio.failedToSaveThemeConfiguration'));
    } finally {
      setSaving(false);
    }
  };

  const currentThemeObj = FOUNDATIONAL_THEMES[selectedThemeId] || FOUNDATIONAL_THEMES.atelier;

  // Modular Section Renderers
  const renderThemeStyleSection = () => (
    <div className="space-y-6">
      {/* Foundational Storefront Theme (Unified Quick Themes Option) */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">{t('brandStudio.storefrontThemeBusinessPresets')}</label>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{t('brandStudio.chooseTheFoundationalDesignArchetypeTailoredForYour')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.values(FOUNDATIONAL_THEMES).map((th) => {
            const isNew = ['aura', 'noir', 'vista', 'horizon', 'canvas'].includes(th.code);
            const isSelected = selectedThemeId === th.code;
            return (
              <button
                key={th.code}
                data-testid={`brand-theme-${th.code}`}
                type="button"
                onClick={() => {
                  setSelectedThemeId(th.code);
                  setPrimaryColor(th.palette.primary);
                  setAccentColor(th.palette.accent);
                  setBackgroundColor(th.palette.background);
                  setTypographyPreset(th.typography.heading);
                  setHeaderStyle(th.headerStyle);
                  setHeroStyle(th.heroStyle);
                  setCardStyle(th.cardStyle);
                  setButtonStyle(th.buttonStyle);
                  setImageRatio(th.imageRatio);
                }}
                className={`text-left p-4 rounded-xl border transition flex flex-col justify-between space-y-2.5 relative cursor-pointer group ${
                  isSelected
                    ? 'border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/30 shadow-xs'
                    : 'border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{th.name}</span>
                      {isNew && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-500 text-white shadow-2xs">{t('brandStudio.new')}</span>
                      )}
                    </div>
                    {isSelected ? (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                        {th.typography.heading}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-tight font-medium">
                    {t(`brandStudio.presets.${th.code}.tagline`)}
                  </p>
                </div>

                {/* Best Suited For Business Callout (High Contrast in both Dark & Light Themes) */}
                <div className="theme-best-suited-box rounded-lg p-2.5 border space-y-1 shadow-2xs">
                  <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 block uppercase tracking-wider">{t('brandStudio.bestSuitedFor')}</span>
                  <p className="text-[11px] font-medium leading-snug">
                    {t(`brandStudio.presets.${th.code}.bestFor`)}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs"
                      style={{ backgroundColor: th.palette.background }}
                      title={t('brandStudio.background')}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs"
                      style={{ backgroundColor: th.palette.primary }}
                      title={t('brandStudio.primary')}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs"
                      style={{ backgroundColor: th.palette.accent }}
                      title={t('brandStudio.accent')}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('brandStudio.ratio')}{' '}{th.imageRatio}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Marquee Offer Banner & Top Promotional Strip (Feature for Merchant Offers) */}
      <div className="bg-white dark:bg-slate-900/60 p-4 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-amber-500" />
              <label className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider block">{t('brandStudio.storefrontOfferMarqueeTopAnnouncementBar')}</label>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{t('brandStudio.displayPromotionsFestiveDiscountsDeliveryGuaranteesOrFlash')}</p>
          </div>

          {/* Toggle Switch */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {announcementEnabled ? t('brandStudio.active') : t('brandStudio.disabled')}
            </span>
            <button
              type="button"
              role="switch"
              aria-label={t('brandStudio.topAnnouncementBar')}
              aria-checked={announcementEnabled}
              onClick={() => setAnnouncementEnabled(!announcementEnabled)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                announcementEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  announcementEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {announcementEnabled && (
          <div className="space-y-4 pt-2 border-t border-slate-200/60 dark:border-slate-800">
            {/* Offer Text Input */}
            <div>
              <CatalogTextField fieldKey="announcement.text"
                  label={t('brandStudio.promotionalOfferMessage')}
                  value={announcementText} max={BRAND_TEXT_LIMITS.subtitle} onChange={setAnnouncementText}
                  labelClassName="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5" type="text" placeholder={t('brandStudio.eGFestiveOffer20OffOnAll')}
                  inputClassName="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t('brandStudio.visibleAtTheTopHeaderAcrossHomeProducts')}</p>
            </div>

            {/* Continuous Scrolling Marquee Animation Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">{t('brandStudio.continuousScrollingMarqueeAnimation')}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{t('brandStudio.smoothlyAutoScrollsTheOfferTextHorizontallyLike')}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-label={t('brandStudio.continuousScrollingMarqueeAnimation')}
                aria-checked={announcementFloating}
                onClick={() => setAnnouncementFloating(!announcementFloating)}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                  announcementFloating ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    announcementFloating ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Quick Offer Presets */}
            <div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">{t('brandStudio.quickOfferTemplatesClickToApply')}</span>
              <div className="flex flex-wrap gap-2">
                {[
                  t('brandStudio.specialOfferFlat20OffOnAllItems'),
                  t('brandStudio.freeExpressShippingOnAllOrdersAbove499'),
                  t('brandStudio.newSeasonDropOnlineNow100AuthenticCertified'),
                  t('brandStudio.pureHandcraftedDailyFreshDispatchWithin24Hours'),
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setAnnouncementText(clampCatalogText(preset, BRAND_TEXT_LIMITS.subtitle));
                      setAnnouncementEnabled(true);
                    }}
                    className="text-left text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500 text-slate-700 dark:text-slate-300 transition shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Tag className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>{preset}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Layout Styling & Component Shapes */}
      <div className="bg-white dark:bg-slate-900/60 p-4 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.layoutStylingComponentShapes')}</label>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{t('brandStudio.customizeHeaderArrangementCardEdgeCurvaturesElevationShadows')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('brandStudio.headerStyle')}</label>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1.5 leading-tight">{t('brandStudio.topBarNavigationLayoutOnDesktopAndMobile')}</p>
            <select
              value={headerStyle}
              onChange={(e) => setHeaderStyle(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
            >
              <option value="sticky-action">{t('brandStudio.stickyActionBarStandard')}</option>
              <option value="minimal-center">{t('brandStudio.centeredBrandLogoBoutique')}</option>
              <option value="quick-search-bar">{t('brandStudio.quickSearchBarRetailFmcg')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('brandStudio.cardStyle')}</label>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1.5 leading-tight">{t('brandStudio.productAndCategoryCardBordersCornerCurvesShadows')}</p>
            <select
              value={cardStyle}
              onChange={(e) => setCardStyle(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
            >
              <option value="elevated-modern">{t('brandStudio.elevatedModern16pxCurveSoftShadow')}</option>
              <option value="rounded-soft">{t('brandStudio.curvedFriendly24pxBubbleCurve')}</option>
              <option value="framed-luxury">{t('brandStudio.framedLuxury6pxRefinedFrame')}</option>
              <option value="minimal-bleed">{t('brandStudio.crispMinimal0pxSquareFlushEdge')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('brandStudio.buttonShape')}</label>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-1.5 leading-tight">{t('brandStudio.cornerRadiusForPurchaseQuoteCtaButtons')}</p>
            <select
              value={buttonStyle}
              onChange={(e) => setButtonStyle(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
            >
              <option value="rounded-heavy">{t('brandStudio.smoothRounded12pxComfortableRadius')}</option>
              <option value="sharp-pill">{t('brandStudio.fullPill9999pxCapsuleCurve')}</option>
              <option value="square-solid">{t('brandStudio.crispSquare2pxPrecisionIndustrialEdges')}</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLogoBannerSection = () => (
    <div className="space-y-6">
      {/* Logo & Banner Upload */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.storeBrandAssetsLogoBanner')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Logo Upload Box */}
              <div>
                <span className="text-xs font-semibold text-slate-700 block mb-1">{t('brandStudio.brandLogo')}</span>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleLogoUpload(e.target.files)}
                  className="hidden"
                />
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className="border border-dashed border-slate-300 rounded-xl p-3 text-center cursor-pointer hover:border-blue-500 hover:bg-slate-50 transition flex items-center gap-3"
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt={t('brandStudio.logo')} className="h-10 w-10 object-contain rounded" />
                  ) : (
                    <div className="h-10 w-10 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                      <Building className="w-5 h-5" />
                    </div>
                  )}
                  <div className="text-left text-xs min-w-0">
                    <span className="font-semibold text-slate-800 block truncate">
                      {logoUrl ? t('brandStudio.changeLogo') : t('brandStudio.uploadLogo')}
                    </span>
                    <span className="text-[10px] text-slate-400">{t('brandStudio.pngOrSvgWithTransparency')}</span>
                  </div>
                </div>
              </div>

              {/* Banner Upload Box */}
              <div>
                <span className="text-xs font-semibold text-slate-700 block mb-1">{t('brandStudio.heroShowcaseBanner')}</span>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleBannerUpload(e.target.files)}
                  className="hidden"
                />
                <div
                  onClick={() => bannerInputRef.current?.click()}
                  className="border border-dashed border-slate-300 rounded-xl p-3 text-center cursor-pointer hover:border-blue-500 hover:bg-slate-50 transition flex items-center gap-3"
                >
                  {heroBannerUrl ? (
                    <img
                      src={heroBannerUrl}
                      alt={t('brandStudio.banner')}
                      className="h-10 w-16 object-cover rounded"
                    />
                  ) : (
                    <div className="h-10 w-16 bg-slate-100 rounded flex items-center justify-center text-slate-400">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                  )}
                  <div className="text-left text-xs min-w-0">
                    <span className="font-semibold text-slate-800 block truncate">
                      {heroBannerUrl ? t('brandStudio.changeBanner') : t('brandStudio.uploadBanner')}
                    </span>
                    <span className="text-[10px] text-slate-400">{t('brandStudio.ultraHd19201080Px169')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Logo & Store Name Size Adjustment Controls */}
            <div className="pt-4 border-t border-slate-100 dark:border-merchant-border space-y-4 dark:[color-scheme:dark]">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-merchant-text block">{t('brandStudio.headerBrandSizing')}</span>
                  <span className="text-[11px] text-slate-400 dark:text-merchant-text-muted">{t('brandStudio.scaleYourLogoAndStoreNameIndependentlyFor')}</span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-merchant-text-muted bg-slate-100 dark:bg-merchant-surface-raised px-2.5 py-1 rounded-md">{t('brandStudio.logo2')}{' '}<span className="font-bold text-blue-600">{logoSize}px</span>{t('brandStudio.name')}{' '}<span className="font-bold text-blue-600">{storeNameSize}px</span>
                </div>
              </div>

              {/* Live Mini Preview Box */}
              <div className="p-3 bg-slate-50/80 dark:bg-merchant-surface-raised text-merchant-text rounded-xl border border-slate-200/60 dark:border-merchant-border flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={t('brandStudio.brandLogo')}
                      style={{
                        width: `${logoSize}px`,
                        height: `${logoSize}px`,
                        maxHeight: `${logoSize}px`,
                        maxWidth: `${logoSize}px`,
                      }}
                      className="rounded-full object-contain p-0.5 bg-white dark:bg-merchant-input-bg border border-slate-200 dark:border-merchant-border shadow-xs shrink-0 transition-all"
                    />
                  ) : (
                    <div
                      style={{
                        width: `${logoSize}px`,
                        height: `${logoSize}px`,
                        fontSize: `${Math.max(10, Math.round(logoSize * 0.4))}px`,
                        backgroundColor: primaryColor || '#0f172a',
                      }}
                      className="rounded-lg flex items-center justify-center font-black text-white shadow-xs shrink-0 transition-all"
                    >
                      {getWordmark(store?.name || 'Store').monogram}
                    </div>
                  )}
                  <div className="min-w-0">
                    <span
                      style={{
                        fontSize: `${storeNameSize}px`,
                        lineHeight: '1.2',
                        color: primaryColor || '#0f172a',
                      }}
                      className="font-bold block truncate transition-all dark:!text-merchant-text"
                    >
                      {store?.name || 'SaiRam Tea Company'}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-merchant-text-muted font-mono uppercase tracking-wider block">{t('brandStudio.liveHeaderPreview')}</span>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/30 shrink-0">{t('brandStudio.responsive')}</span>
              </div>

              {/* 1. Logo Size Control */}
              <div className="space-y-2 bg-slate-50/50 dark:bg-merchant-surface-raised text-merchant-text p-3 rounded-xl border border-slate-200/60 dark:border-merchant-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-merchant-text">{t('brandStudio.logoDimensionSize')}</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLogoSize((prev) => Math.max(24, prev - 4))}
                      disabled={logoSize <= 24}
                      className="w-6 h-6 rounded-md bg-white dark:bg-merchant-input-bg border border-slate-300 dark:border-merchant-border flex items-center justify-center text-slate-600 dark:text-merchant-text hover:bg-slate-100 dark:hover:bg-merchant-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition"
                      title={t('brandStudio.decreaseLogoSize')}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-mono font-bold text-slate-800 dark:text-merchant-text w-12 text-center bg-white dark:bg-merchant-input-bg px-1.5 py-0.5 rounded border border-slate-200 dark:border-merchant-border">
                      {logoSize} px
                    </span>
                    <button
                      type="button"
                      onClick={() => setLogoSize((prev) => Math.min(80, prev + 4))}
                      disabled={logoSize >= 80}
                      className="w-6 h-6 rounded-md bg-white dark:bg-merchant-input-bg border border-slate-300 dark:border-merchant-border flex items-center justify-center text-slate-600 dark:text-merchant-text hover:bg-slate-100 dark:hover:bg-merchant-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition"
                      title={t('brandStudio.increaseLogoSize')}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min="24"
                  max="80"
                  step="2"
                  value={logoSize}
                  onChange={(e) => setLogoSize(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                  <span className="text-[10px] text-slate-400 dark:text-merchant-text-muted font-medium mr-1">{t('brandStudio.presets')}</span>
                  {[
                    { label: t('brandStudio.compact'), size: 32 },
                    { label: t('brandStudio.default'), size: 40 },
                    { label: t('brandStudio.medium'), size: 48 },
                    { label: t('brandStudio.large'), size: 56 },
                    { label: t('brandStudio.heroic'), size: 68 },
                  ].map((p) => (
                    <button
                      key={p.size}
                      type="button"
                      onClick={() => setLogoSize(p.size)}
                      className={`px-2 py-0.5 text-[10px] rounded-md transition font-medium ${
                        logoSize === p.size
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-white dark:bg-merchant-input-bg text-slate-600 dark:text-merchant-text border border-slate-200 dark:border-merchant-border hover:border-slate-300 dark:hover:border-merchant-primary'
                      }`}
                    >
                      {p.label} ({p.size}px)
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Store Name Font Size Control */}
              <div className="space-y-2 bg-slate-50/50 dark:bg-merchant-surface-raised text-merchant-text p-3 rounded-xl border border-slate-200/60 dark:border-merchant-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-merchant-text">{t('brandStudio.storeNameTextSize')}</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStoreNameSize((prev) => Math.max(14, prev - 1))}
                      disabled={storeNameSize <= 14}
                      className="w-6 h-6 rounded-md bg-white dark:bg-merchant-input-bg border border-slate-300 dark:border-merchant-border flex items-center justify-center text-slate-600 dark:text-merchant-text hover:bg-slate-100 dark:hover:bg-merchant-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition"
                      title={t('brandStudio.decreaseStoreNameSize')}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-mono font-bold text-slate-800 dark:text-merchant-text w-12 text-center bg-white dark:bg-merchant-input-bg px-1.5 py-0.5 rounded border border-slate-200 dark:border-merchant-border">
                      {storeNameSize} px
                    </span>
                    <button
                      type="button"
                      onClick={() => setStoreNameSize((prev) => Math.min(36, prev + 1))}
                      disabled={storeNameSize >= 36}
                      className="w-6 h-6 rounded-md bg-white dark:bg-merchant-input-bg border border-slate-300 dark:border-merchant-border flex items-center justify-center text-slate-600 dark:text-merchant-text hover:bg-slate-100 dark:hover:bg-merchant-surface-muted disabled:opacity-40 disabled:cursor-not-allowed transition"
                      title={t('brandStudio.increaseStoreNameSize')}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min="14"
                  max="36"
                  step="1"
                  value={storeNameSize}
                  onChange={(e) => setStoreNameSize(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                  <span className="text-[10px] text-slate-400 dark:text-merchant-text-muted font-medium mr-1">{t('brandStudio.presets')}</span>
                  {[
                    { label: t('brandStudio.small'), size: 15 },
                    { label: t('brandStudio.default'), size: 18 },
                    { label: t('brandStudio.prominent'), size: 22 },
                    { label: t('brandStudio.bold'), size: 26 },
                    { label: t('brandStudio.header'), size: 30 },
                  ].map((p) => (
                    <button
                      key={p.size}
                      type="button"
                      onClick={() => setStoreNameSize(p.size)}
                      className={`px-2 py-0.5 text-[10px] rounded-md transition font-medium ${
                        storeNameSize === p.size
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-white dark:bg-merchant-input-bg text-slate-600 dark:text-merchant-text border border-slate-200 dark:border-merchant-border hover:border-slate-300 dark:hover:border-merchant-primary'
                      }`}
                    >
                      {p.label} ({p.size}px)
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
    </div>
  );

  const renderColorsTypographySection = () => (
    <div className="space-y-6">
      {/* Color Palette & Contrast Validation */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.colorPaletteContrastSafety')}</label>
              {!isAccessible && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />{t('brandStudio.lowContrast')}</span>
              )}
            </div>

            {!isAccessible && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center justify-between gap-2">
                <span>
                  {t('brandStudio.contrastWarning', { ratio: contrastRatio.toFixed(1) })}
                </span>
                <button
                  type="button"
                  onClick={fixContrastAutomatically}
                  className="px-2.5 py-1 bg-amber-600 text-white font-bold rounded-lg text-[10px] shrink-0"
                >{t('brandStudio.autoFix')}</button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ThemeColorField label={t('brandStudio.primaryBrandColor')} value={primaryColor} onChange={setPrimaryColor} onValidityChange={(valid) => setColorValidity('primary', valid)} />
              <ThemeColorField label={t('brandStudio.accentColor')} value={accentColor} onChange={setAccentColor} onValidityChange={(valid) => setColorValidity('accent', valid)} />
              <ThemeColorField label={t('brandStudio.canvasBackground')} value={backgroundColor} onChange={setBackgroundColor} onValidityChange={(valid) => setColorValidity('background', valid)} />
            </div>
          </div>

          {/* Typography Preset Selection */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.curatedTypographyPairing')}</label>
            <p className="text-xs text-slate-500 leading-relaxed">{t('brandStudio.typographyHelp')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'Playfair Display', name: 'Playfair Display', desc: t('brandStudio.editorialSerifLuxury') },
                { id: 'Plus Jakarta Sans', name: 'Plus Jakarta Sans', desc: t('brandStudio.modernHighTechSans') },
                { id: 'Inter', name: t('brandStudio.interMinimal'), desc: t('brandStudio.cleanUltraLegible') },
                { id: 'Space Grotesk', name: 'Space Grotesk', desc: t('brandStudio.industrialTechnical') },
                { id: 'DM Serif Display', name: 'DM Serif Display', desc: t('brandStudio.vogueHighFashion') },
                { id: 'Cinzel', name: t('brandStudio.cinzelHeritage'), desc: t('brandStudio.regalRoyalCraft') },
                { id: 'Outfit', name: t('brandStudio.outfitContemporary'), desc: t('brandStudio.friendlyLifestyle') },
                { id: 'Montserrat', name: t('brandStudio.montserratBold'), desc: t('brandStudio.impactfulStreetwear') },
                { id: 'Noto Sans Devanagari', name: 'Noto Sans Devanagari', desc: t('brandStudio.devanagariMarathiHindi') },
                { id: 'Noto Serif Devanagari', name: 'Noto Serif Devanagari', desc: t('brandStudio.devanagariTraditionalScript') },
              ].map((ty) => (
                <button
                  key={ty.id}
                  type="button"
                  title={t('brandStudio.fontPair', { heading: ty.id, body: STOREFRONT_FONT_FAMILIES[ty.id].body.split("'")[1] })}
                  data-font-preset={ty.id}
                  aria-pressed={typographyPreset === ty.id}
                  onClick={() => setTypographyPreset(ty.id)}
                  className={`text-left p-3 rounded-xl border text-xs transition ${
                    typographyPreset === ty.id
                      ? 'border-blue-600 bg-blue-50/30 ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="font-bold text-slate-900">{ty.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{ty.desc}</p>
                </button>
              ))}
            </div>
          </div>
    </div>
  );

  const renderHomeSection = () => (
    <div className="space-y-6">
      {/* Top Announcement Bar */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-900 block">{t('brandStudio.topAnnouncementBar')}</label>
                <p className="text-[11px] text-slate-500">{t('brandStudio.prominentPromotionalStripDisplayedAtTheVeryTop')}</p>
              </div>
              <input
                type="checkbox"
                checked={announcementEnabled}
                aria-label={t('brandStudio.topAnnouncementBar')}
                onChange={(e) => setAnnouncementEnabled(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
            </div>
            {announcementEnabled && (
              <div className="space-y-3 pt-1">
                <div>
                  <CatalogTextField fieldKey="announcement.text"
                  label={t('brandStudio.announcementMessage')}
                  value={announcementText} max={BRAND_TEXT_LIMITS.subtitle} onChange={setAnnouncementText}
                  labelClassName="text-[11px] font-semibold text-slate-700 block mb-1" type="text" placeholder={t('brandStudio.eGComplimentaryPanIndiaInsuredShippingOn')}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                </div>

                {/* Floating Marquee Button / Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-lg transition ${announcementFloating ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">{t('brandStudio.floatingScrollingMarqueeAnimation')}</span>
                      <span className="text-[11px] text-slate-500">{t('brandStudio.makeTheAnnouncementTextContinuouslyFloatAcrossThe')}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAnnouncementFloating(!announcementFloating)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      announcementFloating ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                    role="switch"
                    aria-label={t('brandStudio.floatingScrollingMarqueeAnimation')}
                    aria-checked={announcementFloating}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        announcementFloating ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Announcement Bar Shape */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{t('brandStudio.announcementBarShape')}</label>
                  <p className="text-[10px] text-slate-400 mb-2 leading-tight">{t('brandStudio.controlsTheBottomEdgeShapeOfTheTop')}</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { value: 'square', label: t('brandStudio.square') },
                      { value: 'soft', label: t('brandStudio.soft') },
                      { value: 'rounded', label: t('brandStudio.rounded') },
                      { value: 'pill', label: t('brandStudio.pill') },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAnnouncementBarStyle(opt.value)}
                        className={`py-2 rounded-xl border text-[11px] font-medium transition ${
                          announcementBarStyle === opt.value
                            ? 'border-blue-600 bg-blue-50/30 ring-2 ring-blue-500/20 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Hero Showcase Texts */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.heroShowcaseSection')}</label>
              <p className="text-xs text-slate-500 mt-0.5">{t('brandStudio.thePrimaryBannerGreetingVisitorsWhenTheyLand')}</p>
            </div>

            <div>
              <CatalogTextField fieldKey="pages.home.heroBadge"
                  label={t('brandStudio.eyebrowBadgeTag')}
                  value={homeHeroBadge} max={HOME_TEXT_LIMITS.heroBadge} onChange={setHomeHeroBadge}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" type="text" placeholder={t('brandStudio.eGArtisanalAtelierHallmarkedCertified')}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
            </div>

            <div>
              <CatalogTextField fieldKey="pages.home.heroTitle"
                  label={t('brandStudio.heroMainHeadline')}
                  value={homeHeroTitle} max={HOME_TEXT_LIMITS.heroTitle} onChange={setHomeHeroTitle}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" type="text" placeholder={t('brandStudio.eGTimelessEleganceHandcraftedLuxury')}
                  inputClassName="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl"
                />
            </div>

            <div>
              <CatalogTextField fieldKey="pages.home.heroSubtitle"
                  label={t('brandStudio.heroSubtitleDescription')}
                  value={homeHeroSubtitle} max={HOME_TEXT_LIMITS.heroSubtitle} onChange={setHomeHeroSubtitle}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" multiline rows={3} placeholder={t('brandStudio.describeYourBoutiqueSOfferingIn23')}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl leading-relaxed"
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <CatalogTextField fieldKey="pages.home.heroCtaText"
                  label={t('brandStudio.primaryActionButtonText')}
                  value={homeCtaText} max={HOME_TEXT_LIMITS.heroCtaText} onChange={setHomeCtaText}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" type="text" placeholder={t('brandStudio.eGExploreCollection')}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <CatalogTextField fieldKey="pages.home.heroSecondaryCtaText"
                  label={t('brandStudio.secondaryButtonText')}
                  value={homeSecondaryCtaText} max={HOME_TEXT_LIMITS.heroSecondaryCtaText} onChange={setHomeSecondaryCtaText}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" type="text" placeholder={t('brandStudio.eGOurHeritage')}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Hero Showcase Image Upload & URL */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-blue-600" />
                  <span>{t('brandStudio.homepageHeroShowcaseImage')}</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">{t('brandStudio.highDefinitionPhotographyOrProductShowcaseFeaturedProminently')}</p>
              </div>
              {heroBannerUrl && (
                <button
                  type="button"
                  onClick={() => setHeroBannerUrl('')}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition cursor-pointer"
                  title={t('brandStudio.removeImage')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('brandStudio.removeImage2')}</span>
                </button>
              )}
            </div>

            {/* Thumbnail Preview & Upload Dropzone */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-52 aspect-[3/2] rounded-xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center relative shrink-0 shadow-xs">
                {heroBannerUrl ? (
                  <>
                    <img
                      src={heroBannerUrl}
                      alt={t('brandStudio.heroBannerPreview')}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-[9px] font-mono font-bold text-amber-300">{t('brandStudio.default1200800Px')}</div>
                  </>
                ) : (
                  <div className="text-center p-3 text-slate-400 space-y-1">
                    <ImageIcon className="w-8 h-8 mx-auto text-slate-300" />
                    <span className="text-[10px] font-medium block">{t('brandStudio.noHeroImageSet')}</span>
                    <span className="text-[9px] font-mono text-slate-400 block">{t('brandStudio.default1200800Px2')}</span>
                  </div>
                )}
                {uploadingHomeBanner && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-white text-[11px] font-semibold p-2 text-center z-10">
                    <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-1.5" />
                    <span>{uploadStepMessage || t('brandStudio.checkingSizeConformingToDefaultLayout')}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 w-full space-y-3">
                <input
                  ref={homeBannerInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleHomeBannerUpload(e.target.files)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => homeBannerInputRef.current?.click()}
                  disabled={uploadingHomeBanner}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4 text-amber-400" />
                  <span>{heroBannerUrl ? t('brandStudio.uploadReplaceImage') : t('brandStudio.uploadHeroImage')}</span>
                </button>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">{t('brandStudio.orEnterDirectImageUrl')}</label>
                  <div className="relative">
                    <CatalogTextField fieldKey="pages.home.heroBannerUrl"
                  label={t('brandStudio.orEnterDirectImageUrl')}
                  value={heroBannerUrl} max={HOME_TEXT_LIMITS.heroBannerUrl} onChange={setHeroBannerUrl}
                  labelClassName="sr-only" type="url" placeholder={t('brandStudio.httpsImagesUnsplashComOrCdnLink')}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl pr-8 font-mono"
                />
                    <Globe className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Ultra-HD Layout Sizing Verification */}
            <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t('brandStudio.ultraHdStandard')}{' '}<strong>1920 × 1080 px</strong>{t('brandStudio.size169WidescreenPanorama')}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  <Check className="w-3 h-3 text-emerald-600" />{t('brandStudio.ultraHdQualityActive')}</span>
              </div>

              {homeBannerMeta ? (
                <div className={`p-3 rounded-xl border space-y-1.5 text-xs ${
                  homeBannerMeta.status === 'valid'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <div className="flex items-center gap-2 font-bold">
                    {homeBannerMeta.status === 'valid' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span>{homeBannerMeta.status === 'valid' ? t('brandStudio.ultraHdClarityVerified') : t('brandStudio.resolutionWarning')}</span>
                    <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      homeBannerMeta.status === 'valid'
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                        : 'bg-amber-100 border-amber-300 text-amber-900'
                    }`}>
                      {homeBannerMeta.width} × {homeBannerMeta.height} px ({homeBannerMeta.sizeKb} KB)
                    </span>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${homeBannerMeta.status === 'valid' ? 'text-emerald-700' : 'text-amber-800'}`}>
                    {imageStatusMessage(homeBannerMeta)}
                  </p>
                  <div className={`flex items-center gap-3 pt-1 text-[10px] border-t font-mono ${
                    homeBannerMeta.status === 'valid' ? 'border-emerald-200/80 text-emerald-800' : 'border-amber-200 text-amber-800'
                  }`}>
                    <span>{t('brandStudio.uploaded')}{' '}{homeBannerMeta.origWidth} × {homeBannerMeta.origHeight} px</span>
                    <span>→</span>
                    <span className="font-bold">{t('brandStudio.displayOutput')}{' '}{homeBannerMeta.width} × {homeBannerMeta.height} px</span>
                  </div>
                </div>
              ) : heroBannerUrl ? (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 space-y-1 text-xs">
                  <div className="flex items-center gap-2 font-bold text-blue-800">
                    <Sliders className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>{t('brandStudio.widescreenPanoramaActive')}</span>
                    <span className="ml-auto text-[10px] font-mono bg-blue-100 px-2 py-0.5 rounded-full border border-blue-300">{t('brandStudio.size19201080PxWidescreen')}</span>
                  </div>
                  <p className="text-[11px] text-blue-700">{t('brandStudio.theStorefrontHeroDisplaysThisImageWithEdge')}</p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <Sliders className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span>{t('brandStudio.optimalClaritySpec19201080PxOr2560')}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{t('brandStudio.toPreventBlurrinessAndPixelationOnLargeDesktop')}</p>
                </div>
              )}
            </div>
          </div>

    </div>
  );

  const renderProductsSection = () => (
    <div className="space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.productsCatalogHeader')}</label>
              <p className="text-xs text-slate-500 mt-0.5">{t('brandStudio.customizeTheBannerAndHeadlinesDisplayedAtThe')}</p>
            </div>
            <CatalogTextField
              label={t('brandStudio.eyebrowBadgeTag')}
              value={productsBadgeText} max={CATALOG_EYEBROW_MAX} onChange={setProductsBadgeText}
              placeholder={t('brandStudio.eGDirectFromMerchant')}
            />
            <CatalogTextField
              label={t('brandStudio.catalogPageTitle')}
              value={productsPageTitle} max={CATALOG_TITLE_MAX} onChange={setProductsPageTitle}
              placeholder={t('brandStudio.eGOurCollection')}
            />
            <CatalogTextField
              label={t('brandStudio.catalogSubtitleDescription')}
              value={productsPageSubtitle} max={CATALOG_SUBTITLE_MAX} onChange={setProductsPageSubtitle}
              placeholder={t('brandStudio.eGExploreOurCompleteSelectionOfHandcrafted')} multiline
            />
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-xs text-emerald-900 space-y-2">
            <div className="flex items-center gap-2 font-bold">
              <ShoppingBag className="w-4 h-4 text-emerald-600" />
              <span>{t('brandStudio.dynamicStoreInventoryIntegration')}</span>
            </div>
            <p className="leading-relaxed text-emerald-800">{t('brandStudio.theProductsCatalogPageAutomaticallySynchronizesWithYour')}</p>
          </div>
    </div>
  );

  const renderAboutSection = () => (
    <div className="space-y-6">
      {/* Header Banner */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.aboutUsPageHeader')}</label>
              <p className="text-xs text-slate-500 mt-0.5">{t('brandStudio.theTopHeadlineAndBrandTaglineWelcomingVisitors')}</p>
            </div>

            <div>
              <CatalogTextField fieldKey="pages.about.pageTitle"
                  label={t('brandStudio.pageTitle')}
                  value={aboutPageTitle} max={ABOUT_TEXT_LIMITS.pageTitle} onChange={setAboutPageTitle}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" type="text" placeholder={t('brandStudio.aboutPlaceholder', { store: store?.name || '' })}
                  inputClassName="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl"
                />
            </div>

            <div>
              <CatalogTextField fieldKey="pages.about.tagline"
                  label={t('brandStudio.taglineSubtitle')}
                  value={aboutTagline} max={ABOUT_TEXT_LIMITS.tagline} onChange={setAboutTagline}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" type="text" placeholder={t('brandStudio.eGRootedInAuthenticTraditionCraftedFor')}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
            </div>
          </div>

          {/* Heritage Story Narrative */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.storeOriginHeritageStory')}</label>
              <p className="text-xs text-slate-500 mt-0.5">{t('brandStudio.tellYourCustomersHowYourBrandStartedAnd')}</p>
            </div>

            <div>
              <CatalogTextField fieldKey="pages.about.storyParagraph1"
                  label={t('brandStudio.originParagraph1')}
                  value={aboutStoryP1} max={ABOUT_TEXT_LIMITS.storyParagraph1} onChange={setAboutStoryP1}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" multiline rows={3}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl leading-relaxed"
                />
            </div>

            <div>
              <CatalogTextField fieldKey="pages.about.storyParagraph2"
                  label={t('brandStudio.craftsmanshipExpansionParagraph2')}
                  value={aboutStoryP2} max={ABOUT_TEXT_LIMITS.storyParagraph2} onChange={setAboutStoryP2}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" multiline rows={3}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl leading-relaxed"
                />
            </div>
          </div>

          {/* About Us Feature & Story Image */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                  <span>{t('brandStudio.aboutUsFeatureStoryImage')}</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">{t('brandStudio.visualPhotoDisplayedAlongsideYourBrandHeritageAnd')}</p>
              </div>
              {aboutBannerUrl && (
                <button
                  type="button"
                  onClick={() => setAboutBannerUrl('')}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition cursor-pointer"
                  title={t('brandStudio.removeImage')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('brandStudio.removeImage2')}</span>
                </button>
              )}
            </div>

            {/* Thumbnail Preview & Upload Dropzone */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-48 aspect-[4/3] rounded-xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center relative shrink-0 shadow-xs">
                {aboutBannerUrl ? (
                  <>
                    <img
                      src={aboutBannerUrl}
                      alt={t('brandStudio.aboutStoryPreview')}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-xs text-[9px] font-mono font-bold text-emerald-300">{t('brandStudio.default800600Px')}</div>
                  </>
                ) : (
                  <div className="text-center p-3 text-slate-400 space-y-1">
                    <ImageIcon className="w-8 h-8 mx-auto text-slate-300" />
                    <span className="text-[10px] font-medium block">{t('brandStudio.noStoryImageSet')}</span>
                    <span className="text-[9px] font-mono text-slate-400 block">{t('brandStudio.default800600Px2')}</span>
                  </div>
                )}
                {uploadingAboutBanner && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-white text-[11px] font-semibold p-2 text-center z-10">
                    <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-1.5" />
                    <span>{uploadStepMessage || t('brandStudio.checkingSizeConformingToDefaultLayout')}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 w-full space-y-3">
                <input
                  ref={aboutBannerInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleAboutBannerUpload(e.target.files)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => aboutBannerInputRef.current?.click()}
                  disabled={uploadingAboutBanner}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4 text-emerald-400" />
                  <span>{aboutBannerUrl ? t('brandStudio.uploadReplaceStoryImage') : t('brandStudio.uploadStoryImage')}</span>
                </button>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">{t('brandStudio.orEnterDirectImageUrl')}</label>
                  <div className="relative">
                    <CatalogTextField fieldKey="pages.about.bannerUrl"
                  label={t('brandStudio.orEnterDirectImageUrl')}
                  value={aboutBannerUrl} max={ABOUT_TEXT_LIMITS.bannerUrl} onChange={setAboutBannerUrl}
                  labelClassName="sr-only" type="url" placeholder={t('brandStudio.httpsImagesUnsplashComOrCdnLink')}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl pr-8 font-mono"
                />
                    <Globe className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Default Layout Sizing Verification */}
            <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t('brandStudio.defaultLayoutSize')}{' '}<strong>800 × 600 px</strong>{t('brandStudio.size43StoryFrame')}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  <Check className="w-3 h-3 text-emerald-600" />{t('brandStudio.autoFitDefaultLayoutEnabled')}</span>
              </div>

              {aboutBannerMeta ? (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 font-bold text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{t('brandStudio.defaultLayoutSizeCheckedVerified')}</span>
                    <span className="ml-auto text-[10px] font-mono bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                      {aboutBannerMeta.width} × {aboutBannerMeta.height} px ({aboutBannerMeta.sizeKb} KB)
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-700 leading-relaxed">
                    {imageStatusMessage(aboutBannerMeta)}
                  </p>
                  <div className="flex items-center gap-3 pt-1 text-[10px] text-emerald-800 border-t border-emerald-200/80 font-mono">
                    <span>{t('brandStudio.original')}{' '}{aboutBannerMeta.origWidth} × {aboutBannerMeta.origHeight} px</span>
                    <span>→</span>
                    <span className="font-bold">{t('brandStudio.defaultLayoutOutput800600Px')}</span>
                  </div>
                </div>
              ) : aboutBannerUrl ? (
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 space-y-1 text-xs">
                  <div className="flex items-center gap-2 font-bold text-emerald-800">
                    <Sliders className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{t('brandStudio.defaultLayoutContainerActive')}</span>
                    <span className="ml-auto text-[10px] font-mono bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">{t('brandStudio.size800600PxStoryFrame')}</span>
                  </div>
                  <p className="text-[11px] text-emerald-700">{t('brandStudio.theAboutUsPageEnclosesThisImageIn')}</p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <Sliders className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span>{t('brandStudio.preUploadDimensionCheckDefaultLayout800600')}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{t('brandStudio.whenAnImageIsUploadedItsDimensionsAre')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Mission & Vision */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.missionVisionStatements')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <CatalogTextField fieldKey="pages.about.missionTitle"
                  label={t('brandStudio.missionTitle')}
                  value={aboutMissionTitle} max={ABOUT_TEXT_LIMITS.missionTitle} onChange={setAboutMissionTitle}
                  labelClassName="block text-xs font-semibold text-slate-700" type="text"
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
                <CatalogTextField fieldKey="pages.about.missionText"
                  label={t('brandStudio.missionDescription')}
                  value={aboutMissionText} max={ABOUT_TEXT_LIMITS.missionText} onChange={setAboutMissionText}
                  labelClassName="block text-[11px] text-slate-500" multiline rows={2}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <CatalogTextField fieldKey="pages.about.visionTitle"
                  label={t('brandStudio.visionTitle')}
                  value={aboutVisionTitle} max={ABOUT_TEXT_LIMITS.visionTitle} onChange={setAboutVisionTitle}
                  labelClassName="block text-xs font-semibold text-slate-700" type="text"
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
                <CatalogTextField fieldKey="pages.about.visionText"
                  label={t('brandStudio.visionDescription')}
                  value={aboutVisionText} max={ABOUT_TEXT_LIMITS.visionText} onChange={setAboutVisionText}
                  labelClassName="block text-[11px] text-slate-500" multiline rows={2}
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* 3 Core Trust Pillars */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.size3CoreTrustValuePillars')}</label>
              <p className="text-xs text-slate-500 mt-0.5">{t('brandStudio.the3FoundationalReasonsWhyBuyersChooseAnd')}</p>
            </div>

            <div className="space-y-3">
              {/* Pillar 1 */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">{t('brandStudio.pillar1')}</span>
                <CatalogTextField fieldKey="pages.about.values.0.title"
                  label={t('brandStudio.pillarTitle', { number: 1 })}
                  value={pillar1Title} max={ABOUT_VALUE_LIMITS.title} onChange={setPillar1Title}
                  labelClassName="sr-only" type="text"
                  inputClassName="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
                />
                <CatalogTextField fieldKey="pages.about.values.0.desc"
                  label={t('brandStudio.pillarDescription', { number: 1 })}
                  value={pillar1Desc} max={ABOUT_VALUE_LIMITS.desc} onChange={setPillar1Desc}
                  labelClassName="sr-only" type="text"
                  inputClassName="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600"
                />
              </div>

              {/* Pillar 2 */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">{t('brandStudio.pillar2')}</span>
                <CatalogTextField fieldKey="pages.about.values.1.title"
                  label={t('brandStudio.pillarTitle', { number: 2 })}
                  value={pillar2Title} max={ABOUT_VALUE_LIMITS.title} onChange={setPillar2Title}
                  labelClassName="sr-only" type="text"
                  inputClassName="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
                />
                <CatalogTextField fieldKey="pages.about.values.1.desc"
                  label={t('brandStudio.pillarDescription', { number: 2 })}
                  value={pillar2Desc} max={ABOUT_VALUE_LIMITS.desc} onChange={setPillar2Desc}
                  labelClassName="sr-only" type="text"
                  inputClassName="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600"
                />
              </div>

              {/* Pillar 3 */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">{t('brandStudio.pillar3')}</span>
                <CatalogTextField fieldKey="pages.about.values.2.title"
                  label={t('brandStudio.pillarTitle', { number: 3 })}
                  value={pillar3Title} max={ABOUT_VALUE_LIMITS.title} onChange={setPillar3Title}
                  labelClassName="sr-only" type="text"
                  inputClassName="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
                />
                <CatalogTextField fieldKey="pages.about.values.2.desc"
                  label={t('brandStudio.pillarDescription', { number: 3 })}
                  value={pillar3Desc} max={ABOUT_VALUE_LIMITS.desc} onChange={setPillar3Desc}
                  labelClassName="sr-only" type="text"
                  inputClassName="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600"
                />
              </div>
            </div>
          </div>

          {/* Physical Address & Contact Support */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.physicalLocationCustomerSupport')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <CatalogTextField fieldKey="pages.about.storeAddress"
                  label={t('brandStudio.storeWorkshopAddress')}
                  value={physicalStoreAddress} max={ABOUT_TEXT_LIMITS.storeAddress} onChange={setPhysicalStoreAddress}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" type="text"
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <CatalogTextField fieldKey="pages.about.storeHours"
                  label={t('brandStudio.operatingHours')}
                  value={physicalStoreTimings} max={ABOUT_TEXT_LIMITS.storeHours} onChange={setPhysicalStoreTimings}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" type="text"
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <CatalogTextField fieldKey="pages.about.contactPhone"
                  label={t('brandStudio.phoneWhatsappSupport')}
                  value={aboutPhone} max={ABOUT_TEXT_LIMITS.contactPhone} onChange={setAboutPhone}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" type="text"
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <CatalogTextField fieldKey="pages.about.contactEmail"
                  label={t('brandStudio.customerSupportEmail')}
                  value={aboutEmail} max={ABOUT_TEXT_LIMITS.contactEmail} onChange={setAboutEmail}
                  labelClassName="block text-xs font-semibold text-slate-700 mb-1" type="email"
                  inputClassName="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
          </div>
    </div>
  );

  const renderFooterSection = () => (
    <div className="space-y-6">
      {/* Social Media Accounts & Links Card */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-pink-600" />
                <label className="text-xs font-bold text-slate-900 uppercase tracking-wider block">{t('brandStudio.socialMediaAccountsLinks')}</label>
              </div>
              <p className="text-xs text-slate-500 mt-1">{t('brandStudio.addYourSocialMediaProfileUrlsOrHandles')}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Instagram */}
              <SocialLinkField platform="instagram" label={<><Instagram className="w-4 h-4 text-pink-600" /><span>Instagram</span></>} value={socialInstagram} onChange={setSocialInstagram} />

              {/* WhatsApp */}
              <SocialLinkField platform="whatsapp" label={<><MessageCircle className="w-4 h-4 text-emerald-600" /><span>{t('brandStudio.whatsappBusiness')}</span></>} value={socialWhatsapp} onChange={setSocialWhatsapp} />

              {/* Facebook */}
              <SocialLinkField platform="facebook" label={<><Facebook className="w-4 h-4 text-blue-600" /><span>{t('brandStudio.facebookPage')}</span></>} value={socialFacebook} onChange={setSocialFacebook} />

              {/* YouTube */}
              <SocialLinkField platform="youtube" label={<><Youtube className="w-4 h-4 text-rose-600" /><span>{t('brandStudio.youtubeChannel')}</span></>} value={socialYoutube} onChange={setSocialYoutube} />

              {/* Twitter / X */}
              <SocialLinkField platform="twitter" label={<><Twitter className="w-4 h-4 text-sky-500" /><span>Twitter / X</span></>} value={socialTwitter} onChange={setSocialTwitter} />

              {/* LinkedIn */}
              <SocialLinkField platform="linkedin" label={<><Linkedin className="w-4 h-4 text-blue-700" /><span>{t('brandStudio.linkedinCompanyPage')}</span></>} value={socialLinkedin} onChange={setSocialLinkedin} />
            </div>
          </div>

          {/* Footer Brand Bio & Tagline */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.footerBrandDescription')}</label>
              <p className="text-xs text-slate-500 mt-0.5">{t('brandStudio.briefSummaryDisplayedBeneathYourStoreMonogramIn')}</p>
            </div>
            <textarea
              rows={3}
              value={footerDescription}
              onChange={(e) => setFooterDescription(e.target.value)}
              placeholder={t('brandStudio.officialDigitalStorefrontOrderGenuineProductsOnlineDirectly')}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl leading-relaxed"
            />
          </div>

          {/* Value Props & Trust Badges Strip */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-900 block">{t('brandStudio.footerTrustBadgesStrip')}</label>
                <p className="text-[11px] text-slate-500">{t('brandStudio.threeReassuranceBadgesDisplayedAboveTheFooterColumns')}</p>
              </div>
              <input
                type="checkbox"
                checked={showTrustBadges}
                onChange={(e) => setShowTrustBadges(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
            </div>

            {showTrustBadges && (
              <div className="space-y-3 pt-2">
                {/* Badge 1 */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t('brandStudio.trustBadge1')}</span>
                  </div>
                  <label className="block text-xs text-slate-700">{t('brandStudio.badgeIcon', { number: 1 })}
                    <select aria-label={t('brandStudio.badgeIcon', { number: 1 })} value={trustBadge1Icon} onChange={(event) => setTrustBadge1Icon(resolveTrustBadgeIcon(event.target.value, 'payment'))} className="mt-1 w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white">
                      {TRUST_BADGE_ICONS.map((icon) => <option key={icon.id} value={icon.id}>{t(`brandStudio.icons.${icon.id}`)}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={trustBadge1Title}
                      onChange={(e) => setTrustBadge1Title(e.target.value)}
                      placeholder={t('brandStudio.titleEGSecureIndianPayments')}
                      className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
                    />
                    <input
                      type="text"
                      value={trustBadge1Subtitle}
                      onChange={(e) => setTrustBadge1Subtitle(e.target.value)}
                      placeholder={t('brandStudio.subtitleEGUpiNetbankingCardsViaRazorpay')}
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600"
                    />
                  </div>
                </div>

                {/* Badge 2 */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                    <span>{t('brandStudio.trustBadge2')}</span>
                  </div>
                  <label className="block text-xs text-slate-700">{t('brandStudio.badgeIcon', { number: 2 })}
                    <select aria-label={t('brandStudio.badgeIcon', { number: 2 })} value={trustBadge2Icon} onChange={(event) => setTrustBadge2Icon(resolveTrustBadgeIcon(event.target.value, 'truck'))} className="mt-1 w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white">
                      {TRUST_BADGE_ICONS.map((icon) => <option key={icon.id} value={icon.id}>{t(`brandStudio.icons.${icon.id}`)}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={trustBadge2Title}
                      onChange={(e) => setTrustBadge2Title(e.target.value)}
                      placeholder={t('brandStudio.titleEGReliablePanIndiaDelivery')}
                      className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
                    />
                    <input
                      type="text"
                      value={trustBadge2Subtitle}
                      onChange={(e) => setTrustBadge2Subtitle(e.target.value)}
                      placeholder={t('brandStudio.subtitleEGDoorstepTrackingViaPremierCouriers')}
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600"
                    />
                  </div>
                </div>

                {/* Badge 3 */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{t('brandStudio.trustBadge3')}</span>
                  </div>
                  <label className="block text-xs text-slate-700">{t('brandStudio.badgeIcon', { number: 3 })}
                    <select aria-label={t('brandStudio.badgeIcon', { number: 3 })} value={trustBadge3Icon} onChange={(event) => setTrustBadge3Icon(resolveTrustBadgeIcon(event.target.value, 'shield'))} className="mt-1 w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white">
                      {TRUST_BADGE_ICONS.map((icon) => <option key={icon.id} value={icon.id}>{t(`brandStudio.icons.${icon.id}`)}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={trustBadge3Title}
                      onChange={(e) => setTrustBadge3Title(e.target.value)}
                      placeholder={t('brandStudio.titleEGVerifiedAuthenticGoods')}
                      className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
                    />
                    <input
                      type="text"
                      value={trustBadge3Subtitle}
                      onChange={(e) => setTrustBadge3Subtitle(e.target.value)}
                      placeholder={t('brandStudio.subtitleEGDirectFromCertifiedMerchantBusiness')}
                      className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Copyright Text */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">{t('brandStudio.bottomCopyrightNotice')}</label>
              <p className="text-xs text-slate-500 mt-0.5">{t('brandStudio.customStatementForTheVeryBottomOfEvery')}</p>
            </div>
            <input
              type="text"
              value={footerCopyright}
              onChange={(e) => setFooterCopyright(e.target.value)}
              placeholder={t('brandStudio.copyrightPlaceholder', { year: new Date().getFullYear(), store: store?.name || '' })}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
            />
          </div>
    </div>
  );

  // Mobile Accordion Customizer
  const renderMobileAccordion = () => {
    const mobileSections = [
      { id: 'THEME_STYLE', label: t('themes.sectionThemeStyle'), icon: Palette, render: renderThemeStyleSection },
      { id: 'LOGO_BANNER', label: t('themes.sectionLogoBanner'), icon: UploadCloud, render: renderLogoBannerSection },
      { id: 'COLORS_TYPO', label: t('themes.sectionColorsTypography'), icon: Type, render: renderColorsTypographySection },
      { id: 'HOME_SECTIONS', label: t('themes.sectionHomeSections'), icon: Home, render: renderHomeSection },
      { id: 'PRODUCT_GRID', label: t('themes.sectionProductGrid'), icon: ShoppingBag, render: renderProductsSection },
      { id: 'ABOUT_STORE', label: t('themes.sectionAboutStore'), icon: BookOpen, render: renderAboutSection },
      { id: 'FOOTER_LINKS', label: t('themes.sectionFooterLinks'), icon: Share2, render: renderFooterSection },
    ];

    return (
      <div className="space-y-2.5">
        {mobileSections.map((sec) => {
          const isOpen = openMobileAccordion === sec.id;
          const Icon = sec.icon;
          return (
            <div
              key={sec.id}
              className="rounded-2xl border transition-all overflow-hidden"
              style={{
                backgroundColor: 'var(--merchant-surface)',
                borderColor: isOpen ? 'var(--merchant-primary)' : 'var(--merchant-border)',
              }}
            >
              <button
                type="button"
                onClick={() => setOpenMobileAccordion(isOpen ? null : sec.id)}
                className="w-full p-3.5 sm:p-4 flex items-center justify-between text-left transition hover:opacity-90 cursor-pointer"
                style={{ backgroundColor: isOpen ? 'var(--merchant-surface-raised)' : 'transparent' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                    style={{
                      backgroundColor: isOpen ? 'var(--merchant-primary)' : 'var(--merchant-surface-raised)',
                      color: isOpen ? '#ffffff' : 'var(--merchant-text)',
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold truncate" style={{ color: 'var(--merchant-text)' }}>
                    {sec.label}
                  </span>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {isOpen && (
                <div className="p-3.5 sm:p-4 border-t space-y-4" style={{ borderColor: 'var(--merchant-border)' }}>
                  {sec.render()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Desktop Controls
  const renderControls = () => (
    <div className="space-y-6 brand-studio-controls">
      {activeTab === 'THEME' && (
        <div className="space-y-6">
          {renderThemeStyleSection()}
          {renderLogoBannerSection()}
          {renderColorsTypographySection()}
        </div>
      )}
      {activeTab === 'HOME' && renderHomeSection()}
      {activeTab === 'PRODUCTS' && renderProductsSection()}
      {activeTab === 'ABOUT' && renderAboutSection()}
      {activeTab === 'FOOTER' && renderFooterSection()}
    </div>
  );

  return (
    <Layout title={t('themes.title')}>
      <Head>
        <title>{t('themes.title')} | {store?.name || t('brandStudio.sellerDashboard')}</title>
      </Head>

      <div className="space-y-6 w-full max-w-full overflow-x-clip">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--merchant-text)' }}>
              {t('themes.title')}
            </h1>
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--merchant-text-muted)' }}>
              {t('themes.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            {store?.slug && (
              <a
                href={getPublicStoreUrl(store.slug, getStorefrontUrl(), { preview: true })}
                target="_blank"
                rel="noreferrer"
                style={{ backgroundColor: 'var(--merchant-surface)', borderColor: 'var(--merchant-border)', color: 'var(--merchant-text)' }}
                className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 border rounded-xl text-xs font-bold transition shadow-2xs hover:opacity-90"
              >
                <Eye className="w-3.5 h-3.5 text-blue-500" />
                <span>{t('themes.previewStore')}</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            )}

            <button
              onClick={handleSaveThemeConfig}
              disabled={saving || hasInvalidColors || hasInvalidSocialLinks}
              style={{ backgroundColor: 'var(--merchant-accent)', color: '#ffffff' }}
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-50 hover:opacity-90 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? t('themes.savingChanges') : t('themes.saveChanges')}
            </button>
          </div>
        </div>

        {hasInvalidSocialLinks && <p role="alert" data-testid="social-save-error" className="text-xs text-red-700">{t('brandStudio.socialSaveError')}</p>}

        {/* Success Alert Banner */}
        {saveSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl flex items-center justify-between shadow-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-xs">
                <span className="font-bold block">{t('themes.changesSaved')}</span>
              </div>
            </div>
            {store?.slug && (
              <a
                href={getPublicStoreUrl(store.slug, getStorefrontUrl(), { preview: true })}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-xs hover:bg-emerald-500 transition shrink-0"
              >
                {t('navigation.viewStorefront')}
              </a>
            )}
          </div>
        )}

        {/* Desktop 5 Page Navigation Tabs (Hidden on mobile < lg) */}
        <div
          className="hidden lg:grid grid-cols-5 p-1 rounded-xl max-w-3xl gap-1 border transition-colors"
          style={{ backgroundColor: 'var(--merchant-surface-raised)', borderColor: 'var(--merchant-border)' }}
        >
          <button
            onClick={() => handleTabSwitch('THEME')}
            style={
              activeTab === 'THEME'
                ? { backgroundColor: 'var(--merchant-surface)', color: 'var(--merchant-text)' }
                : { color: 'var(--merchant-text-secondary)' }
            }
            className="py-2 px-2.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <Palette className="w-3.5 h-3.5" style={{ color: 'var(--merchant-primary)' }} />
            <span className="truncate">{t('themes.themeTab')}</span>
          </button>

          <button
            onClick={() => handleTabSwitch('HOME')}
            style={
              activeTab === 'HOME'
                ? { backgroundColor: 'var(--merchant-surface)', color: 'var(--merchant-text)' }
                : { color: 'var(--merchant-text-secondary)' }
            }
            className="py-2 px-2.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <Home className="w-3.5 h-3.5 text-amber-500" />
            <span className="truncate">{t('themes.homeTab')}</span>
          </button>

          <button
            onClick={() => handleTabSwitch('PRODUCTS')}
            style={
              activeTab === 'PRODUCTS'
                ? { backgroundColor: 'var(--merchant-surface)', color: 'var(--merchant-text)' }
                : { color: 'var(--merchant-text-secondary)' }
            }
            className="py-2 px-2.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
            <span className="truncate">{t('themes.productsTab')}</span>
          </button>

          <button
            onClick={() => handleTabSwitch('ABOUT')}
            style={
              activeTab === 'ABOUT'
                ? { backgroundColor: 'var(--merchant-surface)', color: 'var(--merchant-text)' }
                : { color: 'var(--merchant-text-secondary)' }
            }
            className="py-2 px-2.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
            <span className="truncate">{t('themes.aboutTab')}</span>
          </button>

          <button
            onClick={() => handleTabSwitch('FOOTER')}
            style={
              activeTab === 'FOOTER'
                ? { backgroundColor: 'var(--merchant-surface)', color: 'var(--merchant-text)' }
                : { color: 'var(--merchant-text-secondary)' }
            }
            className="py-2 px-2.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <Share2 className="w-3.5 h-3.5 text-pink-500" />
            <span className="truncate">{t('themes.footerTab')}</span>
          </button>
        </div>

        {/* Responsive Grid: Full width on mobile, 6/6 split on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start w-full max-w-full">
          {/* Controls Column */}
          <div className="col-span-12 lg:col-span-6 w-full max-w-full space-y-4">
            {/* Mobile Prominent Desktop & Support Guidance Card */}
            <div
              className="lg:hidden p-4 sm:p-5 rounded-2xl border shadow-xs transition-colors space-y-3"
              style={{
                backgroundColor: 'var(--merchant-surface)',
                borderColor: 'var(--merchant-border)',
                color: 'var(--merchant-text)',
              }}
            >
              <div className="flex items-center justify-between gap-2 border-b pb-2.5" style={{ borderColor: 'var(--merchant-border)' }}>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Monitor className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">{t('brandStudio.desktopRecommended')}</span>
                </div>
              </div>

              <div className="space-y-1.5 leading-relaxed">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100" style={{ color: 'var(--merchant-text)' }}>
                  {t('themes.mobileNotice') && t('themes.mobileNotice') !== 'mobileNotice'
                    ? t('themes.mobileNotice')
                    : 'Adjusting your store theme requires a larger screen size'}
                </p>
                <p className="text-xs sm:text-sm leading-normal opacity-85" style={{ color: 'var(--merchant-text-secondary)' }}>
                  {t('themes.mobileNoticeDetail') && t('themes.mobileNoticeDetail') !== 'mobileNoticeDetail'
                    ? t('themes.mobileNoticeDetail')
                    : 'To modify layouts, typography, and preview your storefront in real time, kindly switch to a desktop or laptop computer. Alternatively, contact the LetzShop team to help you customize and modify your store user interface and themes.'}
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-t" style={{ borderColor: 'var(--merchant-border)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--merchant-text-muted)' }}>
                  {t('themes.needHelp') && t('themes.needHelp') !== 'needHelp'
                    ? t('themes.needHelp')
                    : 'Need help modifying your store theme or UI?'}
                </span>
                <a
                  href="mailto:business@aikyamaisystems.com?subject=LetzShop%20Theme%20%26%20UI%20Customization%20Request"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition hover:opacity-90 shadow-xs cursor-pointer"
                  style={{
                    backgroundColor: 'var(--merchant-primary)',
                    color: '#ffffff',
                  }}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{t('brandStudio.contactLetzshopSupportTeam')}</span>
                </a>
              </div>
            </div>

            {loading ? (
              <div
                className="p-12 text-center rounded-2xl border"
                style={{ backgroundColor: 'var(--merchant-surface)', borderColor: 'var(--merchant-border)' }}
              >
                <div
                  className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin mx-auto mb-3"
                  style={{ borderColor: 'var(--merchant-primary)', borderTopColor: 'transparent' }}
                />
                <p className="text-xs" style={{ color: 'var(--merchant-text-muted)' }}>{t('brandStudio.loadingCustomizerSettings')}</p>
              </div>
            ) : (
              <>
                {/* Mobile Accordion Editor (< lg) */}
                <div className="lg:hidden space-y-3">
                  {renderMobileAccordion()}

                  {/* Mobile Quick Action Buttons Bar */}
                  <div className="pt-4 pb-6 flex items-center gap-3">
                    {store?.slug && (
                      <a
                        href={getPublicStoreUrl(store.slug, getStorefrontUrl(), { preview: true })}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-3 px-4 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 text-center shadow-xs transition hover:opacity-90"
                        style={{ backgroundColor: 'var(--merchant-surface)', borderColor: 'var(--merchant-border)', color: 'var(--merchant-text)' }}
                      >
                        <Eye className="w-4 h-4 text-blue-500" />
                        <span>{t('themes.previewStore')}</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveThemeConfig}
                      disabled={saving || hasInvalidColors || hasInvalidSocialLinks}
                      style={{ backgroundColor: 'var(--merchant-accent)', color: '#ffffff' }}
                      className="flex-1 py-3 px-4 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer hover:opacity-90"
                    >
                      <Save className="w-4 h-4" />
                      <span>{saving ? t('themes.savingChanges') : t('themes.saveChanges')}</span>
                    </button>
                  </div>
                </div>

                {/* Desktop Tabs Editor (>= lg) */}
                <div className="hidden lg:block">
                  {renderControls()}
                </div>
              </>
            )}
          </div>

          {/* Desktop Live Storefront Interactive Preview Column (Sticky & Internally Scrollable) */}
          <div className="hidden lg:flex lg:flex-col lg:col-span-6 lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)] min-h-0 min-w-0 self-start z-20">
            {store && (
              <MiniStorePreview
                store={store}
                iframeRef={iframeRef}
                activePage={activePreviewPage}
                themeName={currentThemeObj.name}
                onPageChange={(page) => {
                  setActivePreviewPage(page);
                  if (page === 'home') setActiveTab('HOME');
                  else if (page === 'products') setActiveTab('PRODUCTS');
                  else if (page === 'about') setActiveTab('ABOUT');
                }}
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
