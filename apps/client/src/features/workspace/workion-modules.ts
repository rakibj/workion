/**
 * Mirrors the server's WorkionFeature enum keys (common/entitlement/entitlement.ts).
 * String values only — which plan grants which module stays server-side, resolved
 * into IWorkspace.enabledModules by GET /workspace/info.
 */
export const WorkionModule = {
  BLOG: "blog",
} as const;

export type WorkionModule = (typeof WorkionModule)[keyof typeof WorkionModule];
