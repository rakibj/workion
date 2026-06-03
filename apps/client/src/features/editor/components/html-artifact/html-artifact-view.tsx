import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import {
  ActionIcon,
  Group,
  Modal,
  SegmentedControl,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconPencil } from "@tabler/icons-react";
import classes from "./html-artifact-view.module.css";

type Mode = "edit" | "split" | "preview";

const SIZE_WARN_BYTES = 500 * 1024;
const MIN_HEIGHT = 50;
const EDITOR_HEIGHT = 300;

// Appended after user HTML so the cascade reset wins over their styles.
// height:auto overrides height:100%/100vh on html/body which would otherwise
// inflate scrollHeight to equal the iframe's current height instead of
// reporting the true content height.
function buildResizeScript(id: string) {
  return `<style>html,body{height:auto!important;min-height:0!important}</style><script>(function(){var id="${id}";function h(){var v=document.documentElement.scrollHeight;window.parent.postMessage({type:"html-artifact-resize",id:id,height:v},"*");}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",h);}else{h();}window.addEventListener("load",h);window.addEventListener("resize",h);if(typeof ResizeObserver!=="undefined"){new ResizeObserver(h).observe(document.documentElement);}})();</script>`;
}

export default function HtmlArtifactView({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const { html, height: persistedHeight } = node.attrs as {
    html: string;
    height: number | null;
  };
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [mode, setMode] = useState<Mode>("preview");
  const [mobileEditOpen, setMobileEditOpen] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(EDITOR_HEIGHT);
  // Live height while the drag is in progress; committed to attrs on mouse-up.
  const [draggingHeight, setDraggingHeight] = useState<number | null>(null);
  const instanceId = useRef(Math.random().toString(36).slice(2));
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const isLarge = html && html.length > SIZE_WARN_BYTES;
  const isEditable = editor.isEditable;

  // Read-only pages always show preview.
  const effectiveMode: Mode = isEditable ? mode : "preview";

  // Listen for height reports from inside the sandboxed iframe.
  useEffect(() => {
    const id = instanceId.current;
    const handler = (event: MessageEvent) => {
      if (
        event.data?.type === "html-artifact-resize" &&
        event.data?.id === id
      ) {
        const reported = Number(event.data.height);
        if (reported > 0) setIframeHeight(Math.max(reported, MIN_HEIGHT));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleResizeDragStart = (e: React.MouseEvent) => {
    const startHeight = persistedHeight ?? iframeHeight;
    dragStartY.current = e.clientY;
    dragStartHeight.current = startHeight;

    const onMove = (ev: MouseEvent) => {
      const h = Math.max(MIN_HEIGHT, dragStartHeight.current + ev.clientY - dragStartY.current);
      setDraggingHeight(h);
    };
    const onUp = (ev: MouseEvent) => {
      const h = Math.max(MIN_HEIGHT, dragStartHeight.current + ev.clientY - dragStartY.current);
      updateAttributes({ height: h });
      setDraggingHeight(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    e.preventDefault();
  };

  const enrichedHtml = html
    ? html + buildResizeScript(instanceId.current)
    : "";

  const showEditor = !isMobile && (effectiveMode === "edit" || effectiveMode === "split");
  const showPreview = isMobile || effectiveMode === "preview" || effectiveMode === "split";
  const editorWidth = effectiveMode === "split" ? "50%" : "100%";
  const previewWidth = showEditor ? "50%" : "100%";

  // Priority: active drag → persisted attr → auto-fit from iframe content.
  const panelHeight =
    draggingHeight ??
    persistedHeight ??
    (effectiveMode === "split"
      ? Math.max(iframeHeight, EDITOR_HEIGHT)
      : Math.max(iframeHeight, MIN_HEIGHT));

  return (
    <NodeViewWrapper className={classes.wrapper}>
      <div className={classes.header} contentEditable={false}>
        <Group gap="xs">
          <Text size="sm" fw={500}>
            HTML Artifact
          </Text>
          {isLarge && (
            <Tooltip label="HTML exceeds 500 KB — saved, but may affect performance.">
              <ActionIcon variant="transparent" color="orange" size="xs">
                <IconAlertTriangle size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        {isEditable && (
          <Group gap="xs">
            {isMobile ? (
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={() => setMobileEditOpen(true)}
                aria-label="Edit HTML"
              >
                <IconPencil size={14} />
              </ActionIcon>
            ) : (
              <SegmentedControl
                size="xs"
                value={effectiveMode}
                onChange={(v) => setMode(v as Mode)}
                data={[
                  { label: "Edit", value: "edit" },
                  { label: "Split", value: "split" },
                  { label: "Preview", value: "preview" },
                ]}
              />
            )}
          </Group>
        )}
      </div>

      <div className={classes.body} contentEditable={false}>
        {showEditor && (
          <textarea
            className={classes.editor}
            style={{ width: editorWidth, height: panelHeight }}
            value={html || ""}
            onChange={(e) => updateAttributes({ html: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Paste your HTML here…"
            disabled={!isEditable}
            spellCheck={false}
          />
        )}
        {showPreview && (
          <iframe
            className={classes.preview}
            style={{ width: previewWidth, height: panelHeight }}
            // allow-scripts but NOT allow-same-origin: scripts run in a null
            // origin and cannot access the parent's cookies or DOM.
            sandbox="allow-scripts"
            srcDoc={enrichedHtml}
            title="HTML Artifact Preview"
          />
        )}
      </div>

      {/* Drag to resize · double-click to reset to auto-fit */}
      <div
        className={classes.resizeHandle}
        contentEditable={false}
        onMouseDown={handleResizeDragStart}
        onDoubleClick={() => updateAttributes({ height: null })}
        title="Drag to resize · Double-click to auto-fit"
      />

      {isMobile && (
        <Modal
          opened={mobileEditOpen}
          onClose={() => setMobileEditOpen(false)}
          title="Edit HTML"
          fullScreen
        >
          <textarea
            className={classes.mobileEditor}
            value={html || ""}
            onChange={(e) => updateAttributes({ html: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Paste your HTML here…"
            spellCheck={false}
            autoFocus
          />
        </Modal>
      )}
    </NodeViewWrapper>
  );
}
