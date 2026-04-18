/**
 * Graph Canonicalization — compare-only normalization for dirty checks.
 *
 * Produces a canonical form of a workflow JSON that strips rendering noise:
 * sub-pixel position drift, slot colors set post-configure(), viewport state.
 *
 * This is separate from `LGraph.serialize()` which must remain lossless for
 * save/export/prompt generation. Only `graphEqual()` uses this path.
 */

import _ from 'es-toolkit/compat'

import type { ComfyWorkflowJSON } from '@/platform/workflow/validation/schemas/workflowSchema'

/**
 * Round a position/size coordinate to 1 decimal place.
 * DOM layout measurements can produce sub-pixel float drift (~0.0001 px)
 * across tab switches and configure() calls. Rounding to 0.1 px eliminates
 * spurious undo-queue entries while still detecting user moves (≥1 px).
 */
function snapCoord(v: number): number {
  return Math.round(v * 10) / 10
}

/**
 * Normalize a serialized node for comparison by stripping rendering-only
 * properties and rounding positions to eliminate sub-pixel drift.
 */
function normalizeNode(node: Record<string, unknown>): Record<string, unknown> {
  if (!node || typeof node !== 'object') return node
  const out = { ...node }
  if (Array.isArray(out.pos)) out.pos = (out.pos as number[]).map(snapCoord)
  if (Array.isArray(out.size)) out.size = (out.size as number[]).map(snapCoord)

  // Strip rendering-only slot color properties. ComfyUI's node-type
  // initialization sets color_off/color_on on outputs/inputs AFTER
  // configure() runs, so baseline state lacks them → false dirty dot.
  const stripSlotColors = (slot: Record<string, unknown>) => {
    const { color_off: _co, color_on: _cn, ...rest } = slot
    return rest
  }
  if (Array.isArray(out.outputs))
    out.outputs = (out.outputs as Record<string, unknown>[]).map(
      stripSlotColors
    )
  if (Array.isArray(out.inputs))
    out.inputs = (out.inputs as Record<string, unknown>[]).map(stripSlotColors)
  return out
}

/**
 * Compare two workflow JSON objects for semantic equality, ignoring rendering noise.
 *
 * Normalizations applied:
 * - Node positions/sizes rounded to 0.1px
 * - Slot color_off/color_on stripped (rendering-only, set post-configure)
 * - extra.ds stripped (canvas viewport state)
 * - Node arrays compared as sets (order-independent)
 */
export function graphEqual(
  a: ComfyWorkflowJSON,
  b: ComfyWorkflowJSON
): boolean {
  if (a === b) return true

  if (typeof a == 'object' && a && typeof b == 'object' && b) {
    const normA = a.nodes?.map(normalizeNode)
    const normB = b.nodes?.map(normalizeNode)
    if (
      !_.isEqualWith(normA, normB, (arrA, arrB) => {
        if (Array.isArray(arrA) && Array.isArray(arrB)) {
          return _.isEqual(new Set(arrA), new Set(arrB))
        }
      })
    ) {
      return false
    }

    if (
      !_.isEqual(_.omit(a.extra ?? {}, ['ds']), _.omit(b.extra ?? {}, ['ds']))
    )
      return false

    for (const key of [
      'links',
      'floatingLinks',
      'reroutes',
      'groups',
      'definitions',
      'subgraphs'
    ]) {
      if (!_.isEqual(a[key], b[key])) {
        return false
      }
    }

    return true
  }

  return false
}
