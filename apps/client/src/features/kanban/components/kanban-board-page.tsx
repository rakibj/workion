import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { getAvatarUrl } from "@/lib/config";
import { DateInput } from "@mantine/dates";
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
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconAlarm,
  IconAlertCircle,
  IconAlertTriangle,
  IconBolt,
  IconBookmark,
  IconBriefcase,
  IconBug,
  IconBulb,
  IconCalendarDue,
  IconCalendarEvent,
  IconChartBar,
  IconCheck,
  IconChecklist,
  IconCircleCheck,
  IconCircleDot,
  IconClipboardList,
  IconClock,
  IconCode,
  IconDeviceLaptop,
  IconDotsVertical,
  IconFlag,
  IconFolder,
  IconGitBranch,
  IconHash,
  IconHeart,
  IconLock,
  IconMail,
  IconMapPin,
  IconPalette,
  IconPencil,
  IconPlus,
  IconRocket,
  IconSettings,
  IconShieldCheck,
  IconStar,
  IconTag,
  IconTarget,
  IconThumbUp,
  IconTrash,
  IconUser,
  IconUsers,
  IconWorld,
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
import { useDebouncedCallback } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type {
  IKanbanCard,
  IKanbanCategory,
  IKanbanColumn,
  IKanbanMilestone,
  KanbanCategoryOptionColor,
  KanbanColor,
  KanbanPriority,
} from "../types/kanban.types";
import CardDescriptionEditor, { getDescriptionPlainText } from "./card-description-editor";
import {
  useAddAssigneeMutation,
  useCategoriesQuery,
  useCreateCardMutation,
  useCreateCategoryMutation,
  useCreateCategoryOptionMutation,
  useCreateColumnMutation,
  useCreateMilestoneMutation,
  useDeleteCardMutation,
  useDeleteCategoryMutation,
  useDeleteCategoryOptionMutation,
  useDeleteColumnMutation,
  useDeleteMilestoneMutation,
  useKanbanAssignableMembersQuery,
  useKanbanBoardQuery,
  useMilestonesQuery,
  useMoveCardMutation,
  useMoveColumnMutation,
  useRemoveAssigneeMutation,
  useSetCardCategoryMutation,
  useUpdateCardMutation,
  useUpdateCategoryMutation,
  useUpdateCategoryOptionMutation,
  useUpdateColumnMutation,
  useUpdateMilestoneMutation,
} from "../queries/kanban-query";
import {
  updatePageData,
  useUpdateTitlePageMutation,
} from "@/features/page/queries/page-query";
import { useQueryEmit } from "@/features/websocket/use-query-emit";
import type { UpdateEvent } from "@/features/websocket/types";
import localEmitter from "@/lib/local-emitter";
import { buildPageUrl } from "@/features/page/page.utils";
import { useAtom, useAtomValue } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom";
import { kanbanCursorsAtom, type IKanbanCursor } from "../atoms/kanban-cursor-atom";
import { randomElement, userColors } from "@/features/editor/extensions/utils";
import classes from "./kanban-board-page.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────

// Full palette — used for rendering (colorCss) and the category-option
// swatch picker. Kept in sync with KANBAN_OPTION_COLORS on the server
// (kanban.dto.ts).
const COLORS: { name: KanbanCategoryOptionColor; css: string }[] = [
  { name: "gray", css: "var(--mantine-color-gray-5)" },
  { name: "blue", css: "var(--mantine-color-blue-5)" },
  { name: "green", css: "var(--mantine-color-green-5)" },
  { name: "yellow", css: "var(--mantine-color-yellow-5)" },
  { name: "red", css: "var(--mantine-color-red-5)" },
  { name: "purple", css: "var(--mantine-color-violet-5)" },
  { name: "orange", css: "var(--mantine-color-orange-5)" },
  { name: "teal", css: "var(--mantine-color-teal-5)" },
  { name: "pink", css: "var(--mantine-color-pink-5)" },
  { name: "cyan", css: "var(--mantine-color-cyan-5)" },
  { name: "indigo", css: "var(--mantine-color-indigo-5)" },
  { name: "lime", css: "var(--mantine-color-lime-5)" },
];

// Columns keep the original, smaller palette — kept in sync with the
// hardcoded @IsIn lists on CreateColumnDto/UpdateColumnDto (kanban.dto.ts).
const COLUMN_COLORS = COLORS.slice(0, 6) as { name: KanbanColor; css: string }[];

const colorCss = (name: KanbanCategoryOptionColor) =>
  COLORS.find((c) => c.name === name)?.css ?? COLORS[0].css;

const PRIORITIES: { value: KanbanPriority; label: string; color: string }[] = [
  { value: "urgent", label: "Urgent", color: "var(--mantine-color-red-6)" },
  { value: "high",   label: "High",   color: "var(--mantine-color-orange-5)" },
  { value: "medium", label: "Medium", color: "var(--mantine-color-yellow-5)" },
  { value: "low",    label: "Low",    color: "var(--mantine-color-blue-4)" },
];

function priorityConfig(p: KanbanPriority | null) {
  return PRIORITIES.find((x) => x.value === p) ?? null;
}

// Kept in sync with CATEGORY_ICONS on the server (kanban.dto.ts).
const CATEGORY_ICON_MAP: Record<string, typeof IconFlag> = {
  IconTag,
  IconBookmark,
  IconStar,
  IconBolt,
  IconBug,
  IconClipboardList,
  IconUsers,
  IconCalendarEvent,
  IconAlarm,
  IconCircleCheck,
  IconCircleDot,
  IconHash,
  IconRocket,
  IconPalette,
  IconCode,
  IconShieldCheck,
  IconBriefcase,
  IconFolder,
  IconBulb,
  IconHeart,
  IconClock,
  IconMapPin,
  IconMail,
  IconSettings,
  IconLock,
  IconChecklist,
  IconChartBar,
  IconWorld,
  IconGitBranch,
  IconThumbUp,
  IconAlertCircle,
  IconDeviceLaptop,
};
const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICON_MAP);

function CategoryIcon({ name, size = 12 }: { name: string; size?: number }) {
  const Cmp = CATEGORY_ICON_MAP[name] ?? IconTag;
  return <Cmp size={size} />;
}

function IconPickerGrid({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <Group gap={6} justify="center" style={{ maxWidth: 216 }}>
      {CATEGORY_ICON_NAMES.map((name) => (
        <Box
          key={name}
          className={clsx(classes.iconSwatch, value === name && classes.iconSwatchActive)}
          onClick={() => onChange(name)}
          role="button"
          tabIndex={0}
        >
          <CategoryIcon name={name} size={15} />
        </Box>
      ))}
    </Group>
  );
}

function ColorSwatchPicker({
  value,
  onChange,
  disabled,
}: {
  value: KanbanCategoryOptionColor;
  onChange: (color: KanbanCategoryOptionColor) => void;
  disabled?: boolean;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover opened={opened} onChange={setOpened} width={140} withArrow shadow="sm">
      <Popover.Target>
        <Box
          className={classes.colorSwatch}
          style={{ backgroundColor: colorCss(value), width: 14, height: 14 }}
          onClick={() => !disabled && setOpened((v) => !v)}
          role={disabled ? undefined : "button"}
          tabIndex={disabled ? -1 : 0}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <Group gap={6} justify="center">
          {COLORS.map(({ name, css }) => (
            <Box
              key={name}
              className={clsx(classes.colorSwatch, value === name && classes.colorSwatchActive)}
              style={{ backgroundColor: css }}
              onClick={() => { onChange(name); setOpened(false); }}
              role="button"
              tabIndex={0}
            >
              {value === name && <IconCheck size={11} />}
            </Box>
          ))}
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}

function formatDueDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

type DueDateStatus = 'overdue' | 'today' | 'upcoming';

function getDueDateStatus(dateStr: string): DueDateStatus {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dueKey = dateStr.slice(0, 10);
  if (dueKey < todayKey) return 'overdue';
  if (dueKey === todayKey) return 'today';
  return 'upcoming';
}

const DUE_DATE_COLOR: Record<DueDateStatus, string | undefined> = {
  overdue: 'var(--mantine-color-red-6)',
  today:   'var(--mantine-color-yellow-7)',
  upcoming: undefined,
};

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
  insertBefore: number | null,
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

// ─── Drop indicators ──────────────────────────────────────────────────────────

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

// ─── Milestone management modal ───────────────────────────────────────────────

interface MilestoneManagementModalProps {
  opened: boolean;
  onClose: () => void;
  pageId: string;
  canEdit: boolean;
}

function MilestoneManagementModal({
  opened,
  onClose,
  pageId,
  canEdit,
}: MilestoneManagementModalProps) {
  const { data: milestones = [] } = useMilestonesQuery(pageId);
  const createMs = useCreateMilestoneMutation(pageId);
  const updateMs = useUpdateMilestoneMutation(pageId);
  const deleteMs = useDeleteMilestoneMutation(pageId);

  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");

  const handleCreate = () => {
    if (!newName.trim() || !newDate) return;
    createMs.mutate(
      { pageId, name: newName.trim(), dueDate: newDate },
      {
        onSuccess: () => {
          setNewName("");
          setNewDate("");
        },
      },
    );
  };

  const startEdit = (ms: IKanbanMilestone) => {
    setEditingId(ms.id);
    setEditName(ms.name);
    setEditDate(ms.dueDate.slice(0, 10));
  };

  const commitEdit = () => {
    if (!editingId || !editName.trim() || !editDate) return;
    updateMs.mutate({
      milestoneId: editingId,
      name: editName.trim(),
      dueDate: editDate,
    });
    setEditingId(null);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Milestones"
      size="480px"
    >
      <Stack gap="xs">
        {milestones.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="sm">No milestones yet.</Text>
        )}
        {milestones.map((ms) =>
          editingId === ms.id ? (
            <Group key={ms.id} gap="xs" align="flex-end">
              <TextInput
                value={editName}
                onChange={(e) => setEditName(e.currentTarget.value)}
                placeholder="Name"
                size="xs"
                style={{ flex: 1 }}
                autoFocus
              />
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.currentTarget.value)}
                className={classes.dateInput}
              />
              <Button size="xs" onClick={commitEdit} loading={updateMs.isPending}>Save</Button>
              <Button size="xs" variant="default" onClick={() => setEditingId(null)}>Cancel</Button>
            </Group>
          ) : (
            <Group key={ms.id} gap="xs" className={classes.milestoneRow}>
              <IconTarget size={14} className={classes.milestoneIcon} />
              <Text size="sm" style={{ flex: 1 }}>{ms.name}</Text>
              <Text
                size="xs"
                style={{ color: DUE_DATE_COLOR[getDueDateStatus(ms.dueDate)] ?? 'var(--mantine-color-dimmed)' }}
              >
                {formatDueDate(ms.dueDate)}
              </Text>
              {canEdit && (
                <Group gap={4}>
                  <ActionIcon size="xs" variant="subtle" onClick={() => startEdit(ms)}>
                    <IconPencil size={12} />
                  </ActionIcon>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => deleteMs.mutate(ms.id)}
                    loading={deleteMs.isPending}
                  >
                    <IconTrash size={12} />
                  </ActionIcon>
                </Group>
              )}
            </Group>
          ),
        )}

        {canEdit && (
          <>
            <Divider />
            <Group gap="xs" align="flex-end">
              <TextInput
                value={newName}
                onChange={(e) => setNewName(e.currentTarget.value)}
                placeholder="Milestone name"
                size="xs"
                style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              />
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.currentTarget.value)}
                className={classes.dateInput}
              />
              <Button
                size="xs"
                onClick={handleCreate}
                loading={createMs.isPending}
                disabled={!newName.trim() || !newDate}
              >
                Add
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

// ─── Category management modal ─────────────────────────────────────────────

interface CategoryManagementModalProps {
  opened: boolean;
  onClose: () => void;
  pageId: string;
  canEdit: boolean;
}

function CategoryManagementModal({ opened, onClose, pageId, canEdit }: CategoryManagementModalProps) {
  const { data: categories = [] } = useCategoriesQuery(pageId);
  const createCategory = useCreateCategoryMutation(pageId);
  const updateCategory = useUpdateCategoryMutation(pageId);
  const deleteCategory = useDeleteCategoryMutation(pageId);
  const createOption = useCreateCategoryOptionMutation(pageId);
  const updateOption = useUpdateCategoryOptionMutation(pageId);
  const deleteOption = useDeleteCategoryOptionMutation(pageId);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState(CATEGORY_ICON_NAMES[0]);
  const [iconPickerOpenFor, setIconPickerOpenFor] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [newOptionLabel, setNewOptionLabel] = useState<Record<string, string>>({});
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editOptionLabel, setEditOptionLabel] = useState("");

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) return;
    createCategory.mutate(
      { pageId, name: newCategoryName.trim(), icon: newCategoryIcon },
      {
        onSuccess: () => {
          setNewCategoryName("");
          setNewCategoryIcon(CATEGORY_ICON_NAMES[0]);
        },
      },
    );
  };

  const startEditCategory = (category: IKanbanCategory) => {
    setEditingCategoryId(category.id);
    setEditCategoryName(category.name);
  };

  const commitEditCategory = () => {
    if (!editingCategoryId || !editCategoryName.trim()) {
      setEditingCategoryId(null);
      return;
    }
    updateCategory.mutate({ categoryId: editingCategoryId, name: editCategoryName.trim() });
    setEditingCategoryId(null);
  };

  const handleAddOption = (categoryId: string) => {
    const label = (newOptionLabel[categoryId] ?? "").trim();
    if (!label) return;
    createOption.mutate(
      { categoryId, label },
      { onSuccess: () => setNewOptionLabel((prev) => ({ ...prev, [categoryId]: "" })) },
    );
  };

  const startEditOption = (option: { id: string; label: string }) => {
    setEditingOptionId(option.id);
    setEditOptionLabel(option.label);
  };

  const commitEditOption = () => {
    if (!editingOptionId || !editOptionLabel.trim()) {
      setEditingOptionId(null);
      return;
    }
    updateOption.mutate({ optionId: editingOptionId, label: editOptionLabel.trim() });
    setEditingOptionId(null);
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Categories" size="560px">
      <Stack gap="lg">
        {categories.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="sm">No categories yet.</Text>
        )}
        {categories.map((category) => (
          <div key={category.id}>
            <Group gap="xs" wrap="nowrap">
              <Popover
                opened={iconPickerOpenFor === category.id}
                onChange={(v) => setIconPickerOpenFor(v ? category.id : null)}
                width={200}
                withArrow
                shadow="sm"
              >
                <Popover.Target>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => canEdit && setIconPickerOpenFor(category.id)}
                  >
                    <CategoryIcon name={category.icon} size={16} />
                  </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown>
                  <IconPickerGrid
                    value={category.icon}
                    onChange={(icon) => {
                      updateCategory.mutate({ categoryId: category.id, icon });
                      setIconPickerOpenFor(null);
                    }}
                  />
                </Popover.Dropdown>
              </Popover>

              {editingCategoryId === category.id ? (
                <TextInput
                  value={editCategoryName}
                  onChange={(e) => setEditCategoryName(e.currentTarget.value)}
                  onBlur={commitEditCategory}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEditCategory();
                    if (e.key === "Escape") setEditingCategoryId(null);
                  }}
                  size="xs"
                  style={{ flex: 1 }}
                  autoFocus
                />
              ) : (
                <Text
                  size="sm"
                  fw={600}
                  style={{ flex: 1, cursor: canEdit ? "pointer" : undefined }}
                  onClick={() => canEdit && startEditCategory(category)}
                >
                  {category.name}
                </Text>
              )}

              {canEdit && (
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => deleteCategory.mutate(category.id)}
                  loading={deleteCategory.isPending}
                >
                  <IconTrash size={12} />
                </ActionIcon>
              )}
            </Group>

            <Stack gap={4} mt={6} ml={30}>
              {category.options.length === 0 && (
                <Text size="xs" c="dimmed">No options yet.</Text>
              )}
              {category.options.map((option) => (
                <Group key={option.id} gap="xs" wrap="nowrap">
                  <ColorSwatchPicker
                    value={option.color}
                    onChange={(color) => updateOption.mutate({ optionId: option.id, color })}
                    disabled={!canEdit}
                  />
                  {editingOptionId === option.id ? (
                    <TextInput
                      value={editOptionLabel}
                      onChange={(e) => setEditOptionLabel(e.currentTarget.value)}
                      onBlur={commitEditOption}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEditOption();
                        if (e.key === "Escape") setEditingOptionId(null);
                      }}
                      size="xs"
                      style={{ flex: 1 }}
                      autoFocus
                    />
                  ) : (
                    <Text
                      size="xs"
                      style={{ flex: 1, cursor: canEdit ? "pointer" : undefined }}
                      onClick={() => canEdit && startEditOption(option)}
                    >
                      {option.label}
                    </Text>
                  )}
                  {canEdit && (
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => deleteOption.mutate({ optionId: option.id, categoryId: category.id })}
                    >
                      <IconTrash size={11} />
                    </ActionIcon>
                  )}
                </Group>
              ))}

              {canEdit && (
                <Group gap="xs" wrap="nowrap">
                  <TextInput
                    value={newOptionLabel[category.id] ?? ""}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setNewOptionLabel((prev) => ({ ...prev, [category.id]: value }));
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddOption(category.id); }}
                    placeholder="Add option…"
                    size="xs"
                    style={{ flex: 1 }}
                  />
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={() => handleAddOption(category.id)}
                    disabled={!(newOptionLabel[category.id] ?? "").trim()}
                  >
                    <IconPlus size={14} />
                  </ActionIcon>
                </Group>
              )}
            </Stack>
          </div>
        ))}

        {canEdit && (
          <>
            <Divider />
            <Group gap="xs" align="flex-end">
              <Popover
                opened={iconPickerOpenFor === "__new__"}
                onChange={(v) => setIconPickerOpenFor(v ? "__new__" : null)}
                width={200}
                withArrow
                shadow="sm"
              >
                <Popover.Target>
                  <ActionIcon
                    variant="default"
                    size="lg"
                    onClick={() => setIconPickerOpenFor("__new__")}
                  >
                    <CategoryIcon name={newCategoryIcon} size={16} />
                  </ActionIcon>
                </Popover.Target>
                <Popover.Dropdown>
                  <IconPickerGrid
                    value={newCategoryIcon}
                    onChange={(icon) => {
                      setNewCategoryIcon(icon);
                      setIconPickerOpenFor(null);
                    }}
                  />
                </Popover.Dropdown>
              </Popover>
              <TextInput
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.currentTarget.value)}
                placeholder="Category name"
                size="xs"
                style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateCategory(); }}
              />
              <Button
                size="xs"
                onClick={handleCreateCategory}
                loading={createCategory.isPending}
                disabled={!newCategoryName.trim()}
              >
                Add category
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

// ─── Inline milestone picker (on card) ───────────────────────────────────────

interface MilestonePickerProps {
  card: IKanbanCard;
  pageId: string;
  canEdit: boolean;
  onManage: () => void;
}

function MilestonePicker({ card, pageId, canEdit, onManage }: MilestonePickerProps) {
  const { data: milestones = [] } = useMilestonesQuery(pageId);
  const updateCard = useUpdateCardMutation(pageId);

  const current = card.milestone;

  if (!canEdit && !current) return null;

  const handleSelect = (id: string | null) => {
    updateCard.mutate({ cardId: card.id, milestoneId: id });
  };

  const status = current ? getDueDateStatus(current.dueDate) : null;

  return (
    <Menu shadow="md" width={200} position="bottom-start" withinPortal>
      <Menu.Target>
        <button
          className={clsx(
            current ? classes.milestoneBadge : classes.badgeIconOnly,
            current && (status === 'overdue'
              ? classes.milestoneBadgeOverdue
              : status === 'today'
              ? classes.milestoneBadgeToday
              : classes.milestoneBadgeActive),
          )}
          onClick={(e) => e.stopPropagation()}
          title={current ? `${current.name} · ${formatDueDate(current.dueDate)}` : "Set milestone"}
        >
          {status === 'overdue' || status === 'today'
            ? <IconAlertTriangle size={current ? 10 : 12} />
            : <IconTarget size={current ? 10 : 12} />}
          {current && current.name}
        </button>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        {milestones.length === 0 && (
          <Menu.Item disabled>No milestones</Menu.Item>
        )}
        {milestones.map((ms) => (
          <Menu.Item
            key={ms.id}
            leftSection={<IconTarget size={13} />}
            rightSection={
              current?.id === ms.id ? <IconCheck size={12} /> : null
            }
            onClick={() => handleSelect(current?.id === ms.id ? null : ms.id)}
          >
            <Stack gap={0}>
              <Text size="xs">{ms.name}</Text>
              <Text
                size="xs"
                style={{ color: DUE_DATE_COLOR[getDueDateStatus(ms.dueDate)] ?? 'var(--mantine-color-dimmed)' }}
              >
                {formatDueDate(ms.dueDate)}
              </Text>
            </Stack>
          </Menu.Item>
        ))}
        {milestones.length > 0 && current && (
          <>
            <Menu.Divider />
            <Menu.Item color="dimmed" onClick={() => handleSelect(null)}>
              Clear
            </Menu.Item>
          </>
        )}
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconPlus size={12} />}
          onClick={() => { onManage(); }}
        >
          Manage milestones
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

// ─── Inline due date picker (on card) ─────────────────────────────────────────

interface DueDatePickerProps {
  card: IKanbanCard;
  pageId: string;
  canEdit: boolean;
}

function DueDatePicker({ card, pageId, canEdit }: DueDatePickerProps) {
  const [opened, setOpened] = useState(false);
  const updateCard = useUpdateCardMutation(pageId);

  const dueDate = card.dueDate;

  if (!canEdit && !dueDate) return null;

  const status = dueDate ? getDueDateStatus(dueDate) : null;

  const handleChange = (value: string | null) => {
    updateCard.mutate({ cardId: card.id, dueDate: value });
    setOpened(false);
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-start" withinPortal shadow="md">
      <Popover.Target>
        <button
          className={clsx(
            dueDate ? classes.dueDateBadge : classes.badgeIconOnly,
            dueDate && (status === 'overdue'
              ? classes.dueDateBadgeOverdue
              : status === 'today'
              ? classes.dueDateBadgeToday
              : classes.dueDateBadgeActive),
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (canEdit) setOpened((o) => !o);
          }}
          title={dueDate ? `Due ${formatDueDate(dueDate)}` : "Set due date"}
        >
          <IconCalendarDue size={dueDate ? 10 : 12} />
          {dueDate && formatDueDate(dueDate)}
        </button>
      </Popover.Target>
      <Popover.Dropdown
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Stack gap="xs">
          <DateInput
            value={dueDate ? dueDate.slice(0, 10) : null}
            onChange={(value) => handleChange(value || null)}
            placeholder="Due date"
            size="xs"
            clearable
            valueFormat="MMM D, YYYY"
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

// ─── Inline category picker (on card) ────────────────────────────────────────

interface CategoryPickerProps {
  card: IKanbanCard;
  category: IKanbanCategory;
  pageId: string;
  canEdit: boolean;
  onManage: () => void;
}

function CategoryPicker({ card, category, pageId, canEdit, onManage }: CategoryPickerProps) {
  const setCardCategory = useSetCardCategoryMutation(pageId);

  const currentOptionId = card.categoryValues.find((v) => v.categoryId === category.id)?.optionId ?? null;
  const currentOption = category.options.find((o) => o.id === currentOptionId) ?? null;

  if (!canEdit && !currentOption) return null;

  const handleSelect = (optionId: string | null) => {
    setCardCategory.mutate({ cardId: card.id, categoryId: category.id, optionId });
  };

  return (
    <Menu shadow="md" width={180} position="bottom-start" withinPortal>
      <Menu.Target>
        <button
          className={clsx(currentOption ? classes.categoryBadge : classes.badgeIconOnly)}
          onClick={(e) => e.stopPropagation()}
          title={currentOption ? undefined : `Set ${category.name}`}
          style={currentOption ? { color: colorCss(currentOption.color), borderColor: colorCss(currentOption.color) } : undefined}
        >
          <CategoryIcon name={category.icon} size={currentOption ? 10 : 12} />
          {currentOption && currentOption.label}
        </button>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        <Menu.Label>{category.name}</Menu.Label>
        {category.options.length === 0 && (
          <Menu.Item disabled>No options yet</Menu.Item>
        )}
        {category.options.map((o) => (
          <Menu.Item
            key={o.id}
            leftSection={<Box w={10} h={10} style={{ borderRadius: 999, backgroundColor: colorCss(o.color) }} />}
            rightSection={currentOptionId === o.id ? <IconCheck size={12} /> : null}
            onClick={() => handleSelect(currentOptionId === o.id ? null : o.id)}
          >
            {o.label}
          </Menu.Item>
        ))}
        {currentOption && (
          <>
            <Menu.Divider />
            <Menu.Item color="dimmed" onClick={() => handleSelect(null)}>
              Clear
            </Menu.Item>
          </>
        )}
        <Menu.Divider />
        <Menu.Item leftSection={<IconPlus size={12} />} onClick={() => onManage()}>
          Manage categories
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

// ─── Inline priority picker ───────────────────────────────────────────────────

interface PriorityPickerProps {
  priority: KanbanPriority | null;
  cardId: string;
  pageId: string;
  canEdit: boolean;
}

function PriorityPicker({ priority, cardId, pageId, canEdit }: PriorityPickerProps) {
  const updateCard = useUpdateCardMutation(pageId);
  const cfg = priorityConfig(priority);

  if (!canEdit && !cfg) return null;

  const handleSelect = (value: KanbanPriority | null) => {
    updateCard.mutate({ cardId, priority: value });
  };

  return (
    <Menu shadow="md" width={130} position="bottom-start" withinPortal>
      <Menu.Target>
        <button
          className={clsx(
            cfg ? classes.priorityBadge : classes.badgeIconOnly,
            cfg && classes[`priority_${cfg.value}`],
          )}
          onClick={(e) => e.stopPropagation()}
          title={cfg ? undefined : "Set priority"}
          style={cfg ? { color: cfg.color, borderColor: cfg.color } : undefined}
        >
          <IconFlag size={cfg ? 10 : 12} />
          {cfg && cfg.label}
        </button>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        {PRIORITIES.map((p) => (
          <Menu.Item
            key={p.value}
            leftSection={<IconFlag size={13} style={{ color: p.color }} />}
            rightSection={priority === p.value ? <IconCheck size={12} /> : null}
            onClick={() => handleSelect(p.value)}
          >
            {p.label}
          </Menu.Item>
        ))}
        {priority && (
          <>
            <Menu.Divider />
            <Menu.Item color="dimmed" onClick={() => handleSelect(null)}>
              Clear
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

// ─── Inline assignee picker (on card) ────────────────────────────────────────

interface InlineAssigneePickerProps {
  card: IKanbanCard;
  pageId: string;
  spaceId: string;
  canEdit: boolean;
}

function InlineAssigneePicker({ card, pageId, spaceId, canEdit }: InlineAssigneePickerProps) {
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");
  const addAssignee = useAddAssigneeMutation(pageId);
  const removeAssignee = useRemoveAssigneeMutation(pageId);

  const { data: members = [] } = useKanbanAssignableMembersQuery(pageId);

  const assignedIds = new Set(card.assignees.map((a) => a.userId));
  const filtered = members.filter(
    (m) =>
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Group gap={2} align="center" wrap="nowrap">
      {card.assignees.slice(0, 3).map((a) => (
        <Tooltip key={a.userId} label={a.name} withArrow>
          <Avatar src={getAvatarUrl(a.avatarUrl as string)} size={20} radius="xl" name={a.name} />
        </Tooltip>
      ))}
      {card.assignees.length > 3 && (
        <Text size="xs" c="dimmed">+{card.assignees.length - 3}</Text>
      )}
      {canEdit && (
        <Popover
          opened={opened}
          onChange={setOpened}
          width={200}
          position="bottom-start"
          withinPortal
          shadow="md"
        >
          <Popover.Target>
            <ActionIcon
              size={20}
              variant="subtle"
              radius="xl"
              onClick={(e) => { e.stopPropagation(); setOpened((v) => !v); }}
              title="Manage assignees"
            >
              <IconUser size={11} />
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown onClick={(e) => e.stopPropagation()}>
            <TextInput
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              size="xs"
              mb={4}
              autoFocus
            />
            <ScrollArea h={120}>
              <Stack gap={2}>
                {filtered.map((m) => {
                  const isAssigned = assignedIds.has(m.id);
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
                      <Avatar src={getAvatarUrl(m.avatarUrl as string)} size={20} radius="xl" name={m.name} />
                      <Text size="xs" style={{ flex: 1 }} truncate>{m.name}</Text>
                      {isAssigned && <IconCheck size={12} />}
                    </Group>
                  );
                })}
              </Stack>
            </ScrollArea>
          </Popover.Dropdown>
        </Popover>
      )}
    </Group>
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
  onOpenMilestones: () => void;
  onOpenCategories: () => void;
}

function KanbanCardItem({
  card,
  column,
  pageId,
  spaceId,
  canEdit,
  onOpenCard,
  onOpenMilestones,
  onOpenCategories,
}: KanbanCardProps) {
  const { data: categories = [] } = useCategoriesQuery(pageId);
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

  const cfg = priorityConfig(card.priority);

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
        {cfg && (
          <div
            className={classes.priorityStripe}
            style={{ backgroundColor: cfg.color }}
          />
        )}

        <Text size="sm" className={classes.cardTitle}>{card.title || "Untitled"}</Text>
        {card.description && (
          <Text size="xs" c="dimmed" lineClamp={2} className={classes.cardDesc}>
            {getDescriptionPlainText(card.description)}
          </Text>
        )}

        {/* Bottom row: badges */}
        <Group gap={4} mt={6} align="center" wrap="wrap">
          <PriorityPicker
            priority={card.priority}
            cardId={card.id}
            pageId={pageId}
            canEdit={canEdit}
          />
          <DueDatePicker
            card={card}
            pageId={pageId}
            canEdit={canEdit}
          />
          <Group gap={4} ml="auto" align="center" wrap="wrap" justify="flex-end">
            <MilestonePicker
              card={card}
              pageId={pageId}
              canEdit={canEdit}
              onManage={onOpenMilestones}
            />
            {categories.map((category) => (
              <CategoryPicker
                key={category.id}
                card={card}
                category={category}
                pageId={pageId}
                canEdit={canEdit}
                onManage={onOpenCategories}
              />
            ))}
            <InlineAssigneePicker
              card={card}
              pageId={pageId}
              spaceId={spaceId}
              canEdit={canEdit}
            />
          </Group>
        </Group>
        {(() => {
          if (!card.milestone?.dueDate) return null;
          const s = getDueDateStatus(card.milestone.dueDate);
          if (s === 'upcoming') return null;
          const color = DUE_DATE_COLOR[s]!;
          return (
            <Group gap={3} mt={3} align="center" wrap="nowrap">
              <IconAlertTriangle size={10} style={{ color, flexShrink: 0 }} />
              <Text size="xs" style={{ color, fontSize: 10, lineHeight: 1 }}>
                {formatDueDate(card.milestone.dueDate)}
              </Text>
            </Group>
          );
        })()}
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
  onOpenMilestones: () => void;
  onOpenCategories: () => void;
}

function CardModal({ card, pageId, spaceId, canEdit, onClose, onOpenMilestones, onOpenCategories }: CardModalProps) {
  const [title, setTitle] = useState(card?.title ?? "");
  const [desc, setDesc] = useState(card?.description ?? "");
  const [memberSearch, setMemberSearch] = useState("");
  const [showAssigneeSearch, setShowAssigneeSearch] = useState(false);
  const lastSavedTitleRef = useRef(card?.title ?? "");

  const updateCard = useUpdateCardMutation(pageId);
  const deleteCard = useDeleteCardMutation(pageId);
  const addAssignee = useAddAssigneeMutation(pageId);
  const removeAssignee = useRemoveAssigneeMutation(pageId);
  const setCardCategory = useSetCardCategoryMutation(pageId);
  const { data: milestones = [] } = useMilestonesQuery(pageId);
  const { data: categories = [] } = useCategoriesQuery(pageId);

  const { data: members = [] } = useKanbanAssignableMembersQuery(pageId);

  const saveTitle = useCallback(
    (cardId: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      lastSavedTitleRef.current = trimmed;
      updateCard.mutate({ cardId, title: trimmed });
    },
    [updateCard],
  );
  const debouncedSaveTitle = useDebouncedCallback(saveTitle, 800);

  const saveDesc = useCallback(
    (cardId: string, value: string) => {
      updateCard.mutate({ cardId, description: value });
    },
    [updateCard],
  );
  const debouncedSaveDesc = useDebouncedCallback(saveDesc, 800);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDesc(card.description);
      lastSavedTitleRef.current = card.title;
      setMemberSearch("");
      setShowAssigneeSearch(false);
    }
    // Flush whichever card's pending autosave was in flight — either the
    // previous card (id about to change) or this one (on unmount) — using
    // the id/value each debounced call closed over, not this card's id.
    return () => {
      debouncedSaveTitle.flush();
      debouncedSaveDesc.flush();
    };
  }, [card?.id]);

  if (!card) return null;

  const handleTitleChange = (value: string) => {
    setTitle(value);
    debouncedSaveTitle(card.id, value);
  };

  const handleTitleBlur = () => {
    if (!title.trim()) {
      debouncedSaveTitle.cancel();
      setTitle(lastSavedTitleRef.current);
      return;
    }
    debouncedSaveTitle.flush();
  };

  const handleDescChange = (value: string) => {
    setDesc(value);
    debouncedSaveDesc(card.id, value);
  };

  const handleDelete = () => {
    deleteCard.mutate(card.id);
    onClose();
  };

  const handlePriorityChange = (value: string | null) => {
    updateCard.mutate({ cardId: card.id, priority: value ?? null });
  };

  const handleMilestoneChange = (value: string | null) => {
    updateCard.mutate({ cardId: card.id, milestoneId: value });
  };

  const handleDueDateChange = (value: string | null) => {
    updateCard.mutate({ cardId: card.id, dueDate: value });
  };

  const assignedIds = new Set(card.assignees.map((a) => a.userId));
  const filteredMembers = members.filter(
    (m) =>
      m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.email?.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  return (
    <Modal
      opened={!!card}
      onClose={onClose}
      title={null}
      size="min(1140px, 94vw)"
      padding={0}
      styles={{
        content: { display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 80px)", overflow: "hidden" },
        body: { flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "row" },
      }}
    >
      <ScrollArea style={{ flex: 1, minWidth: 0, minHeight: 0 }} p="xl" type="auto">
        {canEdit ? (
          <Group justify="space-between" align="center" mb="md" wrap="nowrap">
            <TextInput
              value={title}
              onChange={(e) => handleTitleChange(e.currentTarget.value)}
              onBlur={handleTitleBlur}
              placeholder="Untitled"
              styles={{
                root: { flex: 1 },
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
            />
            {(updateCard.isPending || updateCard.isSuccess) && (
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {updateCard.isPending ? "Saving…" : "Saved"}
              </Text>
            )}
          </Group>
        ) : (
          <Text fw={700} style={{ fontSize: "1.75rem", lineHeight: 1.2 }} mb="md">
            {card.title || "Untitled"}
          </Text>
        )}

        <CardDescriptionEditor
          key={card.id}
          initialContent={card.description}
          editable={canEdit}
          pageId={pageId}
          onChange={handleDescChange}
        />
      </ScrollArea>

      <div className={classes.modalSidebar}>
        <ScrollArea style={{ flex: 1, minHeight: 0 }} p="md" type="auto">
          <Stack gap="md">
            {/* Priority */}
            <Stack gap={4}>
              <Text size="xs" c="dimmed" fw={500}>Priority</Text>
              {canEdit ? (
                <Select
                  size="xs"
                  placeholder="None"
                  clearable
                  value={card.priority ?? null}
                  onChange={handlePriorityChange}
                  data={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
                  leftSection={
                    card.priority
                      ? <IconFlag size={12} style={{ color: priorityConfig(card.priority)?.color }} />
                      : <IconFlag size={12} />
                  }
                />
              ) : (
                <Text size="sm">{priorityConfig(card.priority)?.label ?? "None"}</Text>
              )}
            </Stack>

            {/* Milestone */}
            <Stack gap={4}>
              <Group gap={4}>
                <Text size="xs" c="dimmed" fw={500}>Milestone</Text>
                {canEdit && (
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    title="Manage milestones"
                    onClick={onOpenMilestones}
                  >
                    <IconPencil size={10} />
                  </ActionIcon>
                )}
              </Group>
              {canEdit ? (
                <Select
                  size="xs"
                  placeholder="None"
                  clearable
                  value={card.milestone?.id ?? null}
                  onChange={handleMilestoneChange}
                  data={milestones.map((m) => ({
                    value: m.id,
                    label: `${m.name} · ${formatDueDate(m.dueDate)}`,
                  }))}
                  leftSection={
                    card.milestone && getDueDateStatus(card.milestone.dueDate) !== 'upcoming'
                      ? <IconAlertTriangle size={12} style={{ color: DUE_DATE_COLOR[getDueDateStatus(card.milestone.dueDate)] }} />
                      : <IconTarget size={12} />
                  }
                />
              ) : (
                card.milestone ? (
                  <Group gap={4} align="center" wrap="nowrap">
                    <Text size="sm">{card.milestone.name}</Text>
                    <Text
                      size="sm"
                      style={{ color: DUE_DATE_COLOR[getDueDateStatus(card.milestone.dueDate)] ?? 'inherit' }}
                    >
                      · {formatDueDate(card.milestone.dueDate)}
                    </Text>
                    {getDueDateStatus(card.milestone.dueDate) !== 'upcoming' && (
                      <IconAlertTriangle
                        size={13}
                        style={{ color: DUE_DATE_COLOR[getDueDateStatus(card.milestone.dueDate)] }}
                      />
                    )}
                  </Group>
                ) : (
                  <Text size="sm">None</Text>
                )
              )}
            </Stack>

            {/* Due date */}
            <Stack gap={4}>
              <Text size="xs" c="dimmed" fw={500}>Due date</Text>
              {canEdit ? (
                <DateInput
                  size="xs"
                  placeholder="None"
                  clearable
                  value={card.dueDate ? card.dueDate.slice(0, 10) : null}
                  onChange={(value) => handleDueDateChange(value || null)}
                  valueFormat="MMM D, YYYY"
                  leftSection={
                    card.dueDate && getDueDateStatus(card.dueDate) !== 'upcoming'
                      ? <IconAlertTriangle size={12} style={{ color: DUE_DATE_COLOR[getDueDateStatus(card.dueDate)] }} />
                      : <IconCalendarDue size={12} />
                  }
                />
              ) : (
                card.dueDate ? (
                  <Group gap={4} align="center" wrap="nowrap">
                    <Text
                      size="sm"
                      style={{ color: DUE_DATE_COLOR[getDueDateStatus(card.dueDate)] ?? 'inherit' }}
                    >
                      {formatDueDate(card.dueDate)}
                    </Text>
                    {getDueDateStatus(card.dueDate) !== 'upcoming' && (
                      <IconAlertTriangle
                        size={13}
                        style={{ color: DUE_DATE_COLOR[getDueDateStatus(card.dueDate)] }}
                      />
                    )}
                  </Group>
                ) : (
                  <Text size="sm">None</Text>
                )
              )}
            </Stack>

            {/* Categories */}
            {categories.map((category) => {
              const currentOptionId = card.categoryValues.find((v) => v.categoryId === category.id)?.optionId ?? null;
              return (
                <Stack gap={4} key={category.id}>
                  <Group gap={4}>
                    <Text size="xs" c="dimmed" fw={500}>{category.name}</Text>
                    {canEdit && (
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        title="Manage categories"
                        onClick={onOpenCategories}
                      >
                        <IconPencil size={10} />
                      </ActionIcon>
                    )}
                  </Group>
                  {canEdit ? (
                    <Select
                      size="xs"
                      placeholder="None"
                      clearable
                      value={currentOptionId}
                      onChange={(value) =>
                        setCardCategory.mutate({ cardId: card.id, categoryId: category.id, optionId: value })
                      }
                      data={category.options.map((o) => ({ value: o.id, label: o.label }))}
                      leftSection={<CategoryIcon name={category.icon} size={12} />}
                    />
                  ) : (
                    <Text size="sm">
                      {category.options.find((o) => o.id === currentOptionId)?.label ?? "None"}
                    </Text>
                  )}
                </Stack>
              );
            })}

            {/* Assignees */}
            <Stack gap={4}>
              <Group gap="xs">
                <Text size="xs" c="dimmed" fw={500}>Assignees</Text>
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
              <Group gap="xs">
                {card.assignees.length > 0 ? (
                  <Avatar.Group spacing="xs">
                    {card.assignees.slice(0, 6).map((a) => (
                      <Tooltip key={a.userId} label={a.name} withArrow>
                        <Avatar
                          src={getAvatarUrl(a.avatarUrl as string)}
                          size={24}
                          radius="xl"
                          name={a.name}
                          style={canEdit ? { cursor: "pointer" } : undefined}
                          onClick={
                            canEdit
                              ? () => removeAssignee.mutate({ cardId: card.id, userId: a.userId })
                              : undefined
                          }
                        />
                      </Tooltip>
                    ))}
                  </Avatar.Group>
                ) : (
                  <Text size="sm" c="dimmed">None</Text>
                )}
              </Group>

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
                            <Avatar src={getAvatarUrl(m.avatarUrl as string)} size={24} radius="xl" name={m.name} />
                            <Text size="sm" style={{ flex: 1 }}>{m.name}</Text>
                            {isAssigned && <IconCheck size={14} />}
                          </Group>
                        );
                      })}
                    </Stack>
                  </ScrollArea>
                </div>
              )}
            </Stack>
          </Stack>
        </ScrollArea>

        <div className={classes.modalSidebarFooter}>
          {canEdit ? (
            <Group justify="space-between">
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={handleDelete}
                size="xs"
              >
                Delete
              </Button>
              <Button variant="default" size="xs" onClick={onClose}>Close</Button>
            </Group>
          ) : (
            <Group justify="flex-end">
              <Button variant="default" size="xs" onClick={onClose}>Close</Button>
            </Group>
          )}
        </div>
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
  onOpenMilestones: () => void;
  onOpenCategories: () => void;
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
  onOpenMilestones,
  onOpenCategories,
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
      draggable({
        element: headerRef.current!,
        getInitialData: () => ({ type: "kanban-column", columnId: column.id }),
        onDragStart: () => setIsDraggingCol(true),
        onDrop: () => setIsDraggingCol(false),
      }),
      dropTargetForElements({
        element: colRef.current,
        canDrop: ({ source }) =>
          source.data.type === "kanban-column" && source.data.columnId !== column.id,
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
      dropTargetForElements({
        element: dropZoneRef.current!,
        canDrop: ({ source }) => source.data.type === "kanban-card",
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source, location }) => {
          setIsOver(false);
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
        <div ref={headerRef} className={classes.columnHeader}>
          <Popover
            opened={colorMenuOpen}
            onChange={setColorMenuOpen}
            width={158}
            position="bottom-start"
            withArrow
            shadow="sm"
          >
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
                {COLUMN_COLORS.map(({ name, css }) => (
                  <Box
                    key={name}
                    className={clsx(
                      classes.colorSwatch,
                      column.color === name && classes.colorSwatchActive,
                    )}
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
                if (e.key === "Escape") {
                  setColName(column.name);
                  setRenamingCol(false);
                }
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

          <Text size="xs" c="dimmed" className={classes.colCount}>
            {column.cards.length}
          </Text>

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

        <div
          ref={dropZoneRef}
          className={clsx(
            classes.cardList,
            isOver && column.cards.length === 0 && classes.cardListOver,
          )}
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
              onOpenMilestones={onOpenMilestones}
              onOpenCategories={onOpenCategories}
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

// ─── Live cursors ───────────────────────────────────────────────────────────────

const CURSOR_STALE_MS = 5000;

function KanbanCursorsLayer({ pageId }: { pageId: string }) {
  const [cursors, setCursors] = useAtom(kanbanCursorsAtom);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        let changed = false;
        const next: Record<string, IKanbanCursor> = {};
        for (const [userId, cursor] of Object.entries(prev)) {
          if (now - cursor.updatedAt < CURSOR_STALE_MS) {
            next[userId] = cursor;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [setCursors]);

  const visible = Object.values(cursors).filter((c) => c.pageId === pageId);
  if (visible.length === 0) return null;

  return (
    <div className={classes.cursorLayer}>
      {visible.map((c) => (
        <div
          key={c.userId}
          className={classes.remoteCursor}
          style={{ left: c.x, top: c.y }}
        >
          <div className={classes.remoteCursorDot} style={{ background: c.color }} />
          <span className={classes.remoteCursorLabel} style={{ background: c.color }}>
            {c.name}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Board ────────────────────────────────────────────────────────────────────

interface KanbanBoardPageProps {
  pageId: string;
  spaceId: string;
  canEdit: boolean;
  title: string;
  spaceSlug: string;
}

export default function KanbanBoardPage({
  pageId,
  spaceId,
  canEdit,
  title,
  spaceSlug,
}: KanbanBoardPageProps) {
  const { t } = useTranslation();
  const { data: columns, isLoading } = useKanbanBoardQuery(pageId);
  const [openCard, setOpenCard] = useState<IKanbanCard | null>(null);
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const moveCard = useMoveCardMutation(pageId);
  const moveColumn = useMoveColumnMutation(pageId);
  const createColumn = useCreateColumnMutation(pageId);

  const [titleValue, setTitleValue] = useState(title);
  const { mutateAsync: updateTitleMutate } = useUpdateTitlePageMutation();
  const emit = useQueryEmit();
  const navigate = useNavigate();

  const currentUser = useAtomValue(userAtom);
  const cursorColorRef = useRef(randomElement(userColors));
  const boardRef = useRef<HTMLDivElement>(null);
  const lastCursorEmitRef = useRef(0);

  const handleBoardPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!currentUser) return;
      const now = Date.now();
      if (now - lastCursorEmitRef.current < 130) return;
      lastCursorEmitRef.current = now;

      const el = boardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      emit({
        operation: "kanbanCursorMoved",
        spaceId,
        pageId,
        userId: currentUser.id,
        x: e.clientX - rect.left + el.scrollLeft,
        y: e.clientY - rect.top + el.scrollTop,
        name: currentUser.name || "Someone",
        color: cursorColorRef.current,
      });
    },
    [currentUser, emit, spaceId, pageId],
  );

  useEffect(() => {
    setTitleValue(title);
  }, [pageId, title]);

  const saveTitle = useCallback(
    async (value: string) => {
      if (value === title) return;
      const page = await updateTitleMutate({ pageId, title: value });
      updatePageData(page);
      const event: UpdateEvent = {
        operation: "updateOne",
        spaceId: page.spaceId,
        entity: ["pages"],
        id: page.id,
        payload: {
          title: page.title,
          slugId: page.slugId,
          parentPageId: page.parentPageId,
          icon: page.icon,
        },
      };
      localEmitter.emit("message", event);
      emit(event);
      navigate(buildPageUrl(spaceSlug, page.slugId, page.title), { replace: true });
    },
    [pageId, title, spaceSlug, emit, navigate, updateTitleMutate],
  );

  const debouncedSaveTitle = useDebouncedCallback(saveTitle, 500);

  const [newColName, setNewColName] = useState("");
  const [addingCol, setAddingCol] = useState(false);

  const [localColumns, setLocalColumns] = useState<IKanbanColumn[] | null>(null);
  const displayColumns = localColumns ?? columns ?? [];

  useEffect(() => {
    setLocalColumns(null);
  }, [columns]);

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
        insertIdx = null;
      } else if (edge === "top") {
        insertIdx = targetIdx;
      } else {
        insertIdx = targetIdx + 1;
      }

      const { before, after } = getAdjacentPositions(
        sortedCards.filter((c) => c.id !== cardId),
        insertIdx,
      );
      const newPosition = positionBetween(before, after);

      const newCols = cols.map((col) => {
        if (col.id === fromColumnId && col.id === toColumnId) {
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
          const card =
            fromCol?.cards.find((c) => c.id === cardId) ??
            col.cards.find((c) => c.id === cardId);
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

      const newCols = cols
        .map((c) => (c.id === dragColumnId ? { ...c, position: newPosition } : c))
        .sort((a, b) => a.position - b.position);
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
      {/* ── Title + toolbar ─────────────────────────────────────────────── */}
      <div className={classes.titleRow}>
        {canEdit ? (
          <TextInput
            value={titleValue}
            onChange={(e) => {
              setTitleValue(e.currentTarget.value);
              debouncedSaveTitle(e.currentTarget.value);
            }}
            onBlur={() => saveTitle(titleValue)}
            placeholder={t("Untitled")}
            variant="unstyled"
            className={classes.titleInput}
          />
        ) : (
          <Text fw={700} className={classes.titleText}>
            {titleValue || t("Untitled")}
          </Text>
        )}

        <Button
          variant="subtle"
          size="xs"
          leftSection={<IconTarget size={14} />}
          onClick={() => setMilestoneModalOpen(true)}
          className={classes.milestonesBtn}
        >
          Milestones
        </Button>

        <Button
          variant="subtle"
          size="xs"
          leftSection={<IconTag size={14} />}
          onClick={() => setCategoryModalOpen(true)}
          className={classes.milestonesBtn}
        >
          Categories
        </Button>
      </div>

      <div className={classes.board} ref={boardRef} onPointerMove={handleBoardPointerMove}>
        <KanbanCursorsLayer pageId={pageId} />
        {displayColumns.map((col) => (
          <KanbanColumnItem
            key={col.id}
            column={col}
            allColumns={displayColumns}
            pageId={pageId}
            spaceId={spaceId}
            canEdit={canEdit}
            onOpenCard={setOpenCard}
            onOpenMilestones={() => setMilestoneModalOpen(true)}
            onOpenCategories={() => setCategoryModalOpen(true)}
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
                    if (e.key === "Escape") {
                      setNewColName("");
                      setAddingCol(false);
                    }
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
        onOpenMilestones={() => setMilestoneModalOpen(true)}
        onOpenCategories={() => setCategoryModalOpen(true)}
      />

      <CategoryManagementModal
        opened={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        pageId={pageId}
        canEdit={canEdit}
      />

      <MilestoneManagementModal
        opened={milestoneModalOpen}
        onClose={() => setMilestoneModalOpen(false)}
        pageId={pageId}
        canEdit={canEdit}
      />
    </div>
  );
}
