import { Module } from '@nestjs/common';
import { ClientController } from './client.controller';
import { ProjectController } from './project.controller';
import { ClientService } from './services/client.service';
import { ProjectService } from './services/project.service';

@Module({
  controllers: [ClientController, ProjectController],
  providers: [ClientService, ProjectService],
  exports: [ClientService, ProjectService],
})
export class ClientModule {}
