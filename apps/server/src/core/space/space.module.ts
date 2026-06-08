import { Module } from '@nestjs/common';
import { SpaceService } from './services/space.service';
import { SpaceController } from './space.controller';
import { SpaceMemberService } from './services/space-member.service';
import { SpaceInviteLinkService } from './services/space-invite-link.service';
import { SpaceInviteLinkController } from './controllers/space-invite-link.controller';
import { SpaceInviteLinkRepo } from '@docmost/db/repos/space/space-invite-link.repo';

@Module({
  imports: [],
  controllers: [SpaceController, SpaceInviteLinkController],
  providers: [SpaceService, SpaceMemberService, SpaceInviteLinkService, SpaceInviteLinkRepo],
  exports: [SpaceService, SpaceMemberService, SpaceInviteLinkService, SpaceInviteLinkRepo],
})
export class SpaceModule {}
