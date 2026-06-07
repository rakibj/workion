import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageVerificationRepo } from '@docmost/db/repos/page/page-verification.repo';
import { PageAccessService } from '../page-access/page-access.service';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import {
  CreateVerificationDto,
  UpdateVerificationDto,
  VerificationListDto,
} from '../dto/page-verification.dto';

@Injectable()
export class PageVerificationService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageVerificationRepo: PageVerificationRepo,
    private readonly pageAccessService: PageAccessService,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  async getVerificationInfo(pageId: string, user: User) {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanView(page, user);

    const verification = await this.pageVerificationRepo.findByPageId(pageId);

    if (!verification) {
      return { status: 'none' };
    }

    const { canEdit } =
      await this.pageAccessService.validateCanViewWithPermissions(page, user);
    const isVerifier =
      (verification.verifiers as any[])?.some((v) => v.id === user.id) ?? false;

    const status = verification.status ?? '';
    const type = verification.type;

    let canVerify = false;
    if (type === 'expiring') {
      canVerify = isVerifier && ['draft', 'expiring', 'expired'].includes(status);
    } else if (type === 'qms') {
      canVerify = isVerifier && status === 'in_approval';
    }

    const canManage = canEdit;
    const canSubmitForApproval =
      canManage &&
      type === 'qms' &&
      ['draft', 'approved'].includes(status) &&
      status !== 'obsolete';
    const canMarkObsolete = canManage && status === 'approved';

    return {
      ...verification,
      permissions: { canVerify, canManage, canSubmitForApproval, canMarkObsolete },
    };
  }

  async createVerification(
    data: CreateVerificationDto,
    user: User,
    workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(data.pageId);
    if (!page) throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanEdit(page, user);

    const existing = await this.pageVerificationRepo.findByPageId(data.pageId);
    if (existing)
      throw new BadRequestException(
        'Verification already exists for this page',
      );

    const type = data.type ?? 'expiring';
    const mode = data.mode ?? (type === 'qms' ? 'indefinite' : 'period');

    let expiresAt: Date | null = null;
    if (mode === 'fixed' && data.fixedExpiresAt) {
      expiresAt = new Date(data.fixedExpiresAt);
    }

    await this.pageVerificationRepo.create(
      {
        pageId: data.pageId,
        workspaceId: workspace.id,
        spaceId: page.spaceId,
        type,
        status: 'draft',
        mode,
        periodAmount: mode === 'period' ? (data.periodAmount ?? 1) : null,
        periodUnit: mode === 'period' ? (data.periodUnit ?? 'month') : null,
        expiresAt,
        creatorId: user.id,
      },
      data.verifierIds,
      user.id,
    );
  }

  async updateVerification(data: UpdateVerificationDto, user: User) {
    const page = await this.pageRepo.findById(data.pageId);
    if (!page) throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanEdit(page, user);

    const verification = await this.pageVerificationRepo.findByPageId(
      data.pageId,
    );
    if (!verification) throw new NotFoundException('Verification not found');

    const updates: Record<string, any> = {};

    if (data.mode !== undefined) {
      updates.mode = data.mode;
      if (data.mode === 'period') {
        updates.periodAmount =
          data.periodAmount ?? verification.periodAmount ?? 1;
        updates.periodUnit =
          data.periodUnit ?? verification.periodUnit ?? 'month';
        updates.expiresAt = null;
      } else if (data.mode === 'fixed' && data.fixedExpiresAt) {
        updates.periodAmount = null;
        updates.periodUnit = null;
        updates.expiresAt = new Date(data.fixedExpiresAt);
      } else if (data.mode === 'indefinite') {
        updates.periodAmount = null;
        updates.periodUnit = null;
        updates.expiresAt = null;
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.pageVerificationRepo.update(verification.id, updates);
    }

    if (data.verifierIds !== undefined) {
      await this.pageVerificationRepo.replaceVerifiers(
        verification.id,
        data.verifierIds,
        user.id,
      );
    }
  }

  async deleteVerification(pageId: string, user: User) {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanEdit(page, user);

    const verification = await this.pageVerificationRepo.findByPageId(pageId);
    if (!verification) throw new NotFoundException('Verification not found');

    await this.pageVerificationRepo.deleteByPageId(pageId);
  }

  async verifyPage(pageId: string, user: User) {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanView(page, user);

    const verification = await this.pageVerificationRepo.findByPageId(pageId);
    if (!verification) throw new NotFoundException('Verification not found');

    const isVerifier =
      (verification.verifiers as any[])?.some((v) => v.id === user.id) ?? false;
    if (!isVerifier)
      throw new ForbiddenException('Only verifiers can verify this page');

    const { type, mode } = verification;
    const status = verification.status ?? '';

    if (type === 'expiring') {
      if (!['draft', 'expiring', 'expired'].includes(status)) {
        throw new BadRequestException(
          'Page cannot be verified in its current status',
        );
      }
    } else if (type === 'qms') {
      if (status !== 'in_approval') {
        throw new BadRequestException(
          'Page must be in approval to be approved',
        );
      }
    }

    const now = new Date();
    let expiresAt: Date | null = verification.expiresAt
      ? new Date(verification.expiresAt as any)
      : null;

    if (
      mode === 'period' &&
      verification.periodAmount &&
      verification.periodUnit
    ) {
      expiresAt = computeExpiresAt(
        now,
        verification.periodAmount,
        verification.periodUnit,
      );
    } else if (mode === 'indefinite') {
      expiresAt = null;
    }

    const newStatus = type === 'qms' ? 'approved' : 'verified';
    await this.pageVerificationRepo.update(verification.id, {
      status: newStatus,
      verifiedAt: now,
      verifiedById: user.id,
      expiresAt,
      rejectedAt: null,
      rejectedById: null,
      rejectionComment: null,
    });

    const verifierIds =
      (verification.verifiers as any[])?.map((v) => v.id) ?? [];
    await this.notificationQueue.add(QueueJob.PAGE_VERIFIED_NOTIFICATION, {
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      actorId: user.id,
      verifierIds,
    });
  }

  async submitForApproval(pageId: string, user: User) {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanEdit(page, user);

    const verification = await this.pageVerificationRepo.findByPageId(pageId);
    if (!verification) throw new NotFoundException('Verification not found');
    if (verification.type !== 'qms')
      throw new BadRequestException('This is not a QMS verification');
    if (!['draft', 'approved'].includes(verification.status ?? ''))
      throw new BadRequestException(
        'Page cannot be submitted for approval in its current status',
      );

    await this.pageVerificationRepo.update(verification.id, {
      status: 'in_approval',
      requestedAt: new Date(),
      requestedById: user.id,
    });

    const verifierIds =
      (verification.verifiers as any[])?.map((v) => v.id) ?? [];
    await this.notificationQueue.add(
      QueueJob.PAGE_APPROVAL_REQUESTED_NOTIFICATION,
      {
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
        actorId: user.id,
        verifierIds,
      },
    );
  }

  async rejectApproval(
    pageId: string,
    comment: string | undefined,
    user: User,
  ) {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanView(page, user);

    const verification = await this.pageVerificationRepo.findByPageId(pageId);
    if (!verification) throw new NotFoundException('Verification not found');
    if (verification.type !== 'qms')
      throw new BadRequestException('This is not a QMS verification');
    if (verification.status !== 'in_approval')
      throw new BadRequestException(
        'Page must be in approval to be rejected',
      );

    const isVerifier =
      (verification.verifiers as any[])?.some((v) => v.id === user.id) ?? false;
    if (!isVerifier)
      throw new ForbiddenException('Only verifiers can reject approval');

    await this.pageVerificationRepo.update(verification.id, {
      status: 'draft',
      rejectedAt: new Date(),
      rejectedById: user.id,
      rejectionComment: comment ?? null,
      requestedAt: null,
      requestedById: null,
    });

    await this.notificationQueue.add(
      QueueJob.PAGE_APPROVAL_REJECTED_NOTIFICATION,
      {
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
        actorId: user.id,
        requestedById: verification.requestedById ?? user.id,
        comment,
      },
    );
  }

  async markObsolete(pageId: string, user: User) {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanEdit(page, user);

    const verification = await this.pageVerificationRepo.findByPageId(pageId);
    if (!verification) throw new NotFoundException('Verification not found');
    if (verification.status !== 'approved')
      throw new BadRequestException(
        'Only approved pages can be marked as obsolete',
      );

    await this.pageVerificationRepo.update(verification.id, {
      status: 'obsolete',
    });
  }

  async getVerificationList(
    params: VerificationListDto,
    workspace: Workspace,
  ) {
    return this.pageVerificationRepo.findList(workspace.id, params);
  }
}

function computeExpiresAt(from: Date, amount: number, unit: string): Date {
  const d = new Date(from);
  switch (unit) {
    case 'day':
      d.setDate(d.getDate() + amount);
      break;
    case 'week':
      d.setDate(d.getDate() + amount * 7);
      break;
    case 'month':
      d.setMonth(d.getMonth() + amount);
      break;
    case 'year':
      d.setFullYear(d.getFullYear() + amount);
      break;
  }
  return d;
}
