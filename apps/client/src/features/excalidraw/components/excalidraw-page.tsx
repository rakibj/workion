import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Group, Loader, Paper, Text } from "@mantine/core";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation";

const ExcalidrawEditor = lazy(() => import("./excalidraw-editor"));

interface ExcalidrawPageProps {
  pageId: string;
  title: string;
  icon: string;
  spaceId: string;
  canEdit: boolean;
}

interface FloatingTitleProps {
  pageId: string;
  title: string;
  icon: string;
  spaceId: string;
  canEdit: boolean;
}

function FloatingTitle({ pageId, title, icon, spaceId, canEdit }: FloatingTitleProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const { handleRename } = useTreeMutation(spaceId);

  useEffect(() => { setValue(title); }, [title]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) {
      handleRename(pageId, trimmed);
    } else {
      setValue(title);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") { setValue(title); setEditing(false); }
    e.stopPropagation();
  };

  return (
    <Paper
      shadow="xs"
      radius="md"
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        zIndex: 100,
        maxWidth: 280,
        minWidth: 100,
        border: "1px solid var(--mantine-color-default-border)",
        pointerEvents: "auto",
      }}
      px="sm"
      py={5}
    >
      <Group gap={6} wrap="nowrap" align="center">
        {icon && (
          <Text span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>
            {icon}
          </Text>
        )}

        {editing ? (
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              minWidth: 80,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: "var(--mantine-font-size-sm)",
              fontWeight: 500,
              color: "var(--mantine-color-text)",
              padding: 0,
            }}
          />
        ) : (
          <Text
            size="sm"
            fw={500}
            truncate="end"
            style={{ flex: 1, cursor: canEdit ? "text" : "default", maxWidth: 220 }}
            onClick={canEdit ? () => setEditing(true) : undefined}
          >
            {title || "Untitled"}
          </Text>
        )}

      </Group>
    </Paper>
  );
}

export default function ExcalidrawPage({ pageId, title, icon, spaceId, canEdit }: ExcalidrawPageProps) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* spacer that clears the 45px fixed PageHeader — same as whiteboard */}
      <div style={{ height: 45, flexShrink: 0 }} />

      <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
        <Suspense fallback={<Loader size="sm" m="md" />}>
          <ExcalidrawEditor key={pageId} pageId={pageId} readOnly={!canEdit} />
        </Suspense>

        {/* Floating title pill — overlays the canvas, adds no vertical space */}
        <FloatingTitle
          pageId={pageId}
          title={title}
          icon={icon}
          spaceId={spaceId}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}
