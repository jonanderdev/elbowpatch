import { useCallback, useEffect, useRef, useState } from 'react'
import { type Listing, listingOf, type Moment, momentsOf, type Shape, sectionBeyond, shapeAt } from '../../domain/lookBack'
import type { Deps } from '../../domain/pieces'

export type MomentsRead = { state: 'loading' } | { state: 'error' } | { state: 'read'; moments: Moment[] }

export interface Sections {
  /** The section on screen: the one the Time Machine opened on, until a turn or a choice reaches another. */
  sectionId: string
  /** That section's moments. While another is being read, the section on screen stays. */
  read: MomentsRead
  /** A section could not be read when it was reached: the one on screen is as it was, and `again` tries it once more. */
  failed: boolean
  again(): void
  /**
   * Reads the section on screen and the piece's listing again, as stored now: another window's thinning may have taken a moment
   * the tape still shows. Resolves with what it found, which the tape shows from then on; rejects, changing nothing, if it cannot.
   */
  reread(): Promise<Moment[]>
  /** The piece's outline at that time: its title page and its sections, which are what Contents lists. None until it is read. */
  shape(at: number | undefined): Shape | undefined
  /** The section a turn past this one's end reaches at that time, or none. */
  beyond(dir: 1 | -1, at: number | undefined): string | undefined
  /**
   * Stands on this section: read first if it has not been, then shown, so no frame holds the new section
   * with the old one's moments. `then` runs just before, to move what else follows it (the time, the page).
   * Ignored while another is being reached.
   */
  reach(sectionId: string, then?: () => void): void
}

/**
 * The sections the Time Machine stands on, one at a time and read as they are reached (a year of journal is not
 * read at once), once `ready` is done: the page's last save and the moment it takes, so now is a version. A save
 * that failed is no reason not to read: the working copy still says what now is. What each section held is fixed
 * while the Time Machine is open (nothing is written, thinning is held), so a section read stays read.
 */
export function useSections(deps: Pick<Deps, 'store'>, pieceId: string, first: string, ready: Promise<unknown>): Sections {
  const [sectionId, setSectionId] = useState(first)
  const [read, setRead] = useState<MomentsRead>({ state: 'loading' })
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(0)
  /** What the piece listed over time, small, read with the first section: it says which sections a turn reaches. */
  const listing = useRef<Listing | undefined>(undefined)
  /** Sections already read. */
  const known = useRef(new Map<string, Moment[]>())
  /** The reach in hand, or the last one that failed. */
  const reaching = useRef<{ sectionId: string; then?: () => void } | undefined>(undefined)
  const busy = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tries` is the trigger: each try reads again.
  useEffect(() => {
    let current = true
    void (async () => {
      await ready.catch(() => {})
      const [moments, found] = await Promise.all([momentsOf(deps, pieceId, first), listingOf(deps, pieceId)])
      listing.current = found
      known.current.set(first, moments)
      if (current) setRead({ state: 'read', moments })
    })().catch(() => {
      if (current) setRead({ state: 'error' })
    })
    return () => {
      current = false
    }
  }, [deps, pieceId, first, ready, tries])

  const reach = useCallback(
    (to: string, then?: () => void): void => {
      if (busy.current) return
      busy.current = true
      reaching.current = { sectionId: to, ...(then && { then }) }
      void (async () => {
        try {
          const moments = known.current.get(to) ?? (await momentsOf(deps, pieceId, to))
          known.current.set(to, moments)
          if (!alive.current) return
          then?.()
          setSectionId(to)
          setRead({ state: 'read', moments })
          setFailed(false)
        } catch {
          if (alive.current) setFailed(true)
        } finally {
          busy.current = false
        }
      })()
    },
    [deps, pieceId],
  )

  const again = useCallback((): void => {
    const last = reaching.current
    if (failed && last) {
      reach(last.sectionId, last.then)
      return
    }
    setRead({ state: 'loading' })
    setTries((n) => n + 1)
  }, [failed, reach])

  const reread = useCallback(async (): Promise<Moment[]> => {
    const [moments, found] = await Promise.all([momentsOf(deps, pieceId, sectionId), listingOf(deps, pieceId)])
    if (alive.current) {
      listing.current = found
      // The others are read again as they are reached.
      known.current.clear()
      known.current.set(sectionId, moments)
      setRead({ state: 'read', moments })
    }
    return moments
  }, [deps, pieceId, sectionId])

  // The listing is in hand once the first section is read, and stays: it is small, and fixed while the Time Machine is open.
  const shape = (at: number | undefined): Shape | undefined => (listing.current && at !== undefined ? shapeAt(listing.current, at) : undefined)
  const beyond = (dir: 1 | -1, at: number | undefined): string | undefined => {
    const found = shape(at)
    return found && sectionBeyond(found.sections, sectionId, dir)
  }

  return { sectionId, read, failed, again, reread, shape, beyond, reach }
}
