import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { pageUnreadCountsAtom } from "@/features/page/atoms/page-unread-atom";
import { markPageRead } from "@/features/page/services/page-service";

export function useMarkPageRead(pageId: string | undefined) {
  const setPageUnreadCounts = useSetAtom(pageUnreadCountsAtom);

  useEffect(() => {
    if (!pageId) return;
    markPageRead(pageId).catch(() => {});
    setPageUnreadCounts((prev) => {
      if (!prev[pageId]) return prev;
      const next = { ...prev };
      delete next[pageId];
      return next;
    });
  }, [pageId]);
}
