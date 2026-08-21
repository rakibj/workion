# Kanban Improvements — Spec

> **Status: Proposed, not approved.** Per CLAUDE.md's methodology, nothing here should be implemented until each spec below is individually approved. Implement one spec at a time, not the whole batch — they're grouped in one document only because they touch the same module.

## Goal

Five independent fixes/improvements to the full Kanban board (`apps/client/src/features/kanban/`, `apps/server/src/core/kanban/`), requested together but scoped as separate specs so they can be approved and shipped incrementally.

## Progress Tracker

| # | Spec | Status | Depends on |
|---|---|---|---|
| 1 | GIF image support with a 5MB cap | Proposed | nothing |
| 2 | Live card/column move sync cleanup | Proposed | nothing |
| 3 | Live cursor presence on the board | Proposed | should land after Spec 2 (same WS surface) |
| 4 | Card detail autosave | Proposed | nothing |
| 5 | Card modal scrollbar fix | Proposed | nothing |

---

## Spec 1 — GIF image support with a 5MB cap

**Depends on:** nothing.

**What it does:** Treats GIF as a first-class inline image type (matching PNG/JPEG) across the shared image-upload path used by both the page editor and the Kanban card description editor, with a dedicated, tighter 5MB size cap instead of the general upload limit.

**Current state (why this needs a real fix, not just a limit bump):** GIFs already pass the client's generic `image/*` MIME check in `validateFn` (`apps/client/src/features/editor/components/image/upload-image-action.tsx:20-34`), and the server's generic `POST /files/upload` (`attachment.controller.ts:81-164` → `AttachmentService.uploadFile()`, `attachment.service.ts:44-141`) has no extension allow-list at all — only the blanket `FILE_UPLOAD_SIZE_LIMIT` (default 50MB, `environment.service.ts:86-87`) applies via Fastify's `multipart.limits.fileSize` (`attachment.controller.ts:91-96`). So a GIF can technically be uploaded today. But `.gif` is missing from `inlineFileExtensions` (`attachment.constants.ts:12-24`), which `sendFileResponse()` (`attachment.controller.ts:468-488`) uses to decide `Content-Disposition`: any extension not on that list is served as `attachment; filename=...` (lines 483-487) instead of inline. That's the likely bug behind "doesn't work like other images" — a GIF is served with a forced-download header instead of inline like PNG/JPEG.

**Backend changes:**
- `attachment.constants.ts:9` — add `.gif` to `validImageExtensions`.
- `attachment.constants.ts:12-24` — add `.gif` to `inlineFileExtensions`, so `sendFileResponse()` stops forcing a download for GIFs.
- `attachment.constants.ts` — new constant `MAX_GIF_SIZE_BYTES = 5 * 1024 * 1024`.
- `attachment.service.ts:44-141` (`uploadFile`) — after `prepareFile()` resolves `fileExtension`/`mimeType`, add a targeted check: if extension is `.gif` (or mimetype `image/gif`) and `file.size > MAX_GIF_SIZE_BYTES`, throw `BadRequestException` before calling `uploadToDrive()`. Independent of, and tighter than, the general `FILE_UPLOAD_SIZE_LIMIT` already enforced upstream.

**Frontend changes:**
- `upload-image-action.tsx:20-34` (`validateFn`) — add a GIF-specific branch checked before the general `getFileUploadSizeLimit()` comparison: if `file.type === "image/gif"` and `file.size > 5 * 1024 * 1024`, notify (e.g. "GIFs must be under 5MB") and return `false`. All other image types keep using the existing general-size check.
- No changes needed in `packages/editor-ext/src/lib/image/image-upload.ts` (`handleImageUpload`, lines 28-153) or `card-description-editor.tsx` — both already delegate to `uploadImageAction`, so the fix applies uniformly to the page editor and the Kanban card description editor without extra wiring. This confirms the change is correctly scoped as a shared upload-path fix, not a Kanban-only change.

**Edge cases:** exactly-5MB file → allow (`>`, not `>=`); animated vs static GIF — no distinction; a non-GIF file with a spoofed `image/gif` MIME — the server-side cap keys off `prepareFile()`'s extension detection (the same mechanism already used elsewhere in this service), not raw client-supplied MIME.

**Tests:** `attachment.service.spec.ts` — GIF under 5MB uploads; GIF over 5MB throws `BadRequestException`; non-GIF image over 5MB but under the general limit still succeeds (proves the cap is GIF-specific).

**Definition of done:** a 4MB GIF dropped into a Kanban card description uploads, renders inline, animates, and is served without a forced-download header; a 6MB GIF is rejected client-side with a toast before any network request; bypassing the client still gets rejected server-side.

**Out of scope:** GIF transcoding/compression/thumbnailing on upload.

---

## Spec 2 — Live card/column move sync cleanup

**Depends on:** nothing.

**What it does:** Removes a redundant realtime broadcast that's the likely actual cause of "card moving doesn't feel live" — today every drag-drop fires two separate WS events for the same action, and the second undoes the benefit of the first.

**Current state:**
- `kanban.controller.ts` already emits fine-grained, self-filtered events: `moveColumn` (`:106-123`) emits `operation: 'kanbanColumnMoved'`, `moveCard` (`:169-192`) emits `operation: 'kanbanCardMoved'`, both via `wsService.emitPageScopedEvent` → broadcast to the `space-${spaceId}` room (`ws.utils.ts:4-10` — despite CLAUDE.md's description, this is a **space-scoped** room today, not `page-${pageId}`).
- `use-query-subscription.ts` consumes these and applies an **incremental patch** directly to `["kanban-board", pageId]` cache (`kanbanCardMoved` handler ~lines 177-192, `kanbanColumnMoved` ~193-215), skipping the event when `data.userId === currentUser.user.id` (the sender already applied its own optimistic update).
- But `KanbanBoardPage`'s drop handlers, `handleCardDrop` (`kanban-board-page.tsx:1372-1455`) and `handleColumnDrop` (`:1457-1499`), **also** call `emit({operation: "invalidate", entity: ["kanban-board"], id: pageId})` after the mutation succeeds (`:1441-1454`, `:1485-1497`). `"invalidate"` is one of the `TREE_EVENTS` the WS gateway's generic `handleMessage` relays (`ws.gateway.ts:69-74`, `ws.utils.ts:12-19`), so this second event **is live** — it reaches `WsService.handleTreeEvent` (`ws.service.ts:27-58`), broadcasts to the same space room, and other clients' `use-query-subscription.ts` handles `"invalidate"` by fully invalidating/refetching `["kanban-board", pageId]` — with **no self-filter**.
- Net effect: on every drag by any user, every other viewer gets a correct incremental patch immediately followed by a full server refetch that replaces it — doubling network cost and very likely causing the choppy/non-instant feel, since the board re-renders twice per move and the second render waits on a round trip instead of applying instantly.

**Fix:** remove the `emit({operation: "invalidate", ...})` calls in `handleCardDrop` (`:1441-1454`) and `handleColumnDrop` (`:1485-1497`) — the existing `kanbanCardMoved`/`kanbanColumnMoved` events (plus each mutation's own `onSuccess` reconciliation for the sender) are already sufficient and strictly better (incremental, self-filtered). No backend change needed.

**Edge cases:** confirm nothing else relies on the `"invalidate"`/`kanban-board` broadcast (grep shows only these two call sites); confirm `localColumns` reset logic (`kanban-board-page.tsx:1368-1370`) still re-syncs correctly once query data is only ever updated via incremental patches, not a refetch.

**Tests:** none new — manual two-browser verification is enough.

**Definition of done:** two browser sessions on the same board; dragging a card in one updates the other within one broadcast round-trip, with no visible re-render flicker or extra board-fetch request in the second session's dev tools.

**Out of scope:** page-scoped WS rooms (see Spec 3's note on room granularity), cursor presence (Spec 3).

---

## Spec 3 — Live cursor presence on the board

**Depends on:** nothing functionally, but should land after Spec 2 (same WS surface, avoids conflicting edits).

**What it does:** Shows other active viewers' live cursor position on the Kanban board — the other half of "live updates on cursor and card moving."

**Why this needs new infra:** the board is not a Yjs/Hocuspocus document — only the card description editor inside the card modal uses TipTap/CRDT collaboration. The board's `type: 'kanban'` page (`kanban.service.ts` `assertKanbanPage`) has no Yjs doc for cursors to attach to. Cursor presence on the *editor* today comes entirely from TipTap's `CollaborationCaret` extension riding on Yjs awareness (`extensions.ts:459-471`, `page-editor.tsx:140-215`) — not reusable for the board itself; this needs a lightweight, ephemeral broadcast over the existing Socket.IO channel instead.

**Design decisions (flagging for approval, not just implementation detail):**
- **Reuse the existing generic broadcast path** rather than build new WS infra: add a new operation, e.g. `'kanbanCursorMoved'`, to `TREE_EVENTS` in `ws.utils.ts:12-19` (despite the name, this set is really "operations `handleMessage` will relay" — `'invalidate'` already proves non-tree operations ride this path). This gets permission-aware broadcasting (`WsService.handleTreeEvent`, restricted-page filtering) for free, at the cost of a per-event `spaceHasRestrictions` check — already cached (`WS_CACHE_TTL_MS`), so acceptable at a throttled cursor rate.
- **Room scope**: piggyback on the existing space-wide room (same as card/column moves) rather than implementing the currently-commented-out `join-room`/`leave-room` per-page rooms (`ws.gateway.ts:76-87`). Simpler, consistent with how moves already work; cursor payloads carry `pageId` for client-side filtering. Flag per-page rooms as a follow-on if a space with many concurrent boards makes this noisy.
- **Not stored in React Query cache** — cursor state is ephemeral/high-frequency and shouldn't live in `["kanban-board", pageId]` (would cause spurious re-renders of unrelated card data and get wiped by the next real board refetch). Use a separate local mechanism (component state Map keyed by `userId`, or a dedicated Jotai atom).
- **Client-side throttling** — throttle emission to ~120-150ms per user, consistent with the existing `useDebouncedCallback` pattern already used in this file (`kanban-board-page.tsx:1360`).
- **Staleness cleanup** — a cursor with no update in ~5s (tab blur, navigation, disconnect) must be removed client-side via a per-`userId` timeout, since socket disconnect isn't itself broadcast to peers today.

**Backend:**
- `ws.utils.ts:12-19` — add `'kanbanCursorMoved'` to `TREE_EVENTS`.
- No new REST endpoint — purely a client-to-client relay via `socket.emit("message", ...)` → `handleMessage` → `handleTreeEvent` (`ws.gateway.ts:69-74`, `ws.service.ts:27-58`). Verify `extractPageId` (`ws.service.ts`) recognizes the new payload shape (`{ operation: 'kanbanCursorMoved', pageId, spaceId, userId, x, y, name, color }`) so restricted-page filtering works correctly for it.

**Frontend:**
- `use-query-emit.ts` — existing generic `emit()` already supports arbitrary payloads; call it from a new throttled `pointermove` listener scoped to the board container in `kanban-board-page.tsx`.
- `use-query-subscription.ts` — add `case "kanbanCursorMoved"` alongside `kanbanCardMoved`/`kanbanColumnMoved` (~lines 177-215), same self-filter-by-`userId` pattern, writing to the new ephemeral cursor store instead of `queryClient.setQueryData`.
- New small presentational layer (in `kanban-board-page.tsx` or a new `kanban-cursors.tsx`) rendering absolutely-positioned colored cursor+name labels, keyed by `userId`. Coordinates should be relative to the board's scrollable container (not raw viewport `clientX/clientY`) so cursors stay aligned regardless of scroll position — needs a `getBoundingClientRect()` offset at emit time or normalized (0-1) coordinates.
- Color: reuse `randomElement(userColors)` (already used for editor `CollaborationCaret`, `extensions.ts:459-471`) so a user's board cursor color matches their editor caret color.

**Edge cases:** a user who only scrolls without moving the mouse never shows a cursor — acceptable for v1; a second tab of the same account correctly shows no self-cursor (filtered by `userId`); no hard cap on concurrent viewers in v1 — flag as a later concern if noisy.

**Tests:** none practical to unit test (DOM pointer + WS timing); manual two-browser verification.

**Definition of done:** two browser sessions on the same board see each other's cursor move in near-real-time (sub-second), cursors disappear within ~5s of the other tab going idle/closing, and the sender never sees their own cursor.

**Out of scope:** cursor presence inside the card modal's description editor (existing Hocuspocus/Yjs mechanism, separate — verify independently if needed); per-page WS rooms.

---

## Spec 4 — Card detail autosave

**Depends on:** nothing.

**What it does:** Card title and description save automatically as the user edits, matching priority/milestone/assignee fields on the same modal, which already autosave.

**Current state** (`CardModal`, `kanban-board-page.tsx:719-1004`):

| Field | Today |
|---|---|
| Title | local state only; committed on manual Save click |
| Description | local state only; committed on manual Save click |
| Priority | **already autosaves** — `handlePriorityChange` (`:755-757`) fires `updateCard.mutate({ cardId, priority })` immediately |
| Milestone | **already autosaves** — `handleMilestoneChange` (`:759-761`) |
| Assignees | **already autosaves** — add/remove fire mutations immediately (`:926-931`, `:961-965`) |

Only title+description are batched behind the Save button (`handleSave`, `:744-748`), which also calls `onClose()` — so today there's no way to save title/description without closing the modal.

**Backend:** no changes — `useUpdateCardMutation` (`kanban-query.ts:90-113`) and its `UpdateCardDto` already accept partial `{ title?, description? }` patches, exactly like the existing priority/milestone autosave calls.

**Frontend (`kanban-board-page.tsx`):**
- Title (`TextInput` at `:786`): replace plain `onChange={setTitle}` with the same debounce pattern already used for the board's own title elsewhere in this file (`useDebouncedCallback`, referenced at `:1360`, with an `onBlur` flush like `:1533`) — debounced call fires `updateCard.mutate({ cardId: card.id, title })` directly. Guard against saving an empty/whitespace title (reuse the existing `if (!title.trim()) return;` check from `handleSave`, `:745`) — on blur, if empty, revert to the last saved title rather than persisting blank.
- Description (`CardDescriptionEditor`'s `onChange={setDesc}` at `:814`): already fires on every Tiptap update; add a debounced `updateCard.mutate({ cardId: card.id, description })` call there (or a `useEffect` watching `desc`), same debounce window as title.
- Remove the Save/Cancel button pair (`:980-995`) and `handleSave` (`:744-748`); replace with a single "Close" (or rely on the modal's existing close affordances — `X`, backdrop, Esc) since nothing is buffered anymore.
- The `useEffect` resetting `title`/`desc` local state when `card?.id` changes (`:733-740`) stays — still needed to re-seed state when the modal is reused for a different card — but must flush any in-flight debounced save for the *previous* card (not drop it) before/during that reset, using the debounce's `.flush()`, mirroring how `:1533`'s blur-flush already handles this for the board title.
- Add a small inline save-status indicator ("Saving…" / "Saved") near the title using `updateCard.isPending`/`isSuccess` (already available, currently only feeding the Save button's `loading` prop) so removing the explicit Save button doesn't leave users unsure whether an edit persisted.

**Edge cases:** rapid typing then immediately closing the modal → flush the pending debounced save before unmount; clearing the title and blurring → revert to last saved value, don't persist empty; switching cards quickly (click card A, then card B before A's save fires) → flush A's pending save with A's `card.id`, not B's — the debounce callback must close over the correct id at call time.

**Tests:** none new on the backend; frontend autosave wiring is primarily manually verified per CLAUDE.md's frontend testing guidance (hooks/utilities, not component behavior).

**Definition of done:** edit a card's title or description, wait ~1s without clicking anything, close the modal — the change persisted; clearing the title and blurring reverts instead of saving blank; switching between two cards' modals in quick succession doesn't lose an edit made to the first.

**Out of scope:** undo/redo for autosaved edits; conflict resolution for simultaneous edits by two users (last-write-wins, same as today's manual Save already implicitly is).

---

## Spec 5 — Card modal scrollbar fix

**Depends on:** nothing.

**What it does:** Makes the Kanban card detail modal's content area show a visible scrollbar when content overflows, so long descriptions aren't silently cut off.

**Root cause:** not a missing `overflow-y: auto` — the `ScrollArea` wrapping the modal content (`kanban-board-page.tsx:782`) already correctly clips and scrolls; the surrounding `Modal` styles (`:770-782`) correctly cap height (`maxHeight: calc(100vh - 80px)`) and set `body: { overflow: "hidden" }`. The actual cause is Mantine `ScrollArea`'s default `type="hover"` — the custom scrollbar thumb only renders while the pointer is over the scroll region, which reads as "no scrollbar" with no hint that hovering reveals one.

**Fix:** set `type="auto"` (visible whenever there's overflow, not gated on hover — closest to normal browser scrollbar behavior, no permanent visual space reserved when a description is short) on the `ScrollArea` at `kanban-board-page.tsx:782`. `type="always"` is the alternative if permanent visibility is preferred.

**Edge cases:** none — single-prop change, no data/behavior implications.

**Tests:** none (visual-only).

**Definition of done:** a card with a long description (enough to overflow the height cap) shows a visible scrollbar without needing to hover first, and scrolls correctly.

**Out of scope:** a general modal/ScrollArea audit elsewhere in the app (flag as a possible follow-on if the same hover-only default causes similar reports elsewhere).
