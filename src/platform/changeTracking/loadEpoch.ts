/**
 * Load Epoch — monotonic ownership token for graph loading.
 *
 * Replaces the boolean `isLoadingGraph` flag and the nullable `loadedWorkflowPath`
 * string with a single monotonic counter. Every deferred callback (microtask,
 * debounced persist, RAF) captures the epoch at creation time and checks
 * `isStale()` before executing. Stale = cancel entirely — no timing-dependent
 * boolean checks needed.
 *
 * This module lives in the fork-specific `platform/changeTracking/` directory.
 * Upstream files import thin helpers from here rather than carrying the logic inline.
 */

let epoch = 0
let ownerPath: string | null = null
let loading = false

/** Increment the epoch. Call at the start of every `loadGraphData()`. */
export function incrementEpoch(): number {
  loading = true
  return ++epoch
}

/** Get the current epoch value. Capture this before queuing deferred work. */
export function currentEpoch(): number {
  return epoch
}

/** Check if a previously captured epoch is stale (a new load has started since). */
export function isStale(capturedEpoch: number): boolean {
  return capturedEpoch !== epoch
}

/** Check if a graph load is currently in progress. */
export function isLoading(): boolean {
  return loading
}

/** Mark loading as complete. Call in the finally block of `loadGraphData()`. */
export function finishLoading(): void {
  loading = false
}

/** Directly set the loading state. Used for testing and backward-compat with isLoadingGraph setter. */
export function setLoading(value: boolean): void {
  loading = value
}

/**
 * Set the owner path — the workflow path currently loaded in `app.rootGraph`.
 * Call in `commitOwnership()` after `configure()` completes.
 */
export function setOwner(path: string | null): void {
  ownerPath = path
}

/** Check if a given path owns the current graph. */
export function isOwner(path: string): boolean {
  return ownerPath === path
}
