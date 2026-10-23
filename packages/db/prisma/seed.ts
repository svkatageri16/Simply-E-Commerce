import crypto from 'node:crypto';
import { PrismaClient, UserRole, TenantStatus, StoreStatus, SubscriptionStatus, ProductMode, ProductStatus, VariantStatus, OptionType, InventoryMovementType, OrderStatus, PaymentStatus, ShipmentStatus, EnquiryStatus, PaymentProviderType, ShippingProviderType, ThemeKey, CredentialType } from '@prisma/client';
import { SEED_IDS } from '../src/seed-data';

const prisma = new PrismaClient();

export async function runSeed() {
  console.log('🌱 Starting Simply E-Commerce database seed...');

  // 1. Platform SuperAdmin
  const admin = await prisma.user.upsert({
    where: { id: SEED_IDS.adminUser },
    update: {},
    create: {
      id: SEED_IDS.adminUser,
      phone: '+919800000000',
      email: 'admin@simplyecommerce.in',
      fullName: 'Platform SuperAdmin',
      role: UserRole.PLATFORM_ADMIN,
      isSuperAdmin: true,
      isActive: true,
    },
  });

  // Seed default admin PIN / Password (Admin@123456)
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@123456';
  const salt = crypto.randomBytes(16).toString('hex');
  const pinHash = salt + ':' + crypto.scryptSync(adminPassword, salt, 64).toString('hex');
  await prisma.sellerCredential.upsert({
    where: {
      userId_credentialType: { userId: admin.id, credentialType: CredentialType.PIN },
    },
    create: { userId: admin.id, credentialType: CredentialType.PIN, pinHash },
    update: { pinHash, failedPinAttempts: 0, lockedUntil: null },
  });
  console.log(`✓ Admin seeded: ${admin.fullName} (${admin.phone}) - Password: ${adminPassword}`);


  // 2. Subscription Plans
  const starterPlan = await prisma.plan.upsert({
    where: { code: 'STARTER_MONTHLY' },
    update: {
      name: 'Solopreneur',
      description: 'Complete cloud ecommerce system for ambitious solopreneurs and direct sellers.',
      pricePaise: 99900, // ₹999/month
      gstBasisPoints: 1800,
      status: 'ACTIVE',
      isPurchasable: true,
      displayOrder: 1,
      badge: 'Available',
    },
    create: {
      id: SEED_IDS.starterPlan,
      code: 'STARTER_MONTHLY',
      name: 'Solopreneur',
      description: 'Complete cloud ecommerce system for ambitious solopreneurs and direct sellers.',
      pricePaise: 99900, // ₹999/month
      gstBasisPoints: 1800,
      status: 'ACTIVE',
      isPurchasable: true,
      displayOrder: 1,
      badge: 'Available',
      billingCycle: 'MONTHLY',
      maxProducts: 50,
      maxStaff: 2,
      maxStorageMb: 1024,
      customDomainAllowed: false,
      isPublic: true,
    },
  });

  const growthPlan = await prisma.plan.upsert({
    where: { code: 'GROWTH_MONTHLY' },
    update: {
      name: 'Professional',
      description: 'Advanced scale tools, custom domains, and team collaboration for established brands.',
      pricePaise: 299900, // ₹2,999/month
      gstBasisPoints: 1800,
      status: 'COMING_SOON',
      isPurchasable: false,
      displayOrder: 2,
      badge: 'Coming Soon',
    },
    create: {
      id: SEED_IDS.growthPlan,
      code: 'GROWTH_MONTHLY',
      name: 'Professional',
      description: 'Advanced scale tools, custom domains, and team collaboration for established brands.',
      pricePaise: 299900, // ₹2,999/month
      gstBasisPoints: 1800,
      status: 'COMING_SOON',
      isPurchasable: false,
      displayOrder: 2,
      badge: 'Coming Soon',
      billingCycle: 'MONTHLY',
      maxProducts: 500,
      maxStaff: 10,
      maxStorageMb: 5120,
      customDomainAllowed: true,
      isPublic: true,
    },
  });

  await prisma.plan.upsert({
    where: { code: 'CUSTOM' },
    update: {
      name: 'Scale',
      description: 'Dedicated architecture, high-concurrency clusters, and bespoke integrations for enterprise retail.',
      pricePaise: 0,
      gstBasisPoints: 1800,
      status: 'CONTACT_SALES',
      isPurchasable: false,
      displayOrder: 3,
      badge: 'Contact Sales',
      isPublic: true,
    },
    create: {
      code: 'CUSTOM',
      name: 'Scale',
      description: 'Dedicated architecture, high-concurrency clusters, and bespoke integrations for enterprise retail.',
      pricePaise: 0,
      gstBasisPoints: 1800,
      status: 'CONTACT_SALES',
      isPurchasable: false,
      displayOrder: 3,
      badge: 'Contact Sales',
      billingCycle: 'MONTHLY',
      maxProducts: 10000,
      maxStaff: 50,
      maxStorageMb: 51200,
      customDomainAllowed: true,
      isPublic: true,
    },
  });
  console.log('✓ Subscription plans seeded');

  // 3. Foundational Themes (6 Specialized Archetypes)
  const foundationalThemes = [
    {
      name: 'Atelier',
      code: 'atelier',
      isDefault: true,
      configJson: {
        tagline: 'Luxury / Editorial',
        bestFor: 'Jewellery, premium fashion, beauty, watches, leather',
        palette: { primary: '#1C1917', accent: '#D4AF37', background: '#FAFAF9', surface: '#FFFFFF', text: '#1C1917', muted: '#78716C' },
        typography: { heading: 'Playfair Display', body: 'Plus Jakarta Sans' },
        headerStyle: 'minimal-center',
        heroStyle: 'split-editorial',
        cardStyle: 'framed-luxury',
        buttonStyle: 'sharp-pill',
        imageRatio: '3/4',
        spacingDensity: 'generous',
      },
    },
    {
      name: 'Pulse',
      code: 'pulse',
      isDefault: false,
      configJson: {
        tagline: 'Bold Contemporary Commerce',
        bestFor: 'Fashion, electronics, youth brands, accessories',
        palette: { primary: '#0F172A', accent: '#EC4899', background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A', muted: '#64748B' },
        typography: { heading: 'Cabinet Grotesk', body: 'Inter' },
        headerStyle: 'sticky-action',
        heroStyle: 'full-banner',
        cardStyle: 'elevated-modern',
        buttonStyle: 'rounded-heavy',
        imageRatio: '1/1',
        spacingDensity: 'compact',
      },
    },
    {
      name: 'Harvest',
      code: 'harvest',
      isDefault: false,
      configJson: {
        tagline: 'Friendly Fast Commerce',
        bestFor: 'Food, sweets, bakery, grocery, organic products',
        palette: { primary: '#14532D', accent: '#F59E0B', background: '#FEFCE8', surface: '#FFFFFF', text: '#1E293B', muted: '#475569' },
        typography: { heading: 'DM Serif Display', body: 'Plus Jakarta Sans' },
        headerStyle: 'warm-friendly',
        heroStyle: 'organic-showcase',
        cardStyle: 'rounded-soft',
        buttonStyle: 'pill-friendly',
        imageRatio: '1/1',
        spacingDensity: 'comfortable',
      },
    },
    {
      name: 'Foundry',
      code: 'foundry',
      isDefault: false,
      configJson: {
        tagline: 'Professional Industrial / B2B',
        bestFor: 'Manufacturing, machinery, chemicals, industrial suppliers',
        palette: { primary: '#1E293B', accent: '#0284C7', background: '#F1F5F9', surface: '#FFFFFF', text: '#0F172A', muted: '#475569' },
        typography: { heading: 'Space Grotesk', body: 'Inter' },
        headerStyle: 'industrial-meta',
        heroStyle: 'technical-hero',
        cardStyle: 'spec-sheet-card',
        buttonStyle: 'square-solid',
        imageRatio: '4/3',
        spacingDensity: 'dense',
      },
    },
    {
      name: 'Habitat',
      code: 'habitat',
      isDefault: false,
      configJson: {
        tagline: 'Visual Lifestyle / Editorial',
        bestFor: 'Furniture, home decor, interiors',
        palette: { primary: '#292524', accent: '#C2410C', background: '#F5F5F4', surface: '#FFFFFF', text: '#292524', muted: '#78716C' },
        typography: { heading: 'Cinzel', body: 'Plus Jakarta Sans' },
        headerStyle: 'spacious-lifestyle',
        heroStyle: 'lifestyle-immersive',
        cardStyle: 'minimal-bleed',
        buttonStyle: 'underline-refined',
        imageRatio: '4/5',
        spacingDensity: 'airy',
      },
    },
    {
      name: 'Local',
      code: 'local',
      isDefault: false,
      configJson: {
        tagline: 'Fast Premium Catalogue',
        bestFor: 'General retailers, small physical stores, wholesalers',
        palette: { primary: '#1E40AF', accent: '#16A34A', background: '#FFFFFF', surface: '#F8FAFC', text: '#0F172A', muted: '#64748B' },
        typography: { heading: 'Inter', body: 'Inter' },
        headerStyle: 'quick-search-bar',
        heroStyle: 'product-mosaic',
        cardStyle: 'high-density-buy',
        buttonStyle: 'quick-add',
        imageRatio: '1/1',
        spacingDensity: 'dense',
      },
    },
    {
      name: 'Feast',
      code: 'feast',
      isDefault: false,
      configJson: {
        tagline: 'Food-First Visual Commerce',
        bestFor: 'Baking, gourmet dining, confectioneries, cloud kitchens, artisanal provisions',
        palette: { primary: '#78350F', accent: '#E11D48', background: '#FFFBEB', surface: '#FFFFFF', text: '#451A03', muted: '#92400E' },
        typography: { heading: 'Playfair Display', body: 'Plus Jakarta Sans' },
        headerStyle: 'warm-friendly',
        heroStyle: 'organic-showcase',
        cardStyle: 'rounded-soft',
        buttonStyle: 'pill-friendly',
        imageRatio: '1/1',
        spacingDensity: 'comfortable',
      },
    },
    {
      name: 'Aura',
      code: 'aura',
      isDefault: false,
      configJson: {
        tagline: 'Luminous Glow & Clean Beauty',
        bestFor: 'Skincare, cosmetics, perfumes, organic serums, luxury spas, aesthetic wellness',
        palette: { primary: '#881337', accent: '#FB7185', background: '#FFF1F2', surface: '#FFFFFF', text: '#4C0519', muted: '#9F1239' },
        typography: { heading: 'Playfair Display', body: 'Plus Jakarta Sans' },
        headerStyle: 'minimal-center',
        heroStyle: 'split-editorial',
        cardStyle: 'framed-luxury',
        buttonStyle: 'sharp-pill',
        imageRatio: '3/4',
        spacingDensity: 'generous',
      },
    },
    {
      name: 'Noir',
      code: 'noir',
      isDefault: false,
      configJson: {
        tagline: 'Avant-Garde Dark Studio & Monolith',
        bestFor: 'Luxury streetwear, haute horlogerie, cyberpunk audio & gear, minimalist apparel',
        palette: { primary: '#09090B', accent: '#10B981', background: '#09090B', surface: '#18181B', text: '#F4F4F5', muted: '#A1A1AA' },
        typography: { heading: 'Space Grotesk', body: 'Inter' },
        headerStyle: 'sticky-action',
        heroStyle: 'full-banner',
        cardStyle: 'elevated-modern',
        buttonStyle: 'sharp-pill',
        imageRatio: '4/5',
        spacingDensity: 'compact',
      },
    },
    {
      name: 'Vista',
      code: 'vista',
      isDefault: false,
      configJson: {
        tagline: 'Earth & Craft Heritage Showcase',
        bestFor: 'Handloom textiles, artisan ceramics, organic roasters, sustainable heirloom crafts',
        palette: { primary: '#9A3412', accent: '#D97706', background: '#FDFBF7', surface: '#FFFFFF', text: '#431407', muted: '#78350F' },
        typography: { heading: 'DM Serif Display', body: 'Plus Jakarta Sans' },
        headerStyle: 'warm-friendly',
        heroStyle: 'organic-showcase',
        cardStyle: 'rounded-soft',
        buttonStyle: 'pill-friendly',
        imageRatio: '4/3',
        spacingDensity: 'comfortable',
      },
    },
    {
      name: 'Horizon',
      code: 'horizon',
      isDefault: false,
      configJson: {
        tagline: 'Enterprise Panorama & Heritage Tech',
        bestFor: 'Textile & technology conglomerates, industrial innovation, high-value enterprise brands, engineering & labs',
        palette: { primary: '#0F172A', accent: '#2563EB', background: '#FFFFFF', surface: '#F8FAFC', text: '#0F172A', muted: '#64748B' },
        typography: { heading: 'Plus Jakarta Sans', body: 'Inter' },
        headerStyle: 'sticky-action',
        heroStyle: 'full-banner',
        cardStyle: 'elevated-modern',
        buttonStyle: 'rounded-heavy',
        imageRatio: '16/9',
        spacingDensity: 'generous',
      },
    },
    {
      name: 'Canvas',
      code: 'canvas',
      isDefault: false,
      configJson: {
        tagline: 'Full-Bleed Cinematic Showcase',
        bestFor: 'Flagship lifestyle apparel, gourmet provisions, artisan goods, cinematic visual brands',
        palette: { primary: '#0F172A', accent: '#D97706', background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A', muted: '#64748B' },
        typography: { heading: 'Outfit', body: 'Plus Jakarta Sans' },
        headerStyle: 'minimal-center',
        heroStyle: 'full-banner',
        cardStyle: 'rounded-soft',
        buttonStyle: 'sharp-pill',
        imageRatio: '1/1',
        spacingDensity: 'generous',
      },
    },
  ];

  for (const t of foundationalThemes) {
    await prisma.theme.upsert({
      where: { code: t.code },
      update: {
        name: t.name,
        isDefault: t.isDefault,
        configJson: t.configJson,
      },
      create: {
        name: t.name,
        code: t.code,
        isDefault: t.isDefault,
        configJson: t.configJson,
      },
    });
  }

  // Canonical ThemeDefinitions (7 Themes with Full Capabilities)
  const canonicalThemeDefinitions: Array<{
    key: ThemeKey;
    name: string;
    version: string;
    description: string;
    categoryFit: string;
    defaultConfig: any;
    capabilities: any;
  }> = [
    {
      key: ThemeKey.ATELIER,
      name: 'Atelier',
      version: '1.0.0',
      description: 'Quiet luxury editorial theme with dramatic negative space, refined serif typography, and full-bleed lookbooks.',
      categoryFit: 'Fine jewellery, haute couture, luxury leather, bespoke timepieces, niche perfumery',
      defaultConfig: {
        palette: { primary: '#1C1917', accent: '#D4AF37', background: '#FAFAF9', surface: '#FFFFFF', text: '#1C1917', muted: '#78716C' },
        typography: { heading: 'Playfair Display', body: 'Plus Jakarta Sans' },
        headerStyle: 'minimal-center',
        heroStyle: 'split-editorial',
        cardStyle: 'framed-luxury',
        buttonStyle: 'sharp-pill',
        imageRatio: '3/4',
        spacingDensity: 'generous',
        motionLevel: 'subtle',
      },
      capabilities: {
        common: ['logo', 'brandColors', 'typographyPreset', 'heroMode', 'heroMedia', 'categoryMedia', 'collectionMedia', 'productMedia', 'variantMedia', 'sectionVisibility', 'sectionOrdering', 'productCardMode', 'imageRatio', 'backgroundTreatment', 'buttonStyle', 'motionLevel'],
        specialized: ['editorialLuxuryLayouts', 'largeImagery', 'typographyFirstFallback', 'productMosaicFallback', 'hallmarkBanner'],
      },
    },
    {
      key: ThemeKey.PULSE,
      name: 'Pulse',
      version: '1.0.0',
      description: 'High-energy contemporary storefront with bold typography, split campaign launches, and fast quick-add.',
      categoryFit: 'Streetwear, activewear, modern electronics, creator merchandise, sneaker culture',
      defaultConfig: {
        palette: { primary: '#0F172A', accent: '#EC4899', background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A', muted: '#64748B' },
        typography: { heading: 'Cabinet Grotesk', body: 'Inter' },
        headerStyle: 'sticky-action',
        heroStyle: 'full-banner',
        cardStyle: 'elevated-modern',
        buttonStyle: 'rounded-heavy',
        imageRatio: '1/1',
        spacingDensity: 'compact',
        motionLevel: 'dynamic',
      },
      capabilities: {
        common: ['logo', 'brandColors', 'typographyPreset', 'heroMode', 'heroMedia', 'categoryMedia', 'collectionMedia', 'productMedia', 'variantMedia', 'sectionVisibility', 'sectionOrdering', 'productCardMode', 'imageRatio', 'backgroundTreatment', 'buttonStyle', 'motionLevel'],
        specialized: ['campaignHero', 'productLaunchHero', 'splitHero', 'productMosaic', 'higherVisualDensity', 'quickAdd'],
      },
    },
    {
      key: ThemeKey.HARVEST,
      name: 'Harvest',
      version: '1.0.0',
      description: 'Warm, organic, and story-driven storefront tailored for natural goods, artisan crafts, and sustainable brands.',
      categoryFit: 'Organic grocery, artisanal honey & coffee, natural skincare, slow fashion, ceramics',
      defaultConfig: {
        palette: { primary: '#14532D', accent: '#F59E0B', background: '#FEFCE8', surface: '#FFFFFF', text: '#1E293B', muted: '#475569' },
        typography: { heading: 'DM Serif Display', body: 'Plus Jakarta Sans' },
        headerStyle: 'warm-friendly',
        heroStyle: 'organic-showcase',
        cardStyle: 'rounded-soft',
        buttonStyle: 'pill-friendly',
        imageRatio: '1/1',
        spacingDensity: 'comfortable',
        motionLevel: 'subtle',
      },
      capabilities: {
        common: ['logo', 'brandColors', 'typographyPreset', 'heroMode', 'heroMedia', 'categoryMedia', 'collectionMedia', 'productMedia', 'variantMedia', 'sectionVisibility', 'sectionOrdering', 'productCardMode', 'imageRatio', 'backgroundTreatment', 'buttonStyle', 'motionLevel'],
        specialized: ['warmStoryModules', 'processStorySections', 'quickAdd', 'organicTactilePresentation'],
      },
    },
    {
      key: ThemeKey.FOUNDRY,
      name: 'Foundry',
      version: '1.0.0',
      description: 'Technical B2B / industrial catalog with deep specification sheets, RFQ workflows, and document downloads.',
      categoryFit: 'Industrial manufacturing, valves & pumps, electrical equipment, laboratory supplies, hardware components',
      defaultConfig: {
        palette: { primary: '#1E293B', accent: '#0284C7', background: '#F1F5F9', surface: '#FFFFFF', text: '#0F172A', muted: '#475569' },
        typography: { heading: 'Space Grotesk', body: 'Inter' },
        headerStyle: 'industrial-meta',
        heroStyle: 'technical-hero',
        cardStyle: 'spec-sheet-card',
        buttonStyle: 'square-solid',
        imageRatio: '4/3',
        spacingDensity: 'dense',
        motionLevel: 'none',
      },
      capabilities: {
        common: ['logo', 'brandColors', 'typographyPreset', 'heroMode', 'heroMedia', 'categoryMedia', 'collectionMedia', 'productMedia', 'variantMedia', 'sectionVisibility', 'sectionOrdering', 'productCardMode', 'imageRatio', 'backgroundTreatment', 'buttonStyle', 'motionLevel'],
        specialized: ['technicalSpecifications', 'rfqEnquiry', 'productDocumentsDownloads', 'industriesServed', 'certifications', 'productModes_SELL_ONLINE_ENQUIRY_ONLY_SELL_AND_ENQUIRY'],
      },
    },
    {
      key: ThemeKey.HABITAT,
      name: 'Habitat',
      version: '1.0.0',
      description: 'Visual interior lifestyle theme featuring room and space curation, material textures, and architectural groups.',
      categoryFit: 'Furniture, architectural lighting, rugs & textiles, home accessories, handcrafted fixtures',
      defaultConfig: {
        palette: { primary: '#292524', accent: '#C2410C', background: '#F5F5F4', surface: '#FFFFFF', text: '#292524', muted: '#78716C' },
        typography: { heading: 'Cinzel', body: 'Plus Jakarta Sans' },
        headerStyle: 'spacious-lifestyle',
        heroStyle: 'lifestyle-immersive',
        cardStyle: 'minimal-bleed',
        buttonStyle: 'underline-refined',
        imageRatio: '4/5',
        spacingDensity: 'airy',
        motionLevel: 'subtle',
      },
      capabilities: {
        common: ['logo', 'brandColors', 'typographyPreset', 'heroMode', 'heroMedia', 'categoryMedia', 'collectionMedia', 'productMedia', 'variantMedia', 'sectionVisibility', 'sectionOrdering', 'productCardMode', 'imageRatio', 'backgroundTreatment', 'buttonStyle', 'motionLevel'],
        specialized: ['shopBySpaceUse', 'materialFinishPresentation', 'shopTheLookCuratedGroups', 'editorialStoryModules'],
      },
    },
    {
      key: ThemeKey.LOCAL,
      name: 'Local',
      version: '1.0.0',
      description: 'High-density, fast-ordering retail catalog designed for local brick-and-mortar storefronts and quick reorders.',
      categoryFit: 'Neighbourhood retail, provisions, hardware stores, stationery, pharmacies',
      defaultConfig: {
        palette: { primary: '#1E40AF', accent: '#16A34A', background: '#FFFFFF', surface: '#F8FAFC', text: '#0F172A', muted: '#64748B' },
        typography: { heading: 'Inter', body: 'Inter' },
        headerStyle: 'quick-search-bar',
        heroStyle: 'product-mosaic',
        cardStyle: 'high-density-buy',
        buttonStyle: 'quick-add',
        imageRatio: '1/1',
        spacingDensity: 'dense',
        motionLevel: 'subtle',
      },
      capabilities: {
        common: ['logo', 'brandColors', 'typographyPreset', 'heroMode', 'heroMedia', 'categoryMedia', 'collectionMedia', 'productMedia', 'variantMedia', 'sectionVisibility', 'sectionOrdering', 'productCardMode', 'imageRatio', 'backgroundTreatment', 'buttonStyle', 'motionLevel'],
        specialized: ['strongSearch', 'catalogueDensityModes', 'quickAdd', 'listCompactComfortableViews', 'storeInformation', 'localDeliveryDisplay'],
      },
    },
    {
      key: ThemeKey.FEAST,
      name: 'Feast',
      version: '1.0.0',
      description: 'Sensory food-first commerce featuring menu category bars, quick quantity adjustments, delivery/pickup timings, and custom order requests.',
      categoryFit: 'Bakeries, patisseries, artisanal sweets, gourmet cloud kitchens, chocolate ateliers, fresh meal provisions',
      defaultConfig: {
        palette: { primary: '#78350F', accent: '#E11D48', background: '#FFFBEB', surface: '#FFFFFF', text: '#451A03', muted: '#92400E' },
        typography: { heading: 'Playfair Display', body: 'Plus Jakarta Sans' },
        headerStyle: 'warm-friendly',
        heroStyle: 'organic-showcase',
        cardStyle: 'rounded-soft',
        buttonStyle: 'pill-friendly',
        imageRatio: '1/1',
        spacingDensity: 'comfortable',
        motionLevel: 'subtle',
      },
      capabilities: {
        common: ['logo', 'brandColors', 'typographyPreset', 'heroMode', 'heroMedia', 'categoryMedia', 'collectionMedia', 'productMedia', 'variantMedia', 'sectionVisibility', 'sectionOrdering', 'productCardMode', 'imageRatio', 'backgroundTreatment', 'buttonStyle', 'motionLevel'],
        specialized: ['foodFirstMenuNavigation', 'quickAddQuantityControls', 'availabilityStates', 'deliveryPickupPresentation', 'productCustomizationOptions', 'giftOccasionModules', 'storeTimings', 'foodSpecificDisplayMetadata'],
      },
    },
  ];

  for (const td of canonicalThemeDefinitions) {
    await prisma.themeDefinition.upsert({
      where: { key: td.key },
      update: {
        name: td.name,
        version: td.version,
        description: td.description,
        categoryFit: td.categoryFit,
        defaultConfig: td.defaultConfig,
        capabilities: td.capabilities,
        status: 'ACTIVE',
      },
      create: {
        key: td.key,
        name: td.name,
        version: td.version,
        description: td.description,
        categoryFit: td.categoryFit,
        defaultConfig: td.defaultConfig,
        capabilities: td.capabilities,
        status: 'ACTIVE',
      },
    });
  }

  console.log('✓ 7 Foundational Themes & ThemeDefinitions seeded (Atelier, Pulse, Harvest, Foundry, Habitat, Local, Feast)');

  // ==============================================================================
  // 4. TENANT A: Aurelia Atelier (Fashion / Luxury - PAID & ACTIVE STORE)
  // ==============================================================================
  const tenantA = await prisma.tenant.upsert({
    where: { id: SEED_IDS.tenantA },
    update: {},
    create: {
      id: SEED_IDS.tenantA,
      name: 'Aurelia Atelier',
      slug: 'aurelia-atelier',
      status: TenantStatus.ACTIVE,
    },
  });

  const tenantAOwner = await prisma.user.upsert({
    where: { id: SEED_IDS.tenantAOwner },
    update: {},
    create: {
      id: SEED_IDS.tenantAOwner,
      phone: '+919876543210',
      email: 'owner@aureliaatelier.in',
      fullName: 'Aurelia Sharma',
      role: UserRole.SELLER_OWNER,
    },
  });

  await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: { tenantId: tenantA.id, userId: tenantAOwner.id },
    },
    update: {},
    create: {
      tenantId: tenantA.id,
      userId: tenantAOwner.id,
      role: UserRole.SELLER_OWNER,
      isActive: true,
    },
  });

  // Seed default seller PIN (123456)
  const sellerPin = '123456';
  const sellerSalt = crypto.randomBytes(16).toString('hex');
  const sellerPinHash = sellerSalt + ':' + crypto.scryptSync(sellerPin, sellerSalt, 64).toString('hex');
  await prisma.sellerCredential.upsert({
    where: {
      userId_credentialType: { userId: tenantAOwner.id, credentialType: CredentialType.PIN },
    },
    create: { userId: tenantAOwner.id, credentialType: CredentialType.PIN, pinHash: sellerPinHash },
    update: { pinHash: sellerPinHash, failedPinAttempts: 0, lockedUntil: null },
  });


  // Store A (LIVE & Publicly Accessible)
  const storeA = await prisma.store.upsert({
    where: { id: SEED_IDS.storeA },
    update: {},
    create: {
      id: SEED_IDS.storeA,
      tenantId: tenantA.id,
      name: 'Aurelia Atelier',
      slug: 'aurelia',
      description: 'Premium handcrafted luxury linen apparel for discerning individuals.',
      status: StoreStatus.LIVE,
      isPubliclyAccessible: true,
    },
  });

  await prisma.storeBranding.upsert({
    where: { storeId: storeA.id },
    update: {},
    create: {
      storeId: storeA.id,
      primaryColor: '#1E3A8A',
      accentColor: '#D97706',
      fontHeading: 'Playfair Display',
      fontBody: 'Inter',
      announcement: 'Complimentary shipping on orders above ₹2,000 across India.',
    },
  });

  // Subscription for Tenant A (ACTIVE & PAID)
  const now = new Date();
  const subA = await prisma.subscription.upsert({
    where: { id: 'a9000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'a9000000-0000-0000-0000-000000000001',
      tenantId: tenantA.id,
      planId: growthPlan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      currentPeriodEnd: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000),  // 25 days in future
    },
  });

  // Category for Store A
  const catA1 = await prisma.category.upsert({
    where: { id: SEED_IDS.categoryA1 },
    update: {},
    create: {
      id: SEED_IDS.categoryA1,
      tenantId: tenantA.id,
      storeId: storeA.id,
      name: 'Luxury Linen Shirts',
      slug: 'linen-shirts',
      description: 'Handwoven pure French linen shirts',
    },
  });

  // Product for Store A
  const prodA1 = await prisma.product.upsert({
    where: { id: SEED_IDS.productA1 },
    update: {},
    create: {
      id: SEED_IDS.productA1,
      tenantId: tenantA.id,
      storeId: storeA.id,
      categoryId: catA1.id,
      name: 'Classic Linen Shirt',
      slug: 'classic-linen-shirt',
      description: 'Breathable, timeless luxury tailored French linen shirt.',
      mode: ProductMode.SELL_ONLINE,
      status: ProductStatus.PUBLISHED,
    },
  });

  // Options: Colour & Size
  const optColour = await prisma.productOption.upsert({
    where: { productId_name: { productId: prodA1.id, name: 'Colour' } },
    update: {},
    create: {
      tenantId: tenantA.id,
      storeId: storeA.id,
      productId: prodA1.id,
      name: 'Colour',
      type: OptionType.COLOUR,
      sortOrder: 0,
    },
  });

  const valNavy = await prisma.productOptionValue.upsert({
    where: { optionId_value: { optionId: optColour.id, value: 'Navy' } },
    update: {},
    create: {
      optionId: optColour.id,
      value: 'Navy',
      colorHex: '#000080',
      sortOrder: 0,
    },
  });

  const valWhite = await prisma.productOptionValue.upsert({
    where: { optionId_value: { optionId: optColour.id, value: 'White' } },
    update: {},
    create: {
      optionId: optColour.id,
      value: 'White',
      colorHex: '#FFFFFF',
      sortOrder: 1,
    },
  });

  const optSize = await prisma.productOption.upsert({
    where: { productId_name: { productId: prodA1.id, name: 'Size' } },
    update: {},
    create: {
      tenantId: tenantA.id,
      storeId: storeA.id,
      productId: prodA1.id,
      name: 'Size',
      type: OptionType.SIZE,
      sortOrder: 1,
    },
  });

  const valS = await prisma.productOptionValue.upsert({
    where: { optionId_value: { optionId: optSize.id, value: 'S' } },
    update: {},
    create: { optionId: optSize.id, value: 'S', sortOrder: 0 },
  });

  const valM = await prisma.productOptionValue.upsert({
    where: { optionId_value: { optionId: optSize.id, value: 'M' } },
    update: {},
    create: { optionId: optSize.id, value: 'M', sortOrder: 1 },
  });

  // Variants: Navy / S, Navy / M
  const varNavyS = await prisma.productVariant.upsert({
    where: { id: SEED_IDS.variantA1NavyS },
    update: {},
    create: {
      id: SEED_IDS.variantA1NavyS,
      tenantId: tenantA.id,
      storeId: storeA.id,
      productId: prodA1.id,
      sku: 'AUR-LSH-NVY-S',
      pricePaise: 249900, // ₹2,499.00
      compareAtPricePaise: 299900,
      status: VariantStatus.ACTIVE,
      sortOrder: 0,
    },
  });

  await prisma.productVariantOptionValue.upsert({
    where: { variantId_optionValueId: { variantId: varNavyS.id, optionValueId: valNavy.id } },
    update: {},
    create: { variantId: varNavyS.id, optionValueId: valNavy.id },
  });
  await prisma.productVariantOptionValue.upsert({
    where: { variantId_optionValueId: { variantId: varNavyS.id, optionValueId: valS.id } },
    update: {},
    create: { variantId: varNavyS.id, optionValueId: valS.id },
  });

  await prisma.inventory.upsert({
    where: { variantId: varNavyS.id },
    update: {},
    create: {
      tenantId: tenantA.id,
      storeId: storeA.id,
      variantId: varNavyS.id,
      stockOnHand: 30,
      stockReserved: 0,
    },
  });

  const varNavyM = await prisma.productVariant.upsert({
    where: { id: SEED_IDS.variantA1NavyM },
    update: {},
    create: {
      id: SEED_IDS.variantA1NavyM,
      tenantId: tenantA.id,
      storeId: storeA.id,
      productId: prodA1.id,
      sku: 'AUR-LSH-NVY-M',
      pricePaise: 249900,
      status: VariantStatus.ACTIVE,
      sortOrder: 1,
    },
  });

  await prisma.productVariantOptionValue.upsert({
    where: { variantId_optionValueId: { variantId: varNavyM.id, optionValueId: valNavy.id } },
    update: {},
    create: { variantId: varNavyM.id, optionValueId: valNavy.id },
  });
  await prisma.productVariantOptionValue.upsert({
    where: { variantId_optionValueId: { variantId: varNavyM.id, optionValueId: valM.id } },
    update: {},
    create: { variantId: varNavyM.id, optionValueId: valM.id },
  });

  await prisma.inventory.upsert({
    where: { variantId: varNavyM.id },
    update: {},
    create: {
      tenantId: tenantA.id,
      storeId: storeA.id,
      variantId: varNavyM.id,
      stockOnHand: 45,
      stockReserved: 0,
    },
  });

  // Variant-specific product media (Navy image)
  await prisma.productMedia.upsert({
    where: { id: 'a5500000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'a5500000-0000-0000-0000-000000000001',
      tenantId: tenantA.id,
      storeId: storeA.id,
      productId: prodA1.id,
      variantId: varNavyS.id,
      storageKey: `${tenantA.id}/${storeA.id}/products/navy-shirt-front.jpg`,
      publicUrl: `http://localhost:4000/media/${tenantA.id}/${storeA.id}/products/navy-shirt-front.jpg`,
      filePath: `/data/media/${tenantA.id}/${storeA.id}/products/navy-shirt-front.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 154200,
      altText: 'Aurelia Classic Linen Shirt in Navy Blue',
      sortOrder: 0,
    },
  });

  // Payment & Shipping Accounts for Tenant A
  await prisma.merchantPaymentAccount.upsert({
    where: { storeId_provider: { storeId: storeA.id, provider: PaymentProviderType.MOCK } },
    update: {},
    create: {
      tenantId: tenantA.id,
      storeId: storeA.id,
      provider: PaymentProviderType.MOCK,
      isEnabled: true,
      keyId: 'mock_key_aurelia_123',
      keySecretEncrypted: 'mock_secret_enc_aurelia_123',
    },
  });

  await prisma.merchantShippingAccount.upsert({
    where: { storeId_provider: { storeId: storeA.id, provider: ShippingProviderType.MOCK } },
    update: {},
    create: {
      tenantId: tenantA.id,
      storeId: storeA.id,
      provider: ShippingProviderType.MOCK,
      isEnabled: true,
      apiKeyEncrypted: 'mock_shiprocket_api_key_aurelia',
      apiSecretEncrypted: 'mock_shiprocket_api_secret_aurelia',
    },
  });

  await prisma.shippingProfile.upsert({
    where: { id: 'a5600000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'a5600000-0000-0000-0000-000000000001',
      tenantId: tenantA.id,
      storeId: storeA.id,
      name: 'Standard Pan-India Delivery',
      flatRatePaise: 9900, // ₹99
      freeShippingThresholdPaise: 200000, // Free above ₹2,000
      isDefault: true,
    },
  });

  // Customer & Completed Order for Tenant A
  const custA1 = await prisma.customer.upsert({
    where: { id: SEED_IDS.customerA1 },
    update: {},
    create: {
      id: SEED_IDS.customerA1,
      tenantId: tenantA.id,
      storeId: storeA.id,
      phone: '+919811122233',
      email: 'rohan.mehta@example.com',
      fullName: 'Rohan Mehta',
      isGuest: true,
    },
  });

  await prisma.customerAddress.upsert({
    where: { id: 'a7100000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'a7100000-0000-0000-0000-000000000001',
      customerId: custA1.id,
      addressLine1: 'B-402, Sea Green Apartments',
      addressLine2: 'Worli Sea Face',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400018',
      country: 'India',
      isDefault: true,
    },
  });

  const orderA1 = await prisma.order.upsert({
    where: { id: SEED_IDS.orderA1 },
    update: {},
    create: {
      id: SEED_IDS.orderA1,
      tenantId: tenantA.id,
      storeId: storeA.id,
      customerId: custA1.id,
      orderNumber: 'ORD-AUR-1001',
      status: OrderStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      shipmentStatus: ShipmentStatus.DELIVERED,
      subtotalPaise: 499800, // 2 shirts x ₹2,499
      taxPaise: 24990,
      shippingPaise: 0,
      discountPaise: 0,
      totalPaise: 524790,
      deliveryAddress: {
        fullName: 'Rohan Mehta',
        phone: '+919811122233',
        addressLine1: 'B-402, Sea Green Apartments',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400018',
      },
    },
  });

  await prisma.orderItem.upsert({
    where: { id: 'a8100000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'a8100000-0000-0000-0000-000000000001',
      orderId: orderA1.id,
      variantId: varNavyS.id,
      productName: 'Classic Linen Shirt',
      variantTitle: 'Navy / S',
      sku: 'AUR-LSH-NVY-S',
      selectedOptions: { Colour: 'Navy', Size: 'S' },
      quantity: 2,
      unitPricePaise: 249900,
      taxPaise: 24990,
      totalPaise: 524790,
    },
  });
  console.log(`✓ Tenant A seeded: ${tenantA.name} [PAID / ACTIVE / LIVE]`);

  // ==============================================================================
  // 5. TENANT B: Patil Engineering (Industrial / B2B - UNPAID & PRIVATE STORE)
  // ==============================================================================
  const tenantB = await prisma.tenant.upsert({
    where: { id: SEED_IDS.tenantB },
    update: {},
    create: {
      id: SEED_IDS.tenantB,
      name: 'Patil Engineering',
      slug: 'patil-engineering',
      status: TenantStatus.ACTIVE,
    },
  });

  const tenantBOwner = await prisma.user.upsert({
    where: { id: SEED_IDS.tenantBOwner },
    update: {},
    create: {
      id: SEED_IDS.tenantBOwner,
      phone: '+919876501234',
      email: 'suresh@patileng.in',
      fullName: 'Suresh Patil',
      role: UserRole.SELLER_OWNER,
    },
  });

  await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: { tenantId: tenantB.id, userId: tenantBOwner.id },
    },
    update: {},
    create: {
      tenantId: tenantB.id,
      userId: tenantBOwner.id,
      role: UserRole.SELLER_OWNER,
      isActive: true,
    },
  });

  // Store B (PRIVATE_PREVIEW & Not Publicly Accessible because UNPAID)
  const storeB = await prisma.store.upsert({
    where: { id: SEED_IDS.storeB },
    update: {},
    create: {
      id: SEED_IDS.storeB,
      tenantId: tenantB.id,
      name: 'Patil Engineering Tools',
      slug: 'patil-engineering',
      description: 'Precision engineered industrial flange valves and fittings.',
      status: StoreStatus.PRIVATE_PREVIEW,
      isPubliclyAccessible: false,
    },
  });

  await prisma.storeBranding.upsert({
    where: { storeId: storeB.id },
    update: {},
    create: {
      storeId: storeB.id,
      primaryColor: '#334155',
      accentColor: '#EA580C',
      fontHeading: 'Inter',
      fontBody: 'Inter',
      announcement: 'GST registered B2B supplies with inspection test certificates.',
    },
  });

  // Subscription for Tenant B: UNPAID / TRIAL EXPIRED
  await prisma.subscription.upsert({
    where: { id: 'b9000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'b9000000-0000-0000-0000-000000000001',
      tenantId: tenantB.id,
      planId: starterPlan.id,
      status: SubscriptionStatus.UNPAID,
      currentPeriodStart: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // Expired 10 days ago!
    },
  });

  // Category for Store B
  const catB1 = await prisma.category.upsert({
    where: { id: SEED_IDS.categoryB1 },
    update: {},
    create: {
      id: SEED_IDS.categoryB1,
      tenantId: tenantB.id,
      storeId: storeB.id,
      name: 'Hydraulic & Flange Valves',
      slug: 'hydraulic-valves',
    },
  });

  // Product B1: Enquiry Only / B2B Mode
  const prodB1 = await prisma.product.upsert({
    where: { id: SEED_IDS.productB1 },
    update: {},
    create: {
      id: SEED_IDS.productB1,
      tenantId: tenantB.id,
      storeId: storeB.id,
      categoryId: catB1.id,
      name: 'Heavy Duty Flange Valve',
      slug: 'heavy-duty-flange-valve',
      description: 'Forged stainless steel SS316 flange valve with ASME Class 150 pressure rating.',
      mode: ProductMode.ENQUIRY_ONLY,
      status: ProductStatus.PUBLISHED,
      minOrderQuantity: 10,
      leadTimeDays: 14,
      enquiryCtaText: 'Request Bulk Quotation',
      specifications: {
        material: 'SS316 Stainless Steel',
        pressureRating: 'Class 150',
        operatingTemperature: '-20°C to 200°C',
        certification: 'EN 10204 3.1 Certified',
      },
    },
  });

  const varB1 = await prisma.productVariant.upsert({
    where: { id: 'b6100000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: 'b6100000-0000-0000-0000-000000000001',
      tenantId: tenantB.id,
      storeId: storeB.id,
      productId: prodB1.id,
      sku: 'PAT-VLV-SS316-50MM',
      pricePaise: 450000, // ₹4,500.00
      status: VariantStatus.ACTIVE,
    },
  });

  await prisma.inventory.upsert({
    where: { variantId: varB1.id },
    update: {},
    create: {
      tenantId: tenantB.id,
      storeId: storeB.id,
      variantId: varB1.id,
      stockOnHand: 150,
    },
  });

  // Sample Enquiry for Tenant B
  await prisma.enquiry.upsert({
    where: { id: SEED_IDS.enquiryB1 },
    update: {},
    create: {
      id: SEED_IDS.enquiryB1,
      tenantId: tenantB.id,
      storeId: storeB.id,
      productId: prodB1.id,
      customerName: 'Kunal Deshmukh',
      customerPhone: '+919822334455',
      customerEmail: 'kunal@puneautomations.in',
      companyName: 'Pune Automations Pvt Ltd',
      message: 'Kindly share your best commercial quotation for 50 pieces of SS316 flange valves including test reports.',
      requestedQuantity: 50,
      status: EnquiryStatus.NEW,
    },
  });
  console.log(`✓ Tenant B seeded: ${tenantB.name} [UNPAID / PRIVATE / B2B ENQUIRY]`);

  // ==============================================================================
  // 6. POLISHED DEMONSTRATION STORES (6 DISTINCT ARCHETYPES)
  // ==============================================================================
  const demoStoresData = [
    {
      tenantId: 'c1000000-0000-0000-0000-000000000001',
      tenantName: 'Aaraa Fine Jewels',
      tenantSlug: 'aaraa-jewels',
      ownerId: 'c2000000-0000-0000-0000-000000000001',
      ownerPhone: '+919810100001',
      ownerEmail: 'concierge@aaraajewels.in',
      ownerName: 'Sunita Mehra',
      storeId: 'c3000000-0000-0000-0000-000000000001',
      storeName: 'Aaraa Fine Jewels',
      storeSlug: 'aaraa-jewels',
      storeDesc: 'Haute Joaillerie, hallmarked polki and certified solitaire diamonds.',
      themeCode: 'atelier',
      branding: {
        primaryColor: '#1C1917',
        accentColor: '#D4AF37',
        fontHeading: 'Playfair Display',
        fontBody: 'Plus Jakarta Sans',
        announcement: 'Complimentary insured door delivery on all fine jewellery orders.',
      },
      categories: [
        { id: 'c4000000-0000-0000-0000-000000000001', name: 'Bridal Polki Chokers', slug: 'polki-chokers' },
        { id: 'c4000000-0000-0000-0000-000000000002', name: 'Solitaire Diamond Rings', slug: 'diamond-rings' },
      ],
      products: [
        {
          id: 'c5000000-0000-0000-0000-000000000001',
          categoryId: 'c4000000-0000-0000-0000-000000000001',
          name: 'Kundan Polki Bridal Choker Set',
          slug: 'kundan-polki-choker',
          desc: 'Handcrafted in 22K hallmarked gold with uncut syndicate polki and Zambian emerald beads.',
          pricePaise: 4850000,
          comparePaise: 5400000,
          sku: 'AR-POLKI-CHK-01',
          imageUrl: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.SELL_ONLINE,
        },
        {
          id: 'c5000000-0000-0000-0000-000000000002',
          categoryId: 'c4000000-0000-0000-0000-000000000002',
          name: 'Solitaire Emerald-Cut Diamond Ring',
          slug: 'emerald-cut-diamond-ring',
          desc: '1.5 Carat IGI certified lab-grown diamond set in 18K white gold cathedral band.',
          pricePaise: 8500000,
          comparePaise: 9500000,
          sku: 'AR-SLT-RNG-15',
          imageUrl: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.SELL_ONLINE,
        },
      ],
    },
    {
      tenantId: 'd1000000-0000-0000-0000-000000000001',
      tenantName: 'Pulse Streetwear',
      tenantSlug: 'pulse-street',
      ownerId: 'd2000000-0000-0000-0000-000000000001',
      ownerPhone: '+919810100002',
      ownerEmail: 'drops@pulsestreetwear.in',
      ownerName: 'Kabir Varma',
      storeId: 'd3000000-0000-0000-0000-000000000001',
      storeName: 'Pulse Streetwear',
      storeSlug: 'pulse-street',
      storeDesc: 'Contemporary streetwear drops, heavyweight hoodies, and limited edition sneakers.',
      themeCode: 'pulse',
      branding: {
        primaryColor: '#0F172A',
        accentColor: '#EC4899',
        fontHeading: 'Cabinet Grotesk',
        fontBody: 'Inter',
        announcement: 'SEASON 04 DROP LIVE • EXPRESS AIR SHIPPING ACROSS INDIA',
      },
      categories: [
        { id: 'd4000000-0000-0000-0000-000000000001', name: 'Heavyweight Hoodies', slug: 'hoodies' },
        { id: 'd4000000-0000-0000-0000-000000000002', name: 'Tactical Bottoms', slug: 'tactical-bottoms' },
      ],
      products: [
        {
          id: 'd5000000-0000-0000-0000-000000000001',
          categoryId: 'd4000000-0000-0000-0000-000000000001',
          name: 'Oversized Acid-Wash Boxy Hoodie',
          slug: 'acid-wash-boxy-hoodie',
          desc: '450 GSM pure French Terry cotton, drop shoulder cut with custom silicone branding.',
          pricePaise: 299900,
          comparePaise: 399900,
          sku: 'PLS-HD-ACD-01',
          imageUrl: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.SELL_ONLINE,
        },
        {
          id: 'd5000000-0000-0000-0000-000000000002',
          categoryId: 'd4000000-0000-0000-0000-000000000002',
          name: 'Tactical Multi-Pocket Cargo Joggers',
          slug: 'tactical-cargo-joggers',
          desc: 'Reinforced nylon ripstop construction with 8 modular utility pockets and magnetic snaps.',
          pricePaise: 349900,
          comparePaise: 429900,
          sku: 'PLS-CRG-JOG-02',
          imageUrl: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.SELL_ONLINE,
        },
      ],
    },
    {
      tenantId: 'e1000000-0000-0000-0000-000000000001',
      tenantName: 'Mithaiwala & Co.',
      tenantSlug: 'mithaiwala',
      ownerId: 'e2000000-0000-0000-0000-000000000001',
      ownerPhone: '+919810100003',
      ownerEmail: 'orders@mithaiwalaco.in',
      ownerName: 'Harish Halwai',
      storeId: 'e3000000-0000-0000-0000-000000000001',
      storeName: 'Mithaiwala & Co.',
      storeSlug: 'mithaiwala',
      storeDesc: 'Handcrafted traditional sweets made with pure A2 Bikaneri ghee and Goan cashews.',
      themeCode: 'harvest',
      branding: {
        primaryColor: '#14532D',
        accentColor: '#F59E0B',
        fontHeading: 'DM Serif Display',
        fontBody: 'Plus Jakarta Sans',
        announcement: 'Fresh batch prepared daily • Vacuum sealed delivery across India',
      },
      categories: [
        { id: 'e4000000-0000-0000-0000-000000000001', name: 'Royal Cashew Sweets', slug: 'cashew-sweets' },
        { id: 'e4000000-0000-0000-0000-000000000002', name: 'Pure Desi Ghee Ladoos', slug: 'ghee-ladoos' },
      ],
      products: [
        {
          id: 'e5000000-0000-0000-0000-000000000001',
          categoryId: 'e4000000-0000-0000-0000-000000000001',
          name: 'Royal Silver-Leaf Kaju Katli (500g)',
          slug: 'royal-kaju-katli',
          desc: 'Finest hand-ground Goan cashews infused with organic cardamom and pure silver vark.',
          pricePaise: 65000,
          comparePaise: 75000,
          sku: 'MW-KJU-KTL-500',
          imageUrl: 'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.SELL_ONLINE,
        },
        {
          id: 'e5000000-0000-0000-0000-000000000002',
          categoryId: 'e4000000-0000-0000-0000-000000000002',
          name: 'Desi Ghee Besan Ladoo (500g)',
          slug: 'desi-ghee-besan-ladoo',
          desc: 'Coarse gram flour slow-roasted in pure Bikaneri cow ghee with crushed pistachios.',
          pricePaise: 45000,
          comparePaise: 50000,
          sku: 'MW-BSN-LDU-500',
          imageUrl: 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.SELL_ONLINE,
        },
      ],
    },
    {
      tenantId: 'b7000000-0000-0000-0000-000000000001',
      tenantName: 'Foundry Industrial Supply',
      tenantSlug: 'foundry-industrial',
      ownerId: 'b7100000-0000-0000-0000-000000000001',
      ownerPhone: '+919810100004',
      ownerEmail: 'sales@foundryindustrial.in',
      ownerName: 'Vikram Shinde',
      storeId: 'b7200000-0000-0000-0000-000000000001',
      storeName: 'Foundry Industrial Supply',
      storeSlug: 'foundry-industrial',
      storeDesc: 'Direct factory engineering components, hydraulic cylinders, and SS316 flange fittings.',
      themeCode: 'foundry',
      branding: {
        primaryColor: '#1E293B',
        accentColor: '#0284C7',
        fontHeading: 'Space Grotesk',
        fontBody: 'Inter',
        announcement: 'ISO 9001:2015 Registered • Commercial GST Tax Invoices with MTC Reports',
      },
      categories: [
        { id: 'b7300000-0000-0000-0000-000000000001', name: 'Valves & Actuators', slug: 'valves-actuators' },
        { id: 'b7300000-0000-0000-0000-000000000002', name: 'Hydraulic Systems', slug: 'hydraulic-systems' },
      ],
      products: [
        {
          id: 'b7400000-0000-0000-0000-000000000001',
          categoryId: 'b7300000-0000-0000-0000-000000000001',
          name: 'Heavy Duty Flange Valve SS316 (Class 150)',
          slug: 'ss316-flange-valve-150',
          desc: 'Forged AISI 316 stainless steel flange valve rated for high pressure chemical and steam transfer.',
          pricePaise: 450000,
          comparePaise: 520000,
          sku: 'FND-VLV-SS316-50',
          imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.SELL_AND_ENQUIRY,
        },
        {
          id: 'b7400000-0000-0000-0000-000000000002',
          categoryId: 'b7300000-0000-0000-0000-000000000002',
          name: 'Industrial Double-Acting Hydraulic Cylinder',
          slug: 'hydraulic-cylinder-250bar',
          desc: 'Hard chrome plated steel cylinder with polyurethane seals. Max working pressure 250 Bar.',
          pricePaise: 1280000,
          comparePaise: 1450000,
          sku: 'FND-HYD-CYL-250',
          imageUrl: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.ENQUIRY_ONLY,
        },
      ],
    },
    {
      tenantId: 'f1000000-0000-0000-0000-000000000001',
      tenantName: 'Vriksha Living',
      tenantSlug: 'vriksha-living',
      ownerId: 'f2000000-0000-0000-0000-000000000001',
      ownerPhone: '+919810100005',
      ownerEmail: 'studio@vrikshaliving.in',
      ownerName: 'Ananya Rao',
      storeId: 'f3000000-0000-0000-0000-000000000001',
      storeName: 'Vriksha Living',
      storeSlug: 'vriksha-living',
      storeDesc: 'Handcrafted solid teakwood furniture and minimalist architectural interior accents.',
      themeCode: 'habitat',
      branding: {
        primaryColor: '#292524',
        accentColor: '#C2410C',
        fontHeading: 'Cinzel',
        fontBody: 'Plus Jakarta Sans',
        announcement: 'White-glove room-of-choice installation across 40+ Indian metro cities',
      },
      categories: [
        { id: 'f4000000-0000-0000-0000-000000000001', name: 'Dining Sanctuaries', slug: 'dining' },
        { id: 'f4000000-0000-0000-0000-000000000002', name: 'Lounge Seating', slug: 'lounge-seating' },
      ],
      products: [
        {
          id: 'f5000000-0000-0000-0000-000000000001',
          categoryId: 'f4000000-0000-0000-0000-000000000001',
          name: 'Solid Teakwood 6-Seater Dining Table',
          slug: 'teakwood-dining-table',
          desc: 'Sustainably harvested reclaimed teakwood with rounded chamfer edges and hand-rubbed organic oil finish.',
          pricePaise: 4200000,
          comparePaise: 4800000,
          sku: 'VRK-DNG-TBL-06',
          imageUrl: 'https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.SELL_ONLINE,
        },
        {
          id: 'f5000000-0000-0000-0000-000000000002',
          categoryId: 'f4000000-0000-0000-0000-000000000002',
          name: 'Boucle & Natural Cane Accent Armchair',
          slug: 'boucle-cane-armchair',
          desc: 'High-resilience foam wrapped in tactile ivory boucle fabric with woven natural cane backrest.',
          pricePaise: 1850000,
          comparePaise: 2200000,
          sku: 'VRK-LOU-CHR-01',
          imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.SELL_ONLINE,
        },
      ],
    },
    {
      tenantId: '11000000-0000-0000-0000-000000000001',
      tenantName: 'Shree Ganesh Superstore',
      tenantSlug: 'shree-ganesh',
      ownerId: '12000000-0000-0000-0000-000000000001',
      ownerPhone: '+919810100006',
      ownerEmail: 'orders@shreeganeshstore.in',
      ownerName: 'Ganesh Agarwal',
      storeId: '13000000-0000-0000-0000-000000000001',
      storeName: 'Shree Ganesh Superstore',
      storeSlug: 'shree-ganesh',
      storeDesc: 'Wholesale grains, pulses, cold pressed cooking oils, and daily FMCG household staples.',
      themeCode: 'local',
      branding: {
        primaryColor: '#1E40AF',
        accentColor: '#16A34A',
        fontHeading: 'Inter',
        fontBody: 'Inter',
        announcement: 'Daily delivery within 2 hours • WhatsApp order assistance: +91 98101 00006',
      },
      categories: [
        { id: '14000000-0000-0000-0000-000000000001', name: 'Premium Rice & Grains', slug: 'rice-grains' },
        { id: '14000000-0000-0000-0000-000000000002', name: 'Pure Cold Pressed Oils', slug: 'cooking-oils' },
      ],
      products: [
        {
          id: '15000000-0000-0000-0000-000000000001',
          categoryId: '14000000-0000-0000-0000-000000000001',
          name: 'Daawat Traditional Aged Basmati Rice (5kg)',
          slug: 'daawat-traditional-basmati-5kg',
          desc: '2-year aged pearlescent long grain basmati rice. Non-sticky, authentic rich aroma.',
          pricePaise: 72000,
          comparePaise: 85000,
          sku: 'SGS-RIC-DWT-05',
          imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.SELL_ONLINE,
        },
        {
          id: '15000000-0000-0000-0000-000000000002',
          categoryId: '14000000-0000-0000-0000-000000000002',
          name: 'Kachi Ghani Cold Pressed Mustard Oil (1L)',
          slug: 'kachi-ghani-mustard-oil-1l',
          desc: 'Traditional wooden kolhu extracted cold-pressed mustard oil with pungent natural aroma.',
          pricePaise: 19500,
          comparePaise: 23000,
          sku: 'SGS-OIL-MST-01',
          imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=800&auto=format&fit=crop&q=80',
          mode: ProductMode.SELL_ONLINE,
        },
      ],
    },
  ];

  for (const ds of demoStoresData) {
    const tenant = await prisma.tenant.upsert({
      where: { id: ds.tenantId },
      update: {},
      create: {
        id: ds.tenantId,
        name: ds.tenantName,
        slug: ds.tenantSlug,
        status: TenantStatus.ACTIVE,
      },
    });

    const user = await prisma.user.upsert({
      where: { id: ds.ownerId },
      update: {},
      create: {
        id: ds.ownerId,
        phone: ds.ownerPhone,
        email: ds.ownerEmail,
        fullName: ds.ownerName,
        role: UserRole.SELLER_OWNER,
      },
    });

    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: user.id,
        role: UserRole.SELLER_OWNER,
        isActive: true,
      },
    });

    const store = await prisma.store.upsert({
      where: { id: ds.storeId },
      update: { status: StoreStatus.LIVE, isPubliclyAccessible: true },
      create: {
        id: ds.storeId,
        tenantId: tenant.id,
        name: ds.storeName,
        slug: ds.storeSlug,
        description: ds.storeDesc,
        status: StoreStatus.LIVE,
        isPubliclyAccessible: true,
      },
    });

    await prisma.storeBranding.upsert({
      where: { storeId: store.id },
      update: ds.branding,
      create: {
        storeId: store.id,
        ...ds.branding,
      },
    });

    // Active Growth Plan Subscription
    await prisma.subscription.upsert({
      where: { id: `sub-${ds.storeSlug}-001` },
      update: {},
      create: {
        id: `sub-${ds.storeSlug}-001`,
        tenantId: tenant.id,
        planId: growthPlan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000),
      },
    });

    // Link Theme
    const matchedTheme = await prisma.theme.findUnique({ where: { code: ds.themeCode } });
    if (matchedTheme) {
      await prisma.storeThemeConfig.upsert({
        where: { storeId_themeId: { storeId: store.id, themeId: matchedTheme.id } },
        update: {},
        create: {
          storeId: store.id,
          themeId: matchedTheme.id,
          configJson: {
            themeId: ds.themeCode,
            palette: {
              primary: ds.branding.primaryColor,
              accent: ds.branding.accentColor,
            },
          },
        },
      });
    }

    // Payment and Shipping Accounts
    await prisma.merchantPaymentAccount.upsert({
      where: { storeId_provider: { storeId: store.id, provider: PaymentProviderType.MOCK } },
      update: {},
      create: {
        tenantId: tenant.id,
        storeId: store.id,
        provider: PaymentProviderType.MOCK,
        isEnabled: true,
        keyId: `mock_${ds.storeSlug}`,
        keySecretEncrypted: `mock_secret_${ds.storeSlug}`,
      },
    });

    await prisma.shippingProfile.upsert({
      where: { id: `ship-${ds.storeSlug}-001` },
      update: {},
      create: {
        id: `ship-${ds.storeSlug}-001`,
        tenantId: tenant.id,
        storeId: store.id,
        name: 'Standard Pan-India Delivery',
        flatRatePaise: 9900,
        freeShippingThresholdPaise: 150000,
        isDefault: true,
      },
    });

    // Categories
    for (const cat of ds.categories) {
      await prisma.category.upsert({
        where: { id: cat.id },
        update: {},
        create: {
          id: cat.id,
          tenantId: tenant.id,
          storeId: store.id,
          name: cat.name,
          slug: cat.slug,
        },
      });
    }

    // Products
    for (const prod of ds.products) {
      const p = await prisma.product.upsert({
        where: { id: prod.id },
        update: {},
        create: {
          id: prod.id,
          tenantId: tenant.id,
          storeId: store.id,
          categoryId: prod.categoryId,
          name: prod.name,
          slug: prod.slug,
          description: prod.desc,
          mode: prod.mode,
          status: ProductStatus.PUBLISHED,
        },
      });

      const variant = await prisma.productVariant.upsert({
        where: { id: `var-${prod.id}` },
        update: {},
        create: {
          id: `var-${prod.id}`,
          tenantId: tenant.id,
          storeId: store.id,
          productId: p.id,
          sku: prod.sku,
          pricePaise: prod.pricePaise,
          compareAtPricePaise: prod.comparePaise,
          status: VariantStatus.ACTIVE,
        },
      });

      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        update: {},
        create: {
          tenantId: tenant.id,
          storeId: store.id,
          variantId: variant.id,
          stockOnHand: 50,
          stockReserved: 0,
        },
      });

      await prisma.productMedia.upsert({
        where: { id: `med-${prod.id}` },
        update: {},
        create: {
          id: `med-${prod.id}`,
          tenantId: tenant.id,
          storeId: store.id,
          productId: p.id,
          variantId: variant.id,
          storageKey: `${tenant.id}/${store.id}/products/${prod.slug}.jpg`,
          publicUrl: prod.imageUrl,
          filePath: `/data/media/${tenant.id}/${store.id}/products/${prod.slug}.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: 120000,
          altText: prod.name,
          sortOrder: 0,
        },
      });
    }

    console.log(`✓ Demo Store Seeded: ${ds.storeName} (Theme: ${ds.themeCode}) -> /store/${ds.storeSlug}`);
  }

  console.log('✅ Simply E-Commerce Database seeding completed successfully!');
}

if (require.main === module) {
  runSeed()
    .catch((e) => {
      console.error('❌ Seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
