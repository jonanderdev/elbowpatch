import { TextSelection } from 'prosemirror-state'
import { type CSSProperties, type ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { countWords } from '../../domain/markdown'
import type { Piece } from '../../domain/model'
import { type Deps, savePages } from '../../domain/pieces'
import { scrollToCaret, showCaret } from '../../page/caret'
import { type Editor, selectionBox } from '../../page/editor'
import { screenOf } from '../../page/pager'
import { placeOf } from '../../page/place'
import { ExportSheet } from '../components/ExportSheet'
import { Path } from '../components/Path'
import { useScrolled } from '../components/useScrolled'
import { download } from '../files/download'
import { markdownFile } from '../files/markdownFile'
import { useSettings } from '../stores/settings'
import { fillTitleFields, keptFor, type Opened, type TitleRefs } from './fields'
import { PageFoot, StatusLine } from './PageFoot'
import { SectionTitle, TitlePage } from './Titles'
import { HeadTools, TextSettings } from './Tools'
import { useCaretFollowing, useCaretKeys } from './useCaret'
import { useEditor } from './useEditor'
import { useFocusOnOpen } from './useFocusOnOpen'
import { useOpenAtPlace } from './useOpenAtPlace'
import { usePager } from './usePager'
import { usePageTurns } from './usePageTurns'
import { useSaving } from './useSaving'
import { SelectionMenu, useKeyboard, WritingBar } from './Writing'

export type { Opened } from './fields'

interface Props {
  deps: Deps
  opened: Opened
  /** Who writes this piece (0010): until the lock answers, and while another window writes it, nothing changes here. */
  writer: 'waiting' | 'here' | 'elsewhere'
  onWriteHere(): void
  /** Lets the app ask the page to save now, before another window takes the piece. */
  flushRef: { current: (() => Promise<void>) | null }
  /** The closing page's last save, so the app lets go of the piece only after it. */
  closingRef: { current: Promise<void> }
  /** The library shows over the page; the page stays laid out behind it, inert. */
  covered: boolean
  onLibrary(): void
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
export function Page({ deps, opened, writer, onWriteHere, flushRef, closingRef, covered, onLibrary, onChange }: Props): ReactElement {
  const { piece, sectionId } = opened
  const readOnly = writer !== 'here'
  // A book or a journal opens on its title page: its name, then chapter 1 or the first day on the next page.
  const titlePage = piece.kind !== 'essay' && piece.sections[0]?.sectionId === sectionId
  // A journal day's title is its date.
  const titleEditable = piece.kind !== 'journal' && !readOnly
  // Words kept for this section, newer than what is stored, start the page.
  const [content] = useState(() => keptFor(opened)?.markdown ?? opened.content)

  const settings = useSettings()
  const keyboard = useKeyboard()
  const [tools, setTools] = useState(false)
  const [sheet, setSheet] = useState<'text' | 'export' | null>(null)
  const [line, setLine] = useState<string | null>(null)
  const [words, setWords] = useState(() => countWords(content))
  const [heading, setHeading] = useState('')
  // A book's or a journal's name, as on its title page: the desktop path shows it while it is written.
  const [name, setName] = useState(piece.title)
  const [writing, setWriting] = useState(false)
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
      const place = moved.current && e && pager ? placeOf(e.view, sectionId, pager.page, viewport.current) : undefined
      // Once kept, it stays until they move again: a later save, as the page closes behind the
      // library, would read a page no longer laid out as they left it.
      moved.current = false
      return place
    },
    pages: () => (pager && screen.current ? { screen: screenOf(screen.current.clientWidth), count: pager.count } : null),
    onStored: onChange,
    flushRef,
    closingRef,
  })

  // The count is kept with the piece whenever it changes (a turn of the text settings, a first reading
  // on this kind of screen), so the library shows a book's pages without laying it out (DESIGN.md).
  useEffect(() => {
    if (readOnly || !pager || !screen.current) return
    void savePages(deps, piece.id, screenOf(screen.current.clientWidth), sectionId, count).catch(() => {})
  }, [deps, piece.id, sectionId, count, pager, readOnly])

  const caretKeys = useCaretKeys(pager, flow)
  const editor = useEditor(mount, content, piece.lang, {
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
    onSelection(view, tr) {
      const e = editorNow.current
      if (e) setSelection({ rect: selectionBox(view), active: e.active() })
      caretKeys.onSelection(tr, view.state.selection)
    },
    onKey: caretKeys.onKey,
  })
  editorNow.current = editor

  useCaretFollowing(editor, pager, flow, mount, caretKeys.memory)
  // With the keyboard down the page no longer scrolls: it stands at its top again.
  useEffect(() => {
    if (!keyboard && scroller.current) scroller.current.scrollTop = 0
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
  })
  const focus = useFocusOnOpen({ opened, editor, saving, titles, covered, readOnly, titlePage, titleEditable })

  // Writing here or not changed (another window took the piece, or Write here): the editor asks
  // `editable` again at once.
  useEffect(() => {
    editor?.view.setProps({ editable: () => !readOnly })
  }, [editor, readOnly])

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
    if (back) requestAnimationFrame(() => back.focus())
  }, [])

  // Escape closes what is open, innermost first: a sheet, then the tools. One listener reads what
  // is open now from a ref: re-attached on each change, an Escape pressed right after one (Done,
  // then Escape) would reach the listener from before it.
  const open = useRef({ tools, sheet })
  open.current = { tools, sheet }
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
      inert={covered}
      aria-hidden={covered}
    >
      <div ref={head} className="head" data-scrolled={scrolled || undefined}>
        {/* Pressed, § leaves the caret where it is, so the place kept is the caret's. On desktop the
            piece's name follows it; a phone shows § alone. */}
        <Path
          crumbs={[{ word: (piece.kind === 'essay' ? heading : name).trim() || 'Untitled' }]}
          keepFocus
          onHome={() => {
            focus.leaving()
            onLibrary()
          }}
        />
        {page > (titlePage ? 1 : 0) ? <div className="running-head">{heading}</div> : null}
        <HeadTools
          page={page + 1}
          count={count}
          words={words}
          sheet={anchor ? sheet : null}
          onTextSettings={(from) => openSheet('text', from)}
          onExport={(from) => openSheet('export', from)}
        />
      </div>

      <div ref={scroller} className="page-scroll">
        <div ref={viewport} className="pager">
          <div ref={flow} className="flow" lang={piece.lang} data-title-page={titlePage || undefined}>
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
                setHeading(text)
                saving?.touch()
                requestAnimationFrame(() => pager?.measure())
              }}
              onDone={toText}
            />
            <div ref={mount} />
          </div>
        </div>
      </div>

      {editor && !readOnly && writing && keyboard && selection ? <WritingBar editor={editor} active={selection.active} barRef={writingBar} /> : null}
      {editor && !readOnly && !keyboard && selection?.rect ? (
        <SelectionMenu editor={editor} rect={selection.rect} active={selection.active} onKeep={() => void keepMoment()} />
      ) : null}

      <PageFoot
        page={page}
        count={count}
        words={words}
        journal={piece.kind === 'journal'}
        titlePage={titlePage && page === 0}
        tools={tools}
        keyboard={keyboard}
        pageButtonRef={pageButton}
        onOpenTools={() => setTools(true)}
        onCloseTools={closeTools}
        onTextSettings={() => openSheet('text')}
        onExport={() => openSheet('export')}
      />

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
