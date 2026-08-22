import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../common/helpers/types/permission';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { CloudGuard } from '../auth/guards/cloud.guard';
import { BillingService } from './billing.service';
import { CheckoutDto } from './dto/checkout.dto';

@UseGuards(JwtAuthGuard, CloudGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Public()
  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  @HttpCode(HttpStatus.OK)
  @Post('checkout')
  async checkout(
    @Body() dto: CheckoutDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.requireOwner(user);
    return this.billingService.createCheckout(workspace, user, dto.variantId);
  }

  @Get('portal')
  async portal(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.requireOwner(user);
    return this.billingService.getPortal(workspace.id);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('lemon-squeezy/webhook')
  async webhook(@Req() req: any, @Headers('x-signature') signature?: string) {
    await this.billingService.handleWebhook(req.rawBody, signature);
    return { received: true };
  }

  private requireOwner(user: User) {
    if (user.role !== UserRole.OWNER) throw new ForbiddenException();
  }
}
