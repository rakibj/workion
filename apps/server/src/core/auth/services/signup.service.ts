import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto';
import { WorkspaceService } from '../../workspace/services/workspace.service';
import { CreateWorkspaceDto } from '../../workspace/dto/create-workspace.dto';
import { CreateAdminUserDto } from '../dto/create-admin-user.dto';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { UserRole } from '../../../common/helpers/types/permission';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { SpaceInviteLinkService } from '../../space/services/space-invite-link.service';
import { SpaceMemberService } from '../../space/services/space-member.service';
import { GuestSignupDto } from '../../../core/space/dto/space-invite-link.dto';

@Injectable()
export class SignupService {
  constructor(
    private userRepo: UserRepo,
    private workspaceService: WorkspaceService,
    private groupUserRepo: GroupUserRepo,
    private spaceInviteLinkService: SpaceInviteLinkService,
    private spaceMemberService: SpaceMemberService,
    @InjectKysely() private readonly db: KyselyDB,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async signup(
    createUserDto: CreateUserDto,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<User> {
    const userCheck = await this.userRepo.findByEmail(
      createUserDto.email,
      workspaceId,
    );

    if (userCheck) {
      throw new BadRequestException(
        'An account with this email already exists in this workspace',
      );
    }

    const user = await executeTx(
      this.db,
      async (trx) => {
        // create user
        const user = await this.userRepo.insertUser(
          {
            ...createUserDto,
            workspaceId: workspaceId,
          },
          trx,
        );

        // add user to workspace
        await this.workspaceService.addUserToWorkspace(
          user.id,
          workspaceId,
          undefined,
          trx,
        );

        // add user to default group
        await this.groupUserRepo.addUserToDefaultGroup(
          user.id,
          workspaceId,
          trx,
        );
        return user;
      },
      trx,
    );

    this.auditService.log({
      event: AuditEvent.USER_CREATED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      changes: {
        after: {
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      metadata: {
        source: 'signup',
      },
    });

    return user;
  }

  async guestSignup(
    dto: GuestSignupDto,
    workspaceId: string,
  ): Promise<User> {
    const link = await this.spaceInviteLinkService.validateToken(dto.token);

    const existing = await this.userRepo.findByEmail(dto.email, workspaceId);
    if (existing) {
      throw new BadRequestException(
        'An account with this email already exists in this workspace',
      );
    }

    const user = await executeTx(this.db, async (trx) => {
      const newUser = await this.userRepo.insertUser(
        {
          name: dto.name ?? dto.email.split('@')[0],
          email: dto.email,
          password: dto.password,
          workspaceId,
          emailVerifiedAt: new Date(),
        },
        trx,
      );

      await this.workspaceService.addUserToWorkspace(
        newUser.id,
        workspaceId,
        UserRole.GUEST,
        trx,
      );

      if (link.spaceRole !== 'none') {
        await this.spaceMemberService.addUserToSpace(
          newUser.id,
          link.spaceId,
          link.spaceRole,
          workspaceId,
          trx,
        );
      }

      await this.spaceInviteLinkService.incrementUseCount(link.id, trx);

      return newUser;
    });

    this.auditService.log({
      event: AuditEvent.USER_CREATED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      changes: {
        after: { name: user.name, email: user.email, role: UserRole.GUEST },
      },
      metadata: { source: 'guest-invite' },
    });

    return user;
  }

  async guestJoin(
    token: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const link = await this.spaceInviteLinkService.validateToken(token);

    await this.spaceInviteLinkService.checkAlreadyMember(userId, link.spaceId);

    await executeTx(this.db, async (trx) => {
      if (link.spaceRole !== 'none') {
        await this.spaceMemberService.addUserToSpace(
          userId,
          link.spaceId,
          link.spaceRole,
          workspaceId,
          trx,
        );
      }

      await this.spaceInviteLinkService.incrementUseCount(link.id, trx);
    });
  }

  async initialSetup(
    createAdminUserDto: CreateAdminUserDto,
    trx?: KyselyTransaction,
  ) {
    let user: User,
      workspace: Workspace = null;

    await executeTx(
      this.db,
      async (trx) => {
        // create user
        user = await this.userRepo.insertUser(
          {
            name: createAdminUserDto.name,
            email: createAdminUserDto.email,
            password: createAdminUserDto.password,
            role: UserRole.OWNER,
            emailVerifiedAt: new Date(),
          },
          trx,
        );

        // create workspace with full setup
        const workspaceData: CreateWorkspaceDto = {
          name: createAdminUserDto.workspaceName || 'My workspace',
          hostname: createAdminUserDto.hostname,
        };

        workspace = await this.workspaceService.create(
          user,
          workspaceData,
          trx,
        );

        user.workspaceId = workspace.id;
        return user;
      },
      trx,
    );

    return { user, workspace };
  }
}
