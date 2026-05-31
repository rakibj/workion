import api from "@/lib/api-client";
import type { IKanbanCard, IKanbanColumn } from "../types/kanban.types";

export async function getBoard(pageId: string): Promise<IKanbanColumn[]> {
  const res = await api.post<IKanbanColumn[]>("/kanban/board", { pageId });
  return res.data;
}

// ─── Columns ─────────────────────────────────────────────────────────────────

export async function createColumn(data: {
  pageId: string;
  name: string;
  color?: string;
}): Promise<IKanbanColumn> {
  const res = await api.post<IKanbanColumn>("/kanban/columns/create", data);
  return res.data;
}

export async function updateColumn(data: {
  columnId: string;
  name?: string;
  color?: string;
}): Promise<IKanbanColumn> {
  const res = await api.post<IKanbanColumn>("/kanban/columns/update", data);
  return res.data;
}

export async function moveColumn(data: {
  columnId: string;
  position: number;
}): Promise<IKanbanColumn> {
  const res = await api.post<IKanbanColumn>("/kanban/columns/move", data);
  return res.data;
}

export async function deleteColumn(columnId: string): Promise<void> {
  await api.post("/kanban/columns/delete", { columnId });
}

// ─── Cards ────────────────────────────────────────────────────────────────────

export async function createCard(data: {
  columnId: string;
  title: string;
}): Promise<IKanbanCard> {
  const res = await api.post<IKanbanCard>("/kanban/cards/create", data);
  return res.data;
}

export async function updateCard(data: {
  cardId: string;
  title?: string;
  description?: string;
}): Promise<IKanbanCard> {
  const res = await api.post<IKanbanCard>("/kanban/cards/update", data);
  return res.data;
}

export async function moveCard(data: {
  cardId: string;
  columnId: string;
  position: number;
}): Promise<IKanbanCard> {
  const res = await api.post<IKanbanCard>("/kanban/cards/move", data);
  return res.data;
}

export async function deleteCard(cardId: string): Promise<void> {
  await api.post("/kanban/cards/delete", { cardId });
}

// ─── Assignees ────────────────────────────────────────────────────────────────

export async function addAssignee(data: {
  cardId: string;
  userId: string;
}): Promise<void> {
  await api.post("/kanban/cards/assignees/add", data);
}

export async function removeAssignee(data: {
  cardId: string;
  userId: string;
}): Promise<void> {
  await api.post("/kanban/cards/assignees/remove", data);
}
