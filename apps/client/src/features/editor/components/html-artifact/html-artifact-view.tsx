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
import {
  IconAlertTriangle,
  IconMinus,
  IconPencil,
  IconPlus,
} from "@tabler/icons-react";
import classes from "./html-artifact-view.module.css";

type Mode = "edit" | "split" | "preview";

const SIZE_WARN_BYTES = 500 * 1024;
const MIN_HEIGHT = 50;
const EDITOR_HEIGHT = 300;
const ZOOM_STEP = 0.1;

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
  const { html, height: persistedHeight, width: persistedWidth } = node.attrs as {
    html: string;
    height: number | null;
    width: number | null;
  };
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [mode, setMode] = useState<Mode>("preview");
  const [mobileEditOpen, setMobileEditOpen] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(EDITOR_HEIGHT);
  const [draggingHeight, setDraggingHeight] = useState<number | null>(null);
  // Height of the pre-scale inner div — used to compute the clipping container height.
  const [innerHeight, setInnerHeight] = useState(0);

  const instanceId = useRef(Math.random().toString(36).slice(2));
  // NodeViewWrapper element — always full-width, used to measure naturalWidth.
  const wrapperRef = useRef<HTMLElement>(null);
  // Clips to the display (scaled) width.
  const scaledContainerRef = useRef<HTMLDivElement>(null);
  // Receives the CSS transform; always renders at naturalWidth.
  const innerRef = useRef<HTMLDivElement>(null);
  // The editor column width — stable reference for direct DOM drag callbacks.
  const naturalWidthRef = useRef<number>(0);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const isLarge = html && html.length > SIZE_WARN_BYTES;
  const isEditable = editor.isEditable;
  const effectiveMode: Mode = isEditable ? mode : "preview";

  // The NodeViewWrapper is always full-width — observe it to track naturalWidth.
  useEffect(() => {
    const wrapper = wrapperRef.current as HTMLElement | null;
    if (!wrapper) return;
    naturalWidthRef.current = wrapper.getBoundingClientRect().width;
    const ro = new ResizeObserver(([entry]) => {
      naturalWidthRef.current = entry.contentRect.width;
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  // Track inner div height so the clipping container stays at the right size.
  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      setInnerHeight(h);
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

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

  // Bottom handle: changes height only.
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

  // Zoom via +/- buttons. Snaps to the nearest 10 % step.
  const applyZoom = (delta: number) => {
    const natWidth = naturalWidthRef.current;
    if (!natWidth) return;
    const currentScale = persistedWidth ? persistedWidth / natWidth : 1;
    const newScale = Math.max(
      0.1,
      Math.min(1, Math.round((currentScale + delta) * 10) / 10),
    );
    updateAttributes({ width: newScale >= 0.99 ? null : Math.round(natWidth * newScale) });
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

  // Derive scale from persisted attribute vs measured natural width.
  const natWidth = naturalWidthRef.current || 800;
  const scale =
    persistedWidth && natWidth > 0 ? persistedWidth / natWidth : 1;
  const isScaled = scale < 0.995;
  const zoomPercent = Math.round(scale * 100);

  // Applied by React after each render; the drag bypasses this via direct DOM.
  const scaledContainerStyle: React.CSSProperties | undefined = isScaled
    ? {
        width: persistedWidth!,
        height: innerHeight > 0 ? Math.round(innerHeight * scale) : undefined,
        overflow: "hidden",
        maxWidth: "100%",
      }
    : undefined;

  const innerScaledStyle: React.CSSProperties | undefined = isScaled
    ? {
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        width: natWidth,
      }
    : undefined;

  return (
    // NodeViewWrapper stays full-width at all times; naturalWidth is measured from it.
    <NodeViewWrapper ref={wrapperRef} className={classes.wrapper}>
      {/* Header is outside the scaled area so it never shrinks or skews. */}
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
            {!isMobile && (
              <>
                {/* Zoom controls */}
                <Group gap={2} align="center" className={classes.zoomControls}>
                  <Tooltip label="Zoom out" withArrow>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      onClick={() => applyZoom(-ZOOM_STEP)}
                      disabled={zoomPercent <= 10}
                    >
                      <IconMinus size={11} />
                    </ActionIcon>
                  </Tooltip>
                  <Text size="xs" c="dimmed" className={classes.zoomLabel}>
                    {zoomPercent}%
                  </Text>
                  <Tooltip label="Zoom in" withArrow>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      onClick={() => applyZoom(ZOOM_STEP)}
                      disabled={zoomPercent >= 100}
                    >
                      <IconPlus size={11} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

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
              </>
            )}

            {isMobile && (
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={() => setMobileEditOpen(true)}
                aria-label="Edit HTML"
              >
                <IconPencil size={14} />
              </ActionIcon>
            )}
          </Group>
        )}
      </div>

      {/* Scaled area: clips to display width; inner content renders at naturalWidth. */}
      <div
        ref={scaledContainerRef}
        className={classes.scaledContainer}
        style={scaledContainerStyle}
        contentEditable={false}
      >
        <div ref={innerRef} style={innerScaledStyle}>
          <div className={classes.body}>
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

          {/* Bottom handle: drag to resize height · double-click to auto-fit */}
          <div
            className={classes.resizeHandle}
            onMouseDown={handleResizeDragStart}
            onDoubleClick={() => updateAttributes({ height: null })}
            title="Drag to resize · Double-click to auto-fit"
          />
        </div>

      </div>

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
