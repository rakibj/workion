import { useWorkspaceQuery } from "@/features/workspace/queries/workspace-query.ts";

export function useHasWorkionModule(module: string): boolean {
  const { data: workspace } = useWorkspaceQuery();
  return workspace?.enabledModules?.includes(module) ?? false;
}
