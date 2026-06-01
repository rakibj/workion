import "@/features/editor/styles/index.css";
import { useRef } from "react";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import { mainExtensions } from "@/features/editor/extensions/extensions";
import { UndoRedo } from "@tiptap/extensions";
import { TransclusionLookupProvider } from "@/features/editor/components/transclusion/transclusion-lookup-context";
import { EditorBubbleMenu } from "@/features/editor/components/bubble-menu/bubble-menu";
import { ReadonlyBubbleMenu } from "@/features/editor/components/bubble-menu/readonly-bubble-menu";
import { EditorLinkMenu } from "@/features/editor/components/link/link-menu";
import TableMenu from "@/features/editor/components/table/table-menu";
import { TableHandlesLayer } from "@/features/editor/components/table/handle/table-handles-layer";
import ImageMenu from "@/features/editor/components/image/image-menu";
import CalloutMenu from "@/features/editor/components/callout/callout-menu";
import VideoMenu from "@/features/editor/components/video/video-menu";
import PdfMenu from "@/features/editor/components/pdf/pdf-menu";
import SubpagesMenu from "@/features/editor/components/subpages/subpages-menu";
import ExcalidrawMenu from "@/features/editor/components/excalidraw/excalidraw-menu-lazy";
import DrawioMenu from "@/features/editor/components/drawio/drawio-menu";
import ColumnsMenu from "@/features/editor/components/columns/columns-menu";
import { EditorAiMenu } from "@/ee/ai/components/editor/ai-menu/ai-menu";
import {
  handleFileDrop,
  handlePaste,
} from "@/features/editor/components/common/editor-paste-handler";
import { useAtomValue } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import classes from "./card-description-editor.module.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseDescriptionContent(desc: string): any {
  if (!desc) return "";
  try {
    const parsed = JSON.parse(desc);
    if (parsed?.type === "doc") return parsed;
  } catch {}
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: desc }] }],
  };
}

export function getDescriptionPlainText(desc: string): string {
  if (!desc) return "";
  try {
    const parsed = JSON.parse(desc);
    if (parsed?.type === "doc") return extractNodeText(parsed).trim();
  } catch {}
  return desc;
}

function extractNodeText(node: any): string {
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";
  return node.content.map(extractNodeText).join(" ");
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CardDescriptionEditorProps {
  initialContent: string;
  editable: boolean;
  pageId: string;
  onChange: (json: string) => void;
}

export default function CardDescriptionEditor({
  initialContent,
  editable,
  pageId,
  onChange,
}: CardDescriptionEditorProps) {
  const currentUser = useAtomValue(currentUserAtom);

  const editor = useEditor({
    extensions: [...mainExtensions, UndoRedo],
    content: parseDescriptionContent(initialContent),
    editable,
    immediatelyRender: true,
    editorProps: {
      handleDOMEvents: {
        keydown: (_view, event) => {
          if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
            if (document.querySelector("#slash-command")) return true;
          }
          if (
            ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(
              event.key,
            )
          ) {
            if (document.querySelector("#emoji-command")) return true;
          }
        },
      },
      handlePaste: (_view, event) => {
        if (!editor) return false;
        return handlePaste(editor, event, pageId, currentUser?.user.id);
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (!editor) return false;
        return handleFileDrop(editor, event, moved, pageId);
      },
    },
    onCreate: ({ editor }) => {
      // @ts-ignore
      editor.storage.pageId = pageId;
    },
    onUpdate: ({ editor }) => {
      onChange(JSON.stringify(editor.getJSON()));
    },
  });

  const editorIsEditable = useEditorState({
    editor,
    selector: (ctx) => ctx.editor?.isEditable ?? false,
  });

  return (
    <TransclusionLookupProvider>
      <div className={classes.root} style={{ position: "relative" }}>
        <EditorContent editor={editor} />

        {editor && editorIsEditable && (
          <>
            <EditorAiMenu editor={editor} />
            <EditorLinkMenu editor={editor} />
            <EditorBubbleMenu editor={editor} />
            <TableMenu editor={editor} />
            <TableHandlesLayer editor={editor} />
            <ImageMenu editor={editor} />
            <VideoMenu editor={editor} />
            <PdfMenu editor={editor} />
            <CalloutMenu editor={editor} />
            <SubpagesMenu editor={editor} />
            <ExcalidrawMenu editor={editor} />
            <DrawioMenu editor={editor} />
            <ColumnsMenu editor={editor} />
          </>
        )}

        {editor && !editorIsEditable && (
          <ReadonlyBubbleMenu editor={editor} />
        )}
      </div>
    </TransclusionLookupProvider>
  );
}
