import type { IKanbanColumn } from "../types/kanban.types";
import { getDescriptionPlainText } from "../components/card-description-editor";

export function kanbanToMarkdown(title: string, columns: IKanbanColumn[]): string {
  const lines: string[] = [];

  if (title) lines.push(`# ${title}\n`);

  const sorted = [...columns].sort((a, b) => a.position - b.position);

  for (const col of sorted) {
    lines.push(`## ${col.name}`);

    const cards = [...col.cards].sort((a, b) => a.position - b.position);

    if (cards.length === 0) {
      lines.push("_No cards_");
    } else {
      for (const card of cards) {
        let line = `- [ ] ${card.title || "Untitled"}`;

        const meta: string[] = [];
        if (card.priority) meta.push(`*${card.priority}*`);
        if (card.milestone) meta.push(`Milestone: ${card.milestone.name}`);
        if (card.assignees.length > 0)
          meta.push(`Assigned to: ${card.assignees.map((a) => a.name).join(", ")}`);

        if (meta.length > 0) line += ` — ${meta.join(" — ")}`;
        lines.push(line);

        const desc = getDescriptionPlainText(card.description);
        if (desc) lines.push(`  ${desc}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
