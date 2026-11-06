import { describe, expect, it } from 'vitest'
import { thinningGate } from './thinningGate'

function gate() {
  const runs: { held: () => boolean; finish: () => void }[] = []
  const later: (() => void)[] = []
  const g = thinningGate(
    (held) => new Promise<void>((finish) => runs.push({ held, finish })),
    (f) => later.push(f),
  )
  return { g, runs, later }
}

describe('thinning, around the Time Machine', () => {
  it('runs when nothing holds it', () => {
    const { g, runs } = gate()
    g.start()
    expect(runs).toHaveLength(1)
  })

  it('does not start while held, and runs once let go, when idle', () => {
    const { g, runs, later } = gate()
    void g.hold()
    g.start()
    expect(runs).toHaveLength(0)
    g.release()
    expect(runs).toHaveLength(0)
    later.shift()?.()
    expect(runs).toHaveLength(1)
  })

  it('is told to stop when held as it runs, and holding waits for it to stop', async () => {
    const { g, runs } = gate()
    g.start()
    expect(runs[0]!.held()).toBe(false)
    let stopped = false
    const held = g.hold().then(() => (stopped = true))
    expect(runs[0]!.held()).toBe(true)
    await Promise.resolve()
    expect(stopped).toBe(false)
    runs[0]!.finish()
    await held
    expect(stopped).toBe(true)
  })

  it('takes up again what was stopped', async () => {
    const { g, runs, later } = gate()
    g.start()
    const held = g.hold()
    runs[0]!.finish()
    await held
    g.release()
    later.shift()?.()
    expect(runs).toHaveLength(2)
  })

  it('does nothing more when let go with nothing waiting', () => {
    const { g, later } = gate()
    void g.hold()
    g.release()
    expect(later).toHaveLength(0)
  })

  it('stays quiet if held again before the idle moment comes', () => {
    const { g, runs, later } = gate()
    void g.hold()
    g.start()
    g.release()
    void g.hold()
    later.shift()?.()
    expect(runs).toHaveLength(0)
    g.release()
    later.shift()?.()
    expect(runs).toHaveLength(1)
  })

  it('a failed run never leaves holding waiting', async () => {
    const g = thinningGate(
      () => Promise.reject(new Error('no')),
      (f) => f(),
    )
    g.start()
    await expect(g.hold()).resolves.toBeUndefined()
  })
})
