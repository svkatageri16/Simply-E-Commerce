import { IsNotEmpty, IsString, IsOptional, IsEmail, Matches, ValidateNested, IsInt, Min, Max, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INDIAN_PHONE_REGEX, INDIAN_PINCODE_REGEX } from '@simply/validation';

export class CheckoutAddressDto {
  @ApiProperty({ example: 'B-402, Sea Green Apartments' })
  @IsNotEmpty()
  @IsString()
  addressLine1: string;

  @ApiPropertyOptional({ example: 'Worli Sea Face' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Opposite Worli Dairy' })
  @IsOptional()
  @IsString()
  landmark?: string;

  @ApiProperty({ example: 'Mumbai' })
  @IsNotEmpty()
  @IsString()
  city: string;

  @ApiProperty({ example: 'Maharashtra' })
  @IsNotEmpty()
  @IsString()
  state: string;

  @ApiProperty({ example: '400018' })
  @IsNotEmpty()
  @IsString()
  @Matches(INDIAN_PINCODE_REGEX, { message: 'Must be a valid 6-digit Indian PIN code' })
  pincode: string;

  @ApiPropertyOptional({ example: 'India', default: 'India' })
  @IsOptional()
  @IsString()
  country?: string;
}

export class DirectCheckoutItemDto {
  @IsString() @IsNotEmpty() productId: string;
  @IsString() @IsNotEmpty() variantId: string;
  @IsInt() @Min(1) @Max(999) quantity: number;
}

export class GuestCheckoutDto {
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9_-]{16,100}$/)
  checkoutKey?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1)
  @ValidateNested({ each: true }) @Type(() => DirectCheckoutItemDto)
  directItems?: DirectCheckoutItemDto[];

  @ApiProperty({ example: 'a3000000-0000-0000-0000-000000000001' })
  @IsNotEmpty()
  @IsString()
  storeId: string;

  @ApiProperty({ example: 'c1000000-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsString()
  cartId?: string;

  @ApiProperty({ example: 'Rohan Mehta' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ example: '+919811122233' })
  @IsNotEmpty()
  @IsString()
  @Matches(INDIAN_PHONE_REGEX, { message: 'Must be a valid 10-digit Indian phone number' })
  phone: string;

  @ApiProperty({ example: 'rohan.mehta@example.com' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ type: CheckoutAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  deliveryAddress?: CheckoutAddressDto;

  @ApiPropertyOptional({ example: 'Please call before delivery' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'WELCOME10' })
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional({ example: 2000 })
  @IsOptional()
  discountPaise?: number;

  @ApiPropertyOptional({ example: 'DELIVERY', enum: ['DELIVERY', 'PICKUP'] })
  @IsOptional()
  @IsString()
  fulfillmentMode?: 'DELIVERY' | 'PICKUP';

  @ApiProperty({ example: 'COD' })
  @IsNotEmpty()
  @IsString()
  paymentMethod: string;
}
