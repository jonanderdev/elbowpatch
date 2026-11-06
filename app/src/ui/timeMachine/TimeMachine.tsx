import { type ReactElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Moment, momentToOpen } from '../../domain/lookBack'
import type { Piece } from '../../domain/model'
import { momentInSentence } from '../../domain/momentInSentence'
import type { Deps } from '../../domain/pieces'
import { momentName, momentShort, pageLine } from '../../domain/words'
import { type Crumb, Path } from '../components/Path'
import { useScrolled } from '../components/useScrolled'
import { usePager } from '../page/usePager'
import { usePageTurns } from '../page/usePageTurns'
import { useSettings } from '../stores/settings'
import { ErrorBar, LoadingBar, MomentsBar, NothingEarlierBar } from './MomentBar'
import { EmptyTape, Tape } from './Tape'
import { useKeepCopy } from './useKeepCopy'
import { useMoments } from './useMoments'
import { useReader } from './useReader'

/** What the page held as the Time Machine opened: it stays on screen until moments are read, and if they cannot be. */
export interface Today {
  content: string
  /** The section's title. */
  title: string
  /** A book's or journal's name. */
  name: string
}

/** Where the Time Machine stands: a section of a piece, from a page that was open on it. */
export interface Looking {
  piece: Piece
  sectionId: string
  today: Today
  /** Done once the page has saved and taken its moment, and thinning has stopped. */
  ready: Promise<unknown>
}

/** One section at one moment, to be brought back: the words are what the writer saw there. */
export interface BringBackRequest {
  sectionId: string
  at: number
  content: string
}

interface Props {
  deps: Pick<Deps, 'store' | 'clock'>
  looking: Looking
  /**
   * Brings the section on screen back to the moment on screen, and closes onto the page with `line` at its foot.
   * Settles once that is done; rejects with everything as it was. Left out, the action does nothing yet.
   */
  onBringBack?(request: BringBackRequest, line: string): Promise<void>
  /** A copy of this moment, opened as a new essay with this line at its foot; rejects with nothing made. */
  onKeepCopy(moment: Moment, line: string): Promise<void>
  /** Back to now, at the same place. */
  onBack(): void
  /** § goes home, from here too. */
  onHome(): void
}

const NEVER = (): undefined => undefined
const NOTHING = (): void => {}

/**
 * The Time Machine (DESIGN.md): a section as it was at one moment, on a shorter page above the moment bar.
 * It stands over the page, which stays as it was left. It writes nothing: no text, no place, no page counts.
 */
export function TimeMachine({ deps, looking, onBringBack, onKeepCopy, onBack, onHome }: Props): ReactElement {
  const { piece, sectionId, today, ready } = looking
  const { read, again } = useMoments(deps, piece.id, sectionId, ready)
  /** The time it stands at, once the writer has moved: it opens on the most recent moment that differs from now. */
  const [chosen, setChosen] = useState<number | undefined>(undefined)
  /** The announcement a change of moment was said over: the next turn is said over it. */
  const [saidOver, setSaidOver] = useState('')
  const settings = useSettings()
  const now = deps.clock.now()
  const copy = useKeepCopy((m) => onKeepCopy(m, `A copy of ${momentInSentence(m.at, now)}, kept as a new essay.`))

  const moments = read.state === 'read' ? read.moments : []
  const stands = chosen ?? momentToOpen(moments)?.at
  const index = stands === undefined ? -1 : moments.findLastIndex((m) => m.at <= stands)
  const moment = moments[index]
  const nothing = read.state === 'read' && !moment
  const content = moment?.content ?? today.content
  const title = moment?.title ?? today.title

  const screen = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const flow = useRef<HTMLDivElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const tape = useRef<HTMLDivElement>(null)
  const noBookTitle = useRef<HTMLHeadingElement>(null)

  // Before the pager, so its first layout already has the text.
  const reader = useReader(mount, today.content, piece.lang)
  const { pager, page, announcement } = usePager({
    screen,
    viewport,
    flow,
    columns: mount,
    kind: piece.kind,
    settings,
    keyboard: false,
    short: !nothing,
    onRelayout: NOTHING,
    say: (at, total) => pageLine(at + 1, total) || 'Page turned',
  })
  usePageTurns({
    screen,
    viewport,
    bookTitle: noBookTitle,
    editor: reader,
    pager,
    covered: false,
    readOnly: true,
    onTurn: NOTHING,
    beyond: NEVER,
    onCross: NOTHING,
  })

  // Before paint, so the words of one moment never stand on the pages of another.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new title's height moves the page breaks too.
  useLayoutEffect(() => {
    reader?.show(content)
    pager?.measure()
  }, [reader, pager, content, title])

  // A bring back under way: the way out waits for it, so a page it is about to replace is never left under way.
  const working = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const leave = (): void => {
    if (!working.current) onBack()
  }
  const home = (): void => {
    if (!working.current) onHome()
  }

  // Read when a key comes; re-attached on each render, an Escape could reach the listener from before it.
  const back = useRef(leave)
  back.current = leave
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Already answered: the rail lets go of the focus first.
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      back.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The focus comes into the bar with the page gone inert: the way out is there in every state.
  useEffect(() => {
    screen.current?.querySelector<HTMLElement>('.moment-close button')?.focus()
  }, [])
  // The tape takes it as it arrives, so ← steps at once, unless the writer has moved on.
  const hasTape = !!moment
  useEffect(() => {
    const active = document.activeElement
    if (hasTape && (!active || active === document.body || active.closest('.moment-close'))) tape.current?.focus()
  }, [hasTape])

  const step = (next: number): void => {
    setChosen(moments[next]?.at)
    setSaidOver(announcement)
  }

  const scrolled = useScrolled()
  const word = (piece.kind === 'essay' ? title : today.name).trim() || 'Untitled'
  const crumbs: Crumb[] = moment ? [{ word, onClick: leave }, { word: momentShort(moment.at, now) }] : [{ word, onClick: leave }]
  const heading = title.trim() || 'Untitled'
  // A copy waits while a bring back runs: two ways out of the Time Machine at once would fight over the page.
  const keepCopy = (): void => {
    if (moment && !working.current) copy.keep(moment)
  }
  const bringBack = (): void => {
    if (!moment || !onBringBack || working.current) return
    working.current = true
    setBusy(true)
    setFailed(false)
    // An essay has no rest: the line says what is kept instead (DESIGN.md).
    const line = `Brought back from ${momentInSentence(moment.at, now)}. Today’s text is kept as a moment.`
    onBringBack({ sectionId, at: moment.at, content: moment.content }, line).then(
      () => {
        working.current = false
      },
      () => {
        working.current = false
        if (!alive.current) return
        setBusy(false)
        setFailed(true)
      },
    )
  }
  const said = moment && saidOver === announcement ? momentName(moment.at, now) : announcement

  return (
    <div
      ref={screen}
      className={piece.kind === 'journal' ? 'page-screen time-machine journal' : 'page-screen time-machine'}
      data-kind={piece.kind}
      data-nothing={nothing || undefined}
    >
      <div className="head" data-scrolled={scrolled || undefined}>
        <div className="head-path">
          <Path crumbs={crumbs} onHome={home} />
        </div>
        {/* As on the writing page, an essay's first page has none: its title stands there. A book's and a journal's keep theirs. */}
        {piece.kind !== 'essay' || page > 0 ? <div className="running-head">{heading}</div> : null}
      </div>

      <div ref={viewport} className="pager">
        <div ref={flow} className="flow" lang={piece.lang}>
          <h1 className="title" data-placeholder="Untitled" data-empty={title === '' || undefined}>
            {title}
          </h1>
          <div ref={mount} />
        </div>
      </div>

      {read.state === 'error' ? (
        <ErrorBar line="Can’t read your moments right now. Your words are still here." onAgain={again} onBack={leave} />
      ) : read.state === 'loading' ? (
        <LoadingBar kind={piece.kind} tape={<EmptyTape />} onBack={leave} />
      ) : copy.failed ? (
        <ErrorBar line="Couldn’t keep a copy just now. Nothing has changed." onAgain={() => copy.keep(copy.failed!)} onBack={leave} />
      ) : moment && failed && !busy ? (
        <ErrorBar line="Couldn’t bring that back just now. Nothing has changed." onAgain={bringBack} onBack={leave} />
      ) : moment ? (
        <MomentsBar
          kind={piece.kind}
          name={momentName(moment.at, now)}
          tape={<Tape moments={moments} index={index} now={now} tapeRef={tape} onMoment={step} />}
          {...(onBringBack ? { onBringBack: bringBack } : {})}
          busy={busy}
          onKeepCopy={keepCopy}
          onBack={leave}
        />
      ) : (
        <NothingEarlierBar onBack={leave} />
      )}

      <div className="visually-hidden" aria-live="polite">
        {said}
      </div>
    </div>
  )
}
