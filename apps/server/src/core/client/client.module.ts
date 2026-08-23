import { Module } from '@nestjs/common';
import { ClientController } from './client.controller';
import { ClientContactController } from './client-contact.controller';
import { ClientService } from './services/client.service';
import { ClientContactService } from './services/client-contact.service';

@Module({
  controllers: [ClientController, ClientContactController],
  providers: [ClientService, ClientContactService],
  exports: [ClientService, ClientContactService],
})
export class ClientModule {}
