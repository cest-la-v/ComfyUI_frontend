/**
 * Commit Ownership — synchronous graph ownership handoff after configure().
 *
 * Called synchronously in loadGraphData() AFTER configure() and
 * syncLayoutStoreNodeBoundsFromGraph(), BEFORE any await. This closes the
 * async window that previously allowed microtasks to corrupt state.
 *
 * By the time any deferred callback (layout flush, persist debounce) runs,
 * ownership is already established — they can check isOwner() or isStale()
 * to know whether their work is still valid.
 */

import type { LGraph } from '@/lib/litegraph/src/litegraph'
import type { ComfyWorkflow } from '@/platform/workflow/management/stores/workflowStore'
import type { ComfyWorkflowJSON } from '@/platform/workflow/validation/schemas/workflowSchema'

import { debugCommitOwnership } from './debug'
import { currentEpoch, setOwner } from './loadEpoch'

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Establish ownership of the graph for a workflow after configure().
 *
 * This must be called synchronously — no awaits before this point after
 * configure(). It:
 * 1. Serializes the current graph state
 * 2. Sets the tracker's baseline (reset if clean, activeState-only if has undo history)
 * 3. Sets the owner path so deferred callbacks can validate ownership
 */
export function commitOwnership(workflow: ComfyWorkflow, graph: LGraph): void {
  const tracker = workflow.changeTracker
  if (!tracker) return

  const serialized = graph.serialize() as ComfyWorkflowJSON

  if (tracker.undoQueue.length === 0) {
    // No pending user changes: re-baseline to absorb DOM position drift.
    // This is safe because there's nothing to undo back to.
    tracker.reset(serialized)
    debugCommitOwnership(
      workflow.path,
      'reset',
      serialized.nodes?.length,
      currentEpoch()
    )
  } else {
    // Has pending changes: preserve initialState so undo can restore to
    // the clean baseline. Only sync activeState to the loaded graph.
    tracker.activeState = clone(serialized)
    debugCommitOwnership(
      workflow.path,
      'activeState-only',
      serialized.nodes?.length,
      currentEpoch()
    )
  }

  setOwner(workflow.path)
}
