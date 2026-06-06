import { atom } from "jotai";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export interface ExcalidrawOps {
  resetCanvas: () => void;
  openFile: (file: File) => Promise<void>;
}

// Casting the initial value (not using an explicit generic) avoids Jotai's
// read-only overload being selected under strictNullChecks: false.
export const excalidrawAPIAtom = atom(null as ExcalidrawImperativeAPI | null);

// Higher-level ops that close over internal Yjs refs — set by excalidraw-editor.tsx
export const excalidrawOpsAtom = atom(null as ExcalidrawOps | null);
