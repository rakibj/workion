import { useEffect, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./excalidraw-editor.css";
import type { BinaryFileData, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useComputedColorScheme } from "@mantine/core";
import { Group, Paper, Text } from "@mantine/core";

interface SharedExcalidrawViewProps {
  content: { elements?: ExcalidrawElement[]; files?: Record<string, BinaryFileData> } | null;
  title?: string;
  icon?: string;
}

function ExcalidrawViewer({ content, title, icon }: SharedExcalidrawViewProps) {
  const theme = useComputedColorScheme();
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

  useEffect(() => {
    if (!excalidrawAPI || !content) return;

    const elements = (content.elements ?? []) as ExcalidrawElement[];
    const files = content.files ?? {};

    if (Object.keys(files).length > 0) {
      excalidrawAPI.addFiles(Object.values(files) as BinaryFileData[]);
    }

    excalidrawAPI.updateScene({ elements });
    excalidrawAPI.scrollToContent(undefined, { animate: false, fitToViewport: true });
  }, [excalidrawAPI, content]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
        <div className="excalidraw-wrapper">
          <Excalidraw
            excalidrawAPI={(api) => setExcalidrawAPI(api)}
            viewModeEnabled={true}
            theme={theme as "light" | "dark"}
          />
        </div>

        {(title || icon) && (
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
              pointerEvents: "none",
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
              {title && (
                <Text size="sm" fw={500} truncate="end" style={{ maxWidth: 220 }}>
                  {title}
                </Text>
              )}
            </Group>
          </Paper>
        )}
      </div>
    </div>
  );
}

export default function SharedExcalidrawView(props: SharedExcalidrawViewProps) {
  return <ExcalidrawViewer {...props} />;
}
