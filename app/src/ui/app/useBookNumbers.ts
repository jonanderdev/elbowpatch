import { useEffect, useRef, useState } from 'react'
import { whenQuiet } from '../../adapters/schedule'
import { type Deps, forgetPages, measureNext } from '../../domain/pieces'
import { fontsFor, measureChapter } from '../../page/measure'
import { screenOf } from '../../page/pager'
import { usePhone } from '../components/usePhone'
import { layoutOf, readLayout, writeLayout } from '../stores/layoutKept'
import { useSettings } from '../stores/settings'
import { layoutWatch } from './layoutWatch'

interface Options {
  deps: Deps
  /** Launched: what is stored is in order, and the fonts are in. */
  ready: boolean
  /** The open piece: its chapters are measured first. */
  openId: string | undefined
  /** The pieces as last read: a change may have brought a chapter with no count. */
  pieces: unknown
  /** A count was kept or forgotten: what shows the numbers reads them again. */
  onCounted(): void
}

/**
 * Keeps every book's page counts known on this screen's page (0003): chapters with no count are measured off
 * screen, one at a time, when the writer has paused and the app is idle. A change to the text settings
 * forgets the counts first, so the numbers stand aside until they are true again.
 */
export function useBookNumbers({ deps, ready, openId, pieces, onCounted }: Options): void {
  const phone = usePhone()
  const layout = layoutOf(useSettings())
  // Read when a measurement runs, long after this render.
  const now = useRef({ openId, onCounted })
  now.current = { openId, onCounted }
  /** Wakes the measuring, if it has stopped. */
  const wake = useRef((): void => {})
  const [watch] = useState(() => layoutWatch({ read: readLayout, write: writeLayout, forget: () => forgetPages(deps) }))

  useEffect(() => {
    if (!ready) return
    let alive = true
    let running = false
    let again = false
    let cancel = (): void => {}

    const step = async (): Promise<void> => {
      const started = watch.generation()
      const more = await measureNext(
        deps,
        screenOf(document.documentElement.clientWidth),
        async (chapter) => {
          await fontsFor(chapter)
          return alive && started === watch.generation() ? measureChapter(chapter) : undefined
        },
        now.current.openId,
      ).catch(() => false)
      if (!alive) return
      if (more) now.current.onCounted()
      if (more || again) {
        again = false
        cancel = whenQuiet(() => void step())
      } else running = false
    }

    wake.current = () => {
      if (running) again = true
      else {
        running = true
        cancel = whenQuiet(() => void step())
      }
    }
    return () => {
      alive = false
      cancel()
      wake.current = () => {}
    }
  }, [deps, ready, watch])

  // The layout changed, here or since the last launch: what is stored was counted at another one.
  useEffect(() => {
    if (!ready) return
    void watch
      .see(layout)
      ?.then(() => now.current.onCounted())
      .catch(() => {})
      .finally(() => wake.current())
  }, [ready, layout, watch])

  // biome-ignore lint/correctness/useExhaustiveDependencies: these are the triggers. Crossing to the other screen's page, or a new piece, may bring chapters with no count.
  useEffect(() => {
    if (ready) wake.current()
  }, [ready, phone, pieces])
}
