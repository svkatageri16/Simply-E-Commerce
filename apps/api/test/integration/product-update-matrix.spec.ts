import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { CatalogService } from '../../src/modules/catalog/catalog.service';
import { ProductMode, ProductStatus, VariantStatus } from '@simply/types';
import { SEED_IDS } from '@simply/db';

describe('Product Create & Update Reproduction Matrix (Bug 25)', () => {
  let prisma: PrismaClient;
  let catalogService: CatalogService;

  const tenantContext = {
    tenantId: SEED_IDS.tenantA,
    storeId: SEED_IDS.storeA,
  };

  let testAsset1: any;
  let testAsset2: any;
  let testAsset3: any;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.TEST_DATABASE_URL ||
            'postgresql://postgres:postgres@localhost:5432/simply_ecommerce_test?schema=public',
        },
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaClient, useValue: prisma },
      ],
    }).compile();

    catalogService = module.get<CatalogService>(CatalogService);

    // Create test media assets for storeA
    testAsset1 = await prisma.mediaAsset.create({
      data: {
        tenantId: tenantContext.tenantId,
        storeId: tenantContext.storeId,
        fileName: 'asset-1.jpg',
        storageKey: `test/asset-1-${Date.now()}.jpg`,
        publicUrl: `https://test.local/asset-1.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      },
    });
    testAsset2 = await prisma.mediaAsset.create({
      data: {
        tenantId: tenantContext.tenantId,
        storeId: tenantContext.storeId,
        fileName: 'asset-2.jpg',
        storageKey: `test/asset-2-${Date.now()}.jpg`,
        publicUrl: `https://test.local/asset-2.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
      },
    });
    testAsset3 = await prisma.mediaAsset.create({
      data: {
        tenantId: tenantContext.tenantId,
        storeId: tenantContext.storeId,
        fileName: 'asset-3.jpg',
        storageKey: `test/asset-3-${Date.now()}.jpg`,
        publicUrl: `https://test.local/asset-3.jpg`,
        mimeType: 'image/jpeg',
        sizeBytes: 3072,
      },
    });
  });

  afterAll(async () => {
    await prisma.mediaAsset.deleteMany({
      where: { id: { in: [testAsset1.id, testAsset2.id, testAsset3.id] } },
    });
    await prisma.$disconnect();
  });

  it('Create simple product and test update matrix', async () => {
    // 1. Create simple product
    const created = await catalogService.createProduct(tenantContext, {
      name: 'Matrix Test Product',
      description: 'Initial description',
      mode: ProductMode.SELL_ONLINE,
      pricePaise: 150000,
      stock: 25,
      sku: `SKU-MAT-${Date.now()}`,
      mediaAssetIds: [testAsset1.id],
      status: ProductStatus.PUBLISHED,
    });
    expect(created).toBeDefined();
    expect(created!.id).toBeDefined();

    try {
      // Test A: Title only
      console.log('Testing update: title only');
      const uTitle = await catalogService.updateProduct(tenantContext, created!.id, {
        name: 'Matrix Test Product Updated Title',
      });
      expect(uTitle!.name).toBe('Matrix Test Product Updated Title');

      // Test B: Description only
      console.log('Testing update: description only');
      const uDesc = await catalogService.updateProduct(tenantContext, created!.id, {
        description: 'Updated description text',
      });
      expect(uDesc!.description).toBe('Updated description text');

      // Test C: Price only
      console.log('Testing update: price only');
      const uPrice = await catalogService.updateProduct(tenantContext, created!.id, {
        pricePaise: 199900,
      });
      expect(uPrice!.variants[0].pricePaise).toBe(199900);

      // Test D: Base stock only
      console.log('Testing update: base stock only');
      const uStock = await catalogService.updateProduct(tenantContext, created!.id, {
        stock: 40,
      });
      expect(uStock!.variants[0].inventory?.stockOnHand).toBe(40);

      // Test E: Selling mode only
      console.log('Testing update: selling mode only');
      const uMode = await catalogService.updateProduct(tenantContext, created!.id, {
        mode: ProductMode.SELL_AND_ENQUIRY,
      });
      expect(uMode!.mode).toBe(ProductMode.SELL_AND_ENQUIRY);

      // Test F: WhatsApp enquiry option (enquiryCtaText)
      console.log('Testing update: WhatsApp enquiry CTA text');
      const uWa = await catalogService.updateProduct(tenantContext, created!.id, {
        enquiryCtaText: 'Enquire on WhatsApp Now',
      });
      expect(uWa!.enquiryCtaText).toBe('Enquire on WhatsApp Now');

      // Test G: Payload like frontend sends for simple product update
      console.log('Testing update: Payload like frontend sends for simple product update');
      const uFrontendPayload = await catalogService.updateProduct(tenantContext, created!.id, {
        name: 'Matrix Test Product Frontend Payload',
        description: 'Updated via frontend payload',
        categoryId: undefined,
        mode: ProductMode.SELL_ONLINE,
        status: ProductStatus.PUBLISHED,
        pricePaise: 180000,
        compareAtPricePaise: 200000,
        stock: 35,
        sku: created!.variants[0].sku,
        mediaAssetIds: [testAsset1.id, testAsset2.id],
        media: [
          { mediaAssetId: testAsset1.id, sortOrder: 0 },
          { mediaAssetId: testAsset2.id, sortOrder: 1 },
        ],
        options: [],
        variants: [
          {
            sku: created!.variants[0].sku,
            pricePaise: 180000,
            compareAtPricePaise: 200000,
            stock: 35,
            initialStock: 35,
            optionValues: [],
            status: 'ACTIVE' as any,
          },
        ],
      });
      expect(uFrontendPayload!.media.length).toBe(2);
      const skuOnly = await catalogService.updateProduct(tenantContext, created!.id, { sku: `SKU-EDIT-${Date.now()}` });
      expect(skuOnly!.variants[0].id).toBe(created!.variants[0].id);
      expect(skuOnly!.variants[0].sku).toMatch(/^SKU-EDIT-/);
      const category = await prisma.category.create({ data: { ...tenantContext, name: 'Owned matrix category', slug: `matrix-${Date.now()}` } });
      try {
        const categorized = await catalogService.updateProduct(tenantContext, created!.id, { categoryId: category.id, status: ProductStatus.DRAFT });
        expect(categorized!.categoryId).toBe(category.id);
        expect(categorized!.status).toBe(ProductStatus.DRAFT);
        const images = await catalogService.updateProduct(tenantContext, created!.id, { mediaAssetIds: [testAsset1.id, testAsset2.id, testAsset3.id] });
        expect(images!.media).toHaveLength(3);
        const removed = await catalogService.updateProduct(tenantContext, created!.id, { mediaAssetIds: [testAsset3.id] });
        expect(removed!.media).toHaveLength(1);
        expect(removed!.media[0].mediaAssetId).toBe(testAsset3.id);
        const preserved = await catalogService.updateProduct(tenantContext, created!.id, { description: 'Keep media unchanged' });
        expect(preserved!.media[0].id).toBe(removed!.media[0].id);
        await catalogService.updateProduct(tenantContext, created!.id, { categoryId: null as any, status: ProductStatus.PUBLISHED });
      } finally { await prisma.category.delete({ where: { id: category.id } }); }

    } finally {
      // Clean up
      await prisma.product.delete({ where: { id: created!.id } });
    }
  });

  it('Create variant product and test update matrix', async () => {
    const createdVariantProd = await catalogService.createProduct(tenantContext, {
      name: 'Matrix Variant Product',
      description: 'Variant initial description',
      mode: ProductMode.SELL_ONLINE,
      mediaAssetIds: [testAsset1.id, testAsset2.id],
      options: [
        {
          name: 'Colour',
          values: [{ value: 'Red' }, { value: 'Blue' }],
        },
      ],
      variants: [
        {
          sku: `SKU-RED-${Date.now()}`,
          pricePaise: 120000,
          stock: 15,
          optionValues: ['Red'],
        },
        {
          sku: `SKU-BLUE-${Date.now()}`,
          pricePaise: 140000,
          stock: 20,
          optionValues: ['Blue'],
        },
      ],
    });
    expect(createdVariantProd).toBeDefined();
    expect(createdVariantProd!.variants.length).toBe(2);

    try {
      console.log('Testing update variant product: change variant price & stock');
      const uVar = await catalogService.updateProduct(tenantContext, createdVariantProd!.id, {
        name: 'Matrix Variant Product Updated',
        options: [
          {
            name: 'Colour',
            values: [{ value: 'Red' }, { value: 'Blue' }],
          },
        ],
        variants: [
          {
            id: createdVariantProd!.variants[0].id,
            sku: createdVariantProd!.variants[0].sku,
            pricePaise: 125000,
            stock: 18,
            optionValues: ['Red'],
            status: VariantStatus.ACTIVE,
          },
          {
            id: createdVariantProd!.variants[1].id,
            sku: createdVariantProd!.variants[1].sku,
            pricePaise: 145000,
            stock: 22,
            optionValues: ['Blue'],
            status: VariantStatus.ACTIVE,
          },
        ],
        mediaAssetIds: [testAsset1.id, testAsset2.id],
      });
      expect(uVar!.variants.length).toBe(2);
      const red = uVar!.variants[0];
      const blue = uVar!.variants[1];
      const toggle = await catalogService.updateProduct(tenantContext, createdVariantProd!.id, { variants: [
        { id: red.id, sku: red.sku, status: VariantStatus.INACTIVE } as any,
        { id: blue.id, sku: blue.sku } as any,
      ] });
      const inactive = toggle!.variants.find(v => v.id === red.id)!;
      expect(inactive.status).toBe(VariantStatus.INACTIVE);
      expect(inactive.pricePaise).toBe(red.pricePaise);
      expect(inactive.inventory!.stockOnHand).toBe(red.inventory!.stockOnHand);
      expect(inactive.optionValues).toHaveLength(red.optionValues.length);
      const priceOnly = await catalogService.updateProduct(tenantContext, createdVariantProd!.id, { variants: [
        { id: red.id, sku: red.sku, pricePaise: 127777 } as any,
        { id: blue.id, sku: blue.sku } as any,
      ] });
      const edited = priceOnly!.variants.find(v => v.id === red.id)!;
      expect(edited.status).toBe(VariantStatus.INACTIVE);
      expect(edited.pricePaise).toBe(127777);
      expect(edited.inventory!.stockOnHand).toBe(red.inventory!.stockOnHand);

      console.log('Testing update variant product: add second image / replace primary');
      const uImages = await catalogService.updateProduct(tenantContext, createdVariantProd!.id, {
        mediaAssetIds: [testAsset3.id, testAsset1.id],
        media: [
          { mediaAssetId: testAsset3.id, sortOrder: 0 },
          { mediaAssetId: testAsset1.id, sortOrder: 1 },
        ],
      });
      expect(uImages!.media.length).toBe(2);
      expect(uImages!.media[0].mediaAssetId).toBe(testAsset3.id);

    } finally {
      await prisma.product.delete({ where: { id: createdVariantProd!.id } });
    }
  });
});
