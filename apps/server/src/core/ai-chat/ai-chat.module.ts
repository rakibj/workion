import { Module } from '@nestjs/common';
import { AiChatController } from './controllers/ai-chat.controller';
import { WorkspaceAiController } from './controllers/workspace-ai.controller';
import { AiChatService } from './services/ai-chat.service';
import { AiKeyService } from './services/ai-key.service';
import { AiStreamService } from './services/ai-stream.service';
import { StorageModule } from '../../integrations/storage/storage.module';
import { KanbanRepo } from '@docmost/db/repos/kanban/kanban.repo';

@Module({
  imports: [StorageModule],
  controllers: [AiChatController, WorkspaceAiController],
  providers: [AiChatService, AiKeyService, AiStreamService, KanbanRepo],
})
export class AiChatModule {}
