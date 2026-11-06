import { type ReactElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { momentToOpen } from '../../domain/lookBack'
import { countWords } from '../../domain/markdown'
import type { Piece } from '../../domain/model'
import type { Deps } from '../../domain/pieces'
import { momentName, momentShort, pageLine } from '../../domain/words'
import { type Crumb, Path } from '../components/Path'
import { usePhone } from '../components/usePhone'
import { useScrolled } from '../components/useScrolled'
import { RailToggle } from '../page/Contents'
import { PagesRail } from '../page/PagesRail'
import { usePageOpenings } from '../page/usePageOpenings'
import { usePager } from '../page/usePager'
import { usePageTurns } from '../page/usePageTurns'
import { useRail } from '../page/useRail'
import { useSettings } from '../stores/settings'
import { ErrorBar, LoadingBar, MomentsBar, NothingEarlierBar } from './MomentBar'
import { EmptyTape, Tape } from './Tape'
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

interface Props {
  deps: Pick<Deps, 'store' | 'clock'>
  looking: Looking
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
export function TimeMachine({ deps, looking, onBack, onHome }: Props): ReactElement {
  const { piece, sectionId, today, ready } = looking
  const { read, again } = useMoments(deps, piece.id, sectionId, ready)
  /** The time it stands at, once the writer has moved: it opens on the most recent moment that differs from now. */
  const [chosen, setChosen] = useState<number | undefined>(undefined)
  /** The announcement a change of moment was said over: the next turn is said over it. */
  const [saidOver, setSaidOver] = useState('')
  const settings = useSettings()
  const now = deps.clock.now()

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
  const railToggle = useRef<HTMLButtonElement>(null)
  const rail = useRail()
  const phone = usePhone()
  /** An essay's pages are the rail on desktop, as on its page: the pages of what is on screen here. */
  const pagesRailed = piece.kind === 'essay' && !phone

  // Before the pager, so its first layout already has the text.
  const reader = useReader(mount, today.content, piece.lang)
  const { pager, page, laidOut, announcement } = usePager({
    screen,
    viewport,
    flow,
    columns: mount,
    kind: piece.kind,
    settings,
    keyboard: false,
    short: !nothing,
    onRelayout: (p) => rail.laidOut(p.g.side),
    say: (at, total) => pageLine(at + 1, total) || 'Page turned',
  })
  const openings = usePageOpenings(pager, mount, pagesRailed && rail.open)
  const turnTo = usePageTurns({
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

  // Read when a key comes; re-attached on each render, an Escape could reach the listener from before it.
  const back = useRef(onBack)
  back.current = onBack
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
  const crumbs: Crumb[] = moment ? [{ word, onClick: onBack }, { word: momentShort(moment.at, now) }] : [{ word, onClick: onBack }]
  const heading = title.trim() || 'Untitled'
  const said = moment && saidOver === announcement ? momentName(moment.at, now) : announcement

  return (
    <div
      ref={screen}
      className={piece.kind === 'journal' ? 'page-screen time-machine journal' : 'page-screen time-machine'}
      data-nothing={nothing || undefined}
    >
      <div className="head" data-scrolled={scrolled || undefined}>
        <div className="head-path">
          <Path crumbs={crumbs} onHome={onHome} />
          {pagesRailed ? <RailToggle label="Pages" open={rail.open} onToggle={rail.toggle} buttonRef={railToggle} /> : null}
        </div>
        {pagesRailed ? (
          <PagesRail
            pages={laidOut ? openings : []}
            current={page}
            words={countWords(content)}
            open={rail.open}
            onTurn={turnTo}
            onLeave={() => {
              rail.letGo()
              railToggle.current?.focus()
            }}
          />
        ) : null}
        <div className="running-head">{heading}</div>
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
        <ErrorBar line="Can’t read your moments right now. Your words are still here." onAgain={again} onBack={onBack} />
      ) : read.state === 'loading' ? (
        <LoadingBar kind={piece.kind} tape={<EmptyTape />} onBack={onBack} />
      ) : moment ? (
        <MomentsBar
          kind={piece.kind}
          name={momentName(moment.at, now)}
          tape={<Tape moments={moments} index={index} now={now} tapeRef={tape} onMoment={step} />}
          onBack={onBack}
        />
      ) : (
        <NothingEarlierBar onBack={onBack} />
      )}

      <div className="visually-hidden" aria-live="polite">
        {said}
      </div>
    </div>
  )
}
