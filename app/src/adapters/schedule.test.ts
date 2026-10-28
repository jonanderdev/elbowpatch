import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounced, moments } from './schedule'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('saving the working copy', () => {
  it('saves a second after typing stops', async () => {
    const save = vi.fn(async () => {})
    const s = debounced(save, 1000, 5000)
    s.touch()
    await vi.advanceTimersByTimeAsync(999)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('saves at least every 5 seconds while typing goes on', async () => {
    const save = vi.fn(async () => {})
    const s = debounced(save, 1000, 5000)
    for (let t = 0; t < 12_000; t += 200) {
      s.touch()
      await vi.advanceTimersByTimeAsync(200)
    }
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('flush saves at once, and only if something changed', async () => {
    const save = vi.fn(async () => {})
    const s = debounced(save, 1000, 5000)
    await s.flush()
    expect(save).not.toHaveBeenCalled()
    s.touch()
    await s.flush()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('a change while a save runs gets its own save', async () => {
    let finish!: () => void
    const save = vi.fn(() => new Promise<void>((ok) => (finish = ok)))
    const s = debounced(save, 1000, 5000)
    s.touch()
    await vi.advanceTimersByTimeAsync(1000)
    s.touch()
    const flushed = s.flush()
    finish()
    await vi.advanceTimersByTimeAsync(0)
    finish()
    await flushed
    expect(save).toHaveBeenCalledTimes(2)
  })
})

describe('moments', () => {
  it('takes a moment on a 3 second pause', async () => {
    const take = vi.fn(async () => {})
    const m = moments(take)
    m.touch()
    await vi.advanceTimersByTimeAsync(3000)
    expect(take).toHaveBeenCalledTimes(1)
  })

  it('takes no more than one every 5 minutes while writing', async () => {
    const take = vi.fn(async () => {})
    const m = moments(take)
    // Write in bursts with 4 second pauses for 10 minutes.
    for (let t = 0; t < 10 * 60_000; t += 5000) {
      m.touch()
      await vi.advanceTimersByTimeAsync(5000)
    }
    expect(take.mock.calls.length).toBeLessThanOrEqual(3)
    expect(take.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('always takes one on leaving, however recent the last', async () => {
    const take = vi.fn(async () => {})
    const m = moments(take)
    m.touch()
    await vi.advanceTimersByTimeAsync(3000)
    m.touch()
    await m.flush()
    expect(take).toHaveBeenCalledTimes(2)
  })
})
