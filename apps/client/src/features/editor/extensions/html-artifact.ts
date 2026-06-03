import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import HtmlArtifactView from "@/features/editor/components/html-artifact/html-artifact-view";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    htmlArtifact: {
      setHtmlArtifact: () => ReturnType;
    };
  }
}

export const HtmlArtifact = Node.create({
  name: "htmlArtifact",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      html: { default: "" },
      height: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'pre[data-type="html-artifact"]' }];
  },

  renderHTML({ node }) {
    return [
      "pre",
      { "data-type": "html-artifact" },
      ["code", { class: "language-html" }, node.attrs.html || ""],
    ];
  },

  addCommands() {
    return {
      setHtmlArtifact:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { html: "" } }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(HtmlArtifactView);
  },
});
