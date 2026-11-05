import { TextSelection } from 'prosemirror-state'
import { type CSSProperties, type ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { countWords } from '../../domain/markdown'
import type { Piece } from '../../domain/model'
import { type BookCount, bookCount, contents, type Deps, savePages } from '../../domain/pieces'
import { scrollToCaret, showCaret, toOpeningPage } from '../../page/caret'
import { type Editor, selectionBox } from '../../page/editor'
import { screenOf } from '../../page/pager'
import { placeOf } from '../../page/place'
import { keepUndo, takeUndo } from '../../page/undoMemory'
import { settled } from '../app/settled'
import { ExportSheet } from '../components/ExportSheet'
import { Path } from '../components/Path'
import { usePhone } from '../components/usePhone'
import { useScrolled } from '../components/useScrolled'
import { download } from '../files/download'
import { markdownFile } from '../files/markdownFile'
import { useSettings } from '../stores/settings'
import { ContentsRail, ContentsSheet, NewChapter, RailToggle, RunningHeadControl } from './Contents'
import { fillTitleFields, keptFor, type OpenAt, type Opened, type TitleRefs, titleOf } from './fields'
import { PageFoot, StatusLine } from './PageFoot'
import { SectionTitle, TitlePage } from './Titles'
import { HeadTools, pageLine, TextSettings } from './Tools'
import { useCaretFollowing, useCaretKeys } from './useCaret'
import { useChapterStart } from './useChapterStart'
import { useEditor } from './useEditor'
import { raiseKeyboard, useFocusOnOpen } from './useFocusOnOpen'
import { useOpenAtPlace } from './useOpenAtPlace'
import { useOutline } from './useOutline'
import { usePager } from './usePager'
import { usePageTurns } from './usePageTurns'
import { useRail } from './useRail'
import { useRejoin } from './useRejoin'
import { useSaving } from './useSaving'
import { FieldBar, SelectionMenu, useKeyboard, WritingBar } from './Writing'

export type { OpenAt, Opened } from './fields'

interface Props {
  deps: Deps
  opened: Opened
  /** Who writes this piece (0010): until the lock answers, and while another window writes it, nothing changes here. */
  writer: 'waiting' | 'here' | 'elsewhere'
  onWriteHere(): void
  /** Lets the app ask the page to save now, before another window takes the piece. */
  flushRef: { current: (() => Promise<void>) | null }
  /** The closing pages' last saves, so the app lets go of the piece only after them. */
  closingRef: { current: Promise<void> }
  /** The library shows over the page; the page stays laid out behind it, inert. */
  covered: boolean
  /** Changes when a chapter's page count was measured or forgotten, away from this page. */
  counted: number
  onLibrary(): void
  /** Opens another section of this piece, once this one is saved. `writing`: the caret goes with the writer. */
  onOpenSection(sectionId: string, writing: boolean, at: OpenAt): void
  /** Opens a new chapter once this section is saved: at the end of the book, or right after the section given. */
  onNewChapter(after?: string): void
  /** A chapter started in this section's text is stored: it opens, with `content` as its text. */
  onChapterStarted(piece: Piece, sectionId: string, content: string): void
  /** Undo put this chapter back: the chapter before it opens at the join, with `content` as its text. */
  onChapterRejoined(piece: Piece, sectionId: string, content: string): void
  onChange(piece: Piece): void
}

interface SelectionState {
  /** Where a selection is, for the selection menu; null for a caret. */
  rect: DOMRect | null
  active: ReturnType<Editor['active']>
}

/**
 * The writing page: one section of a piece, paged (DESIGN.md, The page). The app makes a new page
 * for each section it opens. Each hook below owns one part; this component lays out the page.
 */
export function Page({
  deps,
  opened,
  writer,
  onWriteHere,
  flushRef,
  closingRef,
  covered,
  counted,
  onLibrary,
  onOpenSection,
  onNewChapter,
  onChapterStarted,
  onChapterRejoined,
  onChange,
}: Props): ReactElement {
  const { piece, sectionId } = opened
  const readOnly = writer !== 'here'
  // A book or a journal opens on its title page: its name, then chapter 1 or the first day on the next page.
  const titlePage = piece.kind !== 'essay' && piece.sections[0]?.sectionId === sectionId
  // A journal day's title is its date.
  const titleEditable = piece.kind !== 'journal' && !readOnly
  // Words kept for this section, newer than what is stored, start the page.
  const [content] = useState(() => keptFor(opened)?.markdown ?? opened.content)
  // The section's undo history, from when its page last closed.
  const [resume] = useState(() => takeUndo(sectionId, content))

  const settings = useSettings()
  const keyboard = useKeyboard()
  const phone = usePhone()
  const book = piece.kind === 'book'
  const live = useOutline(deps, piece, sectionId, counted)
  const rail = useRail()
  /** On a book's page, on desktop: Contents is the rail. Essays and journals have none yet. */
  const railed = book && !phone
  const [tools, setTools] = useState(false)
  const [sheet, setSheet] = useState<'text' | 'export' | 'contents' | null>(null)
  /** Contents was opened by keyboard, so it takes the focus. */
  const [contentsFocus, setContentsFocus] = useState(false)
  const [line, setLine] = useState<string | null>(null)
  const [words, setWords] = useState(() => countWords(content))
  const [heading, setHeading] = useState('')
  // A book's or a journal's name, as on its title page: the desktop path shows it while it is written.
  const [name, setName] = useState(piece.title)
  const [writing, setWriting] = useState(false)
  /** The title field being written in, if any: the writing bar stands for it too. */
  const [field, setField] = useState<HTMLElement | null>(null)
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [kept, setKept] = useState('')
  // Where a sheet opened from the desktop head drops: under its control, right-aligned to it.
  const [anchor, setAnchor] = useState<CSSProperties | undefined>(undefined)

  const screen = useRef<HTMLDivElement>(null)
  /** The page's scroller: it scrolls while the phone keyboard is up (DESIGN.md, Control). */
  const scroller = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const flow = useRef<HTMLDivElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const pageButton = useRef<HTMLButtonElement>(null)
  const railToggle = useRef<HTMLButtonElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const writingBar = useRef<HTMLDivElement>(null)
  // A window smaller than the page scrolls, and the page in its scroller with the keyboard up: either
  // way the head then stands on its strip (DESIGN.md, One head). With the keyboard down the scroller no
  // longer scrolls, and may say nothing as its scroll goes.
  const windowScrolled = useScrolled()
  const pageScrolled = useScrolled(scroller)
  const scrolled = windowScrolled || (keyboard && pageScrolled)
  /** The head's control that opened the sheet: the focus goes back to it when the sheet closes. */
  const opener = useRef<HTMLElement | null>(null)
  const titles: TitleRefs = {
    title: useRef<HTMLHeadingElement>(null),
    bookTitle: useRef<HTMLHeadingElement>(null),
    subtitle: useRef<HTMLParagraphElement>(null),
  }
  // The editor, for what runs outside a render (a save, a relayout).
  const editorNow = useRef<Editor | null>(null)
  /** The writer typed, clicked into the text or turned a page since the last moment: their place is kept. */
  const moved = useRef(false)

  // The title fields are uncontrolled: filled once, before the first paint, from what is stored (or kept).
  const [openedFirst] = useState(opened)
  useLayoutEffect(() => {
    setHeading(fillTitleFields(openedFirst, { title: titles.title.current, bookTitle: titles.bookTitle.current, subtitle: titles.subtitle.current }))
    if (titles.bookTitle.current) setName(titles.bookTitle.current.textContent ?? '')
  }, [openedFirst, titles.title, titles.bookTitle, titles.subtitle])

  // The numbers beside the page, at a page of this section: a book's are the whole book's.
  function numbers(at: number, total: number): BookCount {
    if (!book) return { page: at + 1, pages: total, words }
    return bookCount(live.outline, phone ? 'phone' : 'desktop', { sectionId, title: heading, pages: total, words }, at)
  }

  const { pager, page, count, announcement } = usePager({
    screen,
    viewport,
    flow,
    columns: mount,
    kind: piece.kind,
    settings,
    keyboard,
    onRelayout: (p) => {
      if (editorNow.current) showCaret(editorNow.current.view, p)
      rail.laidOut(p.g.side)
    },
    say: (at, total) => {
      const { page: n, pages } = numbers(at, total)
      return pageLine(n, pages) || 'Page turned'
    },
  })

  const { saving, failed } = useSaving({
    deps,
    opened,
    editor: () => editorNow.current,
    titles,
    readOnly,
    place: () => {
      const e = editorNow.current
      const place = moved.current && e && pager ? placeOf(e.view, sectionId, pager.page, phone ? 'phone' : 'desktop', viewport.current) : undefined
      // Once kept, it stays until they move again: a later save, as the page closes behind the
      // library, would read a page no longer laid out as they left it.
      moved.current = false
      return place
    },
    pages: () => (pager && screen.current ? { screen: screenOf(screen.current.clientWidth), count: pager.count } : null),
    onStored: (stored) => {
      live.stored(stored)
      onChange(stored)
    },
    flushRef,
    closingRef,
  })

  // The count is kept with the piece whenever it changes (a turn of the text settings, a first reading
  // on this kind of screen), so the library shows a book's pages without laying it out (DESIGN.md).
  useEffect(() => {
    if (readOnly || !pager || !screen.current || saving?.sealed()) return
    void savePages(deps, piece.id, screenOf(screen.current.clientWidth), sectionId, count).catch(() => {})
  }, [deps, piece.id, sectionId, count, pager, readOnly, saving])

  const shown = numbers(page, count)

  const caretKeys = useCaretKeys(pager, flow)
  const editor = useEditor(mount, content, piece.lang, resume, {
    editable: () => !readOnly,
    onChange(markdown) {
      moved.current = true
      setWords(countWords(markdown))
      saving?.touch()
      requestAnimationFrame(() => pager?.measure())
    },
    onCaret(view) {
      if (pager) showCaret(view, pager)
      scrollToCaret(view, scroller.current, head.current, writingBar.current)
    },
    onFocusChange(focused) {
      if (focused) moved.current = true
      setWriting(focused)
      const e = editorNow.current
      setSelection(focused && e ? { rect: selectionBox(e.view), active: e.active() } : null)
      if (!focused) void saving?.flush()
    },
    onChapterLine: (at) => chapter.line(at),
    onUndoPast: () => undoPast(),
    onClose(state) {
      // A page split or rejoined holds text that is no longer the section's: its history goes with it.
      if (!saving?.sealed()) keepUndo(sectionId, state)
    },
    onSelection(view, tr) {
      const e = editorNow.current
      if (e) setSelection({ rect: selectionBox(view), active: e.active() })
      caretKeys.onSelection(tr, view.state.selection)
    },
    onKey: caretKeys.onKey,
  })
  editorNow.current = editor

  useCaretFollowing(editor, pager, flow, mount, caretKeys.memory)
  // The keyboard coming up folds the tools bar back into the page button, with any sheet from it.
  // The focus stays in the text.
  useEffect(() => {
    if (!keyboard) return
    setTools(false)
    setSheet(null)
  }, [keyboard])
  // With the keyboard down the page no longer scrolls: it stands at its top again. A selection made
  // while writing goes with the keyboard; the next tap places the caret anew.
  const keyboardWasUp = useRef(false)
  useEffect(() => {
    if (!keyboard && scroller.current) scroller.current.scrollTop = 0
    const view = editorNow.current?.view
    if (!keyboard && keyboardWasUp.current && view && !view.state.selection.empty) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.selection.head)))
      window.getSelection()?.removeAllRanges()
    }
    keyboardWasUp.current = keyboard
  }, [keyboard])
  // As the keyboard comes up, the browser shows the caret just above it, under the writing bar: once
  // the bar has moved with it, the caret is scrolled clear. Only on a resize, so a scroll by the writer stays.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv || !editor) return
    let frame = 0
    const on = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (editor.view.hasFocus()) scrollToCaret(editor.view, scroller.current, head.current, writingBar.current)
      })
    }
    vv.addEventListener('resize', on)
    return () => {
      vv.removeEventListener('resize', on)
      cancelAnimationFrame(frame)
    }
  }, [editor])
  useOpenAtPlace(editor, pager, opened)
  usePageTurns({
    screen,
    viewport,
    bookTitle: titles.bookTitle,
    editor,
    pager,
    covered,
    readOnly,
    onTurn: () => {
      moved.current = true
    },
    beyond: chapterBeyond,
    onCross: (dir) => {
      const next = chapterBeyond(dir)
      if (next) leaveFor(next, !!editor?.view.hasFocus() || keyboard, dir > 0 ? 'turned-on' : 'last')
    },
  })
  // With no caret to take it: the page button, or on desktop the chapter in the rail, or its toggle.
  const noCaret = (): HTMLElement | null =>
    phone ? pageButton.current : (screen.current?.querySelector<HTMLElement>('.contents-rail:not([data-folded]) [aria-current="true"]') ?? railToggle.current)
  const focus = useFocusOnOpen({ opened, editor, saving, titles, covered, readOnly, titlePage, titleEditable, noCaret })

  // A chapter chosen in Contents: the writer's place follows, once the page they left has had its
  // last save, so its place never lands after this one. Once, as the page opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `opened` and the closing save are this page's, fixed while it is open.
  useEffect(() => {
    if (!opened.at || !saving || !pager || !editor || readOnly) return
    let alive = true
    void settled(closingRef.current).then(() => {
      if (!alive) return
      moved.current = true
      void saving.flush()
    })
    return () => {
      alive = false
    }
  }, [saving, pager, editor])

  // The latest thing to say wins: a turn is said after a kept moment or a chapter opening.
  // biome-ignore lint/correctness/useExhaustiveDependencies: \`announcement\` is the trigger.
  useEffect(() => setKept(''), [announcement])

  // The page changed under a screen reader: it hears which chapter it is in.
  useEffect(() => {
    if (opened.at) setKept(titleOf(opened).trim() || 'Untitled')
  }, [opened])

  // Writing here or not changed (another window took the piece, or Write here): the editor asks
  // `editable` again at once.
  useEffect(() => {
    editor?.view.setProps({ editable: () => !readOnly })
  }, [editor, readOnly])

  // Always in view, so read as it opens: a window that is not writing is not told of what changes.
  useEffect(() => {
    if (railed && rail.open) live.reread()
  }, [railed, rail.open, live.reread])

  // Closing the tools closes what was opened from them; the focus goes back to the page button.
  const closeTools = useCallback((): void => {
    setSheet(null)
    setTools(false)
    requestAnimationFrame(() => pageButton.current?.focus())
  }, [])

  // A sheet from the phone's tools bar sits above it; one from the desktop head drops under the control
  // that opened it, and closing it gives that control the focus back.
  function openSheet(which: 'text' | 'export', from?: HTMLElement): void {
    if (from && sheet === which) {
      closeSheet()
      return
    }
    opener.current = from ?? null
    setAnchor(from ? below(from) : undefined)
    setSheet(which)
  }
  const closeSheet = useCallback((): void => {
    setSheet(null)
    const back = opener.current
    opener.current = null
    // Only from the sheet: the focus left in the text stays there, and the keyboard with it.
    const active = document.activeElement
    if (back && (!active || active === document.body || active.closest('.sheet'))) requestAnimationFrame(() => back.focus())
  }, [])

  // Contents drops under the head; pressed again, the running head closes it.
  function openContents(from: HTMLElement): void {
    if (sheet === 'contents') {
      closeSheet()
      return
    }
    opener.current = from
    setContentsFocus(document.activeElement === from)
    setAnchor(undefined)
    setSheet('contents')
    live.reread()
  }

  // The chapter before or after this one in the book as it stands now.
  function chapterBeyond(dir: 1 | -1): string | undefined {
    if (!book) return undefined
    const { sections } = live.outline
    const here = sections.findIndex((s) => s.sectionId === sectionId)
    return here < 0 ? undefined : sections[here + dir]?.sectionId
  }

  // Going to another chapter: the words being left are safe in the journal first, in case the save
  // that follows never ends.
  function leaveFor(chosen: string, writing: boolean, at: OpenAt): void {
    saving?.journal()
    if (keyboard) raiseKeyboard()
    onOpenSection(chosen, writing, at)
  }

  // A chapter chosen in Contents opens at its opening page.
  function openChapter(chosen: string): void {
    if (!editor || !pager) return
    const writing = editor.view.hasFocus()
    if (chosen === sectionId) {
      setSheet(null)
      opener.current = null
      toOpeningPage(editor.view, pager)
      moved.current = true
      void saving?.flush()
      return
    }
    leaveFor(chosen, writing, 'opening')
  }

  // A new chapter opens with the caret in its title: the keyboard comes up from this tap, or not at
  // all on iOS. As when choosing a chapter, the words being left are safe in the journal first.
  function addChapter(after?: string): void {
    saving?.journal()
    raiseKeyboard()
    onNewChapter(after)
  }
  // Only the window that writes starts a chapter (0010). Whatever holds Contents places it.
  const newChapter = readOnly ? null : <NewChapter onAdd={() => addChapter()} />
  const chapter = useChapterStart({
    deps,
    pieceId: piece.id,
    sectionId,
    writes: book && !readOnly,
    editor,
    saving,
    title: titles.title,
    keyboard,
    onAddAfter: () => addChapter(sectionId),
    onStarted: onChapterStarted,
  })
  const chapterHere = book && !readOnly ? chapter.here : undefined
  const undoPast = useRejoin({
    deps,
    pieceId: piece.id,
    sectionId,
    writes: book && !readOnly,
    chapterBefore: () => chapterBeyond(-1),
    editor,
    saving,
    keyboard,
    onRejoined: onChapterRejoined,
  })

  // Escape closes what is open, innermost first: a sheet, then the tools. One listener reads what
  // is open now from a ref: re-attached on each change, an Escape pressed right after one (Done,
  // then Escape) would reach the listener from before it.
  const open = useRef({ tools, sheet, anchor })
  open.current = { tools, sheet, anchor }
  useEffect(() => {
    if (covered) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (open.current.sheet) closeSheet()
      else if (open.current.tools) closeTools()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [covered, closeTools, closeSheet])

  // On a phone, a tap outside a sheet closes it; the tools bar beneath it is not outside. One opened
  // from the desktop head stays, so the page can be seen beside it.
  useEffect(() => {
    if (covered) return
    const onDown = (e: PointerEvent): void => {
      if (!open.current.sheet || open.current.anchor) return
      if (!(e.target as Element).closest?.('.sheet, .tools, .running-control')) closeSheet()
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [covered, closeSheet])

  // A calm line at the foot for a few seconds.
  useEffect(() => {
    if (!line) return
    const t = setTimeout(() => setLine(null), 4000)
    return () => clearTimeout(t)
  }, [line])

  async function exportMarkdown(): Promise<string | undefined> {
    if (!editor) return undefined
    const file = await markdownFile(deps, piece, sectionId, editor.markdown(), titles.title.current?.textContent ?? '')
    download(file.name, file.text)
    return file.name
  }

  async function keepMoment(): Promise<void> {
    if (await saving?.keep()) setKept('Moment kept')
  }

  // Return in a title field: on to the text, at its start.
  function toText(): void {
    if (!editor) return
    const view = editor.view
    view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)))
    view.focus()
  }

  return (
    <div
      ref={screen}
      className={piece.kind === 'journal' ? 'page-screen journal' : 'page-screen'}
      data-keyboard={keyboard || undefined}
      data-tools={tools || undefined}
      inert={covered}
      aria-hidden={covered}
    >
      <div ref={head} className="head" data-scrolled={scrolled || undefined}>
        {/* Pressed, § leaves the caret where it is, so the place kept is the caret's. On desktop the
            piece's name follows it; a phone shows § alone. */}
        <div className="head-path">
          <Path
            crumbs={[{ word: (piece.kind === 'essay' ? heading : name).trim() || 'Untitled' }]}
            keepFocus
            onHome={() => {
              focus.leaving()
              onLibrary()
            }}
          />
          {railed ? <RailToggle open={rail.open} onToggle={rail.toggle} buttonRef={railToggle} /> : null}
        </div>
        {/* In the head, so the toggle's next stop is what it opens, then the tools. */}
        {railed ? (
          <ContentsRail
            {...contents(live.outline, 'desktop', pager ? { sectionId, title: heading, pages: count } : undefined)}
            current={sectionId}
            open={rail.open}
            onOpen={openChapter}
            onLeave={() => {
              rail.letGo()
              railToggle.current?.focus()
            }}
          >
            {newChapter}
          </ContentsRail>
        ) : null}
        {page <= (titlePage ? 1 : 0) ? null : book && phone ? (
          <RunningHeadControl title={heading} open={sheet === 'contents'} onOpen={openContents} />
        ) : (
          <div className="running-head">{heading}</div>
        )}
        <HeadTools
          page={shown.page}
          count={shown.pages}
          words={shown.words}
          sheet={anchor && sheet !== 'contents' ? sheet : null}
          onTextSettings={(from) => openSheet('text', from)}
          onExport={(from) => openSheet('export', from)}
        />
      </div>

      <div ref={scroller} className="page-scroll">
        <div ref={viewport} className="pager">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: it only hears the focus of the fields inside it. */}
          <div
            ref={flow}
            className="flow"
            lang={piece.lang}
            data-title-page={titlePage || undefined}
            onFocus={(e) => setField(e.target === editor?.view.dom ? null : (e.target as HTMLElement))}
            onBlur={() => setField(null)}
          >
            {titlePage ? (
              <TitlePage
                nameRef={titles.bookTitle}
                subtitleRef={titles.subtitle}
                kind={piece.kind === 'book' ? 'book' : 'journal'}
                readOnly={readOnly}
                onFocus={() => pager?.turnTo(0)}
                onInput={() => {
                  setName(titles.bookTitle.current?.textContent ?? '')
                  saving?.touch()
                }}
                onDone={() => (titleEditable ? titles.title.current?.focus() : editor?.focus())}
              />
            ) : null}
            <SectionTitle
              titleRef={titles.title}
              editable={titleEditable}
              placeholder={piece.kind === 'book' ? 'Chapter title' : 'Untitled'}
              afterTitlePage={titlePage}
              onFocus={(el) => pager?.show(el.getBoundingClientRect().left)}
              onInput={(text) => {
                // A new chapter can be stored by its title alone: the place follows the writer there.
                moved.current = true
                setHeading(text)
                saving?.touch()
                requestAnimationFrame(() => pager?.measure())
              }}
              onDone={toText}
              onUndoPast={undoPast}
            />
            <div ref={mount} />
          </div>
        </div>
      </div>
      <div className="scroll-mark" aria-hidden="true" />

      {editor && !readOnly && writing && keyboard && selection ? (
        <WritingBar editor={editor} active={selection.active} barRef={writingBar} onChapter={chapterHere} />
      ) : null}
      {!readOnly && keyboard && field ? <FieldBar field={field} barRef={writingBar} onUndoPast={undoPast} /> : null}
      {editor && !readOnly && !keyboard && selection?.rect ? (
        <SelectionMenu editor={editor} rect={selection.rect} active={selection.active} onKeep={() => void keepMoment()} onChapter={chapterHere} />
      ) : null}

      <PageFoot
        page={shown.page}
        count={shown.pages}
        words={shown.words}
        journal={piece.kind === 'journal'}
        titlePage={titlePage && page === 0}
        tools={tools}
        keyboard={keyboard}
        pageButtonRef={pageButton}
        onOpenTools={() => setTools(true)}
        onCloseTools={closeTools}
        onTextSettings={() => openSheet('text')}
        onExport={() => openSheet('export')}
        onContents={book ? openContents : undefined}
        contents={sheet === 'contents'}
      />

      {sheet === 'contents' && phone ? (
        <ContentsSheet
          {...contents(live.outline, 'phone', pager ? { sectionId, title: heading, pages: count } : undefined)}
          current={sectionId}
          takeFocus={contentsFocus}
          onOpen={openChapter}
          onDone={closeSheet}
        >
          {newChapter}
        </ContentsSheet>
      ) : null}
      {sheet === 'text' ? <TextSettings onDone={closeSheet} style={anchor} /> : null}
      {sheet === 'export' ? (
        <ExportSheet
          title={heading || (piece.kind === 'journal' ? piece.title : 'Untitled')}
          style={anchor}
          onMarkdown={async () => {
            const name = await exportMarkdown()
            closeSheet()
            if (name) setLine(`Saved as ${name}.`)
          }}
          onDone={closeSheet}
        />
      ) : null}

      {/* shortcut: Save a copy holds the unsaved section only, not the whole piece. */}
      <StatusLine writer={writer} failed={failed} line={line} onWriteHere={onWriteHere} onSaveCopy={() => void exportMarkdown()} />

      <div className="visually-hidden" aria-live="polite">
        {kept || announcement}
      </div>
    </div>
  )
}

/** A sheet's place under the head control that opened it, right-aligned to it. */
function below(control: HTMLElement): CSSProperties {
  const box = control.getBoundingClientRect()
  return {
    top: box.bottom + 8,
    right: document.documentElement.clientWidth - box.right,
    bottom: 'auto',
    left: 'auto',
    maxHeight: `calc(100dvh - ${box.bottom + 24}px)`,
  }
}
