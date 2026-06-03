import { Module } from '@nestjs/common';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { CaslModule } from '../casl/casl.module';
import { PageModule } from '../page/page.module';

@Module({
  imports: [CaslModule, PageModule],
  controllers: [TemplateController],
  providers: [TemplateService, TemplateRepo, SpaceMemberRepo],
  exports: [TemplateService],
})
export class TemplateModule {}
