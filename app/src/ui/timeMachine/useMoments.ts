import { useCallback, useEffect, useState } from 'react'
import { type Moment, momentsOf } from '../../domain/lookBack'
import type { Deps } from '../../domain/pieces'

export type MomentsRead = { state: 'loading' } | { state: 'error' } | { state: 'read'; moments: Moment[] }

/**
 * A section's moments, read once `ready` is done: the page's last save and the moment it takes, so now is
 * a version. A save that failed is no reason not to read: the working copy still says what now is.
 */
export function useMoments(deps: Pick<Deps, 'store'>, pieceId: string, sectionId: string, ready: Promise<unknown>): { read: MomentsRead; again(): void } {
  const [read, setRead] = useState<MomentsRead>({ state: 'loading' })
  const [tries, setTries] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tries` is the trigger: each try reads again.
  useEffect(() => {
    let alive = true
    void (async () => {
      await ready.catch(() => {})
      const moments = await momentsOf(deps, pieceId, sectionId)
      if (alive) setRead({ state: 'read', moments })
    })().catch(() => {
      if (alive) setRead({ state: 'error' })
    })
    return () => {
      alive = false
    }
  }, [deps, pieceId, sectionId, ready, tries])

  const again = useCallback(() => {
    setRead({ state: 'loading' })
    setTries((n) => n + 1)
  }, [])

  return { read, again }
}
