import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { StorageProvider } from '@simply/storage';
import { TenantContext } from '@simply/types';
import { validateProductImageBuffer } from '@simply/validation';
import * as path from 'path';

export const STORAGE_PROVIDER_TOKEN = 'STORAGE_PROVIDER';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaClient,
    @Inject(STORAGE_PROVIDER_TOKEN) private readonly storageProvider: StorageProvider
  ) {}

  public async uploadProductMedia(
    tenant: TenantContext,
    file: {
      buffer: Buffer;
      originalFilename: string;
      mimeType: string;
    },
    productId: string,
    variantId?: string,
    altText?: string
  ) {
    // 1. Verify product belongs to current tenant
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: tenant.tenantId, storeId: tenant.storeId },
    });
    if (!product) throw new NotFoundException('Product not found in this store.');
    if (variantId && !await this.prisma.productVariant.findFirst({ where: { id: variantId, productId, tenantId: tenant.tenantId, storeId: tenant.storeId, deletedAt: null } })) {
      throw new NotFoundException('Product variant not found in this store.');
    }

    // 2. Validate real binary magic bytes & file size (5MB limit)
    const validation = validateProductImageBuffer(file.buffer, file.originalFilename);
    if (!validation.isValid || !validation.mimeType) {
      throw new BadRequestException(validation.error || 'Invalid product image file.');
    }

    // Ensure filename has proper extension matching verified MIME type
    let safeFilename = file.originalFilename || `image${validation.extension}`;
    if (!path.extname(safeFilename)) {
      safeFilename = `${safeFilename}${validation.extension}`;
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.buffer.length > MAX_SIZE) {
      throw new BadRequestException(`File size ${file.buffer.length} bytes exceeds 5MB limit.`);
    }

    // 3. Upload via Storage Provider (strictly filesystem/cloud, never PostgreSQL binary)
    const uploadResult = await this.storageProvider.upload({
      tenantId: tenant.tenantId,
      storeId: tenant.storeId,
      buffer: file.buffer,
      originalFilename: safeFilename,
      mimeType: validation.mimeType,
      prefix: 'products',
    });

    // 4. Save metadata only in PostgreSQL
    const media = await this.prisma.productMedia.create({
      data: {
        tenantId: tenant.tenantId,
        storeId: tenant.storeId,
        productId,
        variantId: variantId || null,
        storageKey: uploadResult.storageKey,
        publicUrl: uploadResult.publicUrl,
        filePath: uploadResult.filePath,
        mimeType: uploadResult.mimeType,
        sizeBytes: uploadResult.sizeBytes,
        altText: altText || product.name,
      },
    });

    return media;
  }

  /**
   * Upload standalone media asset (for product creation before product ID exists).
   * Persists to storage provider and creates MediaAsset record.
   */
  public async uploadStandaloneMediaAsset(
    tenant: TenantContext,
    file: {
      buffer: Buffer;
      originalFilename: string;
      mimeType: string;
    },
    altText?: string
  ) {
    // 1. Validate real binary magic bytes & file size (5MB limit)
    const validation = validateProductImageBuffer(file.buffer, file.originalFilename);
    if (!validation.isValid || !validation.mimeType) {
      throw new BadRequestException(validation.error || 'Invalid product image file.');
    }

    // Ensure filename has proper extension matching verified MIME type
    let safeFilename = file.originalFilename || `image${validation.extension}`;
    if (!path.extname(safeFilename)) {
      safeFilename = `${safeFilename}${validation.extension}`;
    }

    const uploadResult = await this.storageProvider.upload({
      tenantId: tenant.tenantId,
      storeId: tenant.storeId,
      buffer: file.buffer,
      originalFilename: safeFilename,
      mimeType: validation.mimeType,
      prefix: 'products',
    });

    const mediaAsset = await this.prisma.mediaAsset.create({
      data: {
        tenantId: tenant.tenantId,
        storeId: tenant.storeId,
        storageProvider: this.storageProvider.kind || 'LOCAL',
        storageKey: uploadResult.storageKey,
        publicUrl: uploadResult.publicUrl,
        fileName: safeFilename,
        mimeType: uploadResult.mimeType,
        sizeBytes: uploadResult.sizeBytes,
        altText: altText || null,
      },
    });

    return mediaAsset;
  }

  /**
   * Upload store brand asset (logo, banner, favicon) with 5MB limit and MIME validation.
   */
  public async uploadStoreAsset(
    tenant: TenantContext,
    file: {
      buffer: Buffer;
      originalFilename: string;
      mimeType: string;
    },
    type: 'logo' | 'banner' | 'favicon'
  ) {
    const validation = validateProductImageBuffer(file.buffer, file.originalFilename);
    if (!validation.isValid || !validation.mimeType) throw new BadRequestException(validation.error || 'Use a JPEG, PNG, WebP or AVIF image.');

    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.buffer.length > MAX_SIZE) {
      throw new BadRequestException(`Asset file size ${file.buffer.length} bytes exceeds 5MB limit.`);
    }

    const uploadResult = await this.storageProvider.upload({
      tenantId: tenant.tenantId,
      storeId: tenant.storeId,
      buffer: file.buffer,
      originalFilename: file.originalFilename,
      mimeType: validation.mimeType,
      prefix: 'branding',
    });

    // If logo or favicon, update StoreBranding directly
    if (type === 'logo') {
      await this.prisma.storeBranding.upsert({
        where: { storeId: tenant.storeId },
        update: { logoUrl: uploadResult.publicUrl },
        create: {
          storeId: tenant.storeId,
          logoUrl: uploadResult.publicUrl,
        },
      });
    } else if (type === 'favicon') {
      await this.prisma.storeBranding.upsert({
        where: { storeId: tenant.storeId },
        update: { faviconUrl: uploadResult.publicUrl },
        create: {
          storeId: tenant.storeId,
          faviconUrl: uploadResult.publicUrl,
        },
      });
    }

    return {
      type,
      publicUrl: uploadResult.publicUrl,
      storageKey: uploadResult.storageKey,
      sizeBytes: uploadResult.sizeBytes,
      mimeType: uploadResult.mimeType,
    };
  }

  public async deleteProductMedia(tenant: TenantContext, mediaId: string) {
    const media = await this.prisma.productMedia.findFirst({
      where: { id: mediaId, tenantId: tenant.tenantId, storeId: tenant.storeId },
    });
    if (!media) throw new NotFoundException('Media item not found.');

    // Delete physical file from storage
    await this.storageProvider.delete(media.storageKey);

    // Delete database record
    await this.prisma.productMedia.delete({
      where: { id: media.id },
    });

    return { success: true, message: 'Media deleted successfully.' };
  }

  public getStorageProvider(): StorageProvider {
    return this.storageProvider;
  }
}
