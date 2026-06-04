export const CacheKey = {
  LICENSE_VALID: (workspaceId: string) => `license:valid:${workspaceId}`,
  SPACE_ROLES: (userId: string, spaceId: string) =>
    `perm:space-roles:${userId}:${spaceId}`,
  PAGE_CAN_EDIT: (userId: string, pageId: string) =>
    `perm:can-edit:${userId}:${pageId}`,

  // Entity caches — reduce per-request DB hits
  WORKSPACE: (workspaceId: string) => `entity:workspace:${workspaceId}`,
  WORKSPACE_MEMBER_COUNT: (workspaceId: string) =>
    `entity:workspace-member-count:${workspaceId}`,
  USER: (userId: string, workspaceId: string) =>
    `entity:user:${userId}:${workspaceId}`,
  SPACE: (spaceId: string, workspaceId: string) =>
    `entity:space:${spaceId}:${workspaceId}`,
  PAGE: (pageId: string) => `entity:page:${pageId}`,
  SHARE: (shareKey: string) => `entity:share:${shareKey}`,
};

// Permission caches dedupe repeated checks within and across short request bursts.
// 5s keeps staleness on revocations bounded.
export const PERMISSION_CACHE_TTL_MS = 5_000;

// Entity caches — longer TTL is safe because writes always invalidate.
export const WORKSPACE_CACHE_TTL_MS = 300_000; // 5 min
export const USER_CACHE_TTL_MS = 60_000;        // 1 min
export const SPACE_CACHE_TTL_MS = 120_000;      // 2 min
export const MEMBER_COUNT_CACHE_TTL_MS = 60_000; // 1 min
export const PAGE_CACHE_TTL_MS = 60_000;         // 1 min — base metadata only, not content
export const SHARE_CACHE_TTL_MS = 300_000;       // 5 min — shares rarely change
