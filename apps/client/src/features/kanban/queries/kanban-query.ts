import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as kanbanService from "../services/kanban-service";
import type { IKanbanCard, IKanbanColumn } from "../types/kanban.types";

const boardKey = (pageId: string) => ["kanban-board", pageId];

// ─── Board ────────────────────────────────────────────────────────────────────

export function useKanbanBoardQuery(pageId: string) {
  return useQuery({
    queryKey: boardKey(pageId),
    queryFn: () => kanbanService.getBoard(pageId),
    enabled: !!pageId,
  });
}

// ─── Columns ──────────────────────────────────────────────────────────────────

export function useCreateColumnMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.createColumn,
    onSuccess: (col) => {
      qc.setQueryData<IKanbanColumn[]>(boardKey(pageId), (prev = []) => [
        ...prev,
        { ...col, cards: [] },
      ]);
    },
  });
}

export function useUpdateColumnMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.updateColumn,
    onSuccess: (updated) => {
      qc.setQueryData<IKanbanColumn[]>(boardKey(pageId), (prev = []) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
      );
    },
  });
}

export function useMoveColumnMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.moveColumn,
    onSuccess: (updated) => {
      qc.setQueryData<IKanbanColumn[]>(boardKey(pageId), (prev = []) =>
        prev
          .map((c) => (c.id === updated.id ? { ...c, position: updated.position } : c))
          .sort((a, b) => a.position - b.position),
      );
    },
  });
}

export function useDeleteColumnMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.deleteColumn,
    onSuccess: (_, columnId) => {
      qc.setQueryData<IKanbanColumn[]>(boardKey(pageId), (prev = []) =>
        prev.filter((c) => c.id !== columnId),
      );
    },
  });
}

// ─── Cards ────────────────────────────────────────────────────────────────────

export function useCreateCardMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.createCard,
    onSuccess: (card) => {
      qc.setQueryData<IKanbanColumn[]>(boardKey(pageId), (prev = []) =>
        prev.map((col) =>
          col.id !== card.columnId
            ? col
            : { ...col, cards: [...col.cards, { ...card, assignees: [] }] },
        ),
      );
    },
  });
}

export function useUpdateCardMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.updateCard,
    onSuccess: (updated) => {
      qc.setQueryData<IKanbanColumn[]>(boardKey(pageId), (prev = []) =>
        prev.map((col) => ({
          ...col,
          cards: col.cards.map((c) =>
            c.id === updated.id ? { ...c, ...updated } : c,
          ),
        })),
      );
    },
  });
}

export function useMoveCardMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.moveCard,
    onSuccess: (updated) => {
      qc.setQueryData<IKanbanColumn[]>(boardKey(pageId), (prev = []) => {
        // Locate the full card object in whichever column currently holds it
        let card: IKanbanCard | undefined;
        for (const col of prev) {
          card = col.cards.find((c) => c.id === updated.id);
          if (card) break;
        }
        if (!card) return prev;

        const movedCard: IKanbanCard = {
          ...card,
          columnId: updated.columnId,
          position: updated.position,
        };

        return prev.map((col) => {
          if (col.id === updated.columnId) {
            // Add to target column (deduplicate in case it was already there)
            return {
              ...col,
              cards: [
                ...col.cards.filter((c) => c.id !== updated.id),
                movedCard,
              ].sort((a, b) => a.position - b.position),
            };
          }
          // Strip from every other column
          return { ...col, cards: col.cards.filter((c) => c.id !== updated.id) };
        });
      });
    },
  });
}

export function useDeleteCardMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.deleteCard,
    onSuccess: (_, cardId) => {
      qc.setQueryData<IKanbanColumn[]>(boardKey(pageId), (prev = []) =>
        prev.map((col) => ({
          ...col,
          cards: col.cards.filter((c) => c.id !== cardId),
        })),
      );
    },
  });
}

export function useAddAssigneeMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.addAssignee,
    onSuccess: (_, { cardId, userId }) => {
      // refetch to get the full user object (name, avatarUrl)
      qc.invalidateQueries({ queryKey: boardKey(pageId) });
    },
  });
}

export function useRemoveAssigneeMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.removeAssignee,
    onSuccess: (_, { cardId, userId }) => {
      qc.setQueryData<IKanbanColumn[]>(boardKey(pageId), (prev = []) =>
        prev.map((col) => ({
          ...col,
          cards: col.cards.map((c) =>
            c.id !== cardId
              ? c
              : {
                  ...c,
                  assignees: c.assignees.filter((a) => a.userId !== userId),
                },
          ),
        })),
      );
    },
  });
}
