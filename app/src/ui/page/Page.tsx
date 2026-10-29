import { type ReactElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TextSelection } from 'prosemirror-state'
import { countWords } from '../../domain/markdown'
import type { Piece } from '../../domain/model'
import type { Deps } from '../../domain/pieces'
import { showCaret } from '../../page/caret'
import { type Editor, selectionBox } from '../../page/editor'
import { placeOf } from '../../page/place'
import { ExportSheet } from '../components/ExportSheet'
import { WordButton } from '../components/WordButton'
import { download } from '../files/download'
import { markdownFile } from '../files/markdownFile'
import { update, useSettings } from '../stores/settings'
import { fillTitleFields, keptFor, type Opened, type TitleRefs } from './fields'
import { PageFoot, StatusLine } from './PageFoot'
import { SectionTitle, TitlePage } from './Titles'
import { TextSettings } from './Tools'
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
  const [writing, setWriting] = useState(false)
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [kept, setKept] = useState('')

  const screen = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const flow = useRef<HTMLDivElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const pageButton = useRef<HTMLButtonElement>(null)
  const titles: TitleRefs = { title: useRef<HTMLHeadingElement>(null), bookTitle: useRef<HTMLHeadingElement>(null), subtitle: useRef<HTMLParagraphElement>(null) }
  // The editor, for what runs outside a render (a save, a relayout).
  const editorNow = useRef<Editor | null>(null)
  /** The writer typed, clicked into the text or turned a page since the last moment: their place is kept. */
  const moved = useRef(false)

  // The title fields are uncontrolled: filled once, before the first paint, from what is stored (or kept).
  const [openedFirst] = useState(opened)
  useLayoutEffect(() => {
    setHeading(fillTitleFields(openedFirst, { title: titles.title.current, bookTitle: titles.bookTitle.current, subtitle: titles.subtitle.current }))
  }, [openedFirst, titles.title, titles.bookTitle, titles.subtitle])

  const { pager, page, count, announcement } = usePager({
    screen,
    viewport,
    flow,
    kind: piece.kind,
    settings,
    onRelayout: (p) => {
      if (editorNow.current) showCaret(editorNow.current.view, p)
    },
  })

  const { saving, failed } = useSaving({
    deps,
    opened,
    editor: editorNow.current,
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
    onStored: onChange,
    flushRef,
    closingRef,
  })

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

  // Escape closes what is open, innermost first: a sheet, then the tools. One listener reads what
  // is open now from a ref: re-attached on each change, an Escape pressed right after one (Done,
  // then Escape) would reach the listener from before it.
  const open = useRef({ tools, sheet })
  open.current = { tools, sheet }
  useEffect(() => {
    if (covered) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (open.current.sheet) setSheet(null)
      else if (open.current.tools) closeTools()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [covered, closeTools])

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
    <div ref={screen} className={piece.kind === 'journal' ? 'page-screen journal' : 'page-screen'} inert={covered} aria-hidden={covered}>
      <div className="head">
        {/* Pressed, it leaves the caret where it is, so the place kept is the caret's. */}
        <WordButton
          word="Library"
          keepFocus
          onClick={() => {
            focus.leaving()
            onLibrary()
          }}
        />
        {page > (titlePage ? 1 : 0) ? <div className="running-head">{heading}</div> : null}
      </div>

      <div ref={viewport} className="pager">
        <div ref={flow} className="flow" lang={piece.lang}>
          {titlePage ? (
            <TitlePage
              nameRef={titles.bookTitle}
              subtitleRef={titles.subtitle}
              kind={piece.kind === 'book' ? 'book' : 'journal'}
              readOnly={readOnly}
              onFocus={() => pager?.turnTo(0)}
              onInput={() => saving?.touch()}
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

      {editor && !readOnly && writing && keyboard > 0 && selection ? <WritingBar editor={editor} active={selection.active} keyboard={keyboard} /> : null}
      {editor && !readOnly && keyboard === 0 && selection?.rect ? (
        <SelectionMenu editor={editor} rect={selection.rect} active={selection.active} onKeep={() => void keepMoment()} />
      ) : null}

      <PageFoot
        page={page}
        count={count}
        words={words}
        journal={piece.kind === 'journal'}
        tools={tools}
        showWayIn={!settings.toolsSeen && keyboard === 0 && !failed && !line && writer !== 'elsewhere'}
        keyboard={keyboard}
        pageButtonRef={pageButton}
        onOpenTools={() => {
          setTools(true)
          if (!settings.toolsSeen) update({ toolsSeen: true })
        }}
        onCloseTools={closeTools}
        onTextSettings={() => setSheet('text')}
        onExport={() => setSheet('export')}
      />

      {sheet === 'text' ? <TextSettings onDone={() => setSheet(null)} /> : null}
      {sheet === 'export' ? (
        <ExportSheet
          title={heading || (piece.kind === 'journal' ? piece.title : 'Untitled')}
          onMarkdown={async () => {
            const name = await exportMarkdown()
            setSheet(null)
            if (name) setLine(`Saved as ${name}.`)
          }}
          onDone={() => setSheet(null)}
        />
      ) : null}

      <StatusLine writer={writer} failed={failed} line={line} onWriteHere={onWriteHere} onSaveCopy={() => void exportMarkdown()} />

      <div className="visually-hidden" aria-live="polite">
        {kept || announcement}
      </div>
    </div>
  )
}
