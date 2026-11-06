import { type ReactElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Day } from '../../domain/days'
import { type Moment, momentToOpen, readingAt, timeOf } from '../../domain/lookBack'
import type { Piece } from '../../domain/model'
import { momentInSentence } from '../../domain/momentInSentence'
import type { ContentsChapter, Deps } from '../../domain/pieces'
import { dayTitle, isoDay, momentName, momentShort, pageLine } from '../../domain/words'
import { type Crumb, Path } from '../components/Path'
import { usePhone } from '../components/usePhone'
import { useScrolled } from '../components/useScrolled'
import { ContentsRail, ContentsSheet, RailToggle, RunningHeadControl } from '../page/Contents'
import { DaysRail, DaysSheet } from '../page/Days'
import { usePager } from '../page/usePager'
import { usePageTurns } from '../page/usePageTurns'
import { useRail } from '../page/useRail'
import { useSettings } from '../stores/settings'
import { ErrorBar, LoadingBar, MomentsBar, NothingEarlierBar } from './MomentBar'
import { OldTitlePage } from './OldTitlePage'
import { EmptyTape, Tape } from './Tape'
import { useContentsAsItWas } from './useContentsAsItWas'
import { useContentsSheet } from './useContentsSheet'
import { useDaysAsItWas } from './useDaysAsItWas'
import { useKeepCopy } from './useKeepCopy'
import { useReader } from './useReader'
import { useSections } from './useSections'

/** What the page held as the Time Machine opened: it stays on screen until moments are read, and if they cannot be. */
export interface Today {
  content: string
  /** The section's title. */
  title: string
  /** A book's or journal's name. */
  name: string
  /** A book's subtitle. */
  subtitle?: string
  /** A book's Contents as the page showed it: what stands in the rail and the sheet until moments are read. */
  contents?: { chapters: ContentsChapter[]; pages?: number }
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

const NOTHING = (): void => {}
/** The past is read-only: no chapter can be removed from it. */
const NONE: ReadonlySet<string> = new Set()

/**
 * The Time Machine (DESIGN.md): a section as it was at one moment, on a shorter page above the moment bar.
 * It stands over the page, which stays as it was left. It writes nothing: no text, no place, no page counts.
 */
export function TimeMachine({ deps, looking, onBringBack, onKeepCopy, onBack, onHome }: Props): ReactElement {
  const { piece, today, ready } = looking
  /** The section on screen: the page's own until a turn reaches another, at the same time. */
  const sections = useSections(deps, piece.id, looking.sectionId, ready)
  const { sectionId, read, again } = sections
  const opened = sectionId === looking.sectionId
  /** The time it stands at, once the writer has moved: it opens on the most recent moment that differs from now. */
  const [chosen, setChosen] = useState<number | undefined>(undefined)
  /** The announcement a change of moment was said over: the next turn is said over it. */
  const [saidOver, setSaidOver] = useState('')
  /** The announcement a turn into another section was said over, which says which section. */
  const [crossedOver, setCrossedOver] = useState<string | undefined>(undefined)
  /** Which page a section reached by a turn opens on: its first going on, its last coming back. */
  const arrive = useRef<'first' | 'last' | 'opening' | undefined>(undefined)
  /** The page has been laid out once: a journal's first day opens on its day, not its title page. */
  const landed = useRef(false)
  const settings = useSettings()
  const phone = usePhone()
  const book = piece.kind === 'book'
  const journal = piece.kind === 'journal'
  const essay = piece.kind === 'essay'
  /** A book's Contents or a journal's Days stands beside the page, as the rail; an essay has none. */
  const railed = (book || journal) && !phone
  const rail = useRail()
  const sheet = useContentsSheet()
  const now = deps.clock.now()
  const copy = useKeepCopy((m) => onKeepCopy(m, `A copy of ${momentInSentence(m.at, now)}, kept as a new essay.`))

  const moments = read.state === 'read' ? read.moments : []
  const stands = chosen ?? momentToOpen(moments)?.at
  /** The piece's outline at that time: the title page's words and the chapters Contents lists. */
  const shape = sections.shape(stands)
  const here = shape?.sections.find((s) => s.sectionId === sectionId)?.title ?? ''
  // A section reached by a turn was listed at this time: with no moment yet it reads as empty.
  const reading = readingAt(moments, stands, piece.kind === 'essay' ? (shape?.title ?? '') : piece.kind === 'journal' ? dayTitle(here) : here)
  const index = reading.index
  const moment = moments[index]
  const nothing = opened && read.state === 'read' && !moment
  const content = moment ? reading.content : opened ? today.content : ''
  const title = moment ? reading.title : opened ? today.title : ''
  /** Standing at a moment, so what stands beside the page is of that moment, not today's. */
  const asItWas = !!moment && !!shape
  const sectionList = shape?.sections
  /** A book or a journal opens on a title page, as on the writing page: its name, then the first chapter or day on the next. */
  const titlePage = !essay && (asItWas ? sectionList?.[0]?.sectionId === sectionId : piece.sections[0]?.sectionId === sectionId)
  const bookName = asItWas ? shape.title : today.name
  const subtitle = (asItWas ? shape.subtitle : today.subtitle) ?? ''

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
    onRelayout: (p) => rail.laidOut(p.g.side),
    say: (at, total) => pageLine(at + 1, total) || 'Page turned',
  })
  // A turn past the section's end reaches the one next to it as it was at this time, and stays at this time.
  function cross(dir: 1 | -1): void {
    const to = sections.beyond(dir, stands)
    if (to === undefined || stands === undefined) return
    sections.reach(to, () => {
      arrive.current = dir > 0 ? 'first' : 'last'
      setChosen(stands)
      setCrossedOver(announcement)
    })
  }

  // A chapter chosen in Contents opens at its opening page, at the same time.
  function openChapter(to: string): void {
    sheet.close()
    rail.letGo()
    if (stands === undefined) return
    if (to === sectionId) {
      pager?.turnTo(titlePage ? 1 : 0)
      return
    }
    sections.reach(to, () => {
      arrive.current = 'opening'
      setChosen(stands)
      setCrossedOver(announcement)
    })
  }

  const list =
    useContentsAsItWas(
      deps,
      piece,
      book && asItWas ? sectionList : undefined,
      stands,
      phone ? 'phone' : 'desktop',
      book && asItWas && (phone ? sheet.open : rail.open),
    ) ?? today.contents
  /** A journal's days as that moment listed them, once their words are read: nothing is marked as today. */
  const days = useDaysAsItWas(deps, journal && asItWas ? sectionList : undefined, stands, journal && asItWas && (phone ? sheet.open : rail.open))
  const dayOpen = days?.find((d) => d.sectionId === sectionId)?.iso ?? ''
  /** The last day that can be reached: the moment's own, so every later day recedes. */
  const lastDay = isoDay(new Date(Math.min(stands ?? now, now)))
  const openDay = (day: Day): void => {
    if (day.sectionId) openChapter(day.sectionId)
  }

  usePageTurns({
    screen,
    viewport,
    bookTitle: noBookTitle,
    editor: reader,
    pager,
    covered: false,
    readOnly: true,
    onTurn: NOTHING,
    beyond: (dir) => sections.beyond(dir, stands),
    onCross: cross,
  })

  // Before paint, so the words of one moment never stand on the pages of another.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new title's height moves the page breaks too, and a section reached opens on its own page even when its words read the same.
  useLayoutEffect(() => {
    // Reaching a section is no page turn, and says its title instead: the page it lands on is not announced.
    // A journal never opens on its title page (DESIGN.md, The journal): as on the page, it opens on the day, and the title page is a turn back.
    const landing = pager && !landed.current && journal && titlePage ? 'opening' : undefined
    if (pager) landed.current = true
    const arriving = arrive.current ?? landing
    if (pager && arriving) pager.opening = true
    reader?.show(content)
    pager?.measure()
    if (pager && arriving) {
      pager.turnTo(arriving === 'last' ? pager.count - 1 : arriving === 'opening' && titlePage ? 1 : 0)
      pager.opening = false
    }
    arrive.current = undefined
  }, [reader, pager, content, title, sectionId, titlePage])

  // A bring back under way: the way out waits for it, so a page it is about to replace is never left under way.
  const working = useRef(false)
  const [busy, setBusy] = useState(false)
  const [bringFailed, setBringFailed] = useState(false)
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
    setChosen(timeOf(moments, next))
    setSaidOver(announcement)
    setCrossedOver(undefined)
  }

  const scrolled = useScrolled()
  const railToggle = useRef<HTMLButtonElement>(null)
  const word = (piece.kind === 'essay' ? title : today.name).trim() || 'Untitled'
  const crumbs: Crumb[] = moment ? [{ word, onClick: leave }, { word: momentShort(moment.at, now) }] : [{ word, onClick: leave }]
  const heading = title.trim() || 'Untitled'
  // A copy waits while a bring back runs: two ways out of the Time Machine at once would fight over the page.
  const keepCopy = (): void => {
    // What is on screen: a section with no moment yet reads as empty.
    if (moment && !working.current) copy.keep({ ...moment, content: reading.content, title: reading.title })
  }
  const bringBack = (): void => {
    if (!moment || !onBringBack || working.current) return
    working.current = true
    setBusy(true)
    setBringFailed(false)
    // An essay has no rest: the line says what is kept instead. A day says the rest of the journal is as it was (DESIGN.md).
    const from = momentInSentence(moment.at, now)
    const line =
      piece.kind === 'journal'
        ? `${title.trim() || 'This day'} brought back from ${from}. The rest of the journal is as it was.`
        : `Brought back from ${from}. Today’s text is kept as a moment.`
    onBringBack({ sectionId, at: moment.at, content: moment.content }, line).then(
      () => {
        working.current = false
      },
      () => {
        working.current = false
        if (!alive.current) return
        setBusy(false)
        setBringFailed(true)
      },
    )
  }
  const said = crossedOver === announcement ? heading : moment && saidOver === announcement ? momentName(moment.at, now) : announcement

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
          {railed ? <RailToggle label={journal ? 'Days' : 'Contents'} open={rail.open} onToggle={rail.toggle} buttonRef={railToggle} /> : null}
        </div>
        {/* In the head, so the toggle's next stop is what it opens. As on the page, the rail never offers to add or remove. */}
        {book && !phone && list ? (
          <ContentsRail
            chapters={list.chapters}
            {...(list.pages !== undefined && { pages: list.pages })}
            current={sectionId}
            removable={NONE}
            still={!asItWas}
            open={rail.open}
            onOpen={openChapter}
            onRemove={NOTHING}
            onLeave={() => {
              rail.letGo()
              railToggle.current?.focus()
            }}
          />
        ) : journal && !phone && days ? (
          <DaysRail
            days={days}
            current={dayOpen}
            open={rail.open}
            onOpen={openDay}
            onLeave={() => {
              rail.letGo()
              railToggle.current?.focus()
            }}
          />
        ) : null}
        {/* As on the writing page, an essay's first page has none: its title stands there, and it is no control. A book's
            and a journal's keep theirs on every page. On a phone a book's opens Contents as it was; the book's name stands
            there while the title page and the chapter's opening page carry the chapter's own. */}
        {book && phone ? (
          <RunningHeadControl title={page <= (titlePage ? 1 : 0) ? bookName : heading} label="Contents" open={sheet.open} onOpen={sheet.toggle} />
        ) : journal && phone ? (
          // A day's page carries its date, the title page the journal's name; either way Days is one tap away.
          <RunningHeadControl title={titlePage && page === 0 ? bookName : heading} label="Days" open={sheet.open} onOpen={sheet.toggle} />
        ) : piece.kind !== 'essay' || page > 0 ? (
          <div className="running-head">{heading}</div>
        ) : null}
      </div>

      <div ref={viewport} className="pager">
        <div ref={flow} className="flow" lang={piece.lang} data-title-page={titlePage || undefined}>
          {titlePage ? <OldTitlePage name={bookName} subtitle={subtitle} /> : null}
          <h1 className={titlePage ? 'title chapter-opening' : 'title'} data-placeholder="Untitled" data-empty={title === '' || undefined}>
            {title}
          </h1>
          <div ref={mount} />
        </div>
      </div>

      {book && phone && sheet.open && list ? (
        <ContentsSheet
          chapters={list.chapters}
          {...(list.pages !== undefined && { pages: list.pages })}
          name={bookName}
          current={sectionId}
          removable={NONE}
          still={!asItWas}
          takeFocus={sheet.byKey}
          onOpen={openChapter}
          onRemove={NOTHING}
          onDone={sheet.close}
        />
      ) : null}

      {journal && phone && sheet.open && days ? (
        <DaysSheet days={days} current={dayOpen} last={lastDay} from="head" takeFocus={sheet.byKey} onOpen={openDay} onDone={sheet.close} />
      ) : null}

      {read.state === 'error' || sections.failed ? (
        <ErrorBar line="Can’t read your moments right now. Your words are still here." onAgain={again} onBack={leave} />
      ) : read.state === 'loading' ? (
        <LoadingBar kind={piece.kind} tape={<EmptyTape />} onBack={leave} />
      ) : copy.failed ? (
        <ErrorBar line="Couldn’t keep a copy just now. Nothing has changed." onAgain={() => copy.keep(copy.failed!)} onBack={leave} />
      ) : moment && bringFailed && !busy ? (
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
