import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { StorageModule } from '../storage/storage.module';
import { KanbanRepo } from '@docmost/db/repos/kanban/kanban.repo';

@Module({
  imports: [StorageModule],
  providers: [ExportService, KanbanRepo],
  controllers: [ExportController],
})
export class ExportModule {}
