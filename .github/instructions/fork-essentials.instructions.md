---
applyTo: '**'
---

# ComfyUI Frontend — Fork-Specific Essentials

Read `AGENTS.md` for full conventions. This file contains fork-specific architecture, invariants,
and gotchas that must survive context compaction.

## Architecture Narrative

Read this first — it introduces the vocabulary you need.

**Multiple workflow tabs, one graph.** All tabs share a single `LGraph` + `LGraphCanvas` instance.
Switching tabs serializes the current graph, calls `configure()` to load the new one, and restores
the canvas viewport. Every open workflow has its own `ChangeTracker` (`src/scripts/changeTracker.ts`)
holding `initialState`, `activeState`, `undoQueue`, and `redoQueue`.

**The dirty dot.** The white dot on a tab means `workflow.isModified === true`. Set by
`ChangeTracker.checkState()`, which serializes `app.rootGraph` and compares it to `activeState`
via `graphEqual()` (sub-pixel tolerance, rendering noise stripped). If they differ, the new state
is pushed to `undoQueue` and `isModified` becomes `true`.

**Load races.** Deferred callbacks (microtasks, debounced persist, RAF) can fire while a different
workflow is already loaded. The fork guards this via `src/platform/changeTracking/`: a monotonic
**load epoch** (`isStale()`) and a per-graph **ownership model** (`isOwner()`). `commitOwnership()`
is called synchronously after `configure()` to close the async window.

**Layout sync.** The DOM measures node sizes after render and writes them back to LiteGraph via
`flushPendingChanges()` in `useLayoutSync.ts`. During this flush, `liteNode.onResize()` can trigger
`graphChanged` → `checkState()` synchronously mid-loop — corrupting `activeState` before the
re-baseline guard runs. Fix: wrap the flush loop in `tracker.changeCount++/--` to suppress
`checkState()` for its duration.

## Critical Gotchas

- **Shared LGraph**: All workflow tabs share ONE `LGraph` + `LGraphCanvas`. Isolation guards live
  in `src/platform/changeTracking/` — `isOwner()`, `isStale()`, `isLoading()`. Do not bypass them.
- **`reset()` does NOT sync `isModified`**: `reset()` never calls `updateModified()`. Always set
  `workflow.isModified = false` explicitly after calling `reset()`. Use `graphEqual(initialState,
activeState)` to check the clean baseline — never `workflow.isModified` after `reset()`.
- **Layout sync — suppress `checkState` during flush**: Wrap the flush loop in
  `tracker.changeCount++/--`. Serialize from `app.rootGraph` (not `canvas.graph`). Guard re-baseline
  with `graphEqual(initialState, currentState)` where `currentState` is freshly serialized after the
  loop. Never call `addNodeTitleHeight` inside `flushPendingChanges`. Write directly to
  `liteNode.size[0/1]` / `pos[0/1]` to avoid layoutStore feedback loops.
- **`commitOwnership()` must be synchronous**: No `await` between `configure()` and
  `commitOwnership()`. The ownership window must be zero.
- **Entity architecture**: Don't add methods to `LGraphNode`/`LGraph`/`LGraphCanvas` — extract to
  systems/stores/composables.

## Subsystem Reference (read before touching these areas)

| Area                                                    | Read First                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Undo/redo, dirty-state tracking                         | `docs/architecture/change-tracker.md`                                                       |
| Tab-switch, V1/V2 draft stores, workflow load lifecycle | `docs/architecture/workflow-persistence.md`                                                 |
| Entity/ECS model, component/system split                | `docs/architecture/ecs-target-architecture.md` + `docs/architecture/entity-interactions.md` |
| Layout sync, DOM→LiteGraph, re-baselining               | `docs/adr/0003-crdt-based-layout-system.md` + `docs/architecture/proto-ecs-stores.md`       |
| Subgraph boundaries, promoted widgets                   | `docs/architecture/subgraph-boundaries-and-promotion.md`                                    |
| LiteGraph internals (LGraph, LGraphCanvas, LGraphNode)  | `src/lib/litegraph/AGENTS.md`                                                               |
| Fork-specific bugs, invariants, lessons learned         | `qmd search "<topic>" -c copilot`                                                           |

## `src/platform/changeTracking/` — Ownership Module

| File                 | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `loadEpoch.ts`       | Monotonic epoch + `isOwner()` / `isStale()` / `isLoading()`           |
| `changeOrigin.ts`    | `ChangeOrigin` union + side-effect routing helpers                    |
| `canonicalize.ts`    | `graphEqual()` + `normalizeNode()` — compare-only normalization       |
| `commitOwnership.ts` | Synchronous baseline handoff after `configure()`                      |
| `debug.ts`           | All `console.warn` instrumentation; runtime toggle via `localStorage` |

**Debug toggle** (all build modes): `window.__comfyStateDebug(true/false)` — persists via
`localStorage['comfyui:stateDebug']`.

## Workflow Load Lifecycle Gotchas

- **`afterLoadNewGraph` must capture post-`computeSize` state**: `loadGraphData` calls
  `computeSize()` after `configure()`, mutating sizes in-place. `commitOwnership()` serializes
  `app.rootGraph` post-`computeSize` — never from raw `workflowData`.
- **Skip draft saves during undo/redo**: `beforeLoadNewGraph()` is guarded by
  `!activeWorkflow.changeTracker._restoringState`. Do not remove this guard — it prevents
  pre-undo state from being saved as the draft, making undone changes reappear on reload.
- **`normalizedMainGraph` gate**: `syncLayoutStoreNodeBoundsFromGraph()` only runs on first load
  of an un-corrected workflow. The microtask it dispatches fires while `activeWorkflow` is still
  the OLD workflow. Do not remove this gate without resolving the race.
- **`comfyWorkflow.load()` sets `_isModified` directly** (bypassing `updateModified()`). Visible
  in logs via `__comfyStateDebug(true)` → `[DEBUG draftComparison]`.
