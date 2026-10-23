import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  Matches,
  IsArray,
} from 'class-validator';

export class CreateAdminPlanDto {
  @IsString() @Length(1, 120) name: string;
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]+$/)
  @Length(1, 100)
  code?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsInt() @Min(0) @Max(2147483647) pricePaise: number;
  @IsOptional() @IsIn(['MONTHLY', 'YEARLY']) billingCycle?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) maxProducts?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) maxStaff?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) maxStorageMb?: number;
  @IsOptional() @IsBoolean() customDomainAllowed?: boolean;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) gstBasisPoints?: number;
  @IsOptional() @IsIn(['ACTIVE', 'COMING_SOON', 'CONTACT_SALES', 'INACTIVE']) status?: string;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsString() @Length(0, 50) badge?: string;
  @IsOptional() @IsBoolean() isPurchasable?: boolean;
  @IsOptional() features?: any;
  @IsOptional() @IsArray() highlights?: any[];
}
export class UpdateAdminPlanDto extends PartialType(CreateAdminPlanDto) {}
