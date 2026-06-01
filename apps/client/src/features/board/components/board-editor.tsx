import { useEffect, useRef } from "react";
import { Tldraw } from "tldraw";
import type { Editor, TLEditorSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import { useDebouncedCallback } from "@mantine/hooks";
import { useUpdatePageMutation } from "@/features/page/queries/page-query";

interface BoardEditorProps {
  pageId: string;
  initialSnapshot: TLEditorSnapshot | null;
  readOnly: boolean;
}

export default function BoardEditor({ pageId, initialSnapshot, readOnly }: BoardEditorProps) {
  const { mutate: updatePage } = useUpdatePageMutation();
  const editorRef = useRef<Editor | null>(null);

  const saveSnapshot = useDebouncedCallback(() => {
    const editor = editorRef.current;
    if (!editor || readOnly) return;
    const snapshot = editor.getSnapshot();
    updatePage({ pageId, content: snapshot });
  }, 1000);

  useEffect(() => {
    return () => {
      editorRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Tldraw
        snapshot={initialSnapshot ?? undefined}
        onMount={(editor) => {
          editorRef.current = editor;
          if (readOnly) {
            editor.updateInstanceState({ isReadonly: true });
          }
          const cleanup = editor.store.listen(
            () => {
              if (!readOnly) saveSnapshot();
            },
            { source: "user" },
          );
          return cleanup;
        }}
      />
    </div>
  );
}
