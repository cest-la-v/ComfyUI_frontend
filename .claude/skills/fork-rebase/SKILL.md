---
name: fork-rebase
description: >
  Rebase this fork (cest-la-v/ComfyUI_frontend) onto the latest upstream
  (Comfy-Org/ComfyUI_frontend) and verify the fork-specific state-management
  system still works correctly. Use when asked to rebase onto upstream, sync
  with upstream, update fork to latest, check fork divergence, verify
  customizations after merge, or fix post-rebase regressions.
---

# Fork Rebase Skill

Rebases `cest-la-v/ComfyUI_frontend` onto `Comfy-Org/ComfyUI_frontend` (upstream)
and verifies the fork's custom state-management module (`src/platform/changeTracking/`)
is intact and correctly injected.

## Repository Context

| Item                   | Value                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Fork remote            | `origin` → `cest-la-v/ComfyUI_frontend`                                                                        |
| Upstream remote        | `upstream` → `Comfy-Org/ComfyUI_frontend`                                                                      |
| Working branch         | `dev` (default) or `clean/state-management`                                                                    |
| Fork-specific code     | `src/platform/changeTracking/` (6 source + 3 test files)                                                       |
| Key integration points | `src/scripts/changeTracker.ts`, `src/scripts/app.ts`, `src/platform/workflow/core/services/workflowService.ts` |

## Quick Start

```
1. Fetch upstream
2. Rebase fork branch onto upstream/main
3. Resolve conflicts using the Conflict Playbook below
4. Run the Invariant Verification Checklist
5. Run quality gates
6. Push to fork
```

---

## Phase 1: Fetch and Rebase

```bash
cd <repo root>
git fetch upstream

# Check divergence first
git log upstream/main..HEAD --oneline          # our commits
git log HEAD..upstream/main --oneline          # upstream-only commits

# Rebase
git rebase upstream/main
```

If the rebase is clean, skip to Phase 3.

---

## Phase 2: Conflict Playbook

Four known conflict zones. Resolve in this order (least → most complex).

### Zone A — `src/lib/litegraph/src/LGraphNode.ts` / `src/lib/litegraph/src/LGraphCanvas.ts`

**Our change:** `flags.ghost` excluded from serialization. `LGraphCanvas.state.ghostNodeId` cleared on canvas reset. Ghost is a transient rendering state (node-follows-cursor placement).

**Conflict pattern:** Upstream edits to `serialize()` or canvas state reset logic — content diff.

**Resolution:** Keep upstream's structural changes **and** our ghost-flag exclusions:

- In `serialize()`: ensure `delete f.ghost` is present (strips the ghost flag from serialized flags)
- In canvas reset / `onConfigure()`: ensure `this.state.ghostNodeId = null` resets are present
- Verify:
  ```bash
  grep -n "delete f.ghost\|f\.ghost" src/lib/litegraph/src/LGraphNode.ts
  grep -n "ghostNodeId" src/lib/litegraph/src/LGraphCanvas.ts | grep "null"
  ```

### Zone B — `src/scripts/changeTracker.ts`

**Our change:** `captureCanvasState()` is the primary implementation; `checkState()` is a thin shim. `isLoadingGraph` getter/setter backed by `isLoading()`/`setLoading()` from `loadEpoch.ts`.

**Conflict pattern:** Upstream may refactor `checkState()` directly or add new guards.

**Resolution:**

1. Keep upstream's new guards/logic inside `captureCanvasState()` (our primary), NOT in `checkState()`
2. `checkState()` must remain: `return this.captureCanvasState()`
3. `isLoadingGraph` getter must call `isLoading()` from `src/platform/changeTracking/loadEpoch.ts`
4. `isLoadingGraph` setter must call `setLoading(value)` from the same module

**Critical invariant:** `captureCanvasState()` must guard with:

```ts
if (isLoading()) return
if (this._restoringState) return
if (!this.isActiveTracker) return
if (this.ghostNodeId !== null) return
```

### Zone C — `src/scripts/app.ts` + `src/platform/workflow/core/services/workflowService.ts`

**Our change:** `loadGraphData()` calls `incrementEpoch()` at the start and `finishLoading()` in its finally block. `commitOwnership()` is called three places in `workflowService.ts` (after each `configure()` path), **not** in `app.ts`.

**Conflict pattern:** Upstream extends `loadGraphData()` (new parameters, new behavior, reordering).

**Resolution:**

1. Accept upstream's structural changes to `loadGraphData()`
2. **Re-inject** at the top of `loadGraphData` in `app.ts`: `incrementEpoch()` from `src/platform/changeTracking/loadEpoch.ts`
3. **Re-inject** in the `finally` block of `loadGraphData`: `finishLoading()` from the same module
4. `commitOwnership()` lives in `workflowService.ts` — called synchronously after each path through `loadGraphData` completes. No `await` between `loadGraphData` returning and `commitOwnership` being called.

**Verify:**

```bash
grep -n "incrementEpoch\|finishLoading" src/scripts/app.ts
grep -n "commitOwnership" src/platform/workflow/core/services/workflowService.ts
```

Expected:

- `app.ts`: `incrementEpoch` at start of `loadGraphData`, `finishLoading` in finally
- `workflowService.ts`: `commitOwnership` at lines ~545, ~564, ~574 (three call sites after different load paths)

### Zone D — `src/platform/workflow/core/services/workflowService.ts`

**Our change:** `openWorkflow` mutex (`currentlyLoadingWorkflow`) + pending queue (`pendingWorkflowLoad`). Upstream has no equivalent.

**Conflict pattern:** Upstream adds features to `openWorkflow()` — merge conflicts around the function body.

**Resolution:**

1. Keep upstream's new behavior inside `openWorkflow()`
2. Re-inject the module-level mutex vars at lines ~51-52:
   ```ts
   let currentlyLoadingWorkflow: ComfyWorkflow | null = null
   let pendingWorkflowLoad: ComfyWorkflow | null = null
   ```
3. Re-inject the mutex guard block at the start of `openWorkflow()` — **order matters**:

   ```ts
   // 1. No-op if already active and not forced
   if (
     !currentlyLoadingWorkflow &&
     workflowStore.isActive(workflow) &&
     !options.force
   )
     return

   // 2. Re-click of the loading tab → cancel any queued switch, let in-flight settle
   if (currentlyLoadingWorkflow === workflow) {
     pendingWorkflowLoad = null
     return
   }

   // 3. Different tab clicked while a load is in progress → queue it (last click wins)
   if (currentlyLoadingWorkflow) {
     pendingWorkflowLoad = workflow
     return
   }
   ```

4. Re-inject the pending queue drain **after** the try/finally, not inside it:
   ```ts
   if (pendingWorkflowLoad) {
     const next = pendingWorkflowLoad
     pendingWorkflowLoad = null
     await openWorkflow(next)
   }
   ```

**Also verify** `beforeLoadNewGraph()`:

- Must call `store()` before replacing the active workflow
- Must guard with `!activeWorkflow.changeTracker._restoringState` (prevents draft saves during undo/redo)

### Zone E — `src/renderer/core/layout/sync/useLayoutSync.ts`

**Our change:** Layout flush loop wrapped in `tracker.changeCount++/--` to suppress `captureCanvasState()` during DOM→LiteGraph flush.

**Conflict pattern:** Upstream extends the flush loop or changes the re-baseline logic.

**Resolution:**

1. Keep upstream's flush changes
2. Ensure `tracker.changeCount++` appears immediately before the flush loop
3. Ensure `tracker.changeCount--` appears immediately after (in finally if needed)
4. The post-flush re-baseline must use `app.rootGraph` (not `canvas.graph`)
5. Re-baseline must be guarded: only set `activeState` if `graphEqual(initialState, currentState)` is still true

### Zone F — `src/platform/workflow/persistence/composables/useWorkflowPersistenceV2.ts`

**Our change:** Draft-save watcher guarded by `isLoading()` + `isOwner()` to prevent writing a stale workflow's draft during async tab switches.

**Conflict pattern:** Upstream extends persistence composable (new watchers, new save logic).

**Resolution:**

1. Accept upstream's new persistence behavior
2. Ensure the watcher that triggers draft saves starts with:
   ```ts
   if (isLoading()) return
   if (!isOwner(activeWorkflow.path)) return
   ```
3. Verify:
   ```bash
   grep -n "isLoading\|isOwner" src/platform/workflow/persistence/composables/useWorkflowPersistenceV2.ts
   ```
   Expected: both guards present inside the draft-save watcher callback.

### Zone G — `src/stores/appModeStore.ts`

**Our change:** `linearData` sync skips during graph load via `isLoading()` guard to prevent false dirty state in builder mode.

**Conflict pattern:** Upstream modifies `appModeStore` watchers or adds new sync logic.

**Resolution:**

1. Accept upstream changes
2. Ensure the `linearData` sync watcher (or equivalent) is guarded:
   ```ts
   if (!data || isLoading()) return
   ```
3. Verify:
   ```bash
   grep -n "isLoading" src/stores/appModeStore.ts
   ```

---

Run these after resolving all conflicts. Each is a quick grep or import trace.

### ✓ Invariant 1 — captureCanvasState is primary

```bash
grep -n "checkState\|captureCanvasState" src/scripts/changeTracker.ts | head -30
```

Expected:

- `captureCanvasState()` is a full method with all guards
- `checkState()` body calls `captureCanvasState()` (thin shim)

### ✓ Invariant 2 — commitOwnership is in workflowService (3 call sites)

```bash
grep -n "commitOwnership" src/platform/workflow/core/services/workflowService.ts
```

Expected: three call sites (~lines 545, 564, 574), each immediately after a `loadGraphData()` return path, with no `await` between `loadGraphData` and `commitOwnership`.

Also verify `app.ts` has the epoch guards:

```bash
grep -n "incrementEpoch\|finishLoading" src/scripts/app.ts
```

Expected: `incrementEpoch` at top of `loadGraphData`, `finishLoading` in finally.

### ✓ Invariant 3 — beforeLoadNewGraph uses store() + undo guard

```bash
grep -n "beforeLoadNewGraph\|_restoringState\|store()" src/platform/workflow/core/services/workflowService.ts | head -20
```

Expected:

- `store()` called inside `beforeLoadNewGraph`
- `_restoringState` guard present

### ✓ Invariant 4 — mutex vars are module-level

```bash
grep -n "currentlyLoadingWorkflow\|pendingWorkflowLoad" src/platform/workflow/core/services/workflowService.ts | head -10
```

Expected: both declared at module level (before any function), not inside a composable.

### ✓ Invariant 5 — isLoadingGraph shims use loadEpoch

```bash
grep -n "isLoadingGraph\|isLoading()\|setLoading(" src/scripts/changeTracker.ts
```

Expected: getter calls `isLoading()`, setter calls `setLoading(value)`.

### ✓ Invariant 6 — layout flush suppressed during DOM write

```bash
grep -n "changeCount" src/renderer/core/layout/sync/useLayoutSync.ts
```

Expected: `changeCount++` before flush loop, `changeCount--` after.

### ✓ Invariant 7 — persistence guards prevent cross-tab draft corruption

```bash
grep -n "isLoading\|isOwner" src/platform/workflow/persistence/composables/useWorkflowPersistenceV2.ts
grep -n "isLoading" src/stores/appModeStore.ts
```

Expected: `isLoading()` guard in `useWorkflowPersistenceV2.ts` draft watcher; `isLoading()` guard in `appModeStore.ts` linearData sync.

### ✓ Invariant 8 — changeTracking barrel exports are complete

```bash
grep "^export" src/platform/changeTracking/index.ts
```

Expected: exports include `commitOwnership`, `incrementEpoch`, `finishLoading`, `isLoading`, `setLoading`, `isOwner`, `isStale`, `graphEqual`.

---

## Phase 4: Quality Gates

```bash
pnpm typecheck         # TypeScript — must pass cleanly
pnpm test:unit         # Vitest — all tests green (107+ expected)
pnpm knip              # No dead exports introduced
pnpm lint              # No new lint errors
```

**Run fork-specific tests explicitly** (fastest signal for rebase regressions):

```bash
pnpm test:unit -- --reporter=verbose \
  src/platform/changeTracking/ \
  src/platform/workflow/core/services/workflowService.test.ts \
  src/scripts/changeTracker.test.ts \
  src/lib/litegraph/test/LGraph.test.ts
```

These cover: epoch guards, commitOwnership, graphEqual, ghost-node serialization, and the openWorkflow mutex (basic queue, re-click cancel, last-click-wins).

---

## Phase 5: Push

```bash
git push origin HEAD --force-with-lease   # safe force push on rebased branch
```

---

## Debug Toggle

All state-management instrumentation is behind a runtime flag:

```js
// Browser console — enable verbose state debug logs
window.__comfyStateDebug(true)
// Persisted in localStorage['comfyui:stateDebug']
```

Use this for manual smoke testing after the rebase:

1. Open a workflow, make a node change → dirty dot should appear
2. Undo → dirty dot should disappear
3. Switch tabs (fast) → no automatic back-and-forth switching
4. Save → dirty dot clears

---

## Known Upstream Patterns to Watch

| Upstream change type                          | Risk   | Action                                                                                                                        |
| --------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| New `checkState()` calls added upstream       | Medium | Move logic into `captureCanvasState()`, shim via `checkState()`                                                               |
| New params on `loadGraphData()`               | Low    | Accept params, re-inject epoch/finishLoading around them                                                                      |
| `configure()` moved or wrapped in a helper    | High   | Ensure `commitOwnership()` in `workflowService.ts` still follows each `loadGraphData()` call synchronously — trace call chain |
| New `useWorkflowService()` composable methods | Low    | Accept — mutex vars are module-level, unaffected                                                                              |
| LiteGraph version bumps (litegraph submodule) | Medium | Re-check ghost-flag grep after submodule update                                                                               |

---

## Troubleshooting

**`isLoading()` not found / module import errors:**
→ Check `src/platform/changeTracking/index.ts` barrel exports `isLoading`, `setLoading`, `incrementEpoch`, `finishLoading`, `isOwner`, `isStale`, `commitOwnership`.

**Dirty dot appears on clean workflow load:**
→ `commitOwnership()` is not called synchronously after `loadGraphData()` in `workflowService.ts`, or layout flush isn't suppressed (changeCount guards missing), or `isOwner()` guard missing in `useWorkflowPersistenceV2.ts`.

**Dirty dot never clears on undo:**
→ `captureCanvasState()` is being suppressed incorrectly (check `isActiveTracker`, `changeCount`, or epoch mismatch).

**Tab-switching loop (tabs switch automatically):**
→ `pendingWorkflowLoad = null` is missing in the re-click early-return guard. See fix in `workflowService.ts` circa line 263.

**Tests failing in `loadEpoch.test.ts`:**
→ Module-level state bleeds between tests. Add `vi.resetModules()` in `beforeEach` for that test file.
