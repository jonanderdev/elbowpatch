import { describe, expect, it } from 'vitest'
import { layoutWatch } from './layoutWatch'

/** The layout kept on this device, and a way to end each forgetting by hand. */
function watched(kept: string | undefined) {
  const device = { kept }
  const forgetting: { done(): void; fail(): void }[] = []
  const watch = layoutWatch({
    read: () => device.kept,
    write: (layout) => {
      device.kept = layout
    },
    forget: () =>
      new Promise<void>((done, fail) => {
        forgetting.push({ done, fail: () => fail(new Error('The disk is full.')) })
      }),
  })
  return { device, forgetting, watch }
}

describe('a change of layout seen through', () => {
  it('forgets the counts first, and records the layout only after', async () => {
    const w = watched('a')
    const seen = w.watch.see('b')
    expect(w.forgetting).toHaveLength(1)
    expect(w.device.kept).toBe('a')
    w.forgetting[0]!.done()
    await seen
    expect(w.device.kept).toBe('b')
  })

  it('left unfinished by a failure, is found at the next launch', async () => {
    const w = watched('a')
    const seen = w.watch.see('b')
    w.forgetting[0]!.fail()
    await expect(seen).rejects.toThrow()
    expect(w.device.kept).toBe('a')

    const next = layoutWatch({ read: () => w.device.kept, write: () => {}, forget: () => Promise.resolve() })
    expect(next.see('b')).toBeDefined()
  })

  it('does nothing at the layout it was last counted at', () => {
    expect(watched('a').watch.see('a')).toBeUndefined()
  })

  it('a change back before the first is through is a change too: what was measured between is not kept', async () => {
    const w = watched('a')
    const first = w.watch.see('b')
    const generation = w.watch.generation()
    const second = w.watch.see('a')
    expect(second).toBeDefined()
    expect(w.watch.generation()).not.toBe(generation)
    w.forgetting[1]!.done()
    await second
    w.forgetting[0]!.done()
    await first
    expect(w.device.kept).toBe('a')
  })

  it('a first launch counts as a change', () => {
    expect(watched(undefined).watch.see('a')).toBeDefined()
  })
})
