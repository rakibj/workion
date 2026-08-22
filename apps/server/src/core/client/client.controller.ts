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
import { CreateClientDto } from './dto/create-client.dto';
import { LinkClientSpaceDto } from './dto/link-client-space.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientService } from './services/client.service';

@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Post()
  create(
    @Body() dto: CreateClientDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.clientService.create(user, workspace.id, dto);
  }

  @Get()
  list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.clientService.list(user, workspace.id);
  }

  @Get('by-space/:spaceId')
  getBySpace(
    @Param('spaceId') spaceId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.clientService.getBySpace(user, workspace.id, spaceId);
  }

  @Get(':clientId')
  get(
    @Param('clientId') clientId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.clientService.get(user, workspace.id, clientId);
  }

  @Patch(':clientId')
  update(
    @Param('clientId') clientId: string,
    @Body() dto: UpdateClientDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.clientService.update(user, workspace.id, clientId, dto);
  }

  @Delete(':clientId')
  archive(
    @Param('clientId') clientId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.clientService.archive(user, workspace.id, clientId);
  }

  @Post(':clientId/spaces')
  async linkSpace(
    @Param('clientId') clientId: string,
    @Body() dto: LinkClientSpaceDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.clientService.linkSpace(
      user,
      workspace.id,
      clientId,
      dto.spaceId,
    );
  }

  @Delete(':clientId/spaces/:spaceId')
  async unlinkSpace(
    @Param('clientId') clientId: string,
    @Param('spaceId') spaceId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.clientService.unlinkSpace(user, workspace.id, clientId, spaceId);
  }
}
