import { useRef, useState } from 'react'
import type { Moment } from '../../domain/lookBack'

export interface KeepCopy {
  /** The moment whose copy could not be made: the bar says so and offers *Try again*. */
  failed: Moment | null
  /** Keeps a copy of this moment, once at a time. */
  keep(moment: Moment): void
}

/**
 * Keeping a copy of the moment on screen. `make` opens the copy and leaves the Time Machine, or rejects
 * with nothing made. A press while one is under way, or after one was made, does nothing, so a double press makes one copy.
 */
export function useKeepCopy(make: (moment: Moment) => Promise<void>): KeepCopy {
  const [failed, setFailed] = useState<Moment | null>(null)
  /** A copy is being made: read by the next press, never shown. */
  const busy = useRef(false)

  const keep = (moment: Moment): void => {
    if (busy.current) return
    busy.current = true
    // Once made, it stays busy: the screen is on its way out, and a press in that gap would make a second copy.
    make(moment).catch(() => {
      busy.current = false
      setFailed(moment)
    })
  }

  return { failed, keep }
}
