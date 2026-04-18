/**
 * Change Origin — explicit mutation-source tracking.
 *
 * Replaces the boolean `_restoringState` flag with a discriminated origin type.
 * Each consumer of state-change events can decide independently how to react
 * based on WHY the mutation is happening, not just whether "something is restoring."
 *
 * Key behavioral differences from `_restoringState`:
 *   - 'undo' origin DOES allow draft saves (fixing stale-draft-after-undo risk)
 *   - 'undo' origin DOES NOT dispatch graphChanged (preventing auto-queue / autosave)
 *   - 'load' origin suppresses everything (tab switch)
 *   - 'layout-sync' origin re-baselines only when clean
 */

export type ChangeOrigin = 'user' | 'undo' | 'load' | 'layout-sync'

/** Should the `graphChanged` event be dispatched for this origin? */
export function shouldDispatchGraphChanged(origin: ChangeOrigin): boolean {
  return origin === 'user'
}

/** Should dirty-flag (isModified) be updated for this origin? */
export function shouldUpdateDirty(origin: ChangeOrigin): boolean {
  return origin === 'user' || origin === 'undo'
}
