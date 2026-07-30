import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { SpaceMemberRepo } from './space-member.repo';
import { GroupRepo } from '../group/group.repo';
import { SpaceRepo } from './space.repo';

function createFakeCache() {
  const store = new Map<string, { v: any; expiresAt: number }>();
  return {
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.v;
    },
    async set(key: string, value: any, ttl: number) {
      store.set(key, { v: value, expiresAt: Date.now() + ttl });
    },
    async del(key: string) {
      store.delete(key);
    },
  };
}

describe('SpaceMemberRepo.getUserSpaces caching', () => {
  let repo: SpaceMemberRepo;

  const userId = '00000000-0000-0000-0000-000000000001';
  const workspaceId = '00000000-0000-0000-0000-000000000002';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SpaceMemberRepo,
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: GroupRepo, useValue: {} },
        { provide: SpaceRepo, useValue: {} },
        { provide: CACHE_MANAGER, useValue: createFakeCache() },
      ],
    }).compile();

    repo = module.get(SpaceMemberRepo);
  });

  it('caches the default (first page, no search) call and skips the DB on a repeat', async () => {
    const page = { items: [{ id: 'space-1' }], meta: {} } as any;
    const fetchSpy = jest
      .spyOn(repo as any, '_getUserSpaces')
      .mockResolvedValue(page);

    const first = await repo.getUserSpaces(userId, workspaceId, {
      limit: 20,
    } as any);
    const second = await repo.getUserSpaces(userId, workspaceId, {
      limit: 20,
    } as any);

    expect(first).toEqual(page);
    expect(second).toEqual(page);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache paginated/search calls (unbounded key space)', async () => {
    const fetchSpy = jest
      .spyOn(repo as any, '_getUserSpaces')
      .mockResolvedValue({ items: [], meta: {} });

    await repo.getUserSpaces(userId, workspaceId, {
      limit: 20,
      query: 'eng',
    } as any);
    await repo.getUserSpaces(userId, workspaceId, {
      limit: 20,
      query: 'eng',
    } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('invalidateUserSpacesCache clears the cached default page', async () => {
    const fetchSpy = jest
      .spyOn(repo as any, '_getUserSpaces')
      .mockResolvedValue({ items: [], meta: {} });

    await repo.getUserSpaces(userId, workspaceId, { limit: 20 } as any);
    await repo.invalidateUserSpacesCache(userId, workspaceId);
    await repo.getUserSpaces(userId, workspaceId, { limit: 20 } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps different users/workspaces in separate cache entries', async () => {
    const fetchSpy = jest
      .spyOn(repo as any, '_getUserSpaces')
      .mockResolvedValue({ items: [], meta: {} });

    await repo.getUserSpaces(userId, workspaceId, { limit: 20 } as any);
    await repo.getUserSpaces('other-user', workspaceId, { limit: 20 } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
