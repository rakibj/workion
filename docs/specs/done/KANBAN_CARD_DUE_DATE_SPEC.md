# Kanban Card Due Date

**Status:** Done (2026-08-31). Migration, DTO/service/repo, AI chat tool parity, and UI (card badge + card modal field) all implemented and verified live in the browser (persistence, clear, overdue/today color states all confirmed against the DB).

## Problem

Kanban cards can link to a shared board-level Milestone (a target date shared by many cards) but have no way to set a due date for a single card. Users want a per-card due date that is independent of Milestone — a card can have a Milestone, a due date, both, or neither.

## Data model

New nullable column on the existing `kanban_cards` table (mirrors `milestone_id`'s addition pattern):

```
ALTER TABLE kanban_cards ADD COLUMN due_date date NULL;
```

Migration file: `apps/server/src/database/migrations/<timestamp>-kanban-card-due-date.ts`. Down migration drops the column. No new table — this is a plain scalar on the card, not a shared/reusable entity like Milestone.

## API contract

`core/kanban/dto/kanban.dto.ts` — `UpdateCardDto` gets a new optional field, following the existing `milestoneId` nullable pattern:

```ts
@IsOptional()
@ValidateIf((o) => o.dueDate !== null && o.dueDate !== undefined)
@IsDateString()
dueDate?: string | null;
```

- `KanbanService.updateCard` data param and `KanbanRepo.updateCard`'s `Pick<KanbanCard, ...>` both add `dueDate`.
- `KanbanCard` entity type picks up `dueDate: string | null` automatically once the migration runs and `pnpm --filter server run migration:codegen` regenerates `db.d.ts`.
- No new endpoints — set/clear goes through the existing `PATCH` card update endpoint the same way `milestoneId`/`priority` already do.
- AI chat tool `update_kanban_card` (`core/ai-chat/controllers/ai-chat.controller.ts`) gets a matching optional `dueDate: z.union([z.string(), z.literal('none')]).optional()` param, passed through to the same `updateCard` call (`'none'` → `null`), for parity with `milestoneId`.

## UI

**Card face:** new badge, visually parallel to the existing Milestone badge but a distinct icon (`IconCalendarDue`, not `IconTarget` which Milestone already uses) so the two are distinguishable at a glance. Icon-only when unset; once set, shows the formatted date using the board's existing `formatDueDate`/`getDueDateStatus`/`DUE_DATE_COLOR` helpers (already exported at module scope in `kanban-board-page.tsx`) — red when overdue, amber when due today, default color otherwise. Reuses the same helpers Milestone uses today so the red/amber thresholds stay identical across both badges.

Unlike Milestone (a menu picking from a shared list of board milestones), a due date is a free date value, so the card-face badge opens a small popover with a Mantine `DatePickerInput` (single date, clearable) instead of a `Menu`.

**Card modal:** new "Due date" field placed next to the existing "Milestone" field, using the same `DatePickerInput`, clearable. Calls `updateCard.mutate({ cardId: card.id, dueDate: value })` on change (value `null` clears it), mirroring `handleMilestoneChange`.

**Board filtering/sorting by due date:** out of scope — not requested, no existing precedent for Milestone either.

## Edge cases

- Card has both a Milestone and a due date: both badges render independently on the card face; no conflict resolution needed since they're unrelated fields.
- Clearing: `dueDate: null` clears it, same convention as `milestoneId: null`.
- Overdue/today color thresholds: identical logic to Milestone's `getDueDateStatus`, compared against the card's own `dueDate` rather than the linked milestone's.
- AI tool: `update_kanban_card` with no fields (including no `dueDate`) still returns `ok:false` per its existing guard — extending the union of "did anything change" checks to include `dueDate !== undefined`.

## Tests

- `kanban.service.spec.ts`: `updateCard` passes `dueDate` through to the repo call.
- `ai-chat.controller.spec.ts`: `update_kanban_card` sets and clears `dueDate` (`'none'` → `null`).
