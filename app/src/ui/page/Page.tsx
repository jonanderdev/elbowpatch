import { useEffect, useRef, useState } from 'react'
import { TextSelection } from 'prosemirror-state'
import { pieceAsMarkdown } from '../../domain/export'
import type { Piece } from '../../domain/model'
import { openPiece, type Deps } from '../../domain/pieces'
import { download } from '../files/download'
import { ExportSheet } from '../components/ExportSheet'
import { update, useSettings } from '../stores/settings'
import { TextSettings } from './Tools'
import { WordButton } from '../components/WordButton'
import { SelectionMenu, useKeyboard, WritingBar } from './Writing'
import type { Opened } from './fields'
import { PageFoot, StatusLine } from './PageFoot'
import type { PageSession } from './session'
import { SectionTitle, TitlePage } from './Titles'
import { useFocusOnOpen } from './useFocusOnOpen'
import { usePageSession } from './usePageSession'
import { usePageTurns } from './usePageTurns'

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

/**
 * The writing page: one section of a piece, paged (DESIGN.md, The page). The editor, the pager and
 * saving live in a PageSession (usePageSession); this component lays out the page around them.
 */
export function Page({ deps, opened, writer, onWriteHere, flushRef, closingRef, covered, onLibrary, onChange }: Props) {
  const { piece } = opened
  const readOnly = writer !== 'here'
  // A book or a journal opens on its title page: its name, then chapter 1 or the first day on the next page.
  const titlePage = piece.kind !== 'essay' && piece.sections[0]?.sectionId === opened.sectionId
  // A journal day's title is its date.
  const titleEditable = piece.kind !== 'journal' && !readOnly

  const settings = useSettings()
  const keyboard = useKeyboard()
  const [tools, setTools] = useState(false)
  const [sheet, setSheet] = useState<'text' | 'export' | null>(null)
  const [line, setLine] = useState<string | null>(null)
  const pageButton = useRef<HTMLButtonElement>(null)
  const refs = {
    screen: useRef<HTMLDivElement>(null),
    viewport: useRef<HTMLDivElement>(null),
    flow: useRef<HTMLDivElement>(null),
    mount: useRef<HTMLDivElement>(null),
    title: useRef<HTMLHeadingElement>(null),
    bookTitle: useRef<HTMLHeadingElement>(null),
    subtitle: useRef<HTMLParagraphElement>(null),
  }

  const { session, page, count, words, failed, selection, writing, heading, setHeading, announce, keep } = usePageSession({
    deps,
    opened,
    refs,
    readOnly,
    onStored: onChange,
    flushRef,
    closingRef,
  })
  usePageTurns(refs.screen, session, covered)
  const focus = useFocusOnOpen({ opened, session, refs, covered, readOnly, titlePage, titleEditable })

  // Text settings change the page: lay it out again and keep the caret's page.
  useEffect(() => {
    if (!session) return
    const frame = requestAnimationFrame(() => {
      session.relayout()
      session.showCaret()
    })
    return () => cancelAnimationFrame(frame)
  }, [session, settings.size, settings.leading, settings.measure, settings.align, settings.dropcap, settings.indent])

  // Escape closes what is open, innermost first: a sheet, then the tools. One listener reads what
  // is open now from a ref: re-attached on each change, an Escape pressed right after one (Done,
  // then Escape) would reach the listener from before it.
  const open = useRef({ tools, sheet })
  open.current = { tools, sheet }
  useEffect(() => {
    if (covered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (open.current.sheet) setSheet(null)
      else if (open.current.tools) closeTools()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [covered])

  // A calm line at the foot for a few seconds.
  useEffect(() => {
    if (!line) return
    const t = setTimeout(() => setLine(null), 4000)
    return () => clearTimeout(t)
  }, [line])

  function closeTools() {
    // Closing the tools closes what was opened from them.
    setSheet(null)
    setTools(false)
    requestAnimationFrame(() => pageButton.current?.focus())
  }

  async function exportMarkdown() {
    if (!session) return
    const file = await markdownFile(deps, opened, session, refs.title.current?.textContent ?? '')
    download(file.name, file.text)
    return file.name
  }

  // Return in a title field: on to the text, at its start.
  function toText() {
    if (!session) return
    const view = session.editor.view
    view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)))
    view.focus()
  }

  return (
    <div ref={refs.screen} className={piece.kind === 'journal' ? 'page-screen journal' : 'page-screen'} inert={covered} aria-hidden={covered}>
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
        {page > (titlePage ? 1 : 0) && <div className="running-head">{heading}</div>}
      </div>

      <div ref={refs.viewport} className="pager">
        <div ref={refs.flow} className="flow" lang={piece.lang}>
          {titlePage && (
            <TitlePage
              nameRef={refs.bookTitle}
              subtitleRef={refs.subtitle}
              kind={piece.kind === 'book' ? 'book' : 'journal'}
              readOnly={readOnly}
              onFocus={() => session?.pager.turnTo(0)}
              onInput={() => session?.saving.touch()}
              onDone={() => (titleEditable ? refs.title.current?.focus() : session?.editor.focus())}
            />
          )}
          <SectionTitle
            titleRef={refs.title}
            editable={titleEditable}
            placeholder={piece.kind === 'book' ? 'Chapter title' : 'Untitled'}
            afterTitlePage={titlePage}
            onFocus={(el) => session?.pager.show(el.getBoundingClientRect().left)}
            onInput={(text) => {
              setHeading(text)
              session?.saving.touch()
              requestAnimationFrame(() => session?.pager.measure())
            }}
            onDone={toText}
          />
          <div ref={refs.mount} />
        </div>
      </div>

      {session && !readOnly && writing && keyboard > 0 && selection && <WritingBar editor={session.editor} active={selection.active} keyboard={keyboard} />}
      {session && !readOnly && keyboard === 0 && selection?.rect && (
        <SelectionMenu editor={session.editor} rect={selection.rect} active={selection.active} onKeep={() => void keep()} />
      )}

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

      {sheet === 'text' && <TextSettings onDone={() => setSheet(null)} />}
      {sheet === 'export' && (
        <ExportSheet
          title={heading || (piece.kind === 'journal' ? piece.title : 'Untitled')}
          onMarkdown={async () => {
            const name = await exportMarkdown()
            setSheet(null)
            if (name) setLine(`Saved as ${name}.`)
          }}
          onDone={() => setSheet(null)}
        />
      )}

      <StatusLine writer={writer} failed={failed} line={line} onWriteHere={onWriteHere} onSaveCopy={() => void exportMarkdown()} />

      <div className="visually-hidden" aria-live="polite">
        {announce}
      </div>
    </div>
  )
}

/** The whole piece as one Markdown file, with this section as the page holds it now. */
async function markdownFile(deps: Deps, opened: Opened, session: PageSession, title: string) {
  const { piece, sectionId } = opened
  const stored = await openPiece(deps, piece.id).catch(() => undefined)
  const content = session.editor.markdown()
  const sections = stored ? stored.sections.map((s) => (s.sectionId === sectionId ? { ...s, content } : s)) : [{ sectionId, title: '', content }]
  if (!sections.some((s) => s.sectionId === sectionId)) sections.push({ sectionId, title: piece.sections.find((s) => s.sectionId === sectionId)?.title ?? '', content })
  const base = stored?.piece ?? piece
  return pieceAsMarkdown({ ...base, title: piece.kind === 'essay' ? title : base.title }, sections)
}
