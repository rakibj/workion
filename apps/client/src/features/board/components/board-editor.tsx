import { useEffect, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import { Tldraw } from "tldraw";
import type { Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useCollabToken } from "@/features/auth/queries/auth-query";
import useCollaborationUrl from "@/features/editor/hooks/use-collaboration-url";

// Tags our own writes so the observer doesn't echo them back locally.
const TX_ORIGIN = "board-tldraw";

// Per-tab records (camera, instance state) must not be shared across clients.
const isDocumentRecord = (id: string) =>
  !id.startsWith("instance") &&
  !id.startsWith("camera") &&
  !id.startsWith("pointer");

interface BoardEditorProps {
  pageId: string;
  readOnly: boolean;
}

export default function BoardEditor({ pageId, readOnly }: BoardEditorProps) {
  const { data: collabQuery } = useCollabToken();
  const collaborationURL = useCollaborationUrl();
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    if (!editor || !collabQuery?.token) return;

    const token = collabQuery.token;
    const roomName = `board.${pageId}`;
    const yDoc = new Y.Doc();
    const yMap = yDoc.getMap<object>("tldraw");

    // Local-first persistence: survives a quick refresh even when the
    // Hocuspocus server hasn't flushed its 10-second debounce yet.
    const localPersistence = new IndexeddbPersistence(roomName, yDoc);
    const socket = new HocuspocusProviderWebsocket({ url: collaborationURL });

    let unlistenStore: (() => void) | null = null;

    // ── Yjs → tldraw ──────────────────────────────────────────────────────
    // Handles incremental remote changes after the initial load:
    // shapes drawn by other users, reconnect deltas, etc.
    const yMapObserver = (event: Y.YMapEvent<object>) => {
      if (event.transaction.origin === TX_ORIGIN) return;
      editor.store.mergeRemoteChanges(() => {
        event.changes.keys.forEach((change, key) => {
          if (change.action === "delete") {
            editor.store.remove([key as any]);
          } else {
            const record = yMap.get(key);
            if (record) editor.store.put([record as any]);
          }
        });
      });
    };
    yMap.observe(yMapObserver);

    // IndexedDB "synced" always fires (fast, local, works offline).
    // We initialize from local state here instead of waiting for the
    // WebSocket so the store listener is always registered regardless of
    // network status. Server data arrives later via yMapObserver.
    localPersistence.on("synced", () => {
      if (yMap.size === 0) {
        // Brand-new board: seed Yjs from tldraw's initial canvas state.
        // store.serialize() defaults to scope:'document', so instance/camera
        // records are excluded; the isDocumentRecord guard is belt-and-suspenders.
        yDoc.transact(() => {
          const records = editor.store.serialize();
          Object.values(records).forEach((r: any) => {
            if (isDocumentRecord(r.id)) yMap.set(r.id, r);
          });
        }, TX_ORIGIN);
      } else {
        // Has persisted local state: replace tldraw's defaults with it.
        editor.store.mergeRemoteChanges(() => {
          const toRemove = editor.store
            .allRecords()
            .filter((r) => isDocumentRecord(r.id))
            .map((r) => r.id);
          if (toRemove.length > 0) editor.store.remove(toRemove as any[]);
          yMap.forEach((val: any, key) => {
            if (isDocumentRecord(key)) editor.store.put([val]);
          });
        });
      }

      // Register store listener AFTER the initial tldraw state is set so
      // the default canvas records are never inadvertently written to Yjs
      // before we know whether the board already has saved content.
      unlistenStore = editor.store.listen(
        ({ changes }) => {
          yDoc.transact(() => {
            Object.values(changes.added).forEach((r: any) =>
              yMap.set(r.id, r),
            );
            Object.values(changes.updated).forEach(([, r]: any) =>
              yMap.set(r.id, r),
            );
            Object.values(changes.removed).forEach((r: any) =>
              yMap.delete(r.id),
            );
          }, TX_ORIGIN);
        },
        { source: "user", scope: "document" },
      );
    });

    // HocuspocusProvider merges server state into yDoc via the standard Yjs
    // sync protocol. Subsequent changes from the server (and other clients)
    // are delivered incrementally through yMapObserver above.
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: roomName,
      document: yDoc,
      token,
    });

    return () => {
      yMap.unobserve(yMapObserver);
      unlistenStore?.();
      localPersistence.destroy();
      provider.destroy();
      socket.destroy();
      yDoc.destroy();
    };
  }, [editor, collabQuery?.token, pageId, collaborationURL]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Tldraw
        onMount={(tlEditor) => {
          setEditor(tlEditor);
          if (readOnly) {
            tlEditor.updateInstanceState({ isReadonly: true });
          }
          return () => setEditor(null);
        }}
      />
    </div>
  );
}
