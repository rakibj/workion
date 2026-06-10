import {
  Node,
  InputRule,
  findChildren,
  findParentNode,
  mergeAttributes,
} from "@tiptap/core";
import { icon, setAttributes } from "../utils";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    toggleHeading: {
      setToggleHeading: (attrs: { level: 1 | 2 | 3 }) => ReturnType;
      unsetToggleHeading: () => ReturnType;
      toggleToggleHeading: (attrs: { level: 1 | 2 | 3 }) => ReturnType;
    };
  }
}

export interface ToggleHeadingOptions {
  HTMLAttributes: Record<string, any>;
}

export const ToggleHeading = Node.create<ToggleHeadingOptions>({
  name: "toggleHeading",
  group: "block",
  content: "toggleHeadingTitle toggleHeadingContent",
  defining: true,
  isolating: true,
  // @ts-ignore
  allowGapCursor: false,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      level: {
        default: 1,
        parseHTML: (e) => parseInt(e.getAttribute("data-level") ?? "1", 10),
        renderHTML: (a) => ({ "data-level": a.level }),
      },
      open: {
        default: false,
        parseHTML: (e) => e.hasAttribute("open"),
        renderHTML: (a) => (a.open ? { open: "" } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggleHeading"]' }];
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

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement("div");
      const btn = document.createElement("button");
      const ico = document.createElement("div");
      const div = document.createElement("div");

      dom.setAttribute("data-type", this.name);
      dom.setAttribute("data-level", String(node.attrs.level));
      btn.setAttribute("data-type", `${this.name}Button`);
      div.setAttribute("data-type", `${this.name}Container`);

      if (node.attrs.open) {
        dom.setAttribute("open", "true");
      }

      ico.innerHTML = icon("right-line");
      btn.addEventListener("click", () => {
        const open = !dom.hasAttribute("open");

        if (!editor.isEditable) {
          if (open) {
            dom.setAttribute("open", "true");
          } else {
            dom.removeAttribute("open");
          }
          return;
        }

        setAttributes(editor, getPos, { ...node.attrs, open });
      });

      btn.append(ico);
      dom.append(btn);
      dom.append(div);

      return {
        dom,
        contentDOM: div,
        update: (updatedNode) => {
          if (updatedNode.type !== this.type) return false;
          dom.setAttribute("data-level", String(updatedNode.attrs.level));
          if (updatedNode.attrs.open) {
            dom.setAttribute("open", "true");
          } else {
            dom.removeAttribute("open");
          }
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      setToggleHeading: (attrs) => {
        return ({ state, chain, tr, dispatch }) => {
          // If already inside a toggleHeading, update the level only
          const parent = findParentNode((n) => n.type === this.type)(
            state.selection,
          );
          if (parent) {
            if (dispatch) {
              tr.setNodeMarkup(parent.pos, undefined, {
                ...parent.node.attrs,
                level: attrs.level,
              });
              dispatch(tr);
            }
            return true;
          }

          const range = state.selection.$from.blockRange(state.selection.$to);
          if (!range) return false;

          const slice = state.doc.slice(range.start, range.end);
          if (
            slice.content.firstChild?.type.name === "toggleHeadingTitle"
          ) {
            return false;
          }

          const firstBlock = slice.content.firstChild;
          const titleContent: any[] = firstBlock
            ? (firstBlock.content.toJSON() ?? [])
            : [];

          return chain()
            .insertContentAt(
              { from: range.start, to: range.end },
              {
                type: this.name,
                attrs: { level: attrs.level, open: true },
                content: [
                  { type: "toggleHeadingTitle", content: titleContent },
                  {
                    type: "toggleHeadingContent",
                    content: [{ type: "paragraph" }],
                  },
                ],
              },
            )
            .setTextSelection(range.start + 2)
            .run();
        };
      },

      unsetToggleHeading: () => {
        return ({ state, chain }) => {
          const parent = findParentNode((n) => n.type === this.type)(
            state.selection,
          );
          if (!parent) return false;

          const titleNodes = findChildren(
            parent.node,
            (n) => n.type.name === "toggleHeadingTitle",
          );
          const contentNodes = findChildren(
            parent.node,
            (n) => n.type.name === "toggleHeadingContent",
          );
          if (!titleNodes.length || !contentNodes.length) return false;

          const level = parent.node.attrs.level;
          const range = {
            from: parent.pos,
            to: parent.pos + parent.node.nodeSize,
          };

          const titleContent: any[] =
            titleNodes[0].node.content.toJSON() ?? [];
          const bodyContent: any[] =
            contentNodes[0].node.content.toJSON() ?? [];

          // Drop a single trailing empty paragraph (the default placeholder)
          const filteredBody =
            bodyContent.length === 1 &&
            bodyContent[0].type === "paragraph" &&
            (!bodyContent[0].content || bodyContent[0].content.length === 0)
              ? []
              : bodyContent;

          return chain()
            .insertContentAt(range, [
              { type: "heading", attrs: { level }, content: titleContent },
              ...filteredBody,
            ])
            .setTextSelection(range.from + 1)
            .run();
        };
      },

      toggleToggleHeading: (attrs) => {
        return ({ state, chain }) => {
          const parent = findParentNode((n) => n.type === this.type)(
            state.selection,
          );
          if (!parent) {
            return chain().setToggleHeading(attrs).run();
          }
          if (parent.node.attrs.level === attrs.level) {
            return chain().unsetToggleHeading().run();
          }
          // Different level — update only the level attribute
          return chain().setToggleHeading(attrs).run();
        };
      },
    };
  },

  addInputRules() {
    const makeRule = (find: RegExp, level: 1 | 2 | 3) =>
      new InputRule({
        find,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).setToggleHeading({ level });
        },
      });

    return [
      makeRule(/^#>\s$/, 1),
      makeRule(/^##>\s$/, 2),
      makeRule(/^###>\s$/, 3),
    ];
  },
});
