import { Module } from '@nestjs/common';
import { ClientController } from './client.controller';
import { ProjectController } from './project.controller';
import { ClientContactController } from './client-contact.controller';
import { ClientService } from './services/client.service';
import { ClientContactService } from './services/client-contact.service';
import { ProjectService } from './services/project.service';

@Module({
  controllers: [ClientController, ProjectController, ClientContactController],
  providers: [ClientService, ProjectService, ClientContactService],
  exports: [ClientService, ProjectService, ClientContactService],
})
export class ClientModule {}
