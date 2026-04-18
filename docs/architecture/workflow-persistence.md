# Workflow Persistence Architecture

This document covers the workflow draft/persistence system — the two separate
draft stores, the tab-switch lifecycle, and known footguns.

## Two Independent Draft Stores

### V1 — `workflowDraftStore`

- **Location:** `src/platform/workflow/persistence/stores/workflowDraftStore.ts`
- **Storage:** Single `localStorage` blob at key `'Comfy.Workflow.Drafts'`, path-keyed
- **Who reads:** `comfyWorkflow.ts` `load()` (line ~100) — restores draft on first tab open
- **Who writes:** `workflowService.ts` `beforeLoadNewGraph()` — saves draft on tab switch

### V2 — `workflowDraftStoreV2`

- **Location:** `src/platform/workflow/persistence/stores/workflowDraftStoreV2.ts`
- **Storage:** Per-path keys (via `hashPath`), workspace-scoped
- **Who reads/writes:** `useWorkflowPersistenceV2.ts` — 512ms debounced on `graphChanged`
  events, plus immediate flush on `activeWorkflow.key` change

**Critical:** V1 and V2 are completely independent. V1 drafts are not read by
V2 persistence and vice versa. `comfyWorkflow.ts` only reads V1.

## Tab-Switch Lifecycle (Full Sequence)

When the user clicks a different workflow tab:

```
workflowService.openWorkflow(newWorkflow)
  └─ app.loadGraphData(newWorkflow.activeState, clean=true, ..., newWorkflow)
       ├─ beforeLoadNewGraph()               // saves V1 draft for OLD workflow (if isModified)
       ├─ ChangeTracker.isLoadingGraph = true  // MUST be here — before clean() and awaits
       ├─ canvas.setGraph(rootGraph)
       ├─ app.clean()                        // clears rootGraph to empty
       ├─ await validateWorkflow()           // ← async gap (isLoadingGraph guards V2 persistence)
       ├─ await invokeExtensionsAsync()      // ← async gap
       ├─ await nodeReplacementStore.load()  // ← async gap
       ├─ rootGraph.configure(graphData)     // fills rootGraph with new content
       ├─ ...
       └─ afterLoadNewGraph(newWorkflow, ...)
            └─ workflowStore.openWorkflow(newWorkflow)
                 ├─ newWorkflow.load()       // loads from V1 draft if present
                 ├─ activeWorkflow.value = newWorkflow   // Vue watcher fires synchronously
                 │    └─ V2 persistence watcher:
                 │         debouncedPersist.flush()      // flushes pending V2 saves
                 │         persistCurrentWorkflow()      // immediate V2 save (guarded by isLoadingGraph)
                 ├─ changeTracker.reset(app.rootGraph.serialize())  // baseline = post-configure state
                 └─ changeTracker.restore()  // restores viewport, node outputs
  └─ ChangeTracker.isLoadingGraph = false    // finally block
```

### Why `isLoadingGraph` Must Be Set Before `clean()`

Between `beforeLoadNewGraph()` and the old `isLoadingGraph = true` location,
there were 3 `await` calls. During those awaits:

- `rootGraph` was already **empty** (cleared by `clean()`)
- `isLoadingGraph` was still **false**
- A debounced `persistCurrentWorkflow()` from a prior `graphChanged` event could fire

This would serialize the empty rootGraph and save it to the (now-active) new
workflow's V2 draft path — **overwriting it with empty content**.

**Fix:** `isLoadingGraph = true` is now set immediately after
`beforeLoadNewGraph()`, before `clean()` and all async gaps.

## V1 Draft Save Guard in `beforeLoadNewGraph()`

```ts
if (
  settingStore.get('Comfy.Workflow.Persist') &&
  activeWorkflow.path &&
  !activeWorkflow.changeTracker._restoringState &&
  activeWorkflow.isModified
) {
  // save V1 draft for the workflow we're switching away from
}
```

- `_restoringState` guard: prevents saving a stale draft during undo/redo
  (at that point `activeState` is still the pre-undo state)
- `isModified` guard: skips saving for clean (saved) workflows — their saved
  file is already authoritative. This prevents stale clean drafts from
  triggering false dirty dots on next reload.

## V2 Persistence `activeWorkflow.key` Watcher

```ts
watch(
  () => workflowStore.activeWorkflow?.key,
  (activeWorkflowKey) => {
    if (!activeWorkflowKey) return
    debouncedPersist.flush() // flush any pending debounced save from old workflow
    persistCurrentWorkflow() // immediately persist the new workflow's current state
  }
)
```

This watcher fires **synchronously** when `activeWorkflow.value` is set inside
`workflowStore.openWorkflow()`. At that point `isLoadingGraph` is still `true`
(we're inside `loadGraphData`), so `persistCurrentWorkflow()` hits its guard
and returns early — preventing a premature save of the not-yet-configured graph.

## `comfyWorkflow.load()` — Draft Restoration

When a workflow tab is opened for the first time:

1. Reads V1 draft store for this path
2. If draft exists and is newer than the saved file's `lastModified`, uses it
3. Sets `changeTracker.activeState = draftState`
4. Sets `_isModified = graphEqual(initialState, draftState) ? false : true`
   — only marks modified if draft actually differs from saved file

**Footgun:** Old code set `_isModified = true` unconditionally when a draft
existed. Clean drafts saved on every tab switch would trigger a false dirty dot
on next page reload. Fixed by checking `graphEqual` instead.

## Workflow `save()` Flow

```
comfyWorkflow.save()
  ├─ this.content = JSON.stringify(this.activeState)
  ├─ super.save({ force: true })     // writes to remote via api.storeUserData
  ├─ changeTracker.reset()           // initialState = activeState
  ├─ this.isModified = false
  └─ draftStore.removeDraft(this.path)  // clears V1 draft
```

Note: `reset()` here makes `initialState === activeState` but does **not** call
`updateModified()`. The explicit `this.isModified = false` line below it is what
actually clears the dirty dot.
