export interface ThinningGate {
  /** Thinning's turn has come: it runs, or waits to be let go. */
  start(): void
  /** The Time Machine opens: nothing starts, a run stops at its next piece, and this resolves once it has. */
  hold(): Promise<void>
  /** The Time Machine closed: what waited or was stopped runs when the app is idle. */
  release(): void
}

/**
 * Thinning never runs under a moment on screen (#77). It is safe to run twice, so a run that was stopped
 * is simply run again. Another window's launch can still thin: that cannot be stopped from here.
 */
export function thinningGate(run: (held: () => boolean) => Promise<unknown>, whenIdle: (f: () => void) => void): ThinningGate {
  let held = false
  let waiting = false
  let running: Promise<void> = Promise.resolve()

  const start = (): void => {
    if (held) {
      waiting = true
      return
    }
    waiting = false
    running = run(() => held)
      .catch(() => {})
      .then(() => {
        if (held) waiting = true
      })
  }

  return {
    start,
    hold() {
      held = true
      return running
    },
    release() {
      held = false
      if (waiting) whenIdle(start)
    },
  }
}
