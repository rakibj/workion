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

const TX_ORIGIN = "board-tldraw";

// Per-tab records must not be shared across clients.
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

    const localPersistence = new IndexeddbPersistence(roomName, yDoc);
    const socket = new HocuspocusProviderWebsocket({ url: collaborationURL });

    let unlistenStore: (() => void) | null = null;
    let initialized = false;
    let indexeddbReady = false;
    let providerSynced = false;
    let offlineTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Initialization ────────────────────────────────────────────────────
    // Called once, after both IndexedDB and Hocuspocus have reported ready.
    // By waiting for the provider sync we ensure Account A's page UUID is in
    // yMap before we bootstrap tldraw — avoiding a "wrong page" mismatch.
    const initialize = () => {
      if (initialized) return;
      initialized = true;

      if (offlineTimer !== null) {
        clearTimeout(offlineTimer);
        offlineTimer = null;
      }

      if (yMap.size > 0) {
        // Existing board: replace tldraw's freshly-created default records
        // with the merged (IndexedDB + server) Yjs state so all accounts land
        // on the correct page UUID.
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
      } else {
        // Truly new board: seed tldraw's defaults so the server gets a valid
        // initial state on the first store flush.
        yDoc.transact(() => {
          const records = editor.store.serialize();
          Object.values(records).forEach((r: any) => {
            if (isDocumentRecord(r.id)) yMap.set(r.id, r);
          });
        }, TX_ORIGIN);
      }

      // Store → Yjs: forward user edits to the shared doc.
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
    };

    const tryInitialize = () => {
      if (indexeddbReady && providerSynced) initialize();
    };

    // ── Yjs → tldraw ──────────────────────────────────────────────────────
    // Handles incremental remote changes AFTER the initial bulk load.
    // Skipped until initialized to prevent double-applying the initial state.
    const yMapObserver = (event: Y.YMapEvent<object>) => {
      if (!initialized) return;
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

    localPersistence.on("synced", () => {
      indexeddbReady = true;
      tryInitialize();
      // Offline fallback: if the provider never connects, init from IndexedDB
      // alone after a short grace period.
      if (!providerSynced) {
        offlineTimer = setTimeout(() => {
          providerSynced = true;
          tryInitialize();
        }, 3000);
      }
    });

    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: roomName,
      document: yDoc,
      token,
      onSynced: () => {
        providerSynced = true;
        tryInitialize();
      },
    });

    // Required when passing an external websocketProvider: the constructor
    // does not auto-attach in that case (manageSocket = false), so the
    // provider never registers its open/close listeners and never sends
    // SyncStep1. This is the same call page-editor.tsx makes on every render.
    provider.attach();

    return () => {
      yMap.unobserve(yMapObserver);
      unlistenStore?.();
      if (offlineTimer !== null) clearTimeout(offlineTimer);
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
