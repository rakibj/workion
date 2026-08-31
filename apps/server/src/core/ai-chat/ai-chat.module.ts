import { Module } from '@nestjs/common';
import { AiChatController } from './controllers/ai-chat.controller';
import { WorkspaceAiController } from './controllers/workspace-ai.controller';
import { AiGenerateController } from './controllers/ai-generate.controller';
import { AiChatService } from './services/ai-chat.service';
import { AiKeyService } from './services/ai-key.service';
import { AiStreamService } from './services/ai-stream.service';
import { StorageModule } from '../../integrations/storage/storage.module';
import { KanbanRepo } from '@docmost/db/repos/kanban/kanban.repo';
import { KanbanService } from '../kanban/kanban.service';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [StorageModule, CaslModule],
  controllers: [AiChatController, WorkspaceAiController, AiGenerateController],
  providers: [AiChatService, AiKeyService, AiStreamService, KanbanRepo, KanbanService],
  exports: [AiStreamService],
})
export class AiChatModule {}
