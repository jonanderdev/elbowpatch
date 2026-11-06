import { useCallback, useEffect, useRef, useState } from 'react'
import type { Piece } from '../../domain/model'
import type { Looking, Today } from '../timeMachine/TimeMachine'
import type { ThinningGate } from './thinningGate'

export interface TimeMachineState {
  looking: Looking | null
  open(piece: Piece, sectionId: string, today: Today): void
  /** Back to now; `then` runs once the Time Machine's history entry is gone. */
  leave(then?: () => void): void
}

/**
 * Whether the Time Machine is open. It has no URL, but it has a history entry (0011), so Android's back
 * and the browser's close it. Opening holds thinning, then saves the page, which takes the moment now
 * is read from: the screen shows at once, and reads when that is done (`ready`).
 */
export function useTimeMachine(thinning: ThinningGate, saveFirst: () => Promise<unknown>): TimeMachineState {
  const [looking, setLooking] = useState<Looking | null>(null)
  /** Open now: read in the listener, which stays on so no back press falls between two renders. */
  const isOpen = useRef(false)
  const afterLeaving = useRef<(() => void) | undefined>(undefined)

  const closed = useCallback((): void => {
    if (!isOpen.current) return
    isOpen.current = false
    setLooking(null)
    thinning.release()
    const then = afterLeaving.current
    afterLeaving.current = undefined
    then?.()
  }, [thinning])

  useEffect(() => {
    window.addEventListener('popstate', closed)
    return () => window.removeEventListener('popstate', closed)
  }, [closed])

  const open = (piece: Piece, sectionId: string, today: Today): void => {
    if (isOpen.current) return
    isOpen.current = true
    history.pushState({ timeMachine: true }, '')
    setLooking({ piece, sectionId, today, ready: Promise.all([thinning.hold(), saveFirst()]) })
  }

  const leave = (then?: () => void): void => {
    // Already closed (the browser's back, mid-action): there is no entry to wait for, and `then` must still run.
    if (!isOpen.current) {
      then?.()
      return
    }
    afterLeaving.current = then
    // Only our own entry: going back from any other would leave the page.
    if (history.state?.timeMachine) history.back()
    else closed()
  }

  return { looking, open, leave }
}
