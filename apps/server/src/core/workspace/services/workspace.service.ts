import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LicenseCheckService } from '../../../integrations/environment/license-check.service';
import { UserSessionRepo } from '@docmost/db/repos/session/user-session.repo';
import { CreateWorkspaceDto } from '../dto/create-workspace.dto';
import { UpdateWorkspaceDto } from '../dto/update-workspace.dto';
import { SpaceService } from '../../space/services/space.service';
import { CreateSpaceDto } from '../../space/dto/create-space.dto';
import { SpaceRole, UserRole } from '../../../common/helpers/types/permission';
import { SpaceMemberService } from '../../space/services/space-member.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { UpdateWorkspaceUserRoleDto } from '../dto/update-workspace-user-role.dto';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { UserTokenRepo } from '@docmost/db/repos/user-token/user-token.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { DomainService } from '../../../integrations/environment/domain.service';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import { addDays } from 'date-fns';
import { DISALLOWED_HOSTNAMES, WorkspaceStatus } from '../workspace.constants';
import { isAdminActingOnOwner } from '../workspace.util';
import { v4 } from 'uuid';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { Queue } from 'bullmq';
import {
  generateRandomSuffixNumbers,
  diffAuditTrackedFields,
  nanoIdGen,
} from '../../../common/helpers';
import { isPageEmbeddingsTableExists } from '@docmost/db/helpers/helpers';
import { CursorPaginationResult } from '@docmost/db/pagination/cursor-pagination';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { WatcherRepo } from '@docmost/db/repos/watcher/watcher.repo';
import { FavoriteRepo } from '@docmost/db/repos/favorite/favorite.repo';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { MailService } from '../../../integrations/mail/mail.service';
import { SessionService } from '../../session/session.service';
import { CreateAdminUserDto } from '../../auth/dto/create-admin-user.dto';
import { UserTokenType } from '../../auth/auth.constants';
import {
  computeEmailSignature,
  verifyEmailSignature,
} from '../../auth/auth.util';
import { WorkionPlan } from '../../../common/entitlement/entitlement';
import { EntitlementService } from '../../../common/entitlement/entitlement.service';
import EmailVerificationEmail from '@docmost/transactional/emails/email-verification-email';

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private workspaceRepo: WorkspaceRepo,
    private spaceService: SpaceService,
    private spaceMemberService: SpaceMemberService,
    private groupRepo: GroupRepo,
    private groupUserRepo: GroupUserRepo,
    private userRepo: UserRepo,
    private environmentService: EnvironmentService,
    private domainService: DomainService,
    private licenseCheckService: LicenseCheckService,
    private shareRepo: ShareRepo,
    private watcherRepo: WatcherRepo,
    private favoriteRepo: FavoriteRepo,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private attachmentQueue: Queue,
    @InjectQueue(QueueName.BILLING_QUEUE) private billingQueue: Queue,
    @InjectQueue(QueueName.AI_QUEUE) private aiQueue: Queue,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    private userSessionRepo: UserSessionRepo,
    private userTokenRepo: UserTokenRepo,
    private mailService: MailService,
    private sessionService: SessionService,
    private entitlementService: EntitlementService,
  ) {}

  async findById(workspaceId: string) {
    return this.workspaceRepo.findById(workspaceId);
  }

  async getWorkspaceInfo(workspaceId: string) {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return {
      ...workspace,
      enabledModules: this.entitlementService.getFeatures(workspace.plan),
    };
  }

  async getWorkspacePublicData(workspaceId: string) {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select(['id', 'name', 'logo', 'hostname', 'enforceSso', 'licenseKey', 'plan'])
      .select((eb) =>
        jsonArrayFrom(
          eb
            .selectFrom('authProviders')
            .select([
              'authProviders.id',
              'authProviders.name',
              'authProviders.type',
            ])
            .where('authProviders.isEnabled', '=', true)
            .where('workspaceId', '=', workspaceId),
        ).as('authProviders'),
      )
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const { licenseKey, plan, ...rest } = workspace;

    return rest;
  }

  async create(
    user: User,
    createWorkspaceDto: CreateWorkspaceDto,
    trx?: KyselyTransaction,
  ) {
    let trialEndAt = undefined;

    const createdWorkspace = await executeTx(
      this.db,
      async (trx) => {
        let hostname = undefined;
        let status = undefined;
        let plan = undefined;
        let billingEmail = undefined;
        let settings = undefined;

        if (this.environmentService.isCloud()) {
          // generate unique hostname
          hostname = await this.generateHostname(
            createWorkspaceDto.hostname ?? createWorkspaceDto.name,
          );
          trialEndAt = addDays(
            new Date(),
            this.environmentService.getBillingTrialDays(),
          );
          status = WorkspaceStatus.Active;
          plan = WorkionPlan.TENANT_BASIC;
          billingEmail = user.email;
          settings = { ai: { generative: true, chat: true } };
        }

        // create workspace
        const workspace = await this.workspaceRepo.insertWorkspace(
          {
            name: createWorkspaceDto.name,
            description: createWorkspaceDto.description,
            hostname,
            status,
            trialEndAt,
            plan,
            billingEmail,
            settings,
          },
          trx,
        );

        // create default group
        const group = await this.groupRepo.createDefaultGroup(workspace.id, {
          userId: user.id,
          trx: trx,
        });

        // add user to workspace
        await trx
          .updateTable('users')
          .set({
            workspaceId: workspace.id,
            role: UserRole.OWNER,
          })
          .where('users.id', '=', user.id)
          .execute();

        // add user to default group created above
        await this.groupUserRepo.insertGroupUser(
          {
            userId: user.id,
            groupId: group.id,
          },
          trx,
        );

        // create default space
        const spaceInfo: CreateSpaceDto = {
          name: 'General',
          slug: 'general',
        };

        const createdSpace = await this.spaceService.create(
          user.id,
          workspace.id,
          spaceInfo,
          trx,
        );

        // and add user to space as owner
        await this.spaceMemberService.addUserToSpace(
          user.id,
          createdSpace.id,
          SpaceRole.ADMIN,
          workspace.id,
          trx,
        );

        // add default group to space as writer
        await this.spaceMemberService.addGroupToSpace(
          group.id,
          createdSpace.id,
          SpaceRole.WRITER,
          workspace.id,
          trx,
        );

        // update default spaceId
        workspace.defaultSpaceId = createdSpace.id;
        await this.workspaceRepo.updateWorkspace(
          {
            defaultSpaceId: createdSpace.id,
          },
          workspace.id,
          trx,
        );

        return workspace;
      },
      trx,
    );

    if (this.environmentService.isCloud() && trialEndAt) {
      try {
        const delay = trialEndAt.getTime() - Date.now();

        await this.billingQueue.add(
          QueueJob.TRIAL_ENDED,
          { workspaceId: createdWorkspace.id },
          { delay },
        );

        await this.billingQueue.add(
          QueueJob.WELCOME_EMAIL,
          { userId: user.id },
          { delay: 30 * 60 * 1000 }, // 30m
        );
      } catch (err) {
        this.logger.error(err);
      }
    }

    return createdWorkspace;
  }

  /**
   * Cloud-only signup path (docs/specs/done/MULTI_TENANCY_SPEC.md Slice 1). Mirrors
   * SignupService.initialSetup() but never marks the email pre-verified —
   * cloud logins are gated on emailVerifiedAt via throwIfEmailNotVerified,
   * so a brand new owner must go through the verify-email flow below first.
   */
  async createCloudWorkspace(dto: CreateAdminUserDto): Promise<{
    workspace: Workspace;
    requiresEmailVerification: true;
    emailSignature: string;
  }> {
    let user: User;
    let workspace: Workspace;

    await executeTx(this.db, async (trx) => {
      user = await this.userRepo.insertUser(
        {
          name: dto.name,
          email: dto.email,
          password: dto.password,
          role: UserRole.OWNER,
        },
        trx,
      );

      workspace = await this.create(
        user,
        { name: dto.workspaceName || 'My workspace', hostname: dto.hostname },
        trx,
      );
    });

    await this.sendVerificationEmail(user, workspace);

    const emailSignature = computeEmailSignature(
      user.email,
      workspace.id,
      this.environmentService.getAppSecret(),
    );

    return { workspace, requiresEmailVerification: true, emailSignature };
  }

  /**
   * Consumes an email-verification token (sent by createCloudWorkspace /
   * resendVerificationEmail) and logs the now-verified user in. `workspace`
   * comes from DomainMiddleware's Host-header resolution — the caller is
   * always on that tenant's own subdomain, so setting the auth cookie
   * directly here (no cross-domain exchange) is safe.
   */
  async verifyEmail(token: string, workspace: Workspace): Promise<string> {
    const userToken = await this.userTokenRepo.findById(token, workspace.id);

    if (
      !userToken ||
      userToken.type !== UserTokenType.EMAIL_VERIFICATION ||
      userToken.expiresAt < new Date()
    ) {
      throw new BadRequestException('Invalid or expired token');
    }

    const user = await this.userRepo.findById(userToken.userId, workspace.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await executeTx(this.db, async (trx) => {
      await this.userRepo.updateUser(
        { emailVerifiedAt: new Date() },
        user.id,
        workspace.id,
        trx,
      );
      await this.userTokenRepo.deleteToken(token, trx);
    });

    return this.sessionService.createSessionAndToken(user);
  }

  /**
   * `sig` is an HMAC of (email, workspaceId) computed with the app secret —
   * see computeEmailSignature/throwIfEmailNotVerified — so this route can
   * re-send without requiring an active session. Silently no-ops on an
   * unknown or already-verified user rather than leaking account existence.
   */
  async resendVerificationEmail(
    email: string,
    sig: string,
    workspace: Workspace,
  ): Promise<void> {
    const isValidSig = verifyEmailSignature(
      email,
      workspace.id,
      sig,
      this.environmentService.getAppSecret(),
    );
    if (!isValidSig) {
      throw new BadRequestException('Invalid request');
    }

    const user = await this.userRepo.findByEmail(email, workspace.id);
    if (!user || user.emailVerifiedAt) {
      return;
    }

    await this.sendVerificationEmail(user, workspace);
  }

  private async sendVerificationEmail(
    user: User,
    workspace: Workspace,
  ): Promise<void> {
    const token = nanoIdGen(16);

    await executeTx(this.db, async (trx) => {
      await trx
        .deleteFrom('userTokens')
        .where('userId', '=', user.id)
        .where('type', '=', UserTokenType.EMAIL_VERIFICATION)
        .execute();

      await this.userTokenRepo.insertUserToken(
        {
          token,
          userId: user.id,
          workspaceId: workspace.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          type: UserTokenType.EMAIL_VERIFICATION,
        },
        { trx },
      );
    });

    const verifyLink = `${this.domainService.getUrl(workspace.hostname)}/verify-email?token=${token}`;

    const emailTemplate = EmailVerificationEmail({
      username: user.name,
      verifyLink,
    });

    await this.mailService.sendToQueue({
      to: user.email,
      subject: 'Verify your email',
      template: emailTemplate,
    });
  }

  async addUserToWorkspace(
    userId: string,
    workspaceId: string,
    assignedRole?: UserRole,
    trx?: KyselyTransaction,
  ): Promise<void> {
    return await executeTx(
      this.db,
      async (trx) => {
        const workspace = await trx
          .selectFrom('workspaces')
          .select(['id', 'defaultRole'])
          .where('workspaces.id', '=', workspaceId)
          .executeTakeFirst();

        if (!workspace) {
          throw new BadRequestException('Workspace not found');
        }

        await trx
          .updateTable('users')
          .set({
            role: assignedRole ?? workspace.defaultRole,
            workspaceId: workspace.id,
          })
          .where('id', '=', userId)
          .execute();
      },
      trx,
    );
  }

  async update(workspaceId: string, updateWorkspaceDto: UpdateWorkspaceDto) {
    if (updateWorkspaceDto.enforceSso) {
      const sso = await this.db
        .selectFrom('authProviders')
        .select(['id'])
        .where('isEnabled', '=', true)
        .where('workspaceId', '=', workspaceId)
        .execute();

      if (sso && sso?.length === 0) {
        throw new BadRequestException(
          'There must be at least one active SSO provider to enforce SSO.',
        );
      }
    }

    if (updateWorkspaceDto.emailDomains) {
      const regex =
        /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/;
      const emailDomains = updateWorkspaceDto.emailDomains || [];
      updateWorkspaceDto.emailDomains = emailDomains
        .map((domain) => regex.exec(domain)?.[0])
        .filter(Boolean);
    }

    if (updateWorkspaceDto.hostname) {
      const hostname = updateWorkspaceDto.hostname;
      if (DISALLOWED_HOSTNAMES.includes(hostname)) {
        throw new BadRequestException('Hostname already exists.');
      }
      if (await this.workspaceRepo.hostnameExists(hostname)) {
        throw new BadRequestException('Hostname already exists.');
      }
    }

    const before: Record<string, any> = {};
    const after: Record<string, any> = {};

    if (
      typeof updateWorkspaceDto.disablePublicSharing !== 'undefined' ||
      typeof updateWorkspaceDto.trashRetentionDays !== 'undefined' ||
      typeof updateWorkspaceDto.mcpEnabled !== 'undefined' ||
      typeof updateWorkspaceDto.restrictApiToAdmins !== 'undefined' ||
      typeof updateWorkspaceDto.allowMemberTemplates !== 'undefined' ||
      typeof updateWorkspaceDto.isScimEnabled !== 'undefined'
    ) {
      const ws = await this.db
        .selectFrom('workspaces')
        .select(['id', 'licenseKey', 'plan', 'trashRetentionDays'])
        .where('id', '=', workspaceId)
        .executeTakeFirst();

      if (!ws) {
        throw new NotFoundException('Workspace not found');
      }

      if (
        typeof updateWorkspaceDto.trashRetentionDays !== 'undefined' &&
        updateWorkspaceDto.trashRetentionDays !== ws.trashRetentionDays
      ) {
        before.trashRetentionDays = ws.trashRetentionDays;
        after.trashRetentionDays = updateWorkspaceDto.trashRetentionDays;
      }
    }

    if (updateWorkspaceDto.aiSearch) {
      const tableExists = await isPageEmbeddingsTableExists(this.db);
      if (!tableExists) {
        throw new BadRequestException(
          'Failed to activate. Make sure pgvector postgres extension is installed.',
        );
      }
    }

    const workspaceBefore = await this.workspaceRepo.findById(workspaceId);
    const settingsBefore = (workspaceBefore?.settings ?? {}) as Record<
      string,
      any
    >;

    await executeTx(this.db, async (trx) => {
      if (typeof updateWorkspaceDto.restrictApiToAdmins !== 'undefined') {
        const prev = settingsBefore?.api?.restrictToAdmins ?? false;
        if (prev !== updateWorkspaceDto.restrictApiToAdmins) {
          before.restrictApiToAdmins = prev;
          after.restrictApiToAdmins = updateWorkspaceDto.restrictApiToAdmins;
        }
        await this.workspaceRepo.updateApiSettings(
          workspaceId,
          'restrictToAdmins',
          updateWorkspaceDto.restrictApiToAdmins,
          trx,
        );
      }

      if (typeof updateWorkspaceDto.aiSearch !== 'undefined') {
        const prev = settingsBefore?.ai?.search ?? false;
        if (prev !== updateWorkspaceDto.aiSearch) {
          before.aiSearch = prev;
          after.aiSearch = updateWorkspaceDto.aiSearch;
        }
        await this.workspaceRepo.updateAiSettings(
          workspaceId,
          'search',
          updateWorkspaceDto.aiSearch,
          trx,
        );
      }

      if (typeof updateWorkspaceDto.generativeAi !== 'undefined') {
        const prev = settingsBefore?.ai?.generative ?? false;
        if (prev !== updateWorkspaceDto.generativeAi) {
          before.generativeAi = prev;
          after.generativeAi = updateWorkspaceDto.generativeAi;
        }
        await this.workspaceRepo.updateAiSettings(
          workspaceId,
          'generative',
          updateWorkspaceDto.generativeAi,
          trx,
        );
      }

      if (typeof updateWorkspaceDto.disablePublicSharing !== 'undefined') {
        const prev = settingsBefore?.sharing?.disabled ?? false;
        if (prev !== updateWorkspaceDto.disablePublicSharing) {
          before.disablePublicSharing = prev;
          after.disablePublicSharing = updateWorkspaceDto.disablePublicSharing;
        }
        await this.workspaceRepo.updateSharingSettings(
          workspaceId,
          'disabled',
          updateWorkspaceDto.disablePublicSharing,
          trx,
        );
        if (updateWorkspaceDto.disablePublicSharing) {
          await this.shareRepo.deleteByWorkspaceId(workspaceId, trx);
        }
      }

      if (typeof updateWorkspaceDto.mcpEnabled !== 'undefined') {
        const prev = settingsBefore?.ai?.mcp ?? false;
        if (prev !== updateWorkspaceDto.mcpEnabled) {
          before.mcpEnabled = prev;
          after.mcpEnabled = updateWorkspaceDto.mcpEnabled;
        }
        await this.workspaceRepo.updateAiSettings(
          workspaceId,
          'mcp',
          updateWorkspaceDto.mcpEnabled,
          trx,
        );
      }

      if (typeof updateWorkspaceDto.allowMemberTemplates !== 'undefined') {
        const prev = settingsBefore?.templates?.allowMemberTemplates ?? false;
        if (prev !== updateWorkspaceDto.allowMemberTemplates) {
          before.allowMemberTemplates = prev;
          after.allowMemberTemplates = updateWorkspaceDto.allowMemberTemplates;
        }
        await this.workspaceRepo.updateTemplateSettings(
          workspaceId,
          'allowMemberTemplates',
          updateWorkspaceDto.allowMemberTemplates,
          trx,
        );
      }

      if (typeof updateWorkspaceDto.aiChat !== 'undefined') {
        const prev = settingsBefore?.ai?.chat ?? false;
        if (prev !== updateWorkspaceDto.aiChat) {
          before.aiChat = prev;
          after.aiChat = updateWorkspaceDto.aiChat;
        }
        await this.workspaceRepo.updateAiSettings(
          workspaceId,
          'chat',
          updateWorkspaceDto.aiChat,
          trx,
        );
      }

      delete updateWorkspaceDto.restrictApiToAdmins;
      delete updateWorkspaceDto.aiSearch;
      delete updateWorkspaceDto.generativeAi;
      delete updateWorkspaceDto.disablePublicSharing;
      delete updateWorkspaceDto.mcpEnabled;
      delete updateWorkspaceDto.allowMemberTemplates;
      delete updateWorkspaceDto.aiChat;

      await this.workspaceRepo.updateWorkspace(
        updateWorkspaceDto,
        workspaceId,
        trx,
      );
    });

    if (after.aiSearch === true) {
      await this.aiQueue.add(QueueJob.WORKSPACE_CREATE_EMBEDDINGS, {
        workspaceId,
      });
    } else if (after.aiSearch === false) {
      const deleteJobId = `ai-search-disabled-${workspaceId}`;
      await this.aiQueue.add(
        QueueJob.WORKSPACE_DELETE_EMBEDDINGS,
        { workspaceId },
        {
          jobId: deleteJobId,
          delay: 24 * 60 * 60 * 1000,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    }

    const workspace = await this.workspaceRepo.findById(workspaceId, {
      withMemberCount: true,
      withLicenseKey: true,
    });

    const columnChanges = diffAuditTrackedFields(
      [
        'name',
        'logo',
        'enforceSso',
        'enforceMfa',
        'emailDomains',
        'isScimEnabled',
      ],
      updateWorkspaceDto,
      workspaceBefore,
      workspace,
    );
    if (columnChanges) {
      Object.assign(before, columnChanges.before);
      Object.assign(after, columnChanges.after);
    }

    if (Object.keys(after).length > 0) {
      this.auditService.log({
        event: AuditEvent.WORKSPACE_UPDATED,
        resourceType: AuditResource.WORKSPACE,
        resourceId: workspaceId,
        changes: { before, after },
      });
    }

    const { licenseKey, ...rest } = workspace;
    return rest;
  }

  async getWorkspaceUsers(
    workspaceId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<User>> {
    return this.userRepo.getUsersPaginated(workspaceId, pagination);
  }

  async updateWorkspaceUserRole(
    authUser: User,
    userRoleDto: UpdateWorkspaceUserRoleDto,
    workspaceId: string,
  ) {
    const user = await this.userRepo.findById(userRoleDto.userId, workspaceId);

    const newRole = userRoleDto.role.toLowerCase();

    if (!user) {
      throw new BadRequestException('Workspace member not found');
    }

    // prevent ADMIN from managing OWNER role
    if (
      isAdminActingOnOwner(authUser.role, newRole) ||
      isAdminActingOnOwner(authUser.role, user.role)
    ) {
      throw new ForbiddenException();
    }

    if (user.role === newRole) {
      return user;
    }

    const workspaceOwnerCount = await this.userRepo.roleCountByWorkspaceId(
      UserRole.OWNER,
      workspaceId,
    );

    if (user.role === UserRole.OWNER && workspaceOwnerCount === 1) {
      throw new BadRequestException(
        'There must be at least one workspace owner',
      );
    }

    await this.userRepo.updateUser(
      {
        role: newRole,
      },
      user.id,
      workspaceId,
    );

    this.auditService.log({
      event: AuditEvent.USER_ROLE_CHANGED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      changes: {
        before: { role: user.role },
        after: { role: newRole },
      },
    });
  }

  async generateHostname(
    name: string,
    trx?: KyselyTransaction,
  ): Promise<string> {
    let subdomain = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 20)
      .replace(/^-+|-+$/g, ''); //remove any hyphen at the start or end
    // Ensure we leave room for a random suffix.
    const maxSuffixLength = 6;

    if (subdomain.length < 4) {
      subdomain = `${subdomain}-${generateRandomSuffixNumbers(maxSuffixLength)}`;
    }

    if (DISALLOWED_HOSTNAMES.includes(subdomain)) {
      subdomain = `workspace-${generateRandomSuffixNumbers(maxSuffixLength)}`;
    }

    let uniqueHostname = subdomain;

    while (true) {
      const exists = await this.workspaceRepo.hostnameExists(
        uniqueHostname,
        trx,
      );
      if (!exists) {
        break;
      }
      // Append a random suffix and retry.
      const randomSuffix = generateRandomSuffixNumbers(maxSuffixLength);
      uniqueHostname = `${subdomain}-${randomSuffix}`.substring(0, 25);
    }

    return uniqueHostname;
  }

  async checkHostname(hostname: string) {
    const exists = await this.workspaceRepo.hostnameExists(hostname);
    if (!exists) {
      throw new NotFoundException('Hostname not found');
    }
    return { hostname: this.domainService.getUrl(hostname) };
  }

  /**
   * Backs the Caddy on_demand_tls `ask` gate. Allows the bare SUBDOMAIN_HOST
   * apex plus any `<hostname>.SUBDOMAIN_HOST` where hostname matches a real
   * workspace — nothing else, so a stranger can't force cert issuance for
   * arbitrary subdomains.
   */
  async isDomainAllowed(domain: string): Promise<boolean> {
    const subdomainHost = this.environmentService.getSubdomainHost();
    if (!subdomainHost || !domain) {
      return false;
    }
    if (domain === subdomainHost) {
      return true;
    }

    const suffix = `.${subdomainHost}`;
    if (!domain.endsWith(suffix)) {
      return false;
    }

    const hostname = domain.slice(0, -suffix.length);
    if (!hostname) {
      return false;
    }

    return this.workspaceRepo.hostnameExists(hostname);
  }

  async deactivateUser(
    authUser: User,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const user = await this.userRepo.findById(userId, workspaceId);

    if (!user || user.deletedAt) {
      throw new BadRequestException('Workspace member not found');
    }

    if (user.deactivatedAt) {
      throw new BadRequestException('User is already deactivated');
    }

    if (authUser.id === userId) {
      throw new BadRequestException('You cannot deactivate yourself');
    }

    if (isAdminActingOnOwner(authUser.role, user.role)) {
      throw new BadRequestException(
        'You cannot deactivate a user with owner role',
      );
    }

    if (user.role === UserRole.OWNER) {
      const workspaceOwnerCount = await this.userRepo.roleCountByWorkspaceId(
        UserRole.OWNER,
        workspaceId,
      );

      if (workspaceOwnerCount === 1) {
        throw new BadRequestException(
          'There must be at least one workspace owner',
        );
      }
    }

    await executeTx(this.db, async (trx) => {
      await this.userRepo.updateUser(
        { deactivatedAt: new Date() },
        userId,
        workspaceId,
        trx,
      );
      await this.userSessionRepo.revokeByUserId(userId, workspaceId, trx);
    });

    this.auditService.log({
      event: AuditEvent.USER_DEACTIVATED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      changes: {
        before: {
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  }

  async activateUser(
    authUser: User,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const user = await this.userRepo.findById(userId, workspaceId);

    if (!user || user.deletedAt) {
      throw new BadRequestException('Workspace member not found');
    }

    if (!user.deactivatedAt) {
      throw new BadRequestException('User is not deactivated');
    }

    if (isAdminActingOnOwner(authUser.role, user.role)) {
      throw new BadRequestException(
        'You cannot activate a user with owner role',
      );
    }

    await this.userRepo.updateUser(
      { deactivatedAt: null },
      userId,
      workspaceId,
    );

    this.auditService.log({
      event: AuditEvent.USER_ACTIVATED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      changes: {
        before: {
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  }

  async deleteUser(
    authUser: User,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const user = await this.userRepo.findById(userId, workspaceId);

    if (!user || user.deletedAt) {
      throw new BadRequestException('Workspace member not found');
    }

    const workspaceOwnerCount = await this.userRepo.roleCountByWorkspaceId(
      UserRole.OWNER,
      workspaceId,
    );

    if (user.role === UserRole.OWNER && workspaceOwnerCount === 1) {
      throw new BadRequestException(
        'There must be at least one workspace owner',
      );
    }

    if (authUser.id === userId) {
      throw new BadRequestException('You cannot delete yourself');
    }

    if (isAdminActingOnOwner(authUser.role, user.role)) {
      throw new BadRequestException('You cannot delete a user with owner role');
    }

    await executeTx(this.db, async (trx) => {
      await this.userRepo.updateUser(
        {
          name: 'Deleted user',
          email: v4() + '@deleted.docmost.com',
          avatarUrl: null,
          settings: null,
          deletedAt: new Date(),
        },
        userId,
        workspaceId,
        trx,
      );

      await trx.deleteFrom('groupUsers').where('userId', '=', userId).execute();
      await trx
        .deleteFrom('spaceMembers')
        .where('userId', '=', userId)
        .execute();
      await trx
        .deleteFrom('authAccounts')
        .where('userId', '=', userId)
        .execute();

      await this.watcherRepo.deleteByUserAndWorkspace(userId, workspaceId, {
        trx,
      });

      await this.favoriteRepo.deleteByUserAndWorkspace(userId, workspaceId, {
        trx,
      });

      await this.userSessionRepo.revokeByUserId(userId, workspaceId, trx);
    });

    this.auditService.log({
      event: AuditEvent.USER_DELETED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      changes: {
        before: {
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });

    try {
      await this.attachmentQueue.add(QueueJob.DELETE_USER_AVATARS, user);
    } catch (err) {
      // empty
    }
  }
}
