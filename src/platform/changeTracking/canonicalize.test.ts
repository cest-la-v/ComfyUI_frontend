import { describe, expect, it } from 'vitest'

import type { ComfyWorkflowJSON } from '@/platform/workflow/validation/schemas/workflowSchema'

import { graphEqual } from './canonicalize'

function makeWorkflow(
  nodes: Record<string, unknown>[] = [],
  overrides: Partial<ComfyWorkflowJSON> = {}
): ComfyWorkflowJSON {
  return {
    version: 1,
    nodes,
    links: [],
    groups: [],
    extra: {},
    ...overrides
  } as unknown as ComfyWorkflowJSON
}

function makeNode(
  id: number,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    type: 'TestNode',
    pos: [100, 200],
    size: [200, 100],
    flags: {},
    order: 0,
    mode: 0,
    ...overrides
  }
}

describe('graphEqual', () => {
  describe('same reference / identity', () => {
    it('returns true for the same object reference', () => {
      const w = makeWorkflow([makeNode(1)])
      expect(graphEqual(w, w)).toBe(true)
    })

    it('returns true for deep-equal objects', () => {
      const a = makeWorkflow([makeNode(1)])
      const b = makeWorkflow([makeNode(1)])
      expect(graphEqual(a, b)).toBe(true)
    })
  })

  describe('pos/size sub-pixel tolerance', () => {
    it('treats positions within 0.05px as equal', () => {
      const a = makeWorkflow([makeNode(1, { pos: [100.0, 200.0] })])
      const b = makeWorkflow([makeNode(1, { pos: [100.04, 200.03] })])
      expect(graphEqual(a, b)).toBe(true)
    })

    it('treats positions differing by >=0.15px as not equal', () => {
      const a = makeWorkflow([makeNode(1, { pos: [100.0, 200.0] })])
      const b = makeWorkflow([makeNode(1, { pos: [100.2, 200.0] })])
      expect(graphEqual(a, b)).toBe(false)
    })

    it('treats size within sub-pixel tolerance as equal', () => {
      const a = makeWorkflow([makeNode(1, { size: [200.0, 100.0] })])
      const b = makeWorkflow([makeNode(1, { size: [200.04, 100.03] })])
      expect(graphEqual(a, b)).toBe(true)
    })
  })

  describe('slot color stripping', () => {
    it('ignores color_off/color_on differences on outputs', () => {
      const a = makeWorkflow([
        makeNode(1, { outputs: [{ name: 'out', type: 'IMAGE' }] })
      ])
      const b = makeWorkflow([
        makeNode(1, {
          outputs: [
            { name: 'out', type: 'IMAGE', color_off: '#aaa', color_on: '#fff' }
          ]
        })
      ])
      expect(graphEqual(a, b)).toBe(true)
    })

    it('ignores color_off/color_on differences on inputs', () => {
      const a = makeWorkflow([
        makeNode(1, { inputs: [{ name: 'in', type: 'IMAGE' }] })
      ])
      const b = makeWorkflow([
        makeNode(1, {
          inputs: [
            { name: 'in', type: 'IMAGE', color_off: '#bbb', color_on: '#eee' }
          ]
        })
      ])
      expect(graphEqual(a, b)).toBe(true)
    })

    it('still detects real slot differences beyond color', () => {
      const a = makeWorkflow([
        makeNode(1, { outputs: [{ name: 'out', type: 'IMAGE' }] })
      ])
      const b = makeWorkflow([
        makeNode(1, { outputs: [{ name: 'out', type: 'LATENT' }] })
      ])
      expect(graphEqual(a, b)).toBe(false)
    })
  })

  describe('extra.ds viewport stripping', () => {
    it('ignores extra.ds differences', () => {
      const a = makeWorkflow([], {
        extra: { ds: { scale: 1, offset: [0, 0] } }
      })
      const b = makeWorkflow([], {
        extra: { ds: { scale: 2, offset: [100, 200] } }
      })
      expect(graphEqual(a, b)).toBe(true)
    })

    it('still detects real differences in extra beyond ds', () => {
      const a = makeWorkflow([], { extra: { myProp: 'a' } })
      const b = makeWorkflow([], { extra: { myProp: 'b' } })
      expect(graphEqual(a, b)).toBe(false)
    })
  })

  describe('node order independence', () => {
    it('treats workflows with same nodes in different order as equal', () => {
      const a = makeWorkflow([makeNode(1), makeNode(2)])
      const b = makeWorkflow([makeNode(2), makeNode(1)])
      expect(graphEqual(a, b)).toBe(true)
    })
  })

  describe('real differences', () => {
    it('returns false when node content differs', () => {
      const a = makeWorkflow([makeNode(1, { type: 'NodeA' })])
      const b = makeWorkflow([makeNode(1, { type: 'NodeB' })])
      expect(graphEqual(a, b)).toBe(false)
    })

    it('returns false when links differ', () => {
      const a = makeWorkflow([], { links: [[1, 0, 0, 1, 0, 'IMAGE']] as never })
      const b = makeWorkflow([], { links: [] })
      expect(graphEqual(a, b)).toBe(false)
    })

    it('returns false when node count differs', () => {
      const a = makeWorkflow([makeNode(1), makeNode(2)])
      const b = makeWorkflow([makeNode(1)])
      expect(graphEqual(a, b)).toBe(false)
    })
  })

  describe('null / undefined inputs', () => {
    it('returns false when one side is null', () => {
      expect(
        graphEqual(null as unknown as ComfyWorkflowJSON, makeWorkflow())
      ).toBe(false)
    })

    it('returns true when both sides are null (no-change semantics)', () => {
      expect(
        graphEqual(
          null as unknown as ComfyWorkflowJSON,
          null as unknown as ComfyWorkflowJSON
        )
      ).toBe(true)
    })
  })
})
