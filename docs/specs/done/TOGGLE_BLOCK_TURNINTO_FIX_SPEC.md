# Fix "Turn Into" Inside Toggle Blocks / Toggle Headings — Spec

> **Status: Proposed, not approved.** Per CLAUDE.md's methodology, get approval before implementing.

## Goal

Fix a bug where the block-handle context menu's "Turn into" option is unreachable for blocks nested inside a toggle block's or toggle heading's content — most visibly, the default first paragraph created when a fresh toggle is opened.

## Depends on

Nothing.

## Root cause

Not a schema issue — verified by direct repro against the real node schemas using `prosemirror-model`/`prosemirror-commands`/`prosemirror-schema-list`: `setBlockType`/`wrapInList` (which `toggleNode`/`toggleHeading`/`toggleBulletList`/etc. are built on) work correctly at any nesting depth given a correct selection. `ToggleHeadingContent`'s and `DetailsContent`'s `content: "block*"`, `group: "block"` schemas (`packages/editor-ext/src/lib/toggle-heading/toggle-heading-content.ts:13-18`, `packages/editor-ext/src/lib/details/details-content.ts:13-18`) impose no restriction.

The actual break is earlier, in **block-handle hit-testing**, which decides which block the drag handle — and therefore "Turn into", which only opens via the handle's `blockHandleClick` event — targets.

`nodeDOMAtCoords` (`apps/client/src/features/editor/extensions/drag-handle.ts:58-111`) only recognizes a hovered element if it's a direct child of `.ProseMirror` (`elem.parentElement?.matches(".ProseMirror")`) or matches a hardcoded selector list plus any node types registered in `customNodes`/`customSelectors` (`:71-98`). A paragraph inside `div[data-type="toggleHeadingContent"]` or `div[data-type="detailsContent"]` (the actual node-view DOM structure — confirmed at `toggle-heading.ts:68-119` / `details.ts:64-128`) fails both checks: its parent isn't `.ProseMirror`, and — being the sole/first child seeded by `setToggleHeading`/`setDetails` — it doesn't match the `"p:not(:first-child)"` selector either.

`GlobalDragHandle.configure({ customNodes: [...] })` (`apps/client/src/features/editor/extensions/extensions.ts:244-246`) currently only lists `["transclusionSource", "transclusionReference"]` — `toggleHeading`, `toggleHeadingContent`, `details`, `detailsContent` are never registered, so no fallback matches either.

Result: `nodeDOMAtCoords` returns `undefined`, the drag handle never renders over that block (`mousemove` handler bails at `drag-handle.ts:388-416`), `onDragHandleClick` never fires, `blockHandleClick` is never dispatched, and `BlockContextMenu` (the only consumer of that event, wired in `page-editor.tsx:391-476`) never opens for it — "Turn into" is unreachable, not broken once open. The turn-into commands themselves (`block-menu.tsx:145-231`, `node-selector.tsx:72-176` — both plain `editor.chain().focus().toggleNode(...)`/`.setDetails(...)` etc. operating on `editor.state.selection`) need no changes.

**Why it reads as "under toggle blocks specifically":** `setToggleHeading` (`toggle-heading.ts:150-171`) and `setDetails` (`details.ts:163-172`) both seed a fresh toggle with exactly one default paragraph — so the very first block a user tries to turn into something else inside a new toggle is always the one case this hit-testing gap drops. A second/later paragraph added afterward would actually get a handle and work fine (confirmed by the repro), but that's not the common path users hit.

## Fix

- `apps/client/src/features/editor/extensions/extensions.ts:244-246` — add `"toggleHeading"`, `"toggleHeadingContent"`, `"details"`, `"detailsContent"` to `GlobalDragHandle`'s `customNodes`, the same mechanism already used for `transclusionSource`/`transclusionReference`. This activates the `customSelectors`/`customParagraphSelectors` fallback (`drag-handle.ts:71-98`) so both the wrapper nodes and paragraphs inside their content areas become valid hit-test targets.
- Verify during implementation: these node views use plain DOM (`addNodeView`, no React), not the `.react-renderer` wrapper pattern used elsewhere. Check `isCustomNodeDOM` (`drag-handle.ts:125-139`) and the `.react-renderer` walk inside `mousemove` (`:440-459`) correctly resolve `currentNodePos`/`currentNodeType` for this plain-DOM case once the node types are registered; adjust the handle's vertical positioning logic if it assumed a React-rendered wrapper shape.

## Edge cases

- Turning the toggle-heading's *title* block itself into something else (as opposed to a body block) — the title (`ToggleHeadingTitle`) is a separate node type with its own constraints (`content: "inline*"`, `toggle-heading-title.ts:8-14`). Confirm the fix doesn't accidentally make the title draggable/convertible in a way that breaks the toggle's structure — it should likely stay excluded, with only content-area children gaining handles.
- Nested toggles (a toggle inside a toggle's content) — confirm hit-testing resolves to the innermost correct block, not the outer toggle wrapper.

## Tests

DOM hit-testing tied to `elementsFromPoint`/mouse coordinates is not practically unit-testable under the existing Jest/Vitest conventions (no real layout in jsdom). Manual verification is primary; a browser-level test is out of scope since this repo has no such infrastructure today.

## Definition of done

Open a fresh Toggle Heading (or toggle block), hover the default first paragraph inside it — a drag handle appears. Clicking it and choosing "Turn into → Heading 2" (or any other block type) converts that specific paragraph in place, matching behavior for a top-level paragraph.

## Out of scope

Any change to the turn-into commands themselves, the node schemas, or a general audit of every other custom node's `customNodes` registration (only the two toggle-family node types reported as broken are in scope).
