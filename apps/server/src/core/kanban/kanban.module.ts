import { Module } from '@nestjs/common';
import { KanbanController } from './kanban.controller';
import { KanbanService } from './kanban.service';
import { KanbanRepo } from '@docmost/db/repos/kanban/kanban.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  controllers: [KanbanController],
  providers: [KanbanService, KanbanRepo, PageRepo, SpaceMemberRepo],
  exports: [KanbanService],
})
export class KanbanModule {}
