import React from "react";
import { createPortal } from "react-dom";
import { Menu, SimpleGrid, Tooltip, Box, rem } from "@mantine/core";
import type { Editor } from "@tiptap/react";
import { useAtom } from "jotai";
import { showAiMenuAtom } from "@/features/editor/atoms/editor-atoms";
import {
  IconBlockquote,
  IconBrush,
  IconCaretRightFilled,
  IconCheckbox,
  IconCode,
  IconCopy,
  IconH1,
  IconH2,
  IconH3,
  IconInfoCircle,
  IconLink,
  IconList,
  IconListNumbers,
  IconPalette,
  IconQuote,
  IconSparkles,
  IconToggleLeft,
  IconTrash,
  IconTypography,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

const TEXT_COLORS = [
  { name: "Default", color: "" },
  { name: "Gray", color: "#9B9A97" },
  { name: "Brown", color: "#64473A" },
  { name: "Orange", color: "#D9730D" },
  { name: "Yellow", color: "#CB912F" },
  { name: "Green", color: "#448361" },
  { name: "Blue", color: "#337EA9" },
  { name: "Purple", color: "#9065B0" },
  { name: "Pink", color: "#C14C8A" },
  { name: "Red", color: "#D44C47" },
];

const HIGHLIGHT_COLORS = [
  { name: "Default", color: "" },
  { name: "Gray", color: "#e3e2e0" },
  { name: "Brown", color: "#eee0da" },
  { name: "Orange", color: "#faebdd" },
  { name: "Yellow", color: "#fbf3db" },
  { name: "Green", color: "#ddedea" },
  { name: "Blue", color: "#ddebf1" },
  { name: "Purple", color: "#eae4f2" },
  { name: "Pink", color: "#f4dfeb" },
  { name: "Red", color: "#fbe4e4" },
];

const NO_TURN_INTO = new Set([
  "table",
  "codeBlock",
  "htmlArtifact",
  "image",
  "video",
  "audio",
]);
const NO_COLOR = new Set([
  "table",
  "htmlArtifact",
  "image",
  "video",
  "audio",
]);

export interface BlockContextMenuProps {
  editor: Editor;
  opened: boolean;
  onClose: () => void;
  pos: number;
  nodeType: string;
  x: number;
  y: number;
}

export function BlockContextMenu({
  editor,
  opened,
  onClose,
  pos,
  nodeType,
  x,
  y,
}: BlockContextMenuProps) {
  const { t } = useTranslation();
  const [, setShowAiMenu] = useAtom(showAiMenuAtom);

  const canTurnInto = !NO_TURN_INTO.has(nodeType);
  const canColor = !NO_COLOR.has(nodeType);
  const isHeading = nodeType === "heading";

  const getHeadingId = (): string | undefined => {
    const node = editor.state.doc.nodeAt(pos);
    return node?.attrs?.id as string | undefined;
  };

  // Find the text range of the first textblock inside this block node.
  // setColor / setHighlight are inline marks — they need a text selection.
  const getBlockTextRange = (): { from: number; to: number } | null => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return null;
    let from = -1;
    let to = -1;
    editor.state.doc.nodesBetween(pos, pos + node.nodeSize, (n, p) => {
      if (n.isTextblock) {
        if (from === -1) from = p + 1;
        to = p + n.nodeSize - 1;
        return false; // only the first textblock
      }
    });
    if (from === -1 || from >= to) return null;
    return { from, to };
  };

  const applyTextColor = (color: string) => {
    const range = getBlockTextRange();
    if (!range) { onClose(); return; }
    const chain = editor.chain().focus().setTextSelection(range);
    if (color) {
      chain.setColor(color).run();
    } else {
      chain.unsetColor().run();
    }
    onClose();
  };

  const applyHighlight = (color: string, name: string) => {
    const range = getBlockTextRange();
    if (!range) { onClose(); return; }
    const chain = editor.chain().focus().setTextSelection(range);
    if (color) {
      chain.toggleMark("highlight", { color, colorName: name.toLowerCase() }).run();
    } else {
      chain.unsetHighlight().run();
    }
    onClose();
  };

  const turnIntoItems = [
    {
      name: "Text",
      icon: IconTypography,
      command: () =>
        editor.chain().focus().toggleNode("paragraph", "paragraph").run(),
    },
    {
      name: "Heading 1",
      icon: IconH1,
      command: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      name: "Heading 2",
      icon: IconH2,
      command: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      name: "Heading 3",
      icon: IconH3,
      command: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      name: "Bullet List",
      icon: IconList,
      command: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      name: "Numbered List",
      icon: IconListNumbers,
      command: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      name: "To-do List",
      icon: IconCheckbox,
      command: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      name: "Blockquote",
      icon: IconBlockquote,
      command: () =>
        editor
          .chain()
          .focus()
          .toggleNode("paragraph", "paragraph")
          .toggleBlockquote()
          .run(),
    },
    {
      name: "Synced block",
      icon: IconQuote,
      command: () => editor.chain().focus().toggleTransclusionSource().run(),
    },
    {
      name: "Code",
      icon: IconCode,
      command: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      name: "Callout",
      icon: IconInfoCircle,
      command: () => editor.chain().focus().toggleCallout().run(),
    },
    {
      name: "Toggle block",
      icon: IconCaretRightFilled,
      command: () => editor.chain().focus().setDetails().run(),
    },
    {
      name: "Toggle H1",
      icon: IconToggleLeft,
      command: () =>
        editor.chain().focus().toggleToggleHeading({ level: 1 }).run(),
    },
    {
      name: "Toggle H2",
      icon: IconToggleLeft,
      command: () =>
        editor.chain().focus().toggleToggleHeading({ level: 2 }).run(),
    },
    {
      name: "Toggle H3",
      icon: IconToggleLeft,
      command: () =>
        editor.chain().focus().toggleToggleHeading({ level: 3 }).run(),
    },
  ];

  const handleDuplicate = () => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node) { onClose(); return; }
    editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize, node.toJSON())
      .run();
    onClose();
  };

  const handleDelete = () => {
    editor.chain().focus().deleteNode(nodeType).run();
    onClose();
  };

  const handleCopyLink = () => {
    const headingId = getHeadingId();
    if (headingId) {
      navigator.clipboard.writeText(window.location.href + "#" + headingId);
    }
    onClose();
  };

  const handleAskAi = () => {
    editor.commands.setNodeSelection(pos);
    setShowAiMenu(true);
    onClose();
  };

  const headingId = isHeading ? getHeadingId() : undefined;

  if (!opened) return null;

  return createPortal(
    <Menu
      opened
      onClose={onClose}
      position="bottom-start"
      withinPortal
      shadow="md"
    >
      <Menu.Target>
        <div
          style={{
            position: "fixed",
            top: y,
            left: x,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </Menu.Target>
      <Menu.Dropdown>
        {canTurnInto && (
          <Menu.Sub position="right-start">
            <Menu.Sub.Target>
              <Menu.Sub.Item>{t("Turn into")}</Menu.Sub.Item>
            </Menu.Sub.Target>
            <Menu.Sub.Dropdown>
              {turnIntoItems.map((item) => (
                <Menu.Item
                  key={item.name}
                  leftSection={<item.icon size={16} />}
                  onClick={() => {
                    item.command();
                    onClose();
                  }}
                >
                  {t(item.name)}
                </Menu.Item>
              ))}
            </Menu.Sub.Dropdown>
          </Menu.Sub>
        )}

        {canColor && (
          <>
            {canTurnInto && <Menu.Divider />}
            <Menu.Sub position="right-start">
              <Menu.Sub.Target>
                <Menu.Sub.Item leftSection={<IconPalette size={16} />}>
                  {t("Text color")}
                </Menu.Sub.Item>
              </Menu.Sub.Target>
              <Menu.Sub.Dropdown>
                <SimpleGrid cols={5} p="xs" spacing="xs">
                  {TEXT_COLORS.map(({ name, color }) => (
                    <Tooltip key={name} label={t(name)} withArrow>
                      <Box
                        role="button"
                        tabIndex={0}
                        aria-label={t(name)}
                        onClick={() => applyTextColor(color)}
                        style={{
                          width: rem(24),
                          height: rem(24),
                          borderRadius: rem(4),
                          border: "1px solid var(--mantine-color-gray-4)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: rem(13),
                          fontWeight: 700,
                          color: color || "var(--mantine-color-gray-8)",
                        }}
                      >
                        A
                      </Box>
                    </Tooltip>
                  ))}
                </SimpleGrid>
              </Menu.Sub.Dropdown>
            </Menu.Sub>

            <Menu.Sub position="right-start">
              <Menu.Sub.Target>
                <Menu.Sub.Item leftSection={<IconBrush size={16} />}>
                  {t("Background color")}
                </Menu.Sub.Item>
              </Menu.Sub.Target>
              <Menu.Sub.Dropdown>
                <SimpleGrid cols={5} p="xs" spacing="xs">
                  {HIGHLIGHT_COLORS.map(({ name, color }) => (
                    <Tooltip key={name} label={t(name)} withArrow>
                      <Box
                        role="button"
                        tabIndex={0}
                        aria-label={t(name)}
                        onClick={() => applyHighlight(color, name)}
                        style={{
                          width: rem(24),
                          height: rem(24),
                          borderRadius: rem(4),
                          backgroundColor:
                            color || "var(--mantine-color-white)",
                          border: "1px solid var(--mantine-color-gray-4)",
                          cursor: "pointer",
                        }}
                      />
                    </Tooltip>
                  ))}
                </SimpleGrid>
              </Menu.Sub.Dropdown>
            </Menu.Sub>
          </>
        )}

        <Menu.Divider />

        <Menu.Item
          leftSection={<IconCopy size={16} />}
          onClick={handleDuplicate}
        >
          {t("Duplicate")}
        </Menu.Item>

        {isHeading && headingId && (
          <Menu.Item
            leftSection={<IconLink size={16} />}
            onClick={handleCopyLink}
          >
            {t("Copy link to block")}
          </Menu.Item>
        )}

        <Menu.Divider />

        <Menu.Item
          leftSection={<IconSparkles size={16} />}
          onClick={handleAskAi}
        >
          {t("Ask AI")}
        </Menu.Item>

        <Menu.Divider />

        <Menu.Item
          leftSection={<IconTrash size={16} />}
          color="red"
          onClick={handleDelete}
        >
          {t("Delete")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>,
    document.body,
  );
}
