/**
 * Change Tracking — fork-specific workflow state management.
 *
 * This module contains the ownership model, canonicalization, and debug
 * instrumentation for the dirty-dot / undo / draft-persistence system.
 * Upstream files import thin helpers from here to keep fork-specific
 * logic out of core files.
 *
 * Architecture overview:
 * - loadEpoch: monotonic counter invalidating stale deferred callbacks
 * - changeOrigin: discriminated mutation source (user/undo/load/layout-sync)
 * - canonicalize: compare-only normalization for graphEqual()
 * - commitOwnership: synchronous graph handoff after configure()
 * - debug: all console.warn instrumentation
 */

export {
  type ChangeOrigin,
  shouldDispatchGraphChanged,
  shouldUpdateDirty
} from './changeOrigin'

export { graphEqual } from './canonicalize'

export { commitOwnership } from './commitOwnership'

export {
  debugActivateWorkflow,
  debugAfterLoad,
  debugBeforeLoad,
  debugBuildBanner,
  debugCheckStateDiff,
  debugDraftComparison,
  debugFlushPending,
  debugIsModifiedTrue,
  debugLoadGraphData,
  debugOpenWorkflow,
  debugReset
} from './debug'

export {
  currentEpoch,
  finishLoading,
  incrementEpoch,
  isLoading,
  isOwner,
  isStale,
  setLoading,
  setOwner
} from './loadEpoch'
