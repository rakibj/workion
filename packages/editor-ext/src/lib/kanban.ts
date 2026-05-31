import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

export type KanbanColor = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
}

export interface KanbanColumn {
  id: string;
  name: string;
  color: KanbanColor;
  cards: KanbanCard[];
}

export interface KanbanData {
  columns: KanbanColumn[];
}

export interface KanbanOptions {
  HTMLAttributes: Record<string, any>;
  view: any;
}

const makeDefaultData = (): KanbanData => ({
  columns: [
    { id: 'todo', name: 'To Do', color: 'gray', cards: [] },
    { id: 'in-progress', name: 'In Progress', color: 'blue', cards: [] },
    { id: 'done', name: 'Done', color: 'green', cards: [] },
  ],
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    kanban: {
      insertKanban: () => ReturnType;
    };
  }
}

export const Kanban = Node.create<KanbanOptions>({
  name: 'kanban',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      view: null,
    };
  },

  addAttributes() {
    return {
      data: {
        default: makeDefaultData(),
        parseHTML: (element) => {
          const raw = element.getAttribute('data-kanban');
          try {
            return JSON.parse(raw ?? '');
          } catch {
            return makeDefaultData();
          }
        },
        renderHTML: (attributes) => ({
          'data-kanban': JSON.stringify(attributes.data),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        { 'data-type': this.name },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
    ];
  },

  addNodeView() {
    this.editor.isInitialized = true;
    return ReactNodeViewRenderer(this.options.view);
  },

  addCommands() {
    return {
      insertKanban:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { data: makeDefaultData() },
          }),
    };
  },
});
