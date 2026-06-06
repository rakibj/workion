import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import { Excalidraw, loadFromBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./excalidraw-editor.css";
import type {
  ExcalidrawImperativeAPI,
  Collaborator,
  SocketId,
  AppState,
  BinaryFiles,
  BinaryFileData,
} from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import { useAtomValue, useSetAtom } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom";
import { useCollabToken } from "@/features/auth/queries/auth-query";
import useCollaborationUrl from "@/features/editor/hooks/use-collaboration-url";
import { useComputedColorScheme } from "@mantine/core";
import { excalidrawAPIAtom, excalidrawOpsAtom } from "../atoms/excalidraw-atom";

const TX_ORIGIN = "excalidraw-collab";

// Module-level WebSocket singleton — created once, reused across navigations.
let _excalidrawSocket: HocuspocusProviderWebsocket | null = null;
let _excalidrawSocketUrl: string | null = null;

function getExcalidrawSocket(url: string): HocuspocusProviderWebsocket {
  if (!_excalidrawSocket || _excalidrawSocketUrl !== url) {
    _excalidrawSocket?.destroy();
    _excalidrawSocket = new HocuspocusProviderWebsocket({ url });
    _excalidrawSocketUrl = url;
  }
  return _excalidrawSocket;
}

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

interface ExcalidrawEditorProps {
  pageId: string;
  readOnly: boolean;
}

export default function ExcalidrawEditor({ pageId, readOnly }: ExcalidrawEditorProps) {
  const appUser = useAtomValue(userAtom);
  const { data: collabQuery } = useCollabToken();
  const collaborationURL = useCollaborationUrl();
  const theme = useComputedColorScheme();

  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [ready, setReady] = useState(false);

  const setExcalidrawAPIAtom = useSetAtom(excalidrawAPIAtom);
  const setExcalidrawOpsAtom = useSetAtom(excalidrawOpsAtom);

  // Always-fresh reference to appUser so pointer handler doesn't go stale.
  const appUserRef = useRef(appUser);
  appUserRef.current = appUser;

  // Refs shared between the Yjs effect and onChange/onPointerUpdate callbacks.
  const yElementsRef = useRef<Y.Map<object> | null>(null);
  const yFilesRef = useRef<Y.Map<object> | null>(null);
  const yDocRef = useRef<Y.Doc | null>(null);
  const initializedRef = useRef(false);
  const awarenessRef = useRef<any>(null);
  // Tracks the last versionNonce we pushed to Yjs per element id.
  // We cannot read this back from Yjs because Yjs stores the same object
  // reference that Excalidraw mutates in-place — so yEl.get(id).versionNonce
  // always equals el.versionNonce, causing moves/resizes to be silently dropped.
  const syncedVersionsRef = useRef<Map<string, number>>(new Map());

  // Reset ready + version tracking when the page changes.
  useEffect(() => {
    setReady(false);
    syncedVersionsRef.current.clear();
  }, [pageId]);

  // Sync API reference to global atom; clear on unmount.
  useEffect(() => {
    setExcalidrawAPIAtom(excalidrawAPI);
  }, [excalidrawAPI, setExcalidrawAPIAtom]);

  useEffect(() => {
    return () => {
      setExcalidrawAPIAtom(null);
      setExcalidrawOpsAtom(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose Yjs-aware canvas operations once the API is available.
  // Callbacks read refs at call time so they always see the latest Yjs state.
  useEffect(() => {
    if (!excalidrawAPI) return;

    const resetCanvas = () => {
      const yDoc = yDocRef.current;
      const yEl = yElementsRef.current;
      if (yDoc && yEl) {
        yDoc.transact(() => {
          yEl.clear();
          syncedVersionsRef.current.clear();
        }, TX_ORIGIN);
      }
      excalidrawAPI.resetScene();
    };

    const openFile = async (file: File) => {
      const data = await loadFromBlob(
        file,
        excalidrawAPI.getAppState() as AppState,
        [...excalidrawAPI.getSceneElements()],
      );
      const yDoc = yDocRef.current;
      const yEl = yElementsRef.current;
      const yFl = yFilesRef.current;
      if (yDoc && yEl) {
        yDoc.transact(() => {
          yEl.clear();
          syncedVersionsRef.current.clear();
        }, TX_ORIGIN);
      }
      if (data.elements) {
        excalidrawAPI.updateScene({ elements: data.elements });
      }
      if (data.files && yFl && yDoc) {
        yDoc.transact(() => {
          Object.entries(data.files!).forEach(([id, f]) => yFl.set(id, f));
        }, TX_ORIGIN);
        excalidrawAPI.addFiles(Object.values(data.files) as BinaryFileData[]);
      }
    };

    setExcalidrawOpsAtom({ resetCanvas, openFile });
  }, [excalidrawAPI, setExcalidrawOpsAtom]);

  // ── Yjs + presence sync effect ──────────────────────────────────────────
  useEffect(() => {
    if (!excalidrawAPI || !collabQuery?.token) return;

    const token = collabQuery.token;
    const roomName = `excalidraw.${pageId}`;
    const yDoc = new Y.Doc();
    const yElements = yDoc.getMap<object>("excalidraw");
    const yFiles = yDoc.getMap<object>("excalidraw-files");

    yDocRef.current = yDoc;
    yElementsRef.current = yElements;
    yFilesRef.current = yFiles;

    const localPersistence = new IndexeddbPersistence(roomName, yDoc);
    const socket = getExcalidrawSocket(collaborationURL);

    let unlistenYMap: (() => void) | null = null;

    // ── Core initialization: load canvas from Yjs state ──────────────────
    // Called immediately once IndexedDB has loaded local state. Server updates
    // are handled by yMapObserver once the HocuspocusProvider syncs — no need
    // to block the canvas on the network round-trip.
    const initialize = () => {
      if (initializedRef.current) return;
      initializedRef.current = true;

      if (yFiles.size > 0) {
        excalidrawAPI.addFiles([...yFiles.values()] as BinaryFileData[]);
      }

      if (yElements.size > 0) {
        const initialElements = [...yElements.values()] as ExcalidrawElement[];
        initialElements.forEach((el) => {
          syncedVersionsRef.current.set(el.id, (el as any).versionNonce);
        });
        excalidrawAPI.updateScene({ elements: initialElements });
        excalidrawAPI.scrollToContent(undefined, { animate: false, fitToViewport: true });
      }

      setReady(true);

      // Yjs → Excalidraw: apply remote element changes (server sync + other clients).
      const yMapObserver = (event: Y.YMapEvent<object>) => {
        if (event.transaction.origin === TX_ORIGIN) return;
        const remoteElements = [...yElements.values()] as ExcalidrawElement[];
        // Pre-seed syncedVersions so onChange doesn't echo remote changes back to Yjs.
        remoteElements.forEach((el) => {
          syncedVersionsRef.current.set(el.id, (el as any).versionNonce);
        });
        excalidrawAPI.updateScene({ elements: remoteElements });
      };

      // Yjs → Excalidraw: apply remotely added files.
      const yFilesObserver = (event: Y.YMapEvent<object>) => {
        if (event.transaction.origin === TX_ORIGIN) return;
        const added: BinaryFileData[] = [];
        event.changes.keys.forEach((change, key) => {
          if (change.action !== "delete") {
            const file = yFiles.get(key);
            if (file) added.push(file as BinaryFileData);
          }
        });
        if (added.length > 0) excalidrawAPI.addFiles(added);
      };

      yElements.observe(yMapObserver);
      yFiles.observe(yFilesObserver);
      unlistenYMap = () => {
        yElements.unobserve(yMapObserver);
        yFiles.unobserve(yFilesObserver);
      };
    };

    // Initialize as soon as local IndexedDB state is available — don't wait
    // for the server. The yMapObserver picks up server changes when they arrive.
    localPersistence.on("synced", initialize);

    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: roomName,
      document: yDoc,
      token,
    });

    provider.attach();

    // ── Presence (remote cursors + laser trails) ──────────────────────────
    const awareness = provider.awareness;
    awarenessRef.current = awareness;
    let cleanupPresence: (() => void) | null = null;

    if (awareness) {
      const applyRemotePresences = () => {
        const next = new Map<SocketId, Collaborator>();
        awareness.getStates().forEach((state: any, clientId: number) => {
          if (clientId === awareness.clientID) return;
          const p = state?.presence;
          if (p?.pointer) {
            next.set(String(clientId) as SocketId, {
              pointer: p.pointer,
              // button is required for laser trail rendering on the receiving end
              button: p.button,
              username: p.username ?? undefined,
              color: { background: p.color, stroke: p.color },
            });
          }
        });
        excalidrawAPI.updateScene({ collaborators: next });
      };

      awareness.on("change", applyRemotePresences);
      applyRemotePresences();

      cleanupPresence = () => {
        awareness.off("change", applyRemotePresences);
        awareness.setLocalState(null);
      };
    }

    return () => {
      initializedRef.current = false;
      yDocRef.current = null;
      yElementsRef.current = null;
      yFilesRef.current = null;
      awarenessRef.current = null;
      unlistenYMap?.();
      cleanupPresence?.();
      localPersistence.destroy();
      provider.destroy();
      // socket is a singleton — not destroyed on unmount
      yDoc.destroy();
    };
  }, [excalidrawAPI, collabQuery?.token, pageId, collaborationURL]);

  // Excalidraw → Yjs: push local element and file changes.
  const handleChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], _appState: AppState, files: BinaryFiles) => {
      const yEl = yElementsRef.current;
      const yFl = yFilesRef.current;
      const yDoc = yDocRef.current;
      if (!yEl || !yFl || !yDoc || !initializedRef.current) return;

      const syncedVersions = syncedVersionsRef.current;
      yDoc.transact(() => {
        elements.forEach((el) => {
          if (syncedVersions.get(el.id) !== (el as any).versionNonce) {
            // Shallow-clone to break reference sharing — Excalidraw mutates
            // elements in-place, so storing the live reference means Yjs would
            // silently hold stale data (wrong position/size) without triggering
            // any observers.
            yEl.set(el.id, { ...el });
            syncedVersions.set(el.id, (el as any).versionNonce);
          }
        });
        Object.entries(files).forEach(([id, fileData]) => {
          if (!yFl.has(id)) {
            yFl.set(id, fileData);
          }
        });
      }, TX_ORIGIN);
    },
    [],
  );

  // Broadcast local cursor position + button state via Hocuspocus awareness.
  // button ("down"/"up") is required by Excalidraw on the receiving end to
  // render laser pointer trails — without it the laser tool appears as a plain
  // cursor with no trail effect.
  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      const awareness = awarenessRef.current;
      if (!awareness) return;
      const user = appUserRef.current;
      awareness.setLocalStateField("presence", {
        pointer: payload.pointer,
        button: payload.button,
        username: user?.name ?? "Anonymous",
        color: getPresenceColor(user?.id ?? "anon"),
      });
    },
    [],
  );

  return (
    <div className="excalidraw-wrapper">
      <Excalidraw
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        onChange={handleChange}
        onPointerUpdate={handlePointerUpdate}
        isCollaborating={true}
        viewModeEnabled={readOnly}
        theme={theme as "light" | "dark"}
      />
      {!ready && (
        <div style={{ position: "absolute", inset: 0, zIndex: 9999 }} />
      )}
    </div>
  );
}
