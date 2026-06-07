import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageVerificationService } from './services/page-verification.service';
import {
  CreateVerificationDto,
  RejectApprovalDto,
  UpdateVerificationDto,
  VerificationInfoDto,
  VerificationListDto,
} from './dto/page-verification.dto';

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class PageVerificationController {
  constructor(
    private readonly pageVerificationService: PageVerificationService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('verification-info')
  async getVerificationInfo(
    @Body() dto: VerificationInfoDto,
    @AuthUser() user: User,
  ) {
    return this.pageVerificationService.getVerificationInfo(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create-verification')
  async createVerification(
    @Body() dto: CreateVerificationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pageVerificationService.createVerification(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update-verification')
  async updateVerification(
    @Body() dto: UpdateVerificationDto,
    @AuthUser() user: User,
  ) {
    return this.pageVerificationService.updateVerification(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete-verification')
  async deleteVerification(
    @Body() dto: VerificationInfoDto,
    @AuthUser() user: User,
  ) {
    return this.pageVerificationService.deleteVerification(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify')
  async verifyPage(
    @Body() dto: VerificationInfoDto,
    @AuthUser() user: User,
  ) {
    return this.pageVerificationService.verifyPage(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('submit-for-approval')
  async submitForApproval(
    @Body() dto: VerificationInfoDto,
    @AuthUser() user: User,
  ) {
    return this.pageVerificationService.submitForApproval(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reject-approval')
  async rejectApproval(
    @Body() dto: RejectApprovalDto,
    @AuthUser() user: User,
  ) {
    return this.pageVerificationService.rejectApproval(
      dto.pageId,
      dto.comment,
      user,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('mark-obsolete')
  async markObsolete(
    @Body() dto: VerificationInfoDto,
    @AuthUser() user: User,
  ) {
    return this.pageVerificationService.markObsolete(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verifications')
  async getVerificationList(
    @Body() dto: VerificationListDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pageVerificationService.getVerificationList(dto, workspace);
  }
}
