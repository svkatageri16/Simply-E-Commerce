import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OrdersService } from './orders.service';
import { GuestCheckoutDto } from './dto/checkout.dto';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant, Public } from '../../common/decorators';
import { TenantContext } from '@simply/types';

@ApiTags('Orders & Checkout')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // 1. Guest-First Checkout (Public)
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: Number(process.env.CHECKOUT_RATE_LIMIT) || (process.env.NODE_ENV === 'test' ? 50000 : 20), ttl: 60000 } })
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Guest-first checkout with address and stock reservation' })
  async checkout(@Body() dto: GuestCheckoutDto) {
    return this.ordersService.createGuestOrder(dto);
  }

  @Public()
  @Post('coupon/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Server-side asynchronous coupon validation' })
  async validateCoupon(
    @Body() body: { storeId: string; code: string; subtotalPaise: number }
  ) {
    return this.ordersService.validateCoupon(
      body.storeId,
      body.code,
      Number(body.subtotalPaise) || 0
    );
  }

  @Public()
  @Get('track/:orderNumber')
  @ApiOperation({ summary: 'Secure public guest order tracking with cryptographic tracking token' })
  async trackOrder(
    @Param('orderNumber') orderNumber: string,
    @Query('t') token?: string
  ) {
    return this.ordersService.trackOrder(orderNumber, token);
  }

  // 2. Merchant Order Management (Backward Compatibility - Canonical is /seller/orders)
  @UseGuards(TenantGuard)
  @Post(':id/out-for-delivery')
  async markOutForDelivery(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.ordersService.markOutForDelivery(id, tenant);
  }

  @ApiBearerAuth()
  @UseGuards(TenantGuard)
  @Get()
  @ApiOperation({
    summary: '[Deprecated/Compat] List orders for store - Canonical route is GET /seller/orders',
    deprecated: true,
  })
  async getOrders(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: any
  ) {
    return this.ordersService.getOrders(tenant, query);
  }

  @ApiBearerAuth()
  @UseGuards(TenantGuard)
  @Get(':id')
  @ApiOperation({
    summary: '[Deprecated/Compat] Get order details - Canonical route is GET /seller/orders/:id',
    deprecated: true,
  })
  async getOrderById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string
  ) {
    return this.ordersService.getOrderById(id, tenant);
  }
}
