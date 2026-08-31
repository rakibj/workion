# Kanban: Icon-Only Badges, Custom Categories, AI Board Actions — Spec

> **Status: All three sub-specs implemented (2026-08-31).** Three related Kanban improvements, requested together, scoped as independent sub-specs per CLAUDE.md methodology so they could be approved and implemented one at a time. Spec 2 confirmed single-select-per-category. Implementation order: Spec 1 → Spec 2 → Spec 3. Spec 3 is verified only by unit tests so far — no live in-browser smoke test with a real OpenRouter key has been run yet.

## Goal

1. Reduce visual noise on the card face: priority/milestone (and any future field of the same kind) show as an icon only when unset, text appears only once a value is set.
2. Let a board define its own custom card fields ("categories") — page-level, icon + a set of selectable options — generalizing the existing hardcoded Priority/Milestone pattern to arbitrary user-defined fields.
3. Let the AI chat panel, when opened on a Kanban page, actually act on the board (create a card from text, set priority/milestone/category, move a card) instead of only reading it.

## Progress Tracker

| # | Spec | Depends on |
|---|---|---|
| 1 | Icon-only card badges | nothing |
| 2 | Custom Categories (page-level fields) | nothing (Spec 1's icon-only convention is applied to it directly, no rework) |
| 3 | AI chat Kanban actions | nothing for create/move/priority/milestone tools; the `set_kanban_card_category` tool needs Spec 2 |

---

## Spec 1 — Icon-only card badges

**Status: Done.** Verified in-browser: unset priority/milestone render as small icon-only buttons with no placeholder text; setting either switches to the existing colored pill with label text.

**Depends on:** nothing.

**What it does:** On the card face, `PriorityPicker` and `MilestonePicker` currently always render a full pill with placeholder text ("Priority" / "Milestone") even when nothing is set. Change both — and any category picker added in Spec 2 — to render icon-only when unset, and keep today's icon+colored-text pill once a value is set.

**Current state:**
- `PriorityPicker` (`apps/client/src/features/kanban/components/kanban-board-page.tsx:445-490`) always renders `<IconFlag/>` plus either `cfg.label` or the literal string `"Priority"` (`:464-465`), styled via `.priorityBadge` (`kanban-board-page.module.css:476-500`).
- `MilestonePicker` (`:357-434`) does the same with `<IconTarget/>`/`<IconAlertTriangle/>` plus either the milestone name or the literal `"Milestone"` (`:388-389`), styled via `.milestoneBadge` (`kanban-board-page.module.css:385-431`).
- Both already early-return `null` when `!canEdit && !cfg`/`!current` (`:449`, `:363`) — read-only viewers never see the placeholder; this change only affects editors, and only the *unset* rendering.

**Frontend changes (`kanban-board-page.tsx` + `.module.css`):**
- Add one shared CSS class, e.g. `.badgeIconOnly` (`kanban-board-page.module.css`, new rule near `.priorityBadge`): a small (~20px) subtle/dimmed circular icon button, hover state matching the existing `InlineAssigneePicker` "manage assignees" `ActionIcon` (`:536-544`) for visual consistency with the other icon-only affordance already on the card.
- `PriorityPicker` (`:458-466`): when `cfg` is falsy, render `<button className={classes.badgeIconOnly} title="Set priority"><IconFlag size={12} /></button>`; when `cfg` is set, keep the existing pill unchanged (icon + `cfg.label`, `.priorityBadge`/`.priority_${cfg.value}`).
- `MilestonePicker` (`:374-390`): same pattern — icon-only (`<IconTarget size={12}/>`, no due-date-status coloring since there's no due date yet) with `title="Set milestone"` when `current` is null; unchanged pill when set.
- No change to the `Menu.Dropdown` contents of either component — only the closed-state target button.
- Any category picker built in Spec 2 uses `.badgeIconOnly` for its unset state from the start, so this convention doesn't need retrofitting later.

**Edge cases:** a card with neither priority nor milestone set now shows two small icon buttons instead of two text pills — verify they don't visually collide with the assignee picker on narrow cards (`Group` at `:671-692`, `wrap="wrap"` already handles overflow). Hover/focus states must remain distinguishable from the assignee "+"" `ActionIcon` so all three don't look identical at a glance (different icons already provide this — `IconFlag` vs `IconTarget` vs `IconUser`).

**Tests:** none new (presentational only); frontend testing convention here is hooks/utilities, not component rendering (CLAUDE.md).

**Definition of done:** a fresh card with nothing set shows two small icons and no placeholder text; setting a priority or milestone immediately switches that badge to the existing colored text pill; clearing it reverts to icon-only.

**Out of scope:** changing the *set* state's visual style; the due-date overdue/today row below the badges (`:693-706`, unaffected).

---

## Spec 2 — Custom Categories (page-level fields)

**Status: Done.** Implemented and verified live in-browser: migration `20260831T000000-kanban-categories.ts` applied, `db.d.ts` regenerated, full repo/service/controller/DTO stack, 10 passing unit tests (`kanban.service.spec.ts`), and frontend `CategoryPicker`/`CategoryManagementModal` wired into the board and card modal. Two bugs found and fixed during verification (not covered by the unit tests above, since both are frontend-only): (1) the new-option input's `onChange` captured a synthetic event inside a functional `setState` updater closure (`setNewOptionLabel((prev) => ({..., [category.id]: e.currentTarget.value}))`) — React nulls pooled event fields before the updater runs, crashing the modal on the very first keystroke; fixed by reading `e.currentTarget.value` into a local variable before calling `setState`. (2) `useCreateCardMutation`'s optimistic cache write added `assignees: []` to the new card but not `categoryValues: []`, so `CategoryPicker` crashed the whole board with `Cannot read properties of undefined (reading 'find')` the moment a category existed and a new card was created; fixed by adding `categoryValues: []` alongside `assignees: []`, matching the existing pattern.

**Depends on:** nothing.

**Reading of the request:** "category with text type and icon" = a category has a plain-text **name** and a preset **icon** (not a "field type" enum) — the same shape as an icon+label already used for Priority/Milestone, just user-definable per board instead of hardcoded. "For each category we can set options" = a category owns a small list of selectable **options** (each with its own label and accent color, mirroring how Priority's four values each carry a fixed color today). "Set on card" = a card picks at most one option per category — one selectable slot per category, same interaction model as Milestone (pick one item from a page-level list, or clear it). Multiple categories can exist per board, so in aggregate a card can carry several category values at once (functionally close to "labels"), but each individual category is single-select. This assumption should be confirmed at spec approval; multi-select-per-category is flagged below as a possible follow-on, not built here.

**Current state:** Priority is a fixed 4-value enum baked into `PRIORITIES`/`KanbanPriority` (`kanban-board-page.tsx:106-115`, `kanban.dto.ts:76-78`, `kanban_cards.priority` column). Milestone is page-scoped and dynamic (`kanban_milestones` table, `KanbanRepo` milestone CRUD, `kanban_cards.milestone_id`) but single-purpose (name + due date only — no generic "pick a category" concept exists). There is no existing "label"/"tag" table on Kanban cards to repurpose.

**Data model (new migration, e.g. `apps/server/src/database/migrations/<ts>-kanban-categories.ts` — never edit the existing `20260531T120000-kanban.ts`/`...-kanban-milestones.ts` per CLAUDE.md):**

```
kanban_categories
  id            uuid PK (gen_uuid_v7())
  page_id       uuid  → pages.id, cascade delete
  name          varchar, not null
  icon          varchar, not null            -- one of CATEGORY_ICONS (server-validated enum)
  position      double precision, not null
  created_at / updated_at  timestamptz

kanban_category_options
  id            uuid PK
  category_id   uuid  → kanban_categories.id, cascade delete
  label         varchar, not null
  color         varchar, not null default 'gray'   -- reuse the existing KanbanColor enum (gray/blue/green/yellow/red/purple)
  position      double precision, not null
  created_at / updated_at  timestamptz

kanban_card_category_values
  card_id       uuid  → kanban_cards.id, cascade delete
  category_id   uuid  → kanban_categories.id, cascade delete
  option_id     uuid  → kanban_category_options.id, cascade delete
  PRIMARY KEY (card_id, category_id)   -- enforces single-select per category per card
```

Index `kanban_categories(page_id)` and `kanban_category_options(category_id)`, matching the existing index style on `kanban_milestones`/`kanban_columns`.

**Preset icon list:** a fixed, validated set of Tabler icon names in the same visual family as `IconFlag`/`IconTarget` (outline, 1.5–2px stroke). e.g. `IconTag, IconBookmark, IconStar, IconBolt, IconBug, IconClipboardList, IconUsers, IconCalendarEvent, IconAlarm, IconCircleCheck, IconCircleDot, IconHash, IconRocket, IconPalette, IconCode, IconShieldCheck`. Exported once as `CATEGORY_ICONS` (shared constant, server DTO `@IsIn(CATEGORY_ICONS)` + client icon-name→component lookup map) — final list confirmed at implementation time, not load-bearing for approval.

**Backend changes:**
- `entity.types.ts`: add `KanbanCategory`, `InsertableKanbanCategory`, `KanbanCategoryOption`, `InsertableKanbanCategoryOption`, `KanbanCardCategoryValue` (mirroring the existing `KanbanMilestone`/`InsertableKanbanMilestone` pattern).
- `database/repos/kanban/kanban.repo.ts`: add `getCategoriesByPageId` (categories + nested options, ordered by `position`), `createCategory`/`updateCategory`/`deleteCategory`, `createCategoryOption`/`updateCategoryOption`/`deleteCategoryOption`, `setCardCategoryValue(cardId, categoryId, optionId | null)` (upsert-or-delete on the composite PK). Extend `getBoardByPageId` (`:33-86`) to also select, per card, a `categoryValues` array via `jsonArrayFrom` joining `kanbanCardCategoryValues → kanbanCategoryOptions → kanbanCategories`, same technique already used for `assignees`/`milestone` (`:48-70`).
- `core/kanban/kanban.service.ts`: `getCategories(pageId)`, `createCategory`, `updateCategory`, `deleteCategory`, `createCategoryOption`, `updateCategoryOption`, `deleteCategoryOption`, `setCardCategoryValue` — same `assertKanbanPage`/`findXById`-or-404 shape already used for milestones (`:182-212`).
- `core/kanban/dto/kanban.dto.ts`: `ListCategoriesDto{pageId}`, `CreateCategoryDto{pageId, name, icon}`, `UpdateCategoryDto{categoryId, name?, icon?}`, `DeleteCategoryDto{categoryId}`, `CreateCategoryOptionDto{categoryId, label, color?}`, `UpdateCategoryOptionDto{optionId, label?, color?, position?}`, `DeleteCategoryOptionDto{optionId}`, `SetCardCategoryDto{cardId, categoryId, optionId: string | null}` — same `class-validator` shape as the milestone DTOs (`:111-143`).
- `core/kanban/kanban.controller.ts`: new endpoints under `kanban/categories/*` (`list`, `create`, `update`, `delete`) and `kanban/categories/options/*` (`create`, `update`, `delete`), plus `kanban/cards/category/set`. Same permission pattern as milestones: page-level writes go through `assertCanWrite` (Edit-Page ability), option/card-value writes resolve their parent page id first via a new `assertCanWriteByCategoryId` helper (mirrors `assertCanWriteByMilestoneId`, `:325-332`), card-value writes reuse the existing `assertCanWriteByCardId` (`:313-323`). Read endpoints use `assertCanRead` like `milestones/list` (`:236-244`).
- Regenerate `apps/server/src/database/types/db.d.ts` after the migration (generated file, per CLAUDE.md — do not hand-edit).

**Frontend changes:**
- `types/kanban.types.ts`: add `IKanbanCategory { id, pageId, name, icon, position }`, `IKanbanCategoryOption { id, categoryId, label, color: KanbanColor, position }`; extend `IKanbanCard` with `categoryValues: { categoryId: string; optionId: string }[]`.
- `queries/kanban-query.ts`: `useCategoriesQuery(pageId)` + create/update/delete mutations for categories and options (same shape as the existing milestone hooks, `:204-251`), plus `useSetCardCategoryMutation(pageId)` following `useUpdateCardMutation`'s optimistic-patch pattern (`:90-113`) — patch `categoryValues` on the matching card directly from the mutation response, no refetch needed for the sender.
- New `CategoryPicker` component in `kanban-board-page.tsx`, one instance per category rendered in the card's badge row (`:671-692`) alongside `PriorityPicker`/`MilestonePicker` — same `Menu` structure as `MilestonePicker` (`:371-433`: target button showing the category's icon + selected option's colored label, dropdown listing all options with a "Clear" item), using `.badgeIconOnly` (Spec 1) when unset.
- New `CategoryManagementModal` component, mirroring `MilestoneManagementModal` (`:180-347`): list categories, add/rename/delete a category, pick its icon from a preset grid (same swatch-grid UX already used for column color at `:1230-1245`, just icons instead of colors), and manage each category's options (label + color) inline.
- New "Categories" `Button` next to the existing "Milestones" button in the board header (`:1650-1658`), opening `CategoryManagementModal`; wire `categoryModalOpen` state alongside `milestoneModalOpen` (`:1419`).

**Edge cases:** deleting a category cascades to its options and every card's value for it (DB `ON DELETE CASCADE`) — board must refetch/patch affected cards the same way milestone deletion already does (`useDeleteMilestoneMutation` invalidates the board query, `:239-251`; mirror that for `useDeleteCategoryMutation`). Deleting an option must clear just that option's card values, not the whole category (`ON DELETE CASCADE` on `option_id` handles this automatically via the composite-PK row's cascade). No hard cap on categories/options in v1 — flag a soft UI warning past ~15 categories or ~30 options/category as a possible follow-on, not a blocker.

**Tests:** `kanban.service.spec.ts` (new cases) — create/update/delete category and option; `setCardCategoryValue` upserts an existing value and clears on `optionId: null`; deleting a category's page-mismatch throws `NotFoundException` consistent with existing milestone tests.

**Definition of done:** a board admin creates a category "Type" with icon `IconBug` and options "Bug"/"Feature" (each a different color); a card can have "Type: Bug" set via the card face or card modal; deleting the "Bug" option clears it from every card that had it without touching other cards' "Type" value; deleting the whole "Type" category removes its badge from every card.

**Out of scope:** multi-select per category; per-workspace category templates shared across boards; a category "type" system beyond single-select-from-a-list (e.g. no free-text or date category types).

---

## Spec 3 — AI chat Kanban actions

**Status: Done.** Implemented per this design: `KanbanRepo.getMinCardPosition` added; `AiStreamService.streamChat` takes an optional `tools` param and applies `stopWhen: stepCountIs(5)` when tools are given; `AiChatController` gained `KanbanService`/`SpaceAbilityFactory`/`WsService` deps, `resolveKanbanTools()` (contextPageId must be a kanban page the user can edit) and `buildKanbanTools()` (the four tools below, each verifying the target id belongs to the bound page before mutating, returning `{ok:false, error}` instead of throwing on a bad id, and broadcasting a page-scoped `invalidate` WS event on success); `formatKanbanAsText` now prints column/card/milestone/category/option ids plus Milestones/Categories catalog sections so the model has real ids to call tools with. `AiChatModule` now imports `CaslModule` and provides `KanbanService`. Frontend: `TOOL_LABELS` in `chat-tool-result.tsx` got the four new entries; no other frontend change was needed. Tests: `ai-stream.service.spec.ts` covers tools/stopWhen forwarding; `ai-chat.controller.spec.ts` covers tool registration (kanban+edit vs wrong type/read-only/no contextPageId) and tool-execution edge cases (bad id → `ok:false`, no-op update rejected, success path invalidates the board). Two unrelated pre-existing test bugs were fixed in passing since they were in files this spec had to touch anyway: `ai-chat.controller.spec.ts` was missing `PageRepo`/`KanbanRepo`/`AiChatRepo.updateChat` mocks (DI compile failure, dated from the Spec 1/2 work), and `ai-stream.service.spec.ts` asserted the pre-rebrand `X-Title: 'Docmost'` header. Not yet done: a live in-browser smoke test with a real OpenRouter key (verified only via unit tests here).

**Depends on:** the `create_kanban_card`/`move_kanban_card`/`update_kanban_card` tools depend on nothing new; `set_kanban_card_category` depends on Spec 2's schema existing.

**What it does:** When the AI chat side panel (`apps/client/src/ee/ai-chat/components/aside-chat-panel.tsx`) is opened on a Kanban page, the assistant can create a card from a text description, set a card's priority/milestone/category, and move a card between columns — not just read the board, which is all it does today.

**Current state — this is mostly wiring, not new infrastructure:**
- The AI chat backend already has full tool-calling plumbing built and unused: `AiChatController.send()` (`ai-chat.controller.ts:282-313`) already forwards `tool-call`/`tool-result` stream parts as SSE `tool_call`/`tool_result` events, and `AiChatService.addMessage` (`ai-chat.service.ts:77-91`)/`AiChatMessage` already persist a message's `toolCalls`. The frontend already renders them: `chat-tool-group.tsx` + `chat-tool-result.tsx` show a collapsible "Steps N" list per assistant message, keyed off a `TOOL_LABELS` map (`chat-tool-result.tsx:6-12`) that **already lists** `list_spaces`, `search_pages`, `get_page`, `create_page`, `update_page` — names for a broader workspace-tool system that was apparently planned but never implemented server-side.
- The reason none of this does anything today: `AiStreamService.streamChat()` (`ai-stream.service.ts:16-45`) calls `streamText({ model, messages, system })` with **no `tools` argument at all** — there is currently no code path in this repo that registers any tool. This spec is what actually populates `tools` for the first time; the workspace-tool names above are unrelated dead scaffolding and are **not** implemented here (out of scope).
- Kanban page context is already injected read-only: `buildSystemPrompt` (`ai-chat.controller.ts:359-396`) special-cases `page.type === 'kanban'` and renders the whole board as text via `formatKanbanAsText` (`:398-417`) when the page is the chat's `contextPageId` or a `@mention`. It currently includes titles/priority/milestone name/assignees/description but **no IDs**, so nothing today lets a tool call unambiguously target a specific card/column/milestone.
- Realtime gap that must be fixed as part of this spec: card/column **create/update/delete** never broadcast anything — only `moveCard`/`moveColumn` do (`kanban.controller.ts:106-123`, `169-192`, via `wsService.emitPageScopedEvent`). Frontend mutations mask this for human edits with local optimistic cache writes (`kanban-query.ts:74-113`), but a tool executing on the *server* has no such local write on the viewer's tab — without a broadcast, the board the user is looking at (next to the open chat panel) would not update after the AI acts on it.

**Design decisions:**
- **Tools target real IDs, not fuzzy names.** `formatKanbanAsText` must be extended to print each column's and card's id (and, if categories/milestones exist, their ids and option ids) inline in the context text the model already receives, e.g. `**To Do** (id: 0198f2...)` / `- [id: 0198f3...] Fix login bug [urgent] [milestone: Launch (id: 0198f1...)]`. Tool input schemas then take real UUIDs. This avoids building and debugging a title-matching/disambiguation layer — the model does that mapping itself from the context it already has, the same way a person would read column names off the board before clicking.
- **Tools are only registered when the chat's `contextPageId` (not a `@mention`) is a Kanban page the user can edit.** In `AiChatController.send()`, after resolving `dto.contextPageId`'s page, check `page.type === 'kanban'` and `spaceAbility.createForUser(user, page.spaceId).can(Edit, Page)` (same check `KanbanController.assertCanWrite` already does, `kanban.controller.ts:290-301`) before building the `tools` object. If either check fails, no Kanban tools are passed to `streamText` — the assistant can still read the board (existing behavior) but has nothing to call. Scoping to `contextPageId` only (not `mentionedPageIds`) avoids ambiguity about which of several mentioned boards a write should apply to; mentioning a second board to also act on it is explicitly out of scope for v1.
- **Multi-step tool calling.** `streamText` must be called with `stopWhen: stepCountIs(N)` (AI SDK v6, already the installed `ai@^6.0.134`) — e.g. `stepCountIs(5)` — so the model can call a tool, see its result, and either call another tool or produce its final reply within one user turn. `AiStreamService.streamChat` needs a new optional `tools` parameter threaded through to `streamText`.
- **No double permission-check inside `execute()`.** Unlike the REST endpoints (which must validate on every request because the id comes from an arbitrary client body), a tool's `pageId`/`spaceId` are closed over from the already-validated `contextPageId` at registration time — `execute()` only needs to validate that the specific `cardId`/`columnId`/etc. it's given actually belongs to that page (defense against the model hallucinating an id, not a permission bypass).
- **Tool failures are returned, not thrown.** `execute()` returns `{ ok: false, error: "…" }` for "card not found on this board" etc. so the model can read the failure and recover (ask the user, retry with a corrected id) rather than crashing the SSE stream — `AiChatController.send()`'s stream loop already treats a thrown error as fatal (`:308-311`), so tool code must catch and return instead of throw for expected failure modes.
- **Realtime fix, scoped narrowly.** After any tool successfully mutates the board, call `wsService.emitPageScopedEvent(spaceId, pageId, { operation: 'invalidate', entity: ['kanban-board'], id: pageId })` — the same `'invalidate'` event `use-query-subscription.ts:34-38` already knows how to handle generically, and (unlike the client-originated `handleTreeEvent` path) `emitPageScopedEvent` (`ws.service.ts:74-95`) does **not** exclude the sender's own socket, which is exactly what's needed here since the acting user has no local optimistic update to fall back on. This fix is scoped to the AI-tool path only; the pre-existing gap for manual REST create/update/delete (a second human collaborator's browser not live-updating on create/update) is a separate, pre-existing limitation and out of scope here.

**Tool set (v1):**

| Tool | Args | Behavior |
|---|---|---|
| `create_kanban_card` | `columnId, title, description?, priority?, milestoneId?` | `kanbanService.createCard` then `updateCard` for the optional fields if given |
| `move_kanban_card` | `cardId, columnId, position?: "top" \| "bottom"` (default `"bottom"`) | resolves a numeric position from existing cards in the target column (reuse `getMaxCardPosition`/a symmetrical "min position" helper), then `kanbanService.moveCard` |
| `update_kanban_card` | `cardId, title?, description?, priority?: KanbanPriority \| "none", milestoneId?: string \| "none"` | thin wrapper over the existing `kanbanService.updateCard`, mapping `"none"` → `null` (Zod enums can't express "uuid or null" directly) |
| `set_kanban_card_category` | `cardId, categoryId, optionId: string \| "none"` | `kanbanService.setCardCategoryValue` (Spec 2) |

All four defined with the AI SDK `tool()` helper (`inputSchema` via `zod`, already a dependency) in a new `buildKanbanTools(pageId, spaceId)` private method on `AiChatController`, requiring new constructor deps `KanbanService`, `SpaceAbilityFactory`, `WsService` (the last two mirror exactly what `KanbanController` already injects for the same checks).

**Frontend changes:**
- `chat-tool-result.tsx`: add the four new tool names to `TOOL_LABELS` (`:6-12`), e.g. `create_kanban_card: "Created card"`, `move_kanban_card: "Moved card"`, `update_kanban_card: "Updated card"`, `set_kanban_card_category: "Set category"`. No other frontend change needed — the collapsible tool-step UI, SSE handling, and message persistence are all already generic.
- No change needed to `aside-chat-panel.tsx`'s context-page selection — it already sends `contextPageId` for the page the panel was opened on.

**Edge cases:** model calls a tool with a `cardId`/`columnId` that doesn't belong to this board (hallucinated or stale from an earlier turn after a card was deleted) → `execute()` returns `{ ok:false, error: "..." }`, verified by checking the row's parent page id matches the bound `pageId`, not just that the row exists. `move_kanban_card` to the column the card is already in → treated as a normal reorder (no special-case). `update_kanban_card`/`set_kanban_card_category` called with no recognized fields → return `{ ok:false, error: "no changes given" }` rather than a no-op success, so the model doesn't report success incorrectly. A workspace with no OpenRouter key configured → unaffected, `streamChat` already throws `ServiceUnavailableException` before tools would ever run (`ai-stream.service.ts:21-26`).

**Tests:** `ai-chat.controller.spec.ts` (new cases, mocked `KanbanService`/`SpaceAbilityFactory`) — tools are present in the `streamText` call only when `contextPageId` is a kanban page and the user has Edit ability; absent otherwise (wrong page type, read-only ability, or `contextPageId` unset). Kanban-side logic (`create_kanban_card` etc.) reuses `kanban.service.spec.ts`'s already-mocked-repo pattern for the underlying `KanbanService` calls; the tool wrappers themselves need only a thin test that a bad id returns `{ ok:false }` instead of throwing.

**Definition of done:** with the chat panel open on a Kanban board, asking "add a card called 'Fix login bug' to To Do" creates it and the board (open in the same view) updates without a manual refresh; asking to "move it to In Progress" moves it; asking to "mark it urgent" sets its priority badge; each action shows as a collapsed, human-labeled step in the chat transcript.

**Out of scope:** the dead `list_spaces`/`search_pages`/`get_page`/`create_page`/`update_page` tool names already sitting in `TOOL_LABELS` — unrelated, unimplemented, not touched by this spec; acting on a `@mention`ed board that isn't the chat's `contextPageId`; column create/delete/rename via AI; assignee changes via AI; a `list_kanban_board` refresh tool (the per-`send()` rebuilt system prompt already gives the next user message a fresh snapshot, so this isn't needed for v1).
