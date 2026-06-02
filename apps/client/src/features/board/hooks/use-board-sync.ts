import { useCollabToken } from "@/features/auth/queries/auth-query";
import useCollaborationUrl from "@/features/editor/hooks/use-collaboration-url";

/**
 * Provides the credentials needed to wire Yjs sync inside a tldraw onMount callback.
 * Returns null while the collab token is loading.
 */
export function useBoardSyncParams(pageId: string) {
  const { data: collabQuery } = useCollabToken();
  const collaborationURL = useCollaborationUrl();

  if (!collabQuery?.token) return null;

  return {
    pageId,
    token: collabQuery.token,
    collaborationURL,
  };
}
