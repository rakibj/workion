import { Node, findParentNode, mergeAttributes } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";

export interface ToggleHeadingTitleOptions {
  HTMLAttributes: Record<string, any>;
}

export const ToggleHeadingTitle = Node.create<ToggleHeadingTitleOptions>({
  name: "toggleHeadingTitle",
  group: "block",
  content: "inline*",
  defining: true,
  isolating: true,
  selectable: false,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        { "data-type": this.name },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      0,
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (selection.$anchor.parent.type.name !== this.name) return false;
        if (selection.$anchor.parentOffset !== 0) return false;
        return editor.chain().unsetToggleHeading().focus().run();
      },

      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        const $head = selection.$head;

        if ($head.parent.type.name !== this.name) return false;

        // Find the sibling toggleHeadingContent
        const contentNodePos = $head.after();
        const contentNode = state.doc.nodeAt(contentNodePos);
        if (!contentNode || contentNode.type.name !== "toggleHeadingContent") {
          return false;
        }

        const parent = findParentNode(
          (n) => n.type.name === "toggleHeading",
        )(selection);

        const tr = state.tr;

        // Open the toggle if closed
        if (parent && !parent.node.attrs.open) {
          tr.setNodeMarkup(parent.pos, undefined, {
            ...parent.node.attrs,
            open: true,
          });
        }

        // Move cursor into the first block inside toggleHeadingContent
        // contentNodePos: before toggleHeadingContent opening tag
        // +1: inside toggleHeadingContent
        // +1: inside first child block
        const targetPos = contentNodePos + 2;
        const $target = tr.doc.resolve(targetPos);
        tr.setSelection(Selection.near($target));
        tr.scrollIntoView();
        view.dispatch(tr);
        return true;
      },
    };
  },
});
