import { randomUUID } from 'node:crypto';
import { visibleCategoryCount } from './category-counts';
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaClient, ProductStatus, VariantStatus, ProductMode } from '@prisma/client';
import { CreateProductDto, ProductMediaItemDto } from './dto/catalog.dto';
import { TenantContext } from '@simply/types';
import { normalizeSlug } from '@simply/validation';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  private extractMediaInputs(dto: Partial<CreateProductDto>): Array<{
    mediaAssetId: string;
    optionValueId?: string;
    optionValue?: string;
    variantId?: string;
    sortOrder?: number;
  }> {
    const result: Array<{
      mediaAssetId: string;
      optionValueId?: string;
      optionValue?: string;
      variantId?: string;
      sortOrder?: number;
    }> = [];

    const seen = new Set<string>();

    if (dto.media && Array.isArray(dto.media) && dto.media.length > 0) {
      for (const m of dto.media) {
        if (m.mediaAssetId && !seen.has(m.mediaAssetId)) {
          seen.add(m.mediaAssetId);
          result.push(m);
        }
      }
    } else if (dto.mediaAssetIds && Array.isArray(dto.mediaAssetIds)) {
      for (let i = 0; i < dto.mediaAssetIds.length; i++) {
        const id = dto.mediaAssetIds[i];
        if (id && !seen.has(id)) {
          seen.add(id);
          result.push({ mediaAssetId: id, sortOrder: i });
        }
      }
    }

    return result;
  }

  public async createProduct(
    tenant: TenantContext,
    dto: CreateProductDto,
    actorId?: string
  ) {
    // Mode & Price validation
    if (dto.mode === ProductMode.SELL_ONLINE || dto.mode === ProductMode.SELL_AND_ENQUIRY) {
      const hasVariantWithPrice =
        dto.variants &&
        dto.variants.length > 0 &&
        dto.variants.some((v) => v.pricePaise !== undefined && v.pricePaise !== null);
      if (!hasVariantWithPrice) {
        if (dto.pricePaise === undefined || dto.pricePaise === null || isNaN(dto.pricePaise)) {
          throw new BadRequestException('Price is required for products that can be sold online.');
        }
        if (dto.pricePaise < 0) {
          throw new BadRequestException('Price cannot be negative.');
        }
      }
    }

    // Enforce Product Media Limit: 1 to 3 images, at least 1 compulsory
    const mediaInputs = this.extractMediaInputs(dto);
    if (mediaInputs.length < 1) {
      throw new BadRequestException('Every product needs at least one image.');
    }
    if (mediaInputs.length > 3) {
      throw new BadRequestException('A maximum of 3 images is allowed per product.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Serialize catalogue writes for this tenant: plan limits and slug/SKU checks are atomic.
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenant.tenantId} FOR UPDATE`;
      // Enforce subscription plan maxProducts limit if defined
      const activeSub = await tx.subscription.findFirst({
        where: { tenantId: tenant.tenantId, status: { in: ['ACTIVE', 'TRIALING'] } },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      });
      if (activeSub?.plan?.maxProducts && activeSub.plan.maxProducts > 0) {
        const currentProductCount = await tx.product.count({
          where: { tenantId: tenant.tenantId, deletedAt: null },
        });
        if (currentProductCount >= activeSub.plan.maxProducts) {
          throw new BadRequestException(
            `Product limit reached. Your ${activeSub.plan.name} plan allows up to ${activeSub.plan.maxProducts} products. Please upgrade your plan to add more products.`,
          );
        }
      }

      // Derive unique slug within store
      let baseSlug = normalizeSlug(dto.slug || dto.name);
      if (!baseSlug) baseSlug = 'product';
      let slug = baseSlug;
      let counter = 0;
      while (
        await tx.product.findFirst({
          where: { storeId: tenant.storeId, slug, },
        })
      ) {
        if (++counter >= 8) throw new ConflictException('Unable to reserve product identity. Please try another name.');
        slug = `${baseSlug}-${randomUUID()}`;
      }

      // Validate category belongs to this store if provided
      if (dto.categoryId) {
        const categoryExists = await tx.category.findFirst({
          where: { id: dto.categoryId, storeId: tenant.storeId },
        });
        if (!categoryExists) {
          throw new BadRequestException(`Category with ID "${dto.categoryId}" does not exist in this store.`);
        }
      }

      // 1. Create Product root
      const product = await tx.product.create({
        data: {
          tenantId: tenant.tenantId,
          storeId: tenant.storeId,
          categoryId: dto.categoryId ? dto.categoryId : null,
          name: dto.name,
          slug,
          description: dto.description,
          mode: dto.mode as any,
          status: dto.status || ProductStatus.PUBLISHED,
          minOrderQuantity: dto.minOrderQuantity || 1,
          leadTimeDays: dto.leadTimeDays,
          brochureUrl: dto.brochureUrl,
          specifications: dto.specifications,
          enquiryCtaText: dto.enquiryCtaText || 'Request Quotation',
        },
      });

      let baseVariantId: string | null = null;

      // 2. Create Options and Option Values if provided
      const optionValueMap = new Map<string, string>(); // valueString -> OptionValueId
      const optionValueByIdMap = new Map<string, string>();
      const dimensionValues: Map<string, string>[] = []; // optionValueId -> OptionValueId

      if (dto.options && dto.options.length > 0) {
        if (dto.options.length > 3) {
          throw new BadRequestException('A maximum of 3 option dimensions is supported.');
        }
        let totalCombos = 1;
        const optNames = new Set<string>();
        for (const opt of dto.options) {
          const trimmedName = (opt.name || '').trim();
          if (!trimmedName) {
            throw new BadRequestException('Option name is required.');
          }
          if (optNames.has(trimmedName.toLowerCase())) {
            throw new BadRequestException(`Duplicate option name "${trimmedName}".`);
          }
          optNames.add(trimmedName.toLowerCase());

          if (!opt.values || opt.values.length === 0) {
            throw new BadRequestException(`Option "${opt.name}" must have at least one value.`);
          }
          if (opt.values.length > 20) {
            throw new BadRequestException(`Option "${opt.name}" exceeds the limit of 20 values.`);
          }
          const valSet = new Set<string>();
          for (const valDto of opt.values) {
            const vTrim = (valDto.value || '').trim();
            if (!vTrim) {
              throw new BadRequestException(`Empty option value in option "${opt.name}".`);
            }
            if (valSet.has(vTrim.toLowerCase())) {
              throw new BadRequestException(`Duplicate value "${vTrim}" in option "${opt.name}".`);
            }
            valSet.add(vTrim.toLowerCase());
          }
          totalCombos *= opt.values.length;
        }

        if (totalCombos > 100) {
          throw new BadRequestException(
            `This combination would create ${totalCombos} variants. Reduce option values to continue.`
          );
        }
        if (dto.variants?.length !== totalCombos) {
          throw new BadRequestException('Provide every product option combination exactly once.');
        }

        for (let i = 0; i < dto.options.length; i++) {
          const optDto = dto.options[i];
          dimensionValues[i] = new Map();
          const opt = await tx.productOption.create({
            data: {
              tenantId: tenant.tenantId,
              storeId: tenant.storeId,
              productId: product.id,
              name: optDto.name.trim(),
              type: optDto.type as any,
              sortOrder: i,
            },
          });

          for (let j = 0; j < optDto.values.length; j++) {
            const valDto = optDto.values[j];
            const optVal = await tx.productOptionValue.create({
              data: {
                optionId: opt.id,
                value: valDto.value.trim(),
                colorHex: valDto.colorHex,
                sortOrder: j,
              },
            });
            const valTrimmed = valDto.value.trim();
            dimensionValues[i].set(valTrimmed.toLowerCase(), optVal.id);
            optionValueMap.set(valTrimmed, optVal.id);
            optionValueMap.set(valTrimmed.toLowerCase(), optVal.id);
            optionValueByIdMap.set(optVal.id, optVal.id);
            if (valDto.id) {
              optionValueByIdMap.set(valDto.id, optVal.id);
            }
          }
        }
      }

      // 3. Create Variants & Initial Inventory
      const variantMediaMap = new Map<string, string>(); // mediaAssetId -> variantId

      const combinations = new Set<string>();
      if (dto.variants && dto.variants.length > 0) {
        for (let i = 0; i < dto.variants.length; i++) {
          const varDto = dto.variants[i];

          const variantSku = varDto.sku?.trim() || `SKU-${randomUUID()}`;
          const selectedValues = (varDto.optionValues || []).map((value, dimension) =>
            dimensionValues[dimension]?.get(value.trim().toLowerCase()));
          if (dimensionValues.length && (selectedValues.length !== dimensionValues.length || selectedValues.some(id => !id)))
            throw new BadRequestException('Each variant must select one valid value from every option.');
          const combination = selectedValues.join(':');
          if (combinations.has(combination)) throw new BadRequestException('Duplicate variant combination.');
          combinations.add(combination);
          // Check SKU uniqueness within store, including archived variants retained by the unique index.
          const existingSku = await tx.productVariant.findFirst({
            where: { storeId: tenant.storeId, sku: variantSku },
          });
          if (existingSku) {
            throw new ConflictException(`SKU "${varDto.sku}" already exists in this store.`);
          }

          const pricePaise =
            varDto.pricePaise ?? (product.mode === ProductMode.ENQUIRY_ONLY ? 0 : (dto.pricePaise ?? 0));
          const compareAtPaise = varDto.compareAtPricePaise ?? dto.compareAtPricePaise;
          const stockQty = varDto.stock ?? varDto.initialStock ?? 0;

          const variant = await tx.productVariant.create({
            data: {
              tenantId: tenant.tenantId,
              storeId: tenant.storeId,
              productId: product.id,
              sku: variantSku,
              barcode: varDto.barcode,
              pricePaise,
              compareAtPricePaise: compareAtPaise,
              status: varDto.status || VariantStatus.ACTIVE,
              sortOrder: i,
            },
          });

          if (i === 0) baseVariantId = variant.id;

          for (const optValId of selectedValues) {
            if (optValId) await tx.productVariantOptionValue.create({ data: { variantId: variant.id, optionValueId: optValId } });
          }

          // Initialize inventory
          await tx.inventory.create({
            data: {
              tenantId: tenant.tenantId,
              storeId: tenant.storeId,
              variantId: variant.id,
              stockOnHand: stockQty,
              stockReserved: 0,
            },
          });

          if (varDto.mediaAssetId) {
            variantMediaMap.set(varDto.mediaAssetId, variant.id);
          }
        }
      } else {
        // Server-generated identities never reuse a name-based or tiny random SKU space.
        const sku = dto.sku?.trim().toUpperCase() || `SKU-${randomUUID()}`;
        if (await tx.productVariant.findFirst({ where: { storeId: tenant.storeId, sku } }))
          throw new ConflictException('SKU already exists in this store. Choose a different SKU.');

        const initialStock = dto.stock !== undefined ? dto.stock : 0;
        const basePrice = dto.pricePaise !== undefined ? dto.pricePaise : 0;
        const comparePrice = dto.compareAtPricePaise !== undefined ? dto.compareAtPricePaise : null;

        const baseVariant = await tx.productVariant.create({
          data: {
            tenantId: tenant.tenantId,
            storeId: tenant.storeId,
            productId: product.id,
            sku,
            pricePaise: basePrice,
            compareAtPricePaise: comparePrice,
            status: VariantStatus.ACTIVE,
            sortOrder: 0,
          },
        });
        baseVariantId = baseVariant.id;

        await tx.inventory.create({
          data: {
            tenantId: tenant.tenantId,
            storeId: tenant.storeId,
            variantId: baseVariant.id,
            stockOnHand: initialStock,
            stockReserved: 0,
          },
        });
      }

      // 4. Attach Media Assets (Single source of truth: 1 ProductMedia per mediaAssetId)
      for (let i = 0; i < mediaInputs.length; i++) {
        const item = mediaInputs[i];
        const asset = await tx.mediaAsset.findFirst({
          where: { id: item.mediaAssetId, tenantId: tenant.tenantId, storeId: tenant.storeId },
        });
        if (!asset) throw new BadRequestException("Product image is unavailable in this store. Please upload it again.");
        if (asset) {
          let resolvedOptionValueId: string | null = null;
          if (item.optionValueId && optionValueByIdMap.has(item.optionValueId)) {
            resolvedOptionValueId = optionValueByIdMap.get(item.optionValueId)!;
          } else if (item.optionValue) {
            resolvedOptionValueId =
              optionValueMap.get(item.optionValue.trim()) ||
              optionValueMap.get(item.optionValue.trim().toLowerCase()) ||
              null;
          }

          const resolvedVariantId = item.variantId || variantMediaMap.get(item.mediaAssetId) || null;
          if (resolvedVariantId && !await tx.productVariant.findFirst({ where: { id: resolvedVariantId, productId: product.id, tenantId: tenant.tenantId, storeId: tenant.storeId } })) {
            throw new BadRequestException('Media variant does not belong to this product.');
          }

          await tx.productMedia.create({
            data: {
              tenantId: tenant.tenantId,
              storeId: tenant.storeId,
              productId: product.id,
              variantId: resolvedVariantId,
              optionValueId: resolvedOptionValueId,
              mediaAssetId: asset.id,
              storageKey: asset.storageKey,
              publicUrl: asset.publicUrl,
              filePath: asset.storageKey,
              mimeType: asset.mimeType,
              sizeBytes: asset.sizeBytes,
              altText: asset.altText || product.name,
              sortOrder: item.sortOrder !== undefined ? item.sortOrder : i,
            },
          });
        }
      }

      // 5. Create Product Attributes if provided
      if (dto.attributes && Array.isArray(dto.attributes)) {
        for (let i = 0; i < dto.attributes.length; i++) {
          const attr = dto.attributes[i];
          if (attr.name && attr.value) {
            await tx.productAttribute.create({
              data: {
                productId: product.id,
                name: attr.name,
                value: attr.value,
                type: attr.type || 'TEXT',
                sortOrder: attr.sortOrder !== undefined ? attr.sortOrder : i,
              },
            });
          }
        }
      }

      // 5.5 Optional Product Translations
      if (dto.translations && Array.isArray(dto.translations)) {
        for (const trans of dto.translations) {
          if (trans.locale && (trans.name || trans.description)) {
            await tx.productTranslation.upsert({
              where: {
                productId_locale: {
                  productId: product.id,
                  locale: trans.locale,
                },
              },
              create: {
                productId: product.id,
                locale: trans.locale,
                name: trans.name || product.name || '',
                description: trans.description,
                seoTitle: trans.seoTitle,
                seoDescription: trans.seoDescription,
              },
              update: {
                ...(trans.name ? { name: trans.name } : {}),
                description: trans.description,
                seoTitle: trans.seoTitle,
                seoDescription: trans.seoDescription,
              },
            });
          }
        }
      }

      // 6. Audit Log
      await tx.auditLog.create({
        data: {
          actorId,
          tenantId: tenant.tenantId,
          storeId: tenant.storeId,
          action: 'PRODUCT_CREATED',
          entityType: 'Product',
          entityId: product.id,
          metadata: { name: product.name, slug: product.slug },
        },
      });

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          media: {
            include: {
              mediaAsset: true,
              optionValue: { include: { option: true } },
              variant: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
          options: {
            include: {
              values: {
                include: { media: true },
                orderBy: { sortOrder: 'asc' },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
          variants: {
            where: { deletedAt: null },
            include: {
              inventory: true,
              optionValues: { include: { optionValue: { include: { option: true } } } },
              media: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
          category: true,
          translations: true,
        },
      });
    }, { timeout: 15000, maxWait: 10000 }).catch(error => {
      if (error?.code === 'P2002') throw new ConflictException('Product identity or SKU already exists in this store. Choose a different value.');
      throw error;
    });
  }

  public async getProducts(
    tenant: TenantContext,
    params: { search?: string; categoryId?: string; page?: number; limit?: number } = {}
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId: tenant.tenantId,
      storeId: tenant.storeId,
      deletedAt: null,
    };

    if (params.categoryId) {
      if (params.categoryId === 'uncategorized') {
        where.categoryId = null;
      } else {
        where.categoryId = params.categoryId;
      }
    }

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          media: { orderBy: { sortOrder: 'asc' } },
          attributes: { orderBy: { sortOrder: 'asc' } },
          documents: { orderBy: { sortOrder: 'asc' } },
          variants: {
            where: { deletedAt: null },
            include: { inventory: true },
          },
          translations: true,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      hasMore: skip + items.length < total,
    };
  }

  public async getProductById(tenant: TenantContext, productId: string) {
    // Strictly scoped by tenantId & storeId for tenant isolation
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        tenantId: tenant.tenantId,
        storeId: tenant.storeId,
        deletedAt: null,
      },
      include: {
        category: true,
        media: {
          include: {
            mediaAsset: true,
            optionValue: { include: { option: true } },
            variant: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        attributes: { orderBy: { sortOrder: 'asc' } },
        documents: { orderBy: { sortOrder: 'asc' } },
        options: {
          include: {
            values: {
              include: { media: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        variants: {
          where: { deletedAt: null },
          include: {
            inventory: true,
            optionValues: { include: { optionValue: { include: { option: true } } } },
            media: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        translations: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found in this store.`);
    }

    return product;
  }

  public async deleteProduct(tenant: TenantContext, productId: string, actorId?: string) {
    const product = await this.getProductById(tenant, productId);

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.product.update({
        where: { id: product.id },
        data: { deletedAt: new Date(), status: ProductStatus.ARCHIVED },
      });

      await tx.productVariant.updateMany({
        where: { productId: product.id },
        data: { deletedAt: new Date(), status: VariantStatus.DISCONTINUED },
      });

      await tx.inventory.updateMany({
        where: { variant: { productId: product.id } },
        data: { stockOnHand: 0 },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          tenantId: tenant.tenantId,
          storeId: tenant.storeId,
          action: 'PRODUCT_DELETED',
          entityType: 'Product',
          entityId: product.id,
          metadata: { name: product.name, slug: product.slug },
        },
      });

      return deleted;
    });
  }

  public async updateProduct(
    tenant: TenantContext,
    productId: string,
    dto: Partial<CreateProductDto>,
    actorId?: string
  ) {
    const product = await this.getProductById(tenant, productId);

    const hasMediaUpdate = dto.media !== undefined || dto.mediaAssetIds !== undefined;
    const mediaInputs = hasMediaUpdate ? this.extractMediaInputs(dto) : [];
    if (hasMediaUpdate) {
      if (mediaInputs.length < 1) {
        throw new BadRequestException('Every product needs at least one image.');
      }
      if (mediaInputs.length > 3) {
        throw new BadRequestException('A maximum of 3 images is allowed per product.');
      }
    }

    if (dto.categoryId !== undefined && dto.categoryId) {
      const categoryExists = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, storeId: tenant.storeId },
      });
      if (!categoryExists) {
        throw new BadRequestException(`Category with ID "${dto.categoryId}" does not exist in this store.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          name: dto.name ?? product.name,
          description: dto.description !== undefined ? dto.description : product.description,
          mode: (dto.mode as any) ?? product.mode,
          status: (dto.status as any) ?? product.status,
          categoryId: dto.categoryId !== undefined ? (dto.categoryId || null) : product.categoryId,
          minOrderQuantity: dto.minOrderQuantity ?? product.minOrderQuantity,
          leadTimeDays: dto.leadTimeDays !== undefined ? dto.leadTimeDays : product.leadTimeDays,
          brochureUrl: dto.brochureUrl !== undefined ? (dto.brochureUrl || null) : product.brochureUrl,
          specifications: (dto.specifications as any) ?? product.specifications,
          enquiryCtaText: dto.enquiryCtaText ?? product.enquiryCtaText,
        },
      });

      const optionValueMap = new Map<string, string>();
      const optionValueByIdMap = new Map<string, string>();
      const variantMediaMap = new Map<string, string>();

      // 2. Options and Variants update if provided
      if (dto.variants !== undefined) {
        if (dto.options === undefined) {
          for (const option of product.options) for (const value of option.values) {
            optionValueMap.set(value.value.trim(), value.id);
            optionValueMap.set(value.value.trim().toLowerCase(), value.id);
            optionValueByIdMap.set(value.id, value.id);
          }
        }
        // Validation: Combination safety
        if (dto.options && dto.options.length > 0) {
          if (dto.options.length > 3) {
            throw new BadRequestException('A maximum of 3 option dimensions is supported.');
          }
          let totalCombos = 1;
          const optNames = new Set<string>();
          for (const opt of dto.options) {
            const trimmedName = (opt.name || '').trim();
            if (!trimmedName) {
              throw new BadRequestException('Option name is required.');
            }
            if (optNames.has(trimmedName.toLowerCase())) {
              throw new BadRequestException(`Duplicate option name "${trimmedName}".`);
            }
            optNames.add(trimmedName.toLowerCase());

            if (!opt.values || opt.values.length === 0) {
              throw new BadRequestException(`Option "${opt.name}" must have at least one value.`);
            }
            if (opt.values.length > 20) {
              throw new BadRequestException(`Option "${opt.name}" exceeds the limit of 20 values.`);
            }
            const valSet = new Set<string>();
            for (const valDto of opt.values) {
              const vTrim = (valDto.value || '').trim();
              if (!vTrim) {
                throw new BadRequestException(`Empty option value in option "${opt.name}".`);
              }
              if (valSet.has(vTrim.toLowerCase())) {
                throw new BadRequestException(`Duplicate value "${vTrim}" in option "${opt.name}".`);
              }
              valSet.add(vTrim.toLowerCase());
            }
            totalCombos *= opt.values.length;
          }

          if (totalCombos > 100) {
            throw new BadRequestException(
              `This combination would create ${totalCombos} variants. Reduce option values to continue.`
            );
          }
        }

        // Recreate options transactionally
        if (dto.options !== undefined) await tx.productOption.deleteMany({ where: { productId: product.id } });

        if (dto.options && dto.options.length > 0) {
          for (let i = 0; i < dto.options.length; i++) {
            const optDto = dto.options[i];
            const opt = await tx.productOption.create({
              data: {
                tenantId: tenant.tenantId,
                storeId: tenant.storeId,
                productId: product.id,
                name: optDto.name.trim(),
                type: optDto.type as any,
                sortOrder: i,
              },
            });

            for (let j = 0; j < optDto.values.length; j++) {
              const valDto = optDto.values[j];
              const optVal = await tx.productOptionValue.create({
                data: {
                  optionId: opt.id,
                  value: valDto.value.trim(),
                  colorHex: valDto.colorHex,
                  sortOrder: j,
                },
              });
              const valTrimmed = valDto.value.trim();
              optionValueMap.set(valTrimmed, optVal.id);
              optionValueMap.set(valTrimmed.toLowerCase(), optVal.id);
              optionValueByIdMap.set(optVal.id, optVal.id);
              if (valDto.id) {
                optionValueByIdMap.set(valDto.id, optVal.id);
              }
            }
          }
        }

        // Sync variants
        const existingVariants = await tx.productVariant.findMany({
          where: { productId: product.id, deletedAt: null },
          include: { inventory: true },
        });

        const touchedVariantIds = new Set<string>();

        if (dto.variants && dto.variants.length > 0) {
          for (let i = 0; i < dto.variants.length; i++) {
            const varDto = dto.variants[i];
            const matched =
              existingVariants.find(
                (v) => (varDto.id && v.id === varDto.id) || v.sku === varDto.sku
              ) || (existingVariants.length === 1 && dto.variants.length === 1 ? existingVariants[0] : undefined);

            let variantId: string;
            const pricePaise =
              varDto.pricePaise ?? dto.pricePaise ?? matched?.pricePaise ?? 0;
            const compareAtPaise = varDto.compareAtPricePaise !== undefined ? varDto.compareAtPricePaise : dto.compareAtPricePaise !== undefined ? dto.compareAtPricePaise : matched?.compareAtPricePaise;
            const stockQty = varDto.stock ?? varDto.initialStock ?? matched?.inventory?.stockOnHand ?? 0;

            if (matched) {
              variantId = matched.id;
              const targetSku = varDto.sku?.trim() || matched.sku;
              if (targetSku !== matched.sku) {
                const skuConflict = await tx.productVariant.findFirst({
                  where: {
                    storeId: tenant.storeId,
                    sku: targetSku,
                    id: { not: matched.id },
                  },
                });
                if (skuConflict) {
                  throw new ConflictException(`SKU "${targetSku}" already exists in this store.`);
                }
              }
              await tx.productVariant.update({
                where: { id: matched.id },
                data: {
                  sku: targetSku,
                  pricePaise,
                  compareAtPricePaise: compareAtPaise,
                  status: varDto.status || matched.status,
                  sortOrder: i,
                },
              });

              // Re-link option values
              if (varDto.optionValues !== undefined || dto.options !== undefined) await tx.productVariantOptionValue.deleteMany({ where: { variantId: matched.id } });
              if (varDto.optionValues && Array.isArray(varDto.optionValues)) {
                for (const valString of varDto.optionValues) {
                  const optValId =
                    optionValueMap.get(valString.trim()) ||
                    optionValueMap.get(valString.trim().toLowerCase()) ||
                    optionValueByIdMap.get(valString.trim());
                  if (optValId) {
                    await tx.productVariantOptionValue.create({
                      data: { variantId: matched.id, optionValueId: optValId },
                    });
                  }
                }
              }

              // Update inventory
              await tx.inventory.upsert({
                where: { variantId: matched.id },
                create: {
                  tenantId: tenant.tenantId,
                  storeId: tenant.storeId,
                  variantId: matched.id,
                  stockOnHand: stockQty,
                  stockReserved: 0,
                },
                update: {
                  stockOnHand: stockQty,
                },
              });
            } else {
              // Check SKU uniqueness
              const newSku = varDto.sku?.trim() || `SKU-${randomUUID()}`;
              const existingSku = await tx.productVariant.findFirst({
                where: { storeId: tenant.storeId, sku: newSku },
              });
              if (existingSku) {
                throw new ConflictException(`SKU "${varDto.sku}" already exists in this store.`);
              }

              const newVariant = await tx.productVariant.create({
                data: {
                  tenantId: tenant.tenantId,
                  storeId: tenant.storeId,
                  productId: product.id,
                  sku: newSku,
                  pricePaise,
                  compareAtPricePaise: compareAtPaise,
                  status: varDto.status || VariantStatus.ACTIVE,
                  sortOrder: i,
                },
              });
              variantId = newVariant.id;

              if (varDto.optionValues && Array.isArray(varDto.optionValues)) {
                for (const valString of varDto.optionValues) {
                  const optValId =
                    optionValueMap.get(valString.trim()) ||
                    optionValueMap.get(valString.trim().toLowerCase()) ||
                    optionValueByIdMap.get(valString.trim());
                  if (optValId) {
                    await tx.productVariantOptionValue.create({
                      data: { variantId: newVariant.id, optionValueId: optValId },
                    });
                  }
                }
              }

              await tx.inventory.create({
                data: {
                  tenantId: tenant.tenantId,
                  storeId: tenant.storeId,
                  variantId: newVariant.id,
                  stockOnHand: stockQty,
                  stockReserved: 0,
                },
              });
            }

            touchedVariantIds.add(variantId);

            if (varDto.mediaAssetId) {
              variantMediaMap.set(varDto.mediaAssetId, variantId);
            }
          }

          // Soft delete old variants not touched
          for (const ev of existingVariants) {
            if (!touchedVariantIds.has(ev.id)) {
              await tx.productVariant.update({
                where: { id: ev.id },
                data: { deletedAt: new Date(), status: VariantStatus.DISCONTINUED },
              });
              await tx.inventory.updateMany({
                where: { variantId: ev.id },
                data: { stockOnHand: 0 },
              });
            }
          }
        }
      } else {
        // Options were not touched, load existing options into maps for media resolution
        const curOpts = await tx.productOption.findMany({
          where: { productId: product.id },
          include: { values: true },
        });
        for (const o of curOpts) {
          for (const v of o.values) {
            const vTrim = v.value.trim();
            optionValueMap.set(vTrim, v.id);
            optionValueMap.set(vTrim.toLowerCase(), v.id);
            optionValueByIdMap.set(v.id, v.id);
          }
        }

        // Fallback: update variant price, stock or SKU if base fields are supplied
        if (
          dto.pricePaise !== undefined ||
          dto.compareAtPricePaise !== undefined ||
          dto.stock !== undefined ||
          dto.sku !== undefined
        ) {
          const firstVariant = await tx.productVariant.findFirst({
            where: { productId: product.id, deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          });
          if (firstVariant) {
            const varUpdate: any = {};
            if (dto.pricePaise !== undefined) varUpdate.pricePaise = dto.pricePaise;
            if (dto.compareAtPricePaise !== undefined) varUpdate.compareAtPricePaise = dto.compareAtPricePaise;
            if (dto.sku !== undefined && dto.sku.trim()) varUpdate.sku = dto.sku.trim();
            if (Object.keys(varUpdate).length > 0) {
              await tx.productVariant.update({
                where: { id: firstVariant.id },
                data: varUpdate,
              });
            }
            if (dto.stock !== undefined) {
              await tx.inventory.upsert({
                where: { variantId: firstVariant.id },
                create: {
                  tenantId: tenant.tenantId,
                  storeId: tenant.storeId,
                  variantId: firstVariant.id,
                  stockOnHand: dto.stock,
                  stockReserved: 0,
                },
                update: {
                  stockOnHand: dto.stock,
                },
              });
            }
          }
        }
      }

      // 3. Media sync (Single source of truth: 1 ProductMedia per mediaAssetId)
      if (hasMediaUpdate) {
        const allowedAssetIds = mediaInputs.map((m) => m.mediaAssetId);

        // Remove media associations no longer present in mediaAssetIds
        await tx.productMedia.deleteMany({
          where: {
            productId: product.id,
            mediaAssetId: { notIn: allowedAssetIds },
          },
        });

        for (let i = 0; i < mediaInputs.length; i++) {
          const item = mediaInputs[i];
          let resolvedOptionValueId: string | null = null;
          if (item.optionValueId && optionValueByIdMap.has(item.optionValueId)) {
            resolvedOptionValueId = item.optionValueId;
          } else if (item.optionValue) {
            resolvedOptionValueId =
              optionValueMap.get(item.optionValue.trim()) ||
              optionValueMap.get(item.optionValue.trim().toLowerCase()) ||
              null;
          }

          const resolvedVariantId = item.variantId || variantMediaMap.get(item.mediaAssetId) || null;
          if (resolvedVariantId && !await tx.productVariant.findFirst({ where: { id: resolvedVariantId, productId: product.id, tenantId: tenant.tenantId, storeId: tenant.storeId } })) {
            throw new BadRequestException('Media variant does not belong to this product.');
          }
          const sortOrder = item.sortOrder !== undefined ? item.sortOrder : i;

          const existingMedias = await tx.productMedia.findMany({
            where: { productId: product.id, mediaAssetId: item.mediaAssetId },
            orderBy: { sortOrder: 'asc' },
          });

          if (existingMedias.length > 0) {
            await tx.productMedia.update({
              where: { id: existingMedias[0].id },
              data: {
                optionValueId: resolvedOptionValueId,
                variantId: resolvedVariantId,
                sortOrder,
              },
            });

            // Clean up any duplicate rows for the same mediaAssetId
            if (existingMedias.length > 1) {
              await tx.productMedia.deleteMany({
                where: {
                  productId: product.id,
                  mediaAssetId: item.mediaAssetId,
                  id: { not: existingMedias[0].id },
                },
              });
            }
          } else {
            const asset = await tx.mediaAsset.findFirst({
              where: { id: item.mediaAssetId, tenantId: tenant.tenantId, storeId: tenant.storeId },
            });
            if (asset) {
              await tx.productMedia.create({
                data: {
                  tenantId: tenant.tenantId,
                  storeId: tenant.storeId,
                  productId: product.id,
                  variantId: resolvedVariantId,
                  optionValueId: resolvedOptionValueId,
                  mediaAssetId: asset.id,
                  storageKey: asset.storageKey,
                  publicUrl: asset.publicUrl,
                  filePath: asset.storageKey,
                  mimeType: asset.mimeType,
                  sizeBytes: asset.sizeBytes,
                  altText: asset.altText || product.name,
                  sortOrder,
                },
              });
            }
          }
        }
      }

      // 4. Attributes
      if (dto.attributes && Array.isArray(dto.attributes)) {
        await tx.productAttribute.deleteMany({
          where: { productId: product.id },
        });
        for (let i = 0; i < dto.attributes.length; i++) {
          const attr = dto.attributes[i];
          if (attr.name && attr.value) {
            await tx.productAttribute.create({
              data: {
                productId: product.id,
                name: attr.name,
                value: attr.value,
                type: attr.type || 'TEXT',
                sortOrder: attr.sortOrder !== undefined ? attr.sortOrder : i,
              },
            });
          }
        }
      }

      // 4.5 Optional Product Translations
      if (dto.translations && Array.isArray(dto.translations)) {
        for (const trans of dto.translations) {
          if (trans.locale && (trans.name || trans.description)) {
            await tx.productTranslation.upsert({
              where: {
                productId_locale: {
                  productId: product.id,
                  locale: trans.locale,
                },
              },
              create: {
                productId: product.id,
                locale: trans.locale,
                name: trans.name || product.name || '',
                description: trans.description,
                seoTitle: trans.seoTitle,
                seoDescription: trans.seoDescription,
              },
              update: {
                ...(trans.name ? { name: trans.name } : {}),
                description: trans.description,
                seoTitle: trans.seoTitle,
                seoDescription: trans.seoDescription,
              },
            });
          }
        }
      }

      // 5. Audit Log
      await tx.auditLog.create({
        data: {
          actorId,
          tenantId: tenant.tenantId,
          storeId: tenant.storeId,
          action: 'PRODUCT_UPDATED',
          entityType: 'Product',
          entityId: product.id,
          metadata: { name: updated.name },
        },
      });

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          media: {
            include: {
              mediaAsset: true,
              optionValue: { include: { option: true } },
              variant: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
          options: {
            include: {
              values: {
                include: { media: true },
                orderBy: { sortOrder: 'asc' },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
          variants: {
            where: { deletedAt: null },
            include: {
              inventory: true,
              optionValues: { include: { optionValue: { include: { option: true } } } },
              media: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
          category: true,
          translations: true,
        },
      });
    });
  }

  public async addProductDocument(
    tenant: TenantContext,
    productId: string,
    data: {
      title: string;
      docType?: string;
      fileUrl: string;
      fileSizeMb?: number;
      mediaAssetId?: string;
      sortOrder?: number;
    }
  ) {
    await this.getProductById(tenant, productId);
    return this.prisma.productDocument.create({
      data: {
        tenantId: tenant.tenantId,
        storeId: tenant.storeId,
        productId,
        title: data.title,
        docType: data.docType || 'DATASHEET',
        fileUrl: data.fileUrl,
        fileSizeMb: data.fileSizeMb,
        mediaAssetId: data.mediaAssetId,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  public async removeProductDocument(
    tenant: TenantContext,
    productId: string,
    docId: string
  ) {
    await this.getProductById(tenant, productId);
    const existing = await this.prisma.productDocument.findFirst({
      where: { id: docId, productId, storeId: tenant.storeId },
    });
    if (!existing) {
      throw new NotFoundException('Product document not found in this store.');
    }
    return this.prisma.productDocument.delete({
      where: { id: docId },
    });
  }

  public async duplicateProduct(tenant: TenantContext, productId: string, actorId?: string) {
    const original = await this.getProductById(tenant, productId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenant.tenantId} FOR UPDATE`;
      const sub = await tx.subscription.findFirst({ where: { tenantId: tenant.tenantId, status: { in: ['ACTIVE', 'TRIALING'] } }, orderBy: { createdAt: 'desc' }, include: { plan: true } });
      if (sub?.plan.maxProducts && await tx.product.count({ where: { tenantId: tenant.tenantId, deletedAt: null } }) >= sub.plan.maxProducts)
        throw new BadRequestException('Product limit reached. Upgrade your plan before duplicating a product.');
      const duplicated = await tx.product.create({ data: {
        tenantId: tenant.tenantId, storeId: tenant.storeId, categoryId: original.categoryId,
        name: `${original.name} (Copy)`, slug: `${original.slug}-copy-${randomUUID()}`,
        description: original.description, mode: original.mode, status: ProductStatus.DRAFT,
        minOrderQuantity: original.minOrderQuantity, leadTimeDays: original.leadTimeDays,
        brochureUrl: original.brochureUrl, specifications: original.specifications || undefined,
        enquiryCtaText: original.enquiryCtaText,
      } });
      const values = new Map<string, string>(), variants = new Map<string, string>();
      for (const option of original.options) {
        const created = await tx.productOption.create({ data: { tenantId: tenant.tenantId, storeId: tenant.storeId, productId: duplicated.id, name: option.name, type: option.type, sortOrder: option.sortOrder } });
        for (const value of option.values) {
          const next = await tx.productOptionValue.create({ data: { optionId: created.id, value: value.value, colorHex: value.colorHex, sortOrder: value.sortOrder } });
          values.set(value.id, next.id);
        }
      }
      for (const v of original.variants) {
        const created = await tx.productVariant.create({ data: {
          tenantId: tenant.tenantId, storeId: tenant.storeId, productId: duplicated.id,
          sku: `COPY-${randomUUID()}`, barcode: v.barcode, pricePaise: v.pricePaise, compareAtPricePaise: v.compareAtPricePaise,
          costPricePaise: v.costPricePaise, status: v.status, sortOrder: v.sortOrder,
          weightGrams: v.weightGrams, lengthCm: v.lengthCm, widthCm: v.widthCm, heightCm: v.heightCm,
        } });
        variants.set(v.id, created.id);
        for (const link of v.optionValues) {
          const id = values.get(link.optionValueId);
          if (id) await tx.productVariantOptionValue.create({ data: { variantId: created.id, optionValueId: id } });
        }
        await tx.inventory.create({ data: { tenantId: tenant.tenantId, storeId: tenant.storeId, variantId: created.id, stockOnHand: v.inventory?.stockOnHand || 0, stockReserved: 0 } });
      }
      for (const m of original.media) {
        await tx.productMedia.create({ data: {
          tenantId: tenant.tenantId, storeId: tenant.storeId, productId: duplicated.id,
          variantId: m.variantId ? variants.get(m.variantId) : null,
          optionValueId: m.optionValueId ? values.get(m.optionValueId) : null,
          mediaAssetId: m.mediaAssetId, storageKey: m.storageKey, publicUrl: m.publicUrl,
          filePath: m.filePath, mimeType: m.mimeType, sizeBytes: m.sizeBytes,
          width: m.width, height: m.height, altText: m.altText, sortOrder: m.sortOrder,
        } });
      }
      for (const attr of original.attributes) await tx.productAttribute.create({ data: { productId: duplicated.id, name: attr.name, value: attr.value, type: attr.type, sortOrder: attr.sortOrder } });
      for (const doc of original.documents) await tx.productDocument.create({ data: { tenantId: tenant.tenantId, storeId: tenant.storeId, productId: duplicated.id, mediaAssetId: doc.mediaAssetId, title: doc.title, docType: doc.docType, fileUrl: doc.fileUrl, fileSizeMb: doc.fileSizeMb, sortOrder: doc.sortOrder } });
      for (const tr of original.translations) await tx.productTranslation.create({ data: { productId: duplicated.id, locale: tr.locale, name: tr.name, description: tr.description, seoTitle: tr.seoTitle, seoDescription: tr.seoDescription } });
      await tx.auditLog.create({ data: { actorId, tenantId: tenant.tenantId, storeId: tenant.storeId, action: 'PRODUCT_DUPLICATED', entityType: 'Product', entityId: duplicated.id, metadata: { originalId: original.id, status: 'DRAFT' } } });
      return duplicated;
    }, { timeout: 15000, maxWait: 10000 });
  }

  public async getCategories(tenant: TenantContext) {
    const categories = await this.prisma.category.findMany({
      where: { storeId: tenant.storeId, tenantId: tenant.tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: { where: { storeId: tenant.storeId, tenantId: tenant.tenantId, deletedAt: null } } } } },
    });
    const visible = await this.prisma.category.findMany({
      where: { id: { in: categories.map(c => c.id) }, storeId: tenant.storeId, tenantId: tenant.tenantId },
      select: { id: true, _count: { select: visibleCategoryCount(tenant.storeId, tenant.tenantId) } },
    });
    const counts = new Map(visible.map(c => [c.id, c._count.products]));
    return categories.map(c => ({ ...c, totalProductCount: c._count.products, visibleProductCount: counts.get(c.id) || 0 }));
  }

  public async createCategory(tenant: TenantContext, dto: { name: string; description?: string }) {
    const baseSlug = normalizeSlug(dto.name);
    let slug = baseSlug;
    let counter = 1;
    while (await this.prisma.category.findFirst({ where: { storeId: tenant.storeId, slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    return this.prisma.category.create({
      data: {
        tenantId: tenant.tenantId,
        storeId: tenant.storeId,
        name: dto.name,
        slug,
        description: dto.description,
      },
    });
  }

  public async updateCategory(
    tenant: TenantContext,
    categoryId: string,
    dto: { name?: string; description?: string }
  ) {
    const existing = await this.prisma.category.findFirst({
      where: { id: categoryId, storeId: tenant.storeId },
    });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    const data: any = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
      data.slug = normalizeSlug(dto.name);
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    return this.prisma.category.update({
      where: { id: categoryId },
      data,
    });
  }

  public async deleteCategory(tenant: TenantContext, categoryId: string) {
    const existing = await this.prisma.category.findFirst({
      where: { id: categoryId, storeId: tenant.storeId },
    });
    if (!existing) {
      throw new NotFoundException('Category not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // Unlink products so they become Uncategorized
      await tx.product.updateMany({
        where: { categoryId, storeId: tenant.storeId },
        data: { categoryId: null },
      });

      return tx.category.delete({
        where: { id: categoryId },
      });
    });
  }
}
