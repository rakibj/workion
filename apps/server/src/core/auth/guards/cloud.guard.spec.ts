import { CloudGuard } from './cloud.guard';

describe('CloudGuard', () => {
  it('allows the route when the deployment is cloud', () => {
    const guard = new CloudGuard({ isCloud: () => true } as any);
    expect(guard.canActivate()).toBe(true);
  });

  it('blocks the route on a self-hosted deployment (Gameloops today)', () => {
    const guard = new CloudGuard({ isCloud: () => false } as any);
    expect(guard.canActivate()).toBe(false);
  });
});
