import { useCallback, useState } from 'react'
import { RAIL_WIDTH } from '../../page/pager'
import { update, useSettings } from '../stores/settings'

/** The last layout's answer: each chapter opens a new page, which must not start from a guess and slide. */
let roomLastSeen: boolean | undefined

export interface Rail {
  open: boolean
  toggle(): void
  /** Lets go of a rail opened over the text. A rail beside the text stays. */
  letGo(): void
  /** The text column was laid out, this far from the window's left edge. */
  laidOut(side: number): void
}

/**
 * Whether the rail is open. Open or folded is remembered on this device. Where the window has room for
 * it, it takes its place and the page centres right of it (geometry). Where it has none it starts folded,
 * and opens over the text for this page alone.
 */
export function useRail(): Rail {
  const { railFolded } = useSettings()
  const [room, setRoom] = useState(() => roomLastSeen ?? window.innerWidth >= 1280)
  const [over, setOver] = useState(false)
  const toggle = useCallback(() => {
    if (room) update({ railFolded: !railFolded })
    else setOver((o) => !o)
  }, [room, railFolded])
  const letGo = useCallback(() => setOver(false), [])
  const laidOut = useCallback((side: number) => {
    roomLastSeen = side >= RAIL_WIDTH
    setRoom(roomLastSeen)
  }, [])
  return { open: room ? !railFolded : over, toggle, letGo, laidOut }
}
