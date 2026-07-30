import { atom } from "jotai";

export interface IKanbanCursor {
  userId: string;
  pageId: string;
  x: number;
  y: number;
  name: string;
  color: string;
  updatedAt: number;
}

// Ephemeral, high-frequency — kept out of React Query cache so it doesn't
// trigger board re-renders or get wiped by a board refetch.
export const kanbanCursorsAtom = atom<Record<string, IKanbanCursor>>({});
