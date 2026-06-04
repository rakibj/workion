import { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  ActionIcon,
  Box,
  Group,
  Menu,
  Popover,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import {
  IconCheck,
  IconDotsVertical,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import clsx from "clsx";
import type {
  KanbanCard,
  KanbanColor,
  KanbanColumn,
  KanbanData,
} from "@docmost/editor-ext";
import classes from "./kanban.module.css";

// ─── color palette ────────────────────────────────────────────────────────────

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

// ─── data helpers ─────────────────────────────────────────────────────────────

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function moveCard(
  data: KanbanData,
  cardId: string,
  fromColId: string,
  toColId: string,
): KanbanData {
  if (fromColId === toColId) return data;
  const fromCol = data.columns.find((c) => c.id === fromColId);
  const card = fromCol?.cards.find((c) => c.id === cardId);
  if (!card) return data;
  return {
    ...data,
    columns: data.columns.map((col) => {
      if (col.id === fromColId)
        return { ...col, cards: col.cards.filter((c) => c.id !== cardId) };
      if (col.id === toColId)
        return { ...col, cards: [...col.cards, card] };
      return col;
    }),
  };
}

// ─── CardItem ─────────────────────────────────────────────────────────────────

interface CardItemProps {
  card: KanbanCard;
  columnId: string;
  isEditable: boolean;
  onUpdate: (patch: Partial<KanbanCard>) => void;
  onDelete: () => void;
}

function CardItem({ card, columnId, isEditable, onUpdate, onDelete }: CardItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [opened, setOpened] = useState(false);
  const [titleVal, setTitleVal] = useState(card.title);
  const [descVal, setDescVal] = useState(card.description);

  // sync external updates (e.g. collaboration) into local state when closed
  useEffect(() => {
    if (!opened) {
      setTitleVal(card.title);
      setDescVal(card.description);
    }
  }, [card.title, card.description, opened]);

  useEffect(() => {
    if (!ref.current || !isEditable) return;
    return draggable({
      element: ref.current,
      getInitialData: () => ({
        type: "kanban-card",
        cardId: card.id,
        columnId,
      }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [card.id, columnId, isEditable]);

  const handleClose = useCallback(() => {
    const title = titleVal.trim();
    if (title) {
      onUpdate({ title, description: descVal.trim() });
    }
    setOpened(false);
  }, [titleVal, descVal, onUpdate]);

  return (
    <Popover
      opened={opened}
      onChange={(open) => {
        if (!open) handleClose();
        else setOpened(true);
      }}
      width={260}
      position="bottom-start"
      withArrow
      shadow="md"
      trapFocus
    >
      <Popover.Target>
        <div
          ref={ref}
          className={clsx(
            classes.card,
            isDragging && classes.cardDragging,
            isEditable && classes.cardEditable,
          )}
          onClick={() => isEditable && setOpened(true)}
          role={isEditable ? "button" : undefined}
          tabIndex={isEditable ? 0 : -1}
          onKeyDown={(e) => {
            if (isEditable && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setOpened(true);
            }
          }}
        >
          <Text size="sm" className={classes.cardTitle}>
            {card.title || "Untitled"}
          </Text>
          {card.description && (
            <Text size="xs" c="dimmed" lineClamp={2} className={classes.cardDesc}>
              {card.description}
            </Text>
          )}
        </div>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack gap="xs">
          <TextInput
            value={titleVal}
            onChange={(e) => setTitleVal(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleClose();
              if (e.key === "Escape") {
                setTitleVal(card.title);
                setDescVal(card.description);
                setOpened(false);
              }
            }}
            placeholder="Card title"
            size="sm"
            autoFocus
          />
          <Textarea
            value={descVal}
            onChange={(e) => setDescVal(e.currentTarget.value)}
            placeholder="Add description…"
            size="sm"
            minRows={2}
            maxRows={5}
            autosize
          />
          <Group justify="flex-end">
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={() => {
                setOpened(false);
                onDelete();
              }}
              aria-label="Delete card"
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

// ─── ColumnComponent ──────────────────────────────────────────────────────────

interface ColumnProps {
  column: KanbanColumn;
  isEditable: boolean;
  onUpdateCard: (cardId: string, patch: Partial<KanbanCard>) => void;
  onDeleteCard: (cardId: string) => void;
  onAddCard: (title: string) => void;
  onUpdateColumn: (patch: Partial<Omit<KanbanColumn, "id" | "cards">>) => void;
  onDeleteColumn: () => void;
  onCardDrop: (cardId: string, fromColumnId: string) => void;
}

function ColumnComponent({
  column,
  isEditable,
  onUpdateCard,
  onDeleteCard,
  onAddCard,
  onUpdateColumn,
  onDeleteColumn,
  onCardDrop,
}: ColumnProps) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [renamingCol, setRenamingCol] = useState(false);
  const [colNameVal, setColNameVal] = useState(column.name);
  const [colorMenuOpened, setColorMenuOpened] = useState(false);

  // sync column name from external updates
  useEffect(() => {
    if (!renamingCol) setColNameVal(column.name);
  }, [column.name, renamingCol]);

  useEffect(() => {
    if (!dropRef.current) return;
    return dropTargetForElements({
      element: dropRef.current,
      canDrop: ({ source }) => source.data.type === "kanban-card",
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: ({ source }) => {
        setIsOver(false);
        onCardDrop(
          source.data.cardId as string,
          source.data.columnId as string,
        );
      },
    });
  }, [onCardDrop]);

  const commitAdd = () => {
    if (newCardTitle.trim()) {
      onAddCard(newCardTitle.trim());
    }
    setNewCardTitle("");
    setAddingCard(false);
  };

  const commitRename = () => {
    const name = colNameVal.trim();
    if (name) {
      onUpdateColumn({ name });
    } else {
      setColNameVal(column.name);
    }
    setRenamingCol(false);
  };

  return (
    <div className={classes.column}>
      {/* column header */}
      <div className={classes.columnHeader}>
        <Popover
          opened={colorMenuOpened}
          onChange={setColorMenuOpened}
          width={160}
          position="bottom-start"
          withArrow
          shadow="sm"
        >
          <Popover.Target>
            <div
              className={classes.colorDot}
              style={{ backgroundColor: colorCss(column.color) }}
              onClick={() => isEditable && setColorMenuOpened(true)}
              role={isEditable ? "button" : undefined}
              tabIndex={isEditable ? 0 : -1}
              aria-label="Change column color"
            />
          </Popover.Target>
          <Popover.Dropdown>
            <Group gap={6} justify="center">
              {COLORS.map(({ name, css }) => (
                <Box
                  key={name}
                  className={clsx(
                    classes.colorSwatch,
                    column.color === name && classes.colorSwatchActive,
                  )}
                  style={{ backgroundColor: css }}
                  onClick={() => {
                    onUpdateColumn({ color: name });
                    setColorMenuOpened(false);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={name}
                  aria-pressed={column.color === name}
                >
                  {column.color === name && <IconCheck size={12} />}
                </Box>
              ))}
            </Group>
          </Popover.Dropdown>
        </Popover>

        {renamingCol ? (
          <TextInput
            value={colNameVal}
            onChange={(e) => setColNameVal(e.currentTarget.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setColNameVal(column.name);
                setRenamingCol(false);
              }
            }}
            size="xs"
            autoFocus
            className={classes.columnNameInput}
          />
        ) : (
          <Text
            size="sm"
            fw={600}
            className={classes.columnName}
            onClick={() => isEditable && setRenamingCol(true)}
          >
            {column.name}
          </Text>
        )}

        <Text size="xs" c="dimmed" className={classes.cardCount}>
          {column.cards.length}
        </Text>

        {isEditable && (
          <Menu shadow="md" width={160} position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" size="sm" aria-label="Column options">
                <IconDotsVertical size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconTrash size={14} />}
                color="red"
                onClick={onDeleteColumn}
              >
                Delete column
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </div>

      {/* card list / drop zone */}
      <div
        ref={dropRef}
        className={clsx(classes.cardList, isOver && classes.cardListOver)}
      >
        {column.cards.map((card) => (
          <CardItem
            key={card.id}
            card={card}
            columnId={column.id}
            isEditable={isEditable}
            onUpdate={(patch) => onUpdateCard(card.id, patch)}
            onDelete={() => onDeleteCard(card.id)}
          />
        ))}

        {addingCard && (
          <div className={classes.addCardInput}>
            <TextInput
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.currentTarget.value)}
              onBlur={commitAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAdd();
                if (e.key === "Escape") {
                  setNewCardTitle("");
                  setAddingCard(false);
                }
              }}
              placeholder="Card title…"
              size="xs"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* add card */}
      {isEditable && !addingCard && (
        <button className={classes.addCardBtn} onClick={() => setAddingCard(true)}>
          <IconPlus size={14} />
          Add card
        </button>
      )}
    </div>
  );
}

// ─── KanbanView ───────────────────────────────────────────────────────────────

export default function KanbanView({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const data: KanbanData = node.attrs.data;
  const isEditable = editor.isEditable;

  const update = useCallback(
    (newData: KanbanData) => updateAttributes({ data: newData }),
    [updateAttributes],
  );

  const handleUpdateCard = (
    columnId: string,
    cardId: string,
    patch: Partial<KanbanCard>,
  ) =>
    update({
      ...data,
      columns: data.columns.map((col) =>
        col.id !== columnId
          ? col
          : {
              ...col,
              cards: col.cards.map((c) =>
                c.id !== cardId ? c : { ...c, ...patch },
              ),
            },
      ),
    });

  const handleDeleteCard = (columnId: string, cardId: string) =>
    update({
      ...data,
      columns: data.columns.map((col) =>
        col.id !== columnId
          ? col
          : { ...col, cards: col.cards.filter((c) => c.id !== cardId) },
      ),
    });

  const handleAddCard = (columnId: string, title: string) =>
    update({
      ...data,
      columns: data.columns.map((col) =>
        col.id !== columnId
          ? col
          : {
              ...col,
              cards: [
                ...col.cards,
                { id: genId(), title, description: "" },
              ],
            },
      ),
    });

  const handleUpdateColumn = (
    columnId: string,
    patch: Partial<Omit<KanbanColumn, "id" | "cards">>,
  ) =>
    update({
      ...data,
      columns: data.columns.map((col) =>
        col.id !== columnId ? col : { ...col, ...patch },
      ),
    });

  const handleDeleteColumn = (columnId: string) =>
    update({
      ...data,
      columns: data.columns.filter((col) => col.id !== columnId),
    });

  const handleCardDrop = (
    targetColumnId: string,
    cardId: string,
    fromColumnId: string,
  ) => update(moveCard(data, cardId, fromColumnId, targetColumnId));

  const handleAddColumn = () =>
    update({
      ...data,
      columns: [
        ...data.columns,
        { id: genId(), name: "New Column", color: "gray", cards: [] },
      ],
    });

  return (
    <NodeViewWrapper>
      <div className={classes.board}>
        <div className={classes.columns}>
          {data.columns.map((col) => (
            <ColumnComponent
              key={col.id}
              column={col}
              isEditable={isEditable}
              onUpdateCard={(cardId, patch) =>
                handleUpdateCard(col.id, cardId, patch)
              }
              onDeleteCard={(cardId) => handleDeleteCard(col.id, cardId)}
              onAddCard={(title) => handleAddCard(col.id, title)}
              onUpdateColumn={(patch) => handleUpdateColumn(col.id, patch)}
              onDeleteColumn={() => handleDeleteColumn(col.id)}
              onCardDrop={(cardId, fromColId) =>
                handleCardDrop(col.id, cardId, fromColId)
              }
            />
          ))}

          {isEditable && (
            <button className={classes.addColumnBtn} onClick={handleAddColumn}>
              <IconPlus size={14} />
              Add column
            </button>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
