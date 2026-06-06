import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import { Tldraw } from "tldraw";
import type { Editor } from "tldraw";
import "tldraw/tldraw.css";
import "./board-editor.css";
import { createTLStore, createTLCurrentUser } from "@tldraw/editor";
import type { TLUserPreferences } from "@tldraw/editor";
import { atom } from "@tldraw/state";
import type { Atom } from "@tldraw/state";
import {
  InstancePresenceRecordType,
  UserRecordType,
  getDefaultUserPresence,
} from "@tldraw/tlschema";
import type {
  TLInstancePresence,
  TLInstancePresenceID,
} from "@tldraw/tlschema";
import { useAtomValue } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom";
import { useCollabToken } from "@/features/auth/queries/auth-query";
import useCollaborationUrl from "@/features/editor/hooks/use-collaboration-url";

const TX_ORIGIN = "board-tldraw";

// Module-level WebSocket singleton — created once, reused across board navigations.
// Recreated only if the collaboration URL changes (token rotation, etc.).
let _boardSocket: HocuspocusProviderWebsocket | null = null;
let _boardSocketUrl: string | null = null;

function getBoardSocket(url: string): HocuspocusProviderWebsocket {
  if (!_boardSocket || _boardSocketUrl !== url) {
    _boardSocket?.destroy();
    _boardSocket = new HocuspocusProviderWebsocket({ url });
    _boardSocketUrl = url;
  }
  return _boardSocket;
}

// Stable color palette for user cursors.
const PRESENCE_COLORS = [
  "#E03131", "#C2255C", "#9C36B5", "#3B5BDB", "#1971C2",
  "#0C8599", "#2F9E44", "#E8590C", "#F08C00", "#5C7CFA",
];

function getPresenceColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

// Per-tab records must not be shared across clients via the document Y.Map.
const isDocumentRecord = (id: string) =>
  !id.startsWith("instance") &&
  !id.startsWith("camera") &&
  !id.startsWith("pointer");

interface BoardEditorProps {
  pageId: string;
  readOnly: boolean;
}

export default function BoardEditor({ pageId, readOnly }: BoardEditorProps) {
  const appUser = useAtomValue(userAtom);
  const { data: collabQuery } = useCollabToken();
  const collaborationURL = useCollaborationUrl();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [ready, setReady] = useState(false);

  // Always-fresh reference to appUser so the Yjs effect can read it
  // without becoming a dependency (which would tear down the WebSocket).
  const appUserRef = useRef(appUser);
  appUserRef.current = appUser;

  // ── Mode atom (read-only enforcement) ────────────────────────────────────
  const modeAtomRef = useRef<Atom<"readonly" | "readwrite"> | null>(null);
  if (!modeAtomRef.current) {
    modeAtomRef.current = atom<"readonly" | "readwrite">(
      "board-mode",
      readOnly ? "readonly" : "readwrite",
    );
  }

  useEffect(() => {
    modeAtomRef.current?.set(readOnly ? "readonly" : "readwrite");
  }, [readOnly]);

  // ── Store (created once per page) ────────────────────────────────────────
  const storeRef = useRef<ReturnType<typeof createTLStore> | null>(null);
  if (!storeRef.current) {
    storeRef.current = createTLStore({
      collaboration: { mode: modeAtomRef.current!, status: null },
    });
  }

  // ── User identity for tldraw (cursor color, name, filtering own cursor) ──
  // Created once; stable id/name/color lets tldraw filter out our own cursor
  // when rendering remote presence.
  const currentUser = useMemo(() => {
    const id = appUser?.id ?? "anon";
    const prefsAtom = atom<TLUserPreferences>("board-user-prefs", {
      id,
      name: appUser?.name ?? "Anonymous",
      color: getPresenceColor(id),
    });
    return createTLCurrentUser({ userPreferences: prefsAtom });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUser?.id]);

  // Reset ready when the page changes so the overlay re-engages.
  useEffect(() => { setReady(false); }, [pageId]);

  // ── Yjs + presence sync effect ───────────────────────────────────────────
  useEffect(() => {
    if (!editor || !collabQuery?.token) return;

    const token = collabQuery.token;
    const roomName = `board.${pageId}`;
    const yDoc = new Y.Doc();
    const yMap = yDoc.getMap<object>("tldraw");
    const store = editor.store;

    const localPersistence = new IndexeddbPersistence(roomName, yDoc);
    const socket = getBoardSocket(collaborationURL);

    let unlistenStore: (() => void) | null = null;
    let unlistenSession: (() => void) | null = null;
    let initialized = false;
    let indexeddbReady = false;
    let providerSynced = false;
    let offlineTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Initialization (document sync) ────────────────────────────────────
    const initialize = () => {
      if (initialized) return;
      initialized = true;

      if (offlineTimer !== null) {
        clearTimeout(offlineTimer);
        offlineTimer = null;
      }

      if (yMap.size > 0) {
        // Existing board: replace tldraw's default records with the merged
        // (IndexedDB + server) Yjs state.
        store.mergeRemoteChanges(() => {
          const toRemove = store
            .allRecords()
            .filter((r) => isDocumentRecord(r.id))
            .map((r) => r.id);
          if (toRemove.length > 0) store.remove(toRemove as any[]);
          yMap.forEach((val: any, key) => {
            if (isDocumentRecord(key)) store.put([val]);
          });
        });
      } else {
        // New board: seed tldraw's default records into the Yjs doc.
        yDoc.transact(() => {
          const records = store.serialize();
          Object.values(records).forEach((r: any) => {
            if (isDocumentRecord(r.id)) yMap.set(r.id, r);
          });
        }, TX_ORIGIN);
      }

      // Unblock the canvas now that the Yjs state is loaded. Any interaction
      // before this point would have been wiped by the store clear above.
      setReady(true);

      // Store → Yjs: forward user edits to the shared doc.
      unlistenStore = store.listen(
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

    // ── Yjs → tldraw (document changes) ──────────────────────────────────
    const yMapObserver = (event: Y.YMapEvent<object>) => {
      if (!initialized) return;
      if (event.transaction.origin === TX_ORIGIN) return;
      store.mergeRemoteChanges(() => {
        event.changes.keys.forEach((change, key) => {
          if (change.action === "delete") {
            store.remove([key as any]);
          } else {
            const record = yMap.get(key);
            if (record) store.put([record as any]);
          }
        });
      });
    };
    yMap.observe(yMapObserver);

    localPersistence.on("synced", () => {
      indexeddbReady = true;
      tryInitialize();
      // Offline fallback: if provider never connects, init from IndexedDB alone.
      if (!providerSynced) {
        offlineTimer = setTimeout(() => {
          providerSynced = true;
          tryInitialize();
        }, 1500);
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
    // does not auto-attach (manageSocket = false).
    provider.attach();

    // ── Presence sync (cursors) ───────────────────────────────────────────
    const awareness = provider.awareness;
    let cleanupPresence: (() => void) | null = null;

    if (awareness) {
      const userId = appUserRef.current?.id ?? "anon";
      const userName = appUserRef.current?.name ?? "Anonymous";
      const userColor = getPresenceColor(userId);
      const presenceId = InstancePresenceRecordType.createId(
        userId,
      ) as TLInstancePresenceID;

      // Data-only TLUser object (not stored in the tldraw store).
      const tlUser = UserRecordType.create({
        id: UserRecordType.createId(userId),
        name: userName,
        color: userColor,
        imageUrl: appUserRef.current?.avatarUrl ?? "",
        meta: {},
      });

      // Map from Yjs awareness clientId to the presenceRecordId of that client,
      // so we can remove the record when they disconnect.
      const clientToPresenceId = new Map<number, TLInstancePresenceID>();

      // Broadcast local cursor state to other clients via awareness.
      let broadcastScheduled = false;
      const broadcastPresence = () => {
        try {
          const state = getDefaultUserPresence(store, tlUser);
          if (!state?.currentPageId) return;
          const record: TLInstancePresence = InstancePresenceRecordType.create({
            ...state,
            id: presenceId,
            userId,
            userName,
            lastActivityTimestamp: Date.now(),
          });
          awareness.setLocalStateField("presence", record);
        } catch {
          // store may not be ready yet
        }
      };

      // Throttle broadcasts to one per animation frame (~60fps).
      const scheduleBroadcast = () => {
        if (broadcastScheduled) return;
        broadcastScheduled = true;
        requestAnimationFrame(() => {
          broadcastScheduled = false;
          broadcastPresence();
        });
      };

      // Watch cursor moves, page switches, selection changes, etc.
      unlistenSession = store.listen(
        () => { scheduleBroadcast(); },
        { source: "user", scope: "session" },
      );

      // Initial broadcast so we appear immediately.
      broadcastPresence();

      // Apply all current remote presences to the local store.
      const applyRemotePresences = () => {
        const toAdd: TLInstancePresence[] = [];
        awareness.getStates().forEach((state, clientId) => {
          if (clientId === awareness.clientID) return;
          const presence = state?.presence as TLInstancePresence | undefined;
          if (presence?.userId && presence?.currentPageId) {
            clientToPresenceId.set(clientId, presence.id as TLInstancePresenceID);
            toAdd.push(presence);
          }
        });
        if (toAdd.length > 0) {
          store.mergeRemoteChanges(() => { store.put(toAdd); });
        }
      };

      const awarenessChangeHandler = ({
        removed,
      }: {
        added: number[];
        updated: number[];
        removed: number[];
      }) => {
        // Remove presence records for clients that disconnected.
        if (removed.length > 0) {
          const toRemove = removed
            .map((id) => clientToPresenceId.get(id))
            .filter((id): id is TLInstancePresenceID => id !== undefined);
          if (toRemove.length > 0) {
            store.mergeRemoteChanges(() => { store.remove(toRemove); });
            removed.forEach((id) => clientToPresenceId.delete(id));
          }
        }
        applyRemotePresences();
      };

      awareness.on("change", awarenessChangeHandler);
      applyRemotePresences();

      cleanupPresence = () => {
        awareness.off("change", awarenessChangeHandler);
        // Remove our presence from other clients' views on disconnect.
        awareness.setLocalState(null);
      };
    }

    return () => {
      yMap.unobserve(yMapObserver);
      unlistenStore?.();
      unlistenSession?.();
      if (offlineTimer !== null) clearTimeout(offlineTimer);
      cleanupPresence?.();
      localPersistence.destroy();
      provider.destroy();
      // socket is a singleton — not destroyed on unmount
      yDoc.destroy();
    };
  }, [editor, collabQuery?.token, pageId, collaborationURL]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Tldraw
        store={storeRef.current}
        user={currentUser}
        autoFocus={!readOnly}
        onMount={(tlEditor) => {
          setEditor(tlEditor);
          return () => setEditor(null);
        }}
      />
      {!ready && (
        <div style={{ position: "absolute", inset: 0, zIndex: 9999 }} />
      )}
    </div>
  );
}
