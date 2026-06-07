import { useEffect } from "react";
import { useAtom, useSetAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import { NOTIFICATION_KEY } from "../queries/notification-query";
import { pageUnreadCountsAtom } from "@/features/page/atoms/page-unread-atom";

export function useNotificationSocket() {
  const queryClient = useQueryClient();
  const [socket] = useAtom(socketAtom);
  const setPageUnreadCounts = useSetAtom(pageUnreadCountsAtom);

  useEffect(() => {
    if (!socket) return;

    const notificationHandler = () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY });
    };

    // Full map pushed on connect
    const initHandler = (counts: Record<string, number>) => {
      setPageUnreadCounts(counts);
    };

    // Incremental update when a new notification is created
    const pageUnreadHandler = ({ pageId, count }: { pageId: string; count: number }) => {
      setPageUnreadCounts((prev) => {
        if (count === 0) {
          const next = { ...prev };
          delete next[pageId];
          return next;
        }
        return { ...prev, [pageId]: count };
      });
    };

    socket.on("notification", notificationHandler);
    socket.on("pageUnreadCountsInit", initHandler);
    socket.on("pageUnreadCountChanged", pageUnreadHandler);

    return () => {
      socket.off("notification", notificationHandler);
      socket.off("pageUnreadCountsInit", initHandler);
      socket.off("pageUnreadCountChanged", pageUnreadHandler);
    };
  }, [socket, queryClient]);
}
