import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ComfyWorkflowJSON } from '@/platform/workflow/validation/schemas/workflowSchema'

vi.mock('./debug', () => ({
  debugCommitOwnership: vi.fn()
}))

// Let loadEpoch run for real so we can check isOwner()
import { isOwner, setOwner } from './loadEpoch'
import { commitOwnership } from './commitOwnership'

function makeSerializedGraph(nodes: unknown[] = []): ComfyWorkflowJSON {
  return {
    version: 1,
    nodes,
    links: [],
    groups: [],
    extra: {}
  } as unknown as ComfyWorkflowJSON
}

function makeGraph(serialized: ComfyWorkflowJSON) {
  return { serialize: vi.fn(() => serialized) }
}

function makeTracker(undoQueueLength = 0) {
  return {
    undoQueue: new Array(undoQueueLength).fill({}),
    activeState: null as ComfyWorkflowJSON | null,
    initialState: null as ComfyWorkflowJSON | null,
    reset: vi.fn(function (
      this: ReturnType<typeof makeTracker>,
      state: ComfyWorkflowJSON
    ) {
      this.activeState = state
      this.initialState = state
    })
  }
}

function makeWorkflow(
  path: string,
  tracker: ReturnType<typeof makeTracker> | null
) {
  return { path, changeTracker: tracker }
}

describe('commitOwnership', () => {
  beforeEach(() => {
    setOwner(null)
    vi.clearAllMocks()
  })

  it('returns without error when workflow has no changeTracker', () => {
    const graph = makeGraph(makeSerializedGraph())
    const workflow = makeWorkflow('/a', null)
    expect(() =>
      commitOwnership(workflow as never, graph as never)
    ).not.toThrow()
  })

  describe('empty undoQueue (clean state)', () => {
    it('calls tracker.reset() with the serialized graph', () => {
      const serialized = makeSerializedGraph([{ id: 1 }])
      const graph = makeGraph(serialized)
      const tracker = makeTracker(0)
      const workflow = makeWorkflow('/a', tracker)

      commitOwnership(workflow as never, graph as never)

      expect(tracker.reset).toHaveBeenCalledOnce()
      expect(tracker.reset).toHaveBeenCalledWith(serialized)
    })

    it('sets ownership to the workflow path', () => {
      const graph = makeGraph(makeSerializedGraph())
      const tracker = makeTracker(0)
      const workflow = makeWorkflow('/workflow/clean', tracker)

      commitOwnership(workflow as never, graph as never)

      expect(isOwner('/workflow/clean')).toBe(true)
    })
  })

  describe('non-empty undoQueue (has pending changes)', () => {
    it('does NOT call tracker.reset()', () => {
      const graph = makeGraph(makeSerializedGraph())
      const tracker = makeTracker(2)
      const workflow = makeWorkflow('/b', tracker)

      commitOwnership(workflow as never, graph as never)

      expect(tracker.reset).not.toHaveBeenCalled()
    })

    it('sets tracker.activeState to a clone of the serialized graph', () => {
      const serialized = makeSerializedGraph([{ id: 99 }])
      const graph = makeGraph(serialized)
      const tracker = makeTracker(1)
      const workflow = makeWorkflow('/b', tracker)

      commitOwnership(workflow as never, graph as never)

      expect(tracker.activeState).toEqual(serialized)
      // Must be a clone, not the same reference
      expect(tracker.activeState).not.toBe(serialized)
    })

    it('still sets ownership to the workflow path', () => {
      const graph = makeGraph(makeSerializedGraph())
      const tracker = makeTracker(1)
      const workflow = makeWorkflow('/workflow/pending', tracker)

      commitOwnership(workflow as never, graph as never)

      expect(isOwner('/workflow/pending')).toBe(true)
    })
  })
})
