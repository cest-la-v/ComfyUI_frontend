/**
 * Fork Debug Instrumentation — all console.warn debug logs in one place.
 *
 * Moving debug instrumentation out of upstream files keeps them clean for
 * merges and makes fork-specific logging easy to grep, toggle, or remove.
 *
 * In production builds, all functions are compile-time no-ops (dead code
 * eliminated). In development, logging is controlled at runtime via localStorage
 * so it survives page refreshes without editing source files.
 *
 * Uses console.warn because vite.config.mts purges console.log via
 * manualPureFunctions in Rolldown. console.warn survives the build.
 *
 * Toggle in the browser console:
 *   __comfyStateDebug(true)   // enable
 *   __comfyStateDebug(false)  // disable
 */

const LS_KEY = 'comfyui:stateDebug'

// Disabled by default. Toggle at runtime via __comfyStateDebug(true/false).
// Persists across reloads via localStorage.
let enabled = false
try {
  enabled = localStorage.getItem(LS_KEY) === '1'
} catch {
  // localStorage unavailable (SSR, test env, etc.)
}

/**
 * Enable or disable debug logging at runtime. Persists via localStorage so
 * you only need to call this once per browser session.
 *
 * Also accessible as `window.__comfyStateDebug(true|false)` from the console.
 */
function setDebug(on: boolean): void {
  enabled = on
  try {
    localStorage.setItem(LS_KEY, on ? '1' : '0')
  } catch {
    // localStorage unavailable
  }
  console.warn(`[comfyStateDebug] debug logging ${on ? 'ENABLED' : 'DISABLED'}`)
}

export function debugBuildBanner(): void {
  // Always register the console toggle helper in any build mode.
  ;(window as unknown as Record<string, unknown>).__comfyStateDebug = setDebug
  if (!import.meta.env.PROD) {
    console.warn(
      '[comfyStateDebug] call __comfyStateDebug(true) to enable verbose state-tracking logs'
    )
  }
  if (!enabled) return
  console.warn(
    '[DEBUG BUILD] state-management refactor — commitOwnership + loadEpoch',
    'background:#ff6b00;color:#fff;font-weight:bold'
  )
}

export function debugReset(
  workflowPath: string,
  nodeCount: number | undefined,
  caller: string | undefined
): void {
  if (!enabled) return
  console.warn(
    '[DEBUG reset]',
    'workflow:',
    workflowPath,
    '| new state nodes:',
    nodeCount ?? '(keep current)',
    '| stack:',
    caller
  )
}

export function debugCheckStateDiff(
  workflowPath: string,
  diffKeys: string[],
  undoQueueLen: number,
  movedNodeInfo: string,
  caller: string | undefined
): void {
  if (!enabled) return
  console.warn(
    '[DEBUG checkState DIFF]',
    workflowPath,
    '| changed sections:',
    diffKeys,
    '| undoQueue len:',
    undoQueueLen,
    movedNodeInfo,
    '| caller:',
    caller
  )
}

export function debugIsModifiedTrue(
  workflowPath: string,
  diffExcerpt: string
): void {
  if (!enabled) return
  console.warn(
    '[DEBUG isModified→true]',
    workflowPath,
    '| diff vs initialState:',
    diffExcerpt
  )
}

export function debugFlushPending(
  nodeId: string,
  liteNode: { pos: number[] },
  layout: { position: { x: number; y: number } }
): void {
  if (!enabled) return
  console.warn(
    '[DEBUG flushPending]',
    `node=${nodeId}`,
    `graph=[${liteNode.pos[0].toFixed(2)},${liteNode.pos[1].toFixed(2)}]`,
    `→ layout=[${layout.position.x.toFixed(2)},${layout.position.y.toFixed(2)}]`
  )
}

export function debugLoadGraphData(
  workflowPath: string | undefined,
  clean: boolean | undefined,
  epoch: number
): void {
  if (!enabled) return
  console.warn(
    '[DEBUG loadGraphData]',
    'workflow:',
    workflowPath,
    '| clean:',
    clean,
    '| epoch:',
    epoch
  )
}

export function debugOpenWorkflow(workflowPath: string): void {
  if (!enabled) return
  console.warn('[DEBUG openWorkflow]', workflowPath)
}

export function debugBeforeLoad(workflowPath: string): void {
  if (!enabled) return
  console.warn('[DEBUG beforeLoad]', workflowPath)
}

export function debugAfterLoad(
  path: string,
  variant: 'A' | 'B' | 'C',
  undoQueueLen: number,
  nodeCount: number | undefined
): void {
  if (!enabled) return
  console.warn(
    `[DEBUG afterLoad-${variant}]`,
    path,
    '| undoQueue:',
    undoQueueLen,
    '| nodes:',
    nodeCount
  )
}

export function debugActivateWorkflow(
  newPath: string,
  oldPath: string | undefined
): void {
  if (!enabled) return
  console.warn(
    '[DEBUG workflowStore.openWorkflow] activating:',
    newPath,
    '| was:',
    oldPath ?? 'null'
  )
}

export function debugCommitOwnership(
  workflowPath: string,
  resetOrSync: 'reset' | 'activeState-only',
  nodeCount: number | undefined,
  epoch: number
): void {
  if (!enabled) return
  console.warn(
    '[DEBUG commitOwnership]',
    workflowPath,
    '|',
    resetOrSync,
    '| nodes:',
    nodeCount,
    '| epoch:',
    epoch
  )
}

export function debugDraftComparison(
  workflowPath: string,
  isModified: boolean,
  diffExcerpt: string
): void {
  if (!enabled) return
  console.warn(
    '[DEBUG draftComparison]',
    workflowPath,
    '| isModified:',
    isModified,
    '| diff:',
    diffExcerpt
  )
}
