import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Menu,
  Modal,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconDotsVertical,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import clsx from "clsx";
import { useDisclosure } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import type { IKanbanCard, IKanbanColumn, KanbanColor } from "../types/kanban.types";
import CardDescriptionEditor, { getDescriptionPlainText } from "./card-description-editor";
import {
  useAddAssigneeMutation,
  useCreateCardMutation,
  useCreateColumnMutation,
  useDeleteCardMutation,
  useDeleteColumnMutation,
  useKanbanBoardQuery,
  useMoveCardMutation,
  useMoveColumnMutation,
  useRemoveAssigneeMutation,
  useUpdateCardMutation,
  useUpdateColumnMutation,
} from "../queries/kanban-query";
import { useSpaceMembersInfiniteQuery } from "@/features/space/queries/space-query";
import classes from "./kanban-board-page.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS: { name: KanbanColor; css: string }[] = [
  { name: "gray", css: "var(--mantine-color-gray-5)" },
  { name: "blue", css: "var(--mantine-color-blue-5)" },
  { name: "green", css: "var(--mantine-color-green-5)" },
  { name: "yellow", css: "var(--mantine-color-yellow-5)" },
  { name: "red", css: "var(--mantine-color-red-5)" },
  { name: "purple", css: "var(--mantine-color-violet-5)" },
];

const colorCss = (name: KanbanColor) =>
  COLORS.find((c) => c.name === name)?.css ?? COLORS[0].css;

// ─── Position helpers ─────────────────────────────────────────────────────────

const STEP = 1000;

function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return STEP;
  if (before === null) return (after as number) / 2;
  if (after === null) return before + STEP;
  return (before + after) / 2;
}

function getAdjacentPositions(
  items: { position: number }[],
  insertBefore: number | null, // index of item to insert before; null = append
): { before: number | null; after: number | null } {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  if (insertBefore === null) {
    const last = sorted[sorted.length - 1];
    return { before: last?.position ?? null, after: null };
  }
  const beforeItem = sorted[insertBefore - 1] ?? null;
  const afterItem = sorted[insertBefore] ?? null;
  return {
    before: beforeItem?.position ?? null,
    after: afterItem?.position ?? null,
  };
}

// ─── Drop indicator ───────────────────────────────────────────────────────────

function CardDropIndicator({ edge }: { edge: Edge | null }) {
  if (!edge) return null;
  return (
    <div
      className={clsx(
        classes.dropIndicator,
        edge === "top" && classes.dropIndicatorTop,
        edge === "bottom" && classes.dropIndicatorBottom,
      )}
    />
  );
}

function ColumnDropIndicator({ edge }: { edge: Edge | null }) {
  if (!edge) return null;
  return (
    <div
      className={clsx(
        classes.columnDropIndicator,
        edge === "left" && classes.columnDropLeft,
        edge === "right" && classes.columnDropRight,
      )}
    />
  );
}

// ─── Card component ───────────────────────────────────────────────────────────

interface KanbanCardProps {
  card: IKanbanCard;
  column: IKanbanColumn;
  pageId: string;
  spaceId: string;
  canEdit: boolean;
  onOpenCard: (card: IKanbanCard) => void;
}

function KanbanCardItem({
  card,
  column,
  pageId,
  spaceId,
  canEdit,
  onOpenCard,
}: KanbanCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!ref.current || !canEdit) return;
    return combine(
      draggable({
        element: ref.current,
        getInitialData: () => ({
          type: "kanban-card",
          cardId: card.id,
          columnId: column.id,
        }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element: ref.current,
        canDrop: ({ source }) => source.data.type === "kanban-card",
        getData: ({ input, element }) =>
          attachClosestEdge(
            { type: "kanban-card", cardId: card.id, columnId: column.id },
            { input, element, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => setClosestEdge(null),
      }),
    );
  }, [card.id, column.id, canEdit]);

  return (
    <div className={classes.cardWrapper}>
      <CardDropIndicator edge={closestEdge === "top" ? "top" : null} />
      <div
        ref={ref}
        className={clsx(classes.card, isDragging && classes.cardDragging, canEdit && classes.cardEditable)}
        onClick={() => onOpenCard(card)}
        role={canEdit ? "button" : undefined}
        tabIndex={canEdit ? 0 : -1}
        onKeyDown={(e) => {
          if (canEdit && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onOpenCard(card);
          }
        }}
      >
        <Text size="sm" className={classes.cardTitle}>{card.title || "Untitled"}</Text>
        {card.description && (
          <Text size="xs" c="dimmed" lineClamp={2} className={classes.cardDesc}>
            {getDescriptionPlainText(card.description)}
          </Text>
        )}
        {card.assignees.length > 0 && (
          <Avatar.Group mt={6} spacing="xs">
            {card.assignees.slice(0, 4).map((a) => (
              <Tooltip key={a.userId} label={a.name} withArrow>
                <Avatar src={a.avatarUrl} size={20} radius="xl" name={a.name} />
              </Tooltip>
            ))}
          </Avatar.Group>
        )}
      </div>
      <CardDropIndicator edge={closestEdge === "bottom" ? "bottom" : null} />
    </div>
  );
}

// ─── Card modal ───────────────────────────────────────────────────────────────

interface CardModalProps {
  card: IKanbanCard | null;
  pageId: string;
  spaceId: string;
  canEdit: boolean;
  onClose: () => void;
}

function CardModal({ card, pageId, spaceId, canEdit, onClose }: CardModalProps) {
  const [title, setTitle] = useState(card?.title ?? "");
  const [desc, setDesc] = useState(card?.description ?? "");
  const [memberSearch, setMemberSearch] = useState("");
  const [showAssigneeSearch, setShowAssigneeSearch] = useState(false);

  const updateCard = useUpdateCardMutation(pageId);
  const deleteCard = useDeleteCardMutation(pageId);
  const addAssignee = useAddAssigneeMutation(pageId);
  const removeAssignee = useRemoveAssigneeMutation(pageId);

  const { data: membersData } = useSpaceMembersInfiniteQuery(spaceId);
  const members = (membersData?.pages.flatMap((p) => p.items) ?? []).filter(
    (m) => m.type === "user",
  );

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDesc(card.description);
      setMemberSearch("");
      setShowAssigneeSearch(false);
    }
  }, [card?.id]);

  if (!card) return null;

  const handleSave = () => {
    if (!title.trim()) return;
    updateCard.mutate({ cardId: card.id, title: title.trim(), description: desc });
    onClose();
  };

  const handleDelete = () => {
    deleteCard.mutate(card.id);
    onClose();
  };

  const assignedIds = new Set(card.assignees.map((a) => a.userId));
  const filteredMembers = members.filter(
    (m) =>
      m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
      ("email" in m && (m.email as string)?.toLowerCase().includes(memberSearch.toLowerCase())),
  );

  return (
    <Modal
      opened={!!card}
      onClose={onClose}
      title={null}
      size="860px"
      padding={0}
      styles={{
        content: { display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 80px)" },
        body: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" },
      }}
    >
      {/* ── Scrollable body ─────────────────────────────────────────── */}
      <ScrollArea style={{ flex: 1 }} p="xl">
        {/* Title */}
        {canEdit ? (
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            placeholder="Untitled"
            styles={{
              input: {
                fontWeight: 700,
                fontSize: "1.75rem",
                lineHeight: 1.2,
                border: "none",
                padding: 0,
                height: "auto",
                background: "transparent",
              },
            }}
            variant="unstyled"
            autoFocus
            mb="md"
          />
        ) : (
          <Text fw={700} style={{ fontSize: "1.75rem", lineHeight: 1.2 }} mb="md">
            {card.title || "Untitled"}
          </Text>
        )}

        {/* Rich-text description — full page-editor experience */}
        <CardDescriptionEditor
          key={card.id}
          initialContent={card.description}
          editable={canEdit}
          pageId={pageId}
          onChange={setDesc}
        />
      </ScrollArea>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div className={classes.modalFooter}>
        {/* Assignees row */}
        <Group gap="xs" mb={showAssigneeSearch ? "xs" : 0}>
          <Text size="sm" c="dimmed">Assignees:</Text>
          {card.assignees.length > 0 ? (
            <Avatar.Group spacing="xs">
              {card.assignees.slice(0, 6).map((a) => (
                <Tooltip key={a.userId} label={a.name} withArrow>
                  <Avatar
                    src={a.avatarUrl}
                    size={24}
                    radius="xl"
                    name={a.name}
                    style={canEdit ? { cursor: "pointer" } : undefined}
                    onClick={canEdit ? () => removeAssignee.mutate({ cardId: card.id, userId: a.userId }) : undefined}
                  />
                </Tooltip>
              ))}
            </Avatar.Group>
          ) : (
            <Text size="sm" c="dimmed">None</Text>
          )}
          {canEdit && (
            <ActionIcon
              size="xs"
              variant="subtle"
              onClick={() => setShowAssigneeSearch((v) => !v)}
              title="Manage assignees"
            >
              <IconPlus size={12} />
            </ActionIcon>
          )}
        </Group>

        {/* Assignee search — shown on demand */}
        {canEdit && showAssigneeSearch && (
          <div className={classes.assigneeSearch}>
            <TextInput
              placeholder="Search members…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.currentTarget.value)}
              size="xs"
              mb={4}
              autoFocus
            />
            <ScrollArea h={140}>
              <Stack gap={2}>
                {filteredMembers.map((m) => {
                  const isAssigned = assignedIds.has(m.id);
                  const avatarUrl = "avatarUrl" in m ? (m.avatarUrl as string | null) : null;
                  return (
                    <Group
                      key={m.id}
                      gap="xs"
                      className={clsx(classes.memberRow, isAssigned && classes.memberRowAssigned)}
                      onClick={() =>
                        isAssigned
                          ? removeAssignee.mutate({ cardId: card.id, userId: m.id })
                          : addAssignee.mutate({ cardId: card.id, userId: m.id })
                      }
                    >
                      <Avatar src={avatarUrl} size={24} radius="xl" name={m.name} />
                      <Text size="sm" style={{ flex: 1 }}>{m.name}</Text>
                      {isAssigned && <IconCheck size={14} />}
                    </Group>
                  );
                })}
              </Stack>
            </ScrollArea>
          </div>
        )}

        <Divider my="sm" />

        {/* Actions */}
        {canEdit ? (
          <Group justify="space-between">
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={handleDelete}
              size="xs"
            >
              Delete card
            </Button>
            <Group gap="xs">
              <Button variant="default" size="xs" onClick={onClose}>Cancel</Button>
              <Button size="xs" onClick={handleSave} loading={updateCard.isPending}>Save</Button>
            </Group>
          </Group>
        ) : (
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={onClose}>Close</Button>
          </Group>
        )}
      </div>
    </Modal>
  );
}

// ─── Column component ─────────────────────────────────────────────────────────

interface KanbanColumnProps {
  column: IKanbanColumn;
  allColumns: IKanbanColumn[];
  pageId: string;
  spaceId: string;
  canEdit: boolean;
  onOpenCard: (card: IKanbanCard) => void;
  onCardDrop: (args: {
    cardId: string;
    fromColumnId: string;
    toColumnId: string;
    edge: Edge;
    targetCardId: string | null;
  }) => void;
  onColumnDrop: (args: {
    dragColumnId: string;
    edge: Edge;
    targetColumnId: string;
  }) => void;
}

function KanbanColumnItem({
  column,
  allColumns,
  pageId,
  spaceId,
  canEdit,
  onOpenCard,
  onCardDrop,
  onColumnDrop,
}: KanbanColumnProps) {
  const colRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [colEdge, setColEdge] = useState<Edge | null>(null);
  const [isDraggingCol, setIsDraggingCol] = useState(false);
  const [isOver, setIsOver] = useState(false);

  const [renamingCol, setRenamingCol] = useState(false);
  const [colName, setColName] = useState(column.name);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");

  const updateColumn = useUpdateColumnMutation(pageId);
  const deleteColumn = useDeleteColumnMutation(pageId);
  const createCard = useCreateCardMutation(pageId);

  useEffect(() => {
    if (!renamingCol) setColName(column.name);
  }, [column.name, renamingCol]);

  useEffect(() => {
    if (!colRef.current || !canEdit) return;

    return combine(
      // column is draggable by its header
      draggable({
        element: headerRef.current!,
        getInitialData: () => ({ type: "kanban-column", columnId: column.id }),
        onDragStart: () => setIsDraggingCol(true),
        onDrop: () => setIsDraggingCol(false),
      }),
      // column itself is a drop target for other columns
      dropTargetForElements({
        element: colRef.current,
        canDrop: ({ source }) => source.data.type === "kanban-column" && source.data.columnId !== column.id,
        getData: ({ input, element }) =>
          attachClosestEdge(
            { type: "kanban-column", columnId: column.id },
            { input, element, allowedEdges: ["left", "right"] },
          ),
        onDrag: ({ self }) => setColEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setColEdge(null),
        onDrop: ({ source, self }) => {
          const edge = extractClosestEdge(self.data);
          if (edge) {
            onColumnDrop({
              dragColumnId: source.data.columnId as string,
              edge,
              targetColumnId: column.id,
            });
          }
          setColEdge(null);
        },
      }),
      // card list drop zone
      dropTargetForElements({
        element: dropZoneRef.current!,
        canDrop: ({ source }) => source.data.type === "kanban-card",
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source, location }) => {
          setIsOver(false);
          // Check if the user dropped onto a specific card (innermost target)
          const targets = location.current.dropTargets;
          const cardTarget = targets.find((t) => t.data.type === "kanban-card");
          if (cardTarget) {
            const edge = extractClosestEdge(cardTarget.data) ?? "bottom";
            onCardDrop({
              cardId: source.data.cardId as string,
              fromColumnId: source.data.columnId as string,
              toColumnId: column.id,
              edge,
              targetCardId: cardTarget.data.cardId as string,
            });
          } else {
            // Dropped on empty column area — append to end
            onCardDrop({
              cardId: source.data.cardId as string,
              fromColumnId: source.data.columnId as string,
              toColumnId: column.id,
              edge: "bottom",
              targetCardId: null,
            });
          }
        },
      }),
    );
  }, [column.id, canEdit, onCardDrop, onColumnDrop]);

  const commitRename = () => {
    const name = colName.trim();
    if (name && name !== column.name) {
      updateColumn.mutate({ columnId: column.id, name });
    } else {
      setColName(column.name);
    }
    setRenamingCol(false);
  };

  const commitAddCard = () => {
    if (newCardTitle.trim()) {
      createCard.mutate({ columnId: column.id, title: newCardTitle.trim() });
    }
    setNewCardTitle("");
    setAddingCard(false);
  };

  return (
    <div className={classes.columnWrapper}>
      <ColumnDropIndicator edge={colEdge === "left" ? "left" : null} />

      <div
        ref={colRef}
        className={clsx(classes.column, isDraggingCol && classes.columnDragging)}
      >
        {/* header — drag handle for columns */}
        <div ref={headerRef} className={classes.columnHeader}>
          <Popover opened={colorMenuOpen} onChange={setColorMenuOpen} width={158} position="bottom-start" withArrow shadow="sm">
            <Popover.Target>
              <div
                className={classes.colorBar}
                style={{ backgroundColor: colorCss(column.color) }}
                onClick={() => canEdit && setColorMenuOpen(true)}
                role={canEdit ? "button" : undefined}
                tabIndex={canEdit ? 0 : -1}
                aria-label="Change column color"
              />
            </Popover.Target>
            <Popover.Dropdown>
              <Group gap={6} justify="center">
                {COLORS.map(({ name, css }) => (
                  <Box
                    key={name}
                    className={clsx(classes.colorSwatch, column.color === name && classes.colorSwatchActive)}
                    style={{ backgroundColor: css }}
                    onClick={() => {
                      updateColumn.mutate({ columnId: column.id, color: name });
                      setColorMenuOpen(false);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {column.color === name && <IconCheck size={11} />}
                  </Box>
                ))}
              </Group>
            </Popover.Dropdown>
          </Popover>

          {renamingCol ? (
            <TextInput
              value={colName}
              onChange={(e) => setColName(e.currentTarget.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setColName(column.name); setRenamingCol(false); }
              }}
              size="xs"
              autoFocus
              className={classes.colNameInput}
            />
          ) : (
            <Text
              fw={600}
              size="sm"
              className={classes.colName}
              onClick={() => canEdit && setRenamingCol(true)}
            >
              {column.name}
            </Text>
          )}

          <Text size="xs" c="dimmed" className={classes.colCount}>{column.cards.length}</Text>

          {canEdit && (
            <Menu shadow="md" width={150} position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" size="sm" aria-label="Column options">
                  <IconDotsVertical size={14} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconTrash size={14} />}
                  color="red"
                  onClick={() => deleteColumn.mutate(column.id)}
                >
                  Delete column
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </div>

        {/* card list */}
        <div
          ref={dropZoneRef}
          className={clsx(classes.cardList, isOver && column.cards.length === 0 && classes.cardListOver)}
        >
          {column.cards.map((card) => (
            <KanbanCardItem
              key={card.id}
              card={card}
              column={column}
              pageId={pageId}
              spaceId={spaceId}
              canEdit={canEdit}
              onOpenCard={onOpenCard}
            />
          ))}

          {addingCard && (
            <div className={classes.addCardInput}>
              <TextInput
                value={newCardTitle}
                onChange={(e) => setNewCardTitle(e.currentTarget.value)}
                onBlur={commitAddCard}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitAddCard();
                  if (e.key === "Escape") { setNewCardTitle(""); setAddingCard(false); }
                }}
                placeholder="Card title…"
                size="xs"
                autoFocus
              />
            </div>
          )}
        </div>

        {canEdit && !addingCard && (
          <button className={classes.addCardBtn} onClick={() => setAddingCard(true)}>
            <IconPlus size={14} />
            Add card
          </button>
        )}
      </div>

      <ColumnDropIndicator edge={colEdge === "right" ? "right" : null} />
    </div>
  );
}

// ─── Board ────────────────────────────────────────────────────────────────────

interface KanbanBoardPageProps {
  pageId: string;
  spaceId: string;
  canEdit: boolean;
}

export default function KanbanBoardPage({ pageId, spaceId, canEdit }: KanbanBoardPageProps) {
  const { data: columns, isLoading } = useKanbanBoardQuery(pageId);
  const [openCard, setOpenCard] = useState<IKanbanCard | null>(null);

  const moveCard = useMoveCardMutation(pageId);
  const moveColumn = useMoveColumnMutation(pageId);
  const createColumn = useCreateColumnMutation(pageId);

  const [newColName, setNewColName] = useState("");
  const [addingCol, setAddingCol] = useState(false);

  // ── optimistic column state (local ordering during drag) ──────────────────
  const [localColumns, setLocalColumns] = useState<IKanbanColumn[] | null>(null);
  const displayColumns = localColumns ?? columns ?? [];

  useEffect(() => {
    // sync server data into local state when not dragging
    setLocalColumns(null);
  }, [columns]);

  // ── Card drop ─────────────────────────────────────────────────────────────
  const handleCardDrop = useCallback(
    ({
      cardId,
      fromColumnId,
      toColumnId,
      edge,
      targetCardId,
    }: {
      cardId: string;
      fromColumnId: string;
      toColumnId: string;
      edge: Edge;
      targetCardId: string | null;
    }) => {
      const cols = displayColumns;
      const toCol = cols.find((c) => c.id === toColumnId);
      if (!toCol) return;

      const sortedCards = [...toCol.cards].sort((a, b) => a.position - b.position);
      const targetIdx = targetCardId
        ? sortedCards.findIndex((c) => c.id === targetCardId)
        : -1;

      let insertIdx: number | null;
      if (targetIdx === -1) {
        insertIdx = null; // append
      } else if (edge === "top") {
        insertIdx = targetIdx;
      } else {
        insertIdx = targetIdx + 1;
      }

      const { before, after } = getAdjacentPositions(sortedCards.filter((c) => c.id !== cardId), insertIdx);
      const newPosition = positionBetween(before, after);

      // optimistic local update
      const newCols = cols.map((col) => {
        if (col.id === fromColumnId && col.id === toColumnId) {
          // Same-column reorder: update position without removing and re-adding
          const card = col.cards.find((c) => c.id === cardId);
          if (!card) return col;
          const updatedCard = { ...card, position: newPosition };
          const others = col.cards.filter((c) => c.id !== cardId);
          return {
            ...col,
            cards: [...others, updatedCard].sort((a, b) => a.position - b.position),
          };
        }
        if (col.id === fromColumnId) {
          return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
        }
        if (col.id === toColumnId) {
          const fromCol = cols.find((c) => c.id === fromColumnId);
          const card = fromCol?.cards.find((c) => c.id === cardId)
            ?? col.cards.find((c) => c.id === cardId);
          if (!card) return col;
          const updatedCard = { ...card, columnId: toColumnId, position: newPosition };
          const others = col.cards.filter((c) => c.id !== cardId);
          return {
            ...col,
            cards: [...others, updatedCard].sort((a, b) => a.position - b.position),
          };
        }
        return col;
      });
      setLocalColumns(newCols);

      moveCard.mutate({ cardId, columnId: toColumnId, position: newPosition });
    },
    [displayColumns, moveCard],
  );

  // ── Column drop ───────────────────────────────────────────────────────────
  const handleColumnDrop = useCallback(
    ({
      dragColumnId,
      edge,
      targetColumnId,
    }: {
      dragColumnId: string;
      edge: Edge;
      targetColumnId: string;
    }) => {
      const cols = displayColumns;
      const sorted = [...cols].sort((a, b) => a.position - b.position);
      const targetIdx = sorted.findIndex((c) => c.id === targetColumnId);
      if (targetIdx === -1) return;

      const filteredSorted = sorted.filter((c) => c.id !== dragColumnId);
      const insertIdx = edge === "left" ? targetIdx : targetIdx + 1;
      const clampedIdx = Math.min(insertIdx, filteredSorted.length);

      const before = filteredSorted[clampedIdx - 1]?.position ?? null;
      const after = filteredSorted[clampedIdx]?.position ?? null;
      const newPosition = positionBetween(before, after);

      const newCols = cols.map((c) =>
        c.id === dragColumnId ? { ...c, position: newPosition } : c,
      ).sort((a, b) => a.position - b.position);
      setLocalColumns(newCols);

      moveColumn.mutate({ columnId: dragColumnId, position: newPosition });
    },
    [displayColumns, moveColumn],
  );

  const commitAddColumn = () => {
    const name = newColName.trim();
    if (name) {
      createColumn.mutate({ pageId, name });
    }
    setNewColName("");
    setAddingCol(false);
  };

  // ── card open: find live version from query data ──────────────────────────
  const liveCard = openCard
    ? (columns ?? []).flatMap((c) => c.cards).find((c) => c.id === openCard.id)
    : null;

  if (isLoading) {
    return (
      <div className={classes.loading}>
        <Loader size="sm" />
      </div>
    );
  }

  return (
    <div className={classes.root}>
      <div className={classes.board}>
        {displayColumns.map((col) => (
          <KanbanColumnItem
            key={col.id}
            column={col}
            allColumns={displayColumns}
            pageId={pageId}
            spaceId={spaceId}
            canEdit={canEdit}
            onOpenCard={setOpenCard}
            onCardDrop={handleCardDrop}
            onColumnDrop={handleColumnDrop}
          />
        ))}

        {canEdit && (
          <div className={classes.addColumnWrapper}>
            {addingCol ? (
              <div className={classes.addColumnInput}>
                <TextInput
                  value={newColName}
                  onChange={(e) => setNewColName(e.currentTarget.value)}
                  onBlur={commitAddColumn}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitAddColumn();
                    if (e.key === "Escape") { setNewColName(""); setAddingCol(false); }
                  }}
                  placeholder="Column name…"
                  size="sm"
                  autoFocus
                />
              </div>
            ) : (
              <button className={classes.addColumnBtn} onClick={() => setAddingCol(true)}>
                <IconPlus size={14} />
                Add column
              </button>
            )}
          </div>
        )}
      </div>

      <CardModal
        card={liveCard ?? openCard}
        pageId={pageId}
        spaceId={spaceId}
        canEdit={canEdit}
        onClose={() => setOpenCard(null)}
      />
    </div>
  );
}
