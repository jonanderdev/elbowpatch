import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { countWords } from '../../domain/markdown'
import type { Piece } from '../../domain/model'
import type { Deps } from '../../domain/pieces'
import { fillTitleFields, type Opened } from './fields'
import { PageSession, type SelectionState } from './session'

export interface PageRefs {
  screen: RefObject<HTMLDivElement | null>
  viewport: RefObject<HTMLDivElement | null>
  flow: RefObject<HTMLDivElement | null>
  mount: RefObject<HTMLDivElement | null>
  title: RefObject<HTMLHeadingElement | null>
  bookTitle: RefObject<HTMLHeadingElement | null>
  subtitle: RefObject<HTMLParagraphElement | null>
}

interface Options {
  deps: Deps
  opened: Opened
  refs: PageRefs
  readOnly: boolean
  onStored(piece: Piece): void
  /** Lets the app ask the page to save now, before another window takes the piece. */
  flushRef: { current: (() => Promise<void>) | null }
  /** The closing page's last save, so the app lets go of the piece only after it. */
  closingRef: { current: Promise<void> }
}

/**
 * One PageSession per opened section, created before the first paint (so a piece opens at the
 * writer's place, never a frame of page 1 first) and destroyed when another section opens or the
 * page goes. Returns the session and the state the page shows from it.
 */
export function usePageSession({ deps, opened, refs, readOnly, onStored, flushRef, closingRef }: Options) {
  const [session, setSession] = useState<PageSession | null>(null)
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(1)
  const [words, setWords] = useState(() => countWords(opened.content))
  const [failed, setFailed] = useState(false)
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [writing, setWriting] = useState(false)
  const [heading, setHeading] = useState('')
  const [announce, setAnnounce] = useState('')

  // The session reads these when it acts, not when it was made.
  const readOnlyNow = useRef(readOnly)
  readOnlyNow.current = readOnly
  const onStoredNow = useRef(onStored)
  onStoredNow.current = onStored

  useLayoutEffect(() => {
    // The title fields are the page's own text (uncontrolled): filled each time a section opens,
    // so a rename from the library, or Write here, shows the title as stored.
    const fields = { title: refs.title.current, bookTitle: refs.bookTitle.current, subtitle: refs.subtitle.current }
    setHeading(fillTitleFields(opened, fields))
    setWords(countWords(opened.content))
    setFailed(false)
    const s = new PageSession({
      deps,
      opened,
      elements: { ...fields, screen: refs.screen.current!, viewport: refs.viewport.current!, flow: refs.flow.current!, mount: refs.mount.current! },
      readOnly: () => readOnlyNow.current,
      events: {
        pages(page, count, turned) {
          setPage(page)
          setCount(count)
          // A turn is announced; a page added by typing is not (DESIGN.md, Behaviour).
          if (turned) setAnnounce(`Page ${page + 1} of ${count}`)
        },
        words: setWords,
        failed: setFailed,
        selection: setSelection,
        writing: setWriting,
        stored: (piece) => onStoredNow.current(piece),
      },
    })
    setSession(s)
    flushRef.current = () => s.saving.flush()
    return () => {
      flushRef.current = null
      closingRef.current = s.destroy()
    }
    // One session per opened section; the refs and callbacks are read through refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  // Another window took the piece: stop writing here at once.
  useEffect(() => {
    session?.editor.view.setProps({})
  }, [session, readOnly])

  const keep = async () => {
    if (await session?.saving.keep()) setAnnounce('Moment kept')
  }

  return { session, page, count, words, failed, selection, writing, heading, setHeading, announce, keep }
}
