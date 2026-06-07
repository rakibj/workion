import { Module } from '@nestjs/common';
import { PageService } from './services/page.service';
import { PageController } from './page.controller';
import { PageHistoryService } from './services/page-history.service';
import { TrashCleanupService } from './services/trash-cleanup.service';
import { BacklinkService } from './services/backlink.service';
import { StorageModule } from '../../integrations/storage/storage.module';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { WatcherModule } from '../watcher/watcher.module';
import { TransclusionModule } from './transclusion/transclusion.module';
import { LabelModule } from '../label/label.module';
import { KanbanModule } from '../kanban/kanban.module';
import { PageVerificationController } from './page-verification.controller';
import { PageVerificationService } from './services/page-verification.service';

@Module({
  controllers: [PageController, PageVerificationController],
  providers: [
    PageService,
    PageHistoryService,
    TrashCleanupService,
    BacklinkService,
    PageVerificationService,
  ],
  exports: [PageService, PageHistoryService],
  imports: [
    StorageModule,
    CollaborationModule,
    WatcherModule,
    TransclusionModule,
    LabelModule,
    KanbanModule,
  ],
})
export class PageModule {}
