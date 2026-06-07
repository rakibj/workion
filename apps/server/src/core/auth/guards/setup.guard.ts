import { CanActivate, Injectable } from '@nestjs/common';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';

@Injectable()
export class SetupGuard implements CanActivate {
  constructor(
    private environmentService: EnvironmentService,
    private workspaceRepo: WorkspaceRepo,
  ) {}

  async canActivate(): Promise<boolean> {
    if (this.environmentService.isCloud()) {
      return false;
    }

    const count = await this.workspaceRepo.count();
    return count === 0;
  }
}
