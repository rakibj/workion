import { useMutation, useQuery, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import * as kanbanService from "../services/kanban-service";
import type { KanbanAssignableMember } from "../services/kanban-service";
import type {
  IKanbanCard,
  IKanbanCategory,
  IKanbanColumn,
  IKanbanMilestone,
} from "../types/kanban.types";

const boardKey = (pageId: string) => ["kanban-board", pageId];
const milestonesKey = (pageId: string) => ["kanban-milestones", pageId];
const categoriesKey = (pageId: string) => ["kanban-categories", pageId];

// ─── Board ────────────────────────────────────────────────────────────────────

export function useKanbanBoardQuery(pageId: string | undefined) {
  return useQuery({
    queryKey: boardKey(pageId ?? ""),
    queryFn: () => kanbanService.getBoard(pageId!),
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
            : { ...col, cards: [...col.cards, { ...card, assignees: [], categoryValues: [] }] },
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
      // The server returns a raw KanbanCard row: it has milestoneId but no
      // embedded milestone object. Derive it from the milestones cache so the
      // card badge updates immediately without a board refetch.
      const milestones = qc.getQueryData<IKanbanMilestone[]>(milestonesKey(pageId)) ?? [];
      const milestone = updated.milestoneId
        ? (milestones.find((m) => m.id === updated.milestoneId) ?? null)
        : null;

      qc.setQueryData<IKanbanColumn[]>(boardKey(pageId), (prev = []) =>
        prev.map((col) => ({
          ...col,
          cards: col.cards.map((c) =>
            c.id === updated.id ? { ...c, ...updated, milestone } : c,
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

// ─── Milestones ───────────────────────────────────────────────────────────────

export function useMilestonesQuery(pageId: string) {
  return useQuery({
    queryKey: milestonesKey(pageId),
    queryFn: () => kanbanService.listMilestones(pageId),
    enabled: !!pageId,
  });
}

export function useCreateMilestoneMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.createMilestone,
    onSuccess: (ms) => {
      qc.setQueryData<IKanbanMilestone[]>(milestonesKey(pageId), (prev = []) => [
        ...prev,
        ms,
      ]);
    },
  });
}

export function useUpdateMilestoneMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.updateMilestone,
    onSuccess: (updated) => {
      qc.setQueryData<IKanbanMilestone[]>(milestonesKey(pageId), (prev = []) =>
        prev.map((m) => (m.id === updated.id ? updated : m)),
      );
      // board cards embedding the milestone name also need refreshing
      qc.invalidateQueries({ queryKey: boardKey(pageId) });
    },
  });
}

export function useDeleteMilestoneMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.deleteMilestone,
    onSuccess: (_, milestoneId) => {
      qc.setQueryData<IKanbanMilestone[]>(milestonesKey(pageId), (prev = []) =>
        prev.filter((m) => m.id !== milestoneId),
      );
      // cards assigned to this milestone now have milestone=null
      qc.invalidateQueries({ queryKey: boardKey(pageId) });
    },
  });
}

// ─── Categories ─────────────────────────────────────────────────────────────

export function useCategoriesQuery(pageId: string) {
  return useQuery({
    queryKey: categoriesKey(pageId),
    queryFn: () => kanbanService.listCategories(pageId),
    enabled: !!pageId,
  });
}

export function useCreateCategoryMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.createCategory,
    onSuccess: (category) => {
      qc.setQueryData<IKanbanCategory[]>(categoriesKey(pageId), (prev = []) => [
        ...prev,
        { ...category, options: [] },
      ]);
    },
  });
}

export function useUpdateCategoryMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.updateCategory,
    onSuccess: (updated) => {
      qc.setQueryData<IKanbanCategory[]>(categoriesKey(pageId), (prev = []) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
      );
    },
  });
}

export function useDeleteCategoryMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.deleteCategory,
    onSuccess: (_, categoryId) => {
      qc.setQueryData<IKanbanCategory[]>(categoriesKey(pageId), (prev = []) =>
        prev.filter((c) => c.id !== categoryId),
      );
      // cards holding a value for this category now need it cleared
      qc.invalidateQueries({ queryKey: boardKey(pageId) });
    },
  });
}

export function useCreateCategoryOptionMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.createCategoryOption,
    onSuccess: (option) => {
      qc.setQueryData<IKanbanCategory[]>(categoriesKey(pageId), (prev = []) =>
        prev.map((c) =>
          c.id !== option.categoryId ? c : { ...c, options: [...c.options, option] },
        ),
      );
    },
  });
}

export function useUpdateCategoryOptionMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.updateCategoryOption,
    onSuccess: (updated) => {
      qc.setQueryData<IKanbanCategory[]>(categoriesKey(pageId), (prev = []) =>
        prev.map((c) =>
          c.id !== updated.categoryId
            ? c
            : {
                ...c,
                options: c.options.map((o) => (o.id === updated.id ? updated : o)),
              },
        ),
      );
    },
  });
}

export function useDeleteCategoryOptionMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { optionId: string; categoryId: string }) =>
      kanbanService.deleteCategoryOption(vars.optionId),
    onSuccess: (_, { optionId, categoryId }) => {
      qc.setQueryData<IKanbanCategory[]>(categoriesKey(pageId), (prev = []) =>
        prev.map((c) =>
          c.id !== categoryId
            ? c
            : { ...c, options: c.options.filter((o) => o.id !== optionId) },
        ),
      );
      // cards holding this option now need it cleared
      qc.invalidateQueries({ queryKey: boardKey(pageId) });
    },
  });
}

export function useSetCardCategoryMutation(pageId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: kanbanService.setCardCategory,
    onSuccess: (_, { cardId, categoryId, optionId }) => {
      qc.setQueryData<IKanbanColumn[]>(boardKey(pageId), (prev = []) =>
        prev.map((col) => ({
          ...col,
          cards: col.cards.map((c) => {
            if (c.id !== cardId) return c;
            const rest = c.categoryValues.filter((v) => v.categoryId !== categoryId);
            return {
              ...c,
              categoryValues: optionId ? [...rest, { categoryId, optionId }] : rest,
            };
          }),
        })),
      );
    },
  });
}

// ─── Assignable members ───────────────────────────────────────────────────────

export function useKanbanAssignableMembersQuery(
  pageId: string,
): UseQueryResult<KanbanAssignableMember[], Error> {
  return useQuery({
    queryKey: ["kanban-assignable-members", pageId],
    queryFn: () => kanbanService.getAssignableMembers(pageId),
    enabled: !!pageId,
    staleTime: 60 * 1000,
  });
}

