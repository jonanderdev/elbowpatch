// When things are saved: timers live here, not in the domain (docs/decisions/0009).

export interface Scheduled {
  /** Something changed. */
  touch(): void
  /** Run now if anything is waiting (leaving, hiding, switching pieces). */
  flush(): Promise<void>
  cancel(): void
}

/**
 * Runs `task` once changes pause for `idle` ms, and at least every `max` ms
 * while they go on. One run at a time; a change during a run schedules another.
 */
export function debounced(task: () => Promise<void>, idle: number, max: number): Scheduled {
  let timer: ReturnType<typeof setTimeout> | undefined
  let firstChange: number | undefined
  let running: Promise<void> | undefined
  let pending = false

  const run = async (): Promise<void> => {
    clearTimeout(timer)
    timer = undefined
    if (!pending) return running
    if (running) {
      await running
      return run()
    }
    pending = false
    firstChange = undefined
    running = task()
      .catch((error) => {
        // Not saved: still waiting, so the next touch or flush tries again.
        pending = true
        throw error
      })
      .finally(() => (running = undefined))
    return running
  }

  return {
    touch() {
      pending = true
      const now = Date.now()
      firstChange ??= now
      clearTimeout(timer)
      // A run the timer starts reports its own failure (the caller's task does); nothing is left unhandled.
      timer = setTimeout(() => void run().catch(() => {}), Math.max(0, Math.min(idle, firstChange + max - now)))
    },
    flush: run,
    cancel() {
      clearTimeout(timer)
      pending = false
    },
  }
}

/**
 * Moments (docs/decisions/0005): after `idle` ms without typing, but no more
 * than one every `every` ms while writing. `flush` takes one at once, for blur,
 * hiding, closing and switching pieces.
 */
export function moments(take: () => Promise<unknown>, idle: number = 3000, every: number = 5 * 60_000): Scheduled {
  let timer: ReturnType<typeof setTimeout> | undefined
  let last = -Infinity
  let pending = false

  const run = async () => {
    clearTimeout(timer)
    timer = undefined
    if (!pending) return
    pending = false
    last = Date.now()
    await take()
  }

  return {
    touch() {
      pending = true
      clearTimeout(timer)
      const wait = Math.max(idle, last + every - Date.now())
      timer = setTimeout(() => void run().catch(() => {}), wait)
    },
    flush: run,
    cancel() {
      clearTimeout(timer)
      pending = false
    },
  }
}
