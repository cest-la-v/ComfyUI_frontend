import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * loadEpoch.ts uses module-level mutable state.
 * Re-import the module before each test via vi.resetModules() to get a clean slate.
 */

type LoadEpochModule = {
  incrementEpoch: () => number
  currentEpoch: () => number
  isStale: (epoch: number) => boolean
  isLoading: () => boolean
  finishLoading: () => void
  setLoading: (value: boolean) => void
  setOwner: (path: string | null) => void
  isOwner: (path: string) => boolean
}

describe('loadEpoch', () => {
  let loadEpoch: LoadEpochModule

  beforeEach(async () => {
    // Fresh module instance with reset state for every test
    vi.resetModules()
    loadEpoch = (await import('./loadEpoch')) as LoadEpochModule
  })

  describe('loading flag', () => {
    it('isLoading() is false initially', () => {
      expect(loadEpoch.isLoading()).toBe(false)
    })

    it('isLoading() is true after incrementEpoch()', () => {
      loadEpoch.incrementEpoch()
      expect(loadEpoch.isLoading()).toBe(true)
    })

    it('isLoading() is false after finishLoading()', () => {
      loadEpoch.incrementEpoch()
      loadEpoch.finishLoading()
      expect(loadEpoch.isLoading()).toBe(false)
    })

    it('setLoading(true) sets isLoading to true', () => {
      loadEpoch.setLoading(true)
      expect(loadEpoch.isLoading()).toBe(true)
    })

    it('setLoading(false) sets isLoading to false', () => {
      loadEpoch.setLoading(true)
      loadEpoch.setLoading(false)
      expect(loadEpoch.isLoading()).toBe(false)
    })
  })

  describe('epoch / staleness', () => {
    it('currentEpoch() returns 0 initially', () => {
      expect(loadEpoch.currentEpoch()).toBe(0)
    })

    it('incrementEpoch() advances the epoch', () => {
      const before = loadEpoch.currentEpoch()
      loadEpoch.incrementEpoch()
      expect(loadEpoch.currentEpoch()).toBe(before + 1)
    })

    it('isStale(captured) is false before any new increment', () => {
      const captured = loadEpoch.currentEpoch()
      expect(loadEpoch.isStale(captured)).toBe(false)
    })

    it('isStale(captured) is true after incrementEpoch()', () => {
      const captured = loadEpoch.currentEpoch()
      loadEpoch.incrementEpoch()
      expect(loadEpoch.isStale(captured)).toBe(true)
    })

    it('captured epoch tracks the new value after increment', () => {
      loadEpoch.incrementEpoch()
      const captured = loadEpoch.currentEpoch()
      expect(loadEpoch.isStale(captured)).toBe(false)
    })
  })

  describe('ownership', () => {
    it('isOwner() is false for any path initially', () => {
      expect(loadEpoch.isOwner('/workflow/a')).toBe(false)
    })

    it('isOwner() is true after setOwner() for that path', () => {
      loadEpoch.setOwner('/workflow/a')
      expect(loadEpoch.isOwner('/workflow/a')).toBe(true)
    })

    it('isOwner() is false for a different path', () => {
      loadEpoch.setOwner('/workflow/a')
      expect(loadEpoch.isOwner('/workflow/b')).toBe(false)
    })

    it('isOwner() is false after setOwner(null)', () => {
      loadEpoch.setOwner('/workflow/a')
      loadEpoch.setOwner(null)
      expect(loadEpoch.isOwner('/workflow/a')).toBe(false)
    })

    it('setOwner() transfers ownership to a new path', () => {
      loadEpoch.setOwner('/workflow/a')
      loadEpoch.setOwner('/workflow/b')
      expect(loadEpoch.isOwner('/workflow/a')).toBe(false)
      expect(loadEpoch.isOwner('/workflow/b')).toBe(true)
    })
  })
})
