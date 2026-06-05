import { CanActivate, Injectable } from '@nestjs/common';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

@Injectable()
export class SetupGuard implements CanActivate {
  constructor(private environmentService: EnvironmentService) {}

  canActivate(): boolean {
    if (this.environmentService.isCloud()) {
      return false;
    }

    return true;
  }
}
