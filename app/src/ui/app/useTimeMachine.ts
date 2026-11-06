import { useCallback, useEffect, useRef, useState } from 'react'
import type { Piece } from '../../domain/model'
import { reducedMotion, SCREEN_FADE } from '../timeMachine/motion'
import type { Looking, Today } from '../timeMachine/TimeMachine'
import type { ThinningGate } from './thinningGate'

/** The Time Machine on screen: still there while it fades out, after it has been left. */
export interface OnScreen {
  looking: Looking
  /** Each opening is its own screen, even one that opens as the last is fading. */
  key: number
  leaving: boolean
}

export interface TimeMachineState {
  /** Where it stands; none from the moment it is left. */
  looking: Looking | null
  /** What shows: `looking`, and the screen as it fades out. */
  onScreen: OnScreen | null
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
  const [onScreen, setOnScreen] = useState<OnScreen | null>(null)
  const looking = onScreen && !onScreen.leaving ? onScreen.looking : null
  const opened = useRef(0)
  const fading = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Open now: read in the listener, which stays on so no back press falls between two renders. */
  const isOpen = useRef(false)
  const afterLeaving = useRef<(() => void) | undefined>(undefined)

  const closed = useCallback((): void => {
    if (!isOpen.current) return
    isOpen.current = false
    // The screen fades out over the page, which is already the writer's again.
    if (reducedMotion()) setOnScreen(null)
    else {
      setOnScreen((s) => s && { ...s, leaving: true })
      fading.current = setTimeout(() => setOnScreen(null), SCREEN_FADE)
    }
    thinning.release()
    const then = afterLeaving.current
    afterLeaving.current = undefined
    then?.()
  }, [thinning])

  useEffect(() => {
    window.addEventListener('popstate', closed)
    return () => window.removeEventListener('popstate', closed)
  }, [closed])
  useEffect(() => () => clearTimeout(fading.current), [])

  const open = (piece: Piece, sectionId: string, today: Today): void => {
    if (isOpen.current) return
    isOpen.current = true
    history.pushState({ timeMachine: true }, '')
    clearTimeout(fading.current)
    setOnScreen({ looking: { piece, sectionId, today, ready: Promise.all([thinning.hold(), saveFirst()]) }, key: ++opened.current, leaving: false })
  }

  const leave = (then?: () => void): void => {
    afterLeaving.current = then
    // Only our own entry: going back from any other would leave the page.
    if (history.state?.timeMachine) history.back()
    else closed()
  }

  return { looking, onScreen, open, leave }
}
