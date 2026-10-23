import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant, CurrentUser } from '../../common/decorators';
import { TenantContext, AuthenticatedUser } from '@simply/types';
import * as fs from 'fs';

@ApiTags('Seller Business Verification')
@Controller('seller/verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @ApiBearerAuth()
  @UseGuards(TenantGuard)
  @Get()
  @ApiOperation({ summary: 'Get current merchant business verification details and requirements' })
  async getVerification(@CurrentTenant() tenant: TenantContext) {
    return this.verificationService.getVerification(tenant.tenantId);
  }

  @ApiBearerAuth()
  @UseGuards(TenantGuard)
  @Patch('profile')
  @ApiOperation({ summary: 'Update business entity type and registration metadata' })
  async updateProfile(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      businessType?: string;
      gstRegistered?: boolean;
      gstin?: string;
      panNumber?: string;
      udyamNumber?: string;
    },
  ) {
    return this.verificationService.updateProfile(tenant.tenantId, user.userId, body);
  }

  @ApiBearerAuth()
  @UseGuards(TenantGuard)
  @Post('documents')
  @ApiOperation({ summary: 'Upload or replace a business verification document' })
  async uploadDocument(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      type: string;
      documentNumber?: string;
      filename: string;
      mimeType: string;
      base64Data: string;
    },
  ) {
    return this.verificationService.uploadDocument(tenant.tenantId, user.userId, body);
  }

  @ApiBearerAuth()
  @UseGuards(TenantGuard)
  @Get('documents/:id/download')
  @ApiOperation({ summary: 'Securely download merchant business document' })
  async downloadDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res() res: any,
  ) {
    const { filePath, mimeType, filename } =
      await this.verificationService.getDocumentStream(id, tenant.tenantId, false);

    res.header('Content-Type', mimeType);
    res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.header('Cache-Control', 'private, no-store');

    const stream = fs.createReadStream(filePath);
    return stream.pipe(res);
  }

  @ApiBearerAuth()
  @UseGuards(TenantGuard)
  @Get('documents/:id/view')
  @ApiOperation({ summary: 'Securely preview merchant business document inline' })
  async viewDocument(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Res() res: any,
  ) {
    const { filePath, mimeType, filename } =
      await this.verificationService.getDocumentStream(id, tenant.tenantId, false);

    res.header('Content-Type', mimeType);
    res.header('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.header('Cache-Control', 'private, no-store');

    const stream = fs.createReadStream(filePath);
    return stream.pipe(res);
  }
}
