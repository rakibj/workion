import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateClientContactDto } from './dto/create-client-contact.dto';
import { AddClientMemberDto } from './dto/add-client-member.dto';
import { UpdateClientContactDto } from './dto/update-client-contact.dto';
import { ClientContactService } from './services/client-contact.service';

@UseGuards(JwtAuthGuard)
@Controller('clients/:clientId/contacts')
export class ClientContactController {
  constructor(private readonly clientContactService: ClientContactService) {}

  @Get()
  list(
    @Param('clientId') clientId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.clientContactService.list(user, workspace.id, clientId);
  }

  @Post()
  create(
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientContactDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.clientContactService.create(user, workspace.id, clientId, dto);
  }

  @Post('members')
  async addExistingSpaceMember(
    @Param('clientId') clientId: string,
    @Body() dto: AddClientMemberDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.clientContactService.addExistingSpaceMember(
      user,
      workspace.id,
      clientId,
      dto.spaceId,
      dto.userId,
    );
  }

  @Patch(':contactId')
  update(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateClientContactDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.clientContactService.update(
      user,
      workspace.id,
      clientId,
      contactId,
      dto,
    );
  }

  @Delete(':contactId')
  async archive(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.clientContactService.archive(
      user,
      workspace.id,
      clientId,
      contactId,
    );
  }
}
