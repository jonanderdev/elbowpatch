import { useEffect, useRef, useState } from 'react'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { debounced, moments } from '../adapters/schedule'
import { pieceAsMarkdown } from '../domain/export'
import { countWords } from '../domain/markdown'
import type { Piece, Place } from '../domain/model'
import { openPiece, rename, renameSection, savePlace, takeMoment, write, type Deps } from '../domain/pieces'
import { dayTitle } from '../domain/words'
import { createEditor, type Editor } from '../page/editor'
import { geometry, Pager } from '../page/pager'
import { download } from './download'
import { ExportSheet } from './Export'
import { useSettings } from './settings'
import { TextSettings, ToolsBar } from './Tools'
import { SelectionMenu, useKeyboard, WritingBar } from './Writing'

export interface Opened {
  piece: Piece
  sectionId: string
  content: string
  /** Just made: the title takes the caret. */
  fresh?: boolean
  focused?: boolean
}

interface Props {
  deps: Deps
  opened: Opened
  /** Who writes this piece (0010): until the lock answers, and while another window writes it, nothing changes here. */
  writer: 'waiting' | 'here' | 'elsewhere'
  onWriteHere(): void
  /** Lets the app ask the page to save now, before another window takes the piece. */
  flushRef: { current: (() => Promise<void>) | null }
  /** The library shows over the page; the page stays laid out behind it, inert. */
  covered: boolean
  onLibrary(): void
  onChange(piece: Piece): void
}

const MIN_SIDE = 24

export function Page({ deps, opened, writer, onWriteHere, flushRef, covered, onLibrary, onChange }: Props) {
  const settings = useSettings()
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(1)
  const [words, setWords] = useState(() => countWords(opened.content))
  const [tools, setTools] = useState(false)
  const [sheet, setSheet] = useState<'text' | 'export' | null>(null)
  const [failed, setFailed] = useState(false)
  const [line, setLine] = useState<string | null>(null)
  const [heading, setHeading] = useState(() => titleOf(opened))
  const [announce, setAnnounce] = useState('')
  const [selection, setSelection] = useState<{ rect: DOMRect | null; active: ReturnType<Editor['active']> } | null>(null)
  const [writing, setWriting] = useState(false)
  const keyboard = useKeyboard()

  const screen = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const flow = useRef<HTMLDivElement>(null)
  const titleEl = useRef<HTMLHeadingElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const pageButton = useRef<HTMLButtonElement>(null)
  const live = useRef<{
    editor: Editor
    pager: Pager
    piece: Piece
    flush(): Promise<void>
    keep(): Promise<void>
    relayout(): void
    save: ReturnType<typeof debounced>
    moment: ReturnType<typeof moments>
  }>(null)

  const { piece, sectionId } = opened
  const readOnly = writer !== 'here'
  const readOnlyNow = useRef(readOnly)
  readOnlyNow.current = readOnly
  const titleEditable = piece.kind !== 'journal' && !readOnly

  useEffect(() => {
    const state = { piece, title: titleOf(opened) }
    let failedNow = false
    let retry: ReturnType<typeof setTimeout> | undefined

    const save = debounced(
      async () => {
        if (readOnlyNow.current) return
        const markdown = editor.markdown()
        try {
          await write(deps, state.piece, sectionId, markdown)
          const title = titleEl.current?.textContent ?? ''
          // A journal day's title is its date, never written here.
          if (piece.kind !== 'journal' && title !== state.title) {
            if (piece.kind === 'essay') await rename(deps, state.piece, title)
            else await renameSection(deps, state.piece, sectionId, title)
            state.title = title
          }
          const stored = await openPiece(deps, piece.id)
          if (stored) {
            state.piece = stored.piece
            onChange(stored.piece)
          }
          if (failedNow) setFailed((failedNow = false))
        } catch (error) {
          // The text stays in the editor; say so, and keep trying (0010).
          setFailed((failedNow = true))
          clearTimeout(retry)
          retry = setTimeout(() => save.touch(), 5000)
          throw error
        }
      },
      1000,
      5000,
    )

    const moment = moments(async () => {
      await save.flush().catch(() => {})
      if (failedNow || readOnlyNow.current) return
      await takeMoment(deps, piece.id).catch(() => {})
      const place = placeOf(editor.view, sectionId, pager.page)
      if (place) await savePlace(deps, piece.id, place).catch(() => {})
      const stored = await openPiece(deps, piece.id).catch(() => undefined)
      if (stored) onChange(stored.piece)
    })

    // Leaving, hiding, closing: save now and keep a moment (0005).
    const flush = async () => {
      moment.touch()
      await moment.flush()
    }

    const pager = new Pager(viewport.current!, flow.current!, (p, c) => {
      setPage(p)
      setCount(c)
      setAnnounce(`Page ${p + 1} of ${c}`)
    })

    const editor = createEditor(mount.current!, {
      content: opened.content,
      lang: piece.lang,
      onChange(markdown) {
        setWords(countWords(markdown))
        save.touch()
        moment.touch()
        requestAnimationFrame(() => pager.measure())
      },
      onCaret: (view) => showCaret(view, pager),
      onFocusChange(focused) {
        setWriting(focused)
        if (focused) setSelection((s) => s ?? { rect: null, active: editor.active() })
        else {
          setSelection(null)
          void flush()
        }
      },
      onSelection(view) {
        const { from, to, empty } = view.state.selection
        let rect: DOMRect | null = null
        if (!empty && view.hasFocus()) {
          const a = view.coordsAtPos(from)
          const b = view.coordsAtPos(to)
          rect = new DOMRect(Math.min(a.left, b.left), Math.min(a.top, b.top), Math.abs(b.right - a.left), Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top))
        }
        setSelection({ rect, active: editor.active() })
      },
      editable: () => !readOnlyNow.current,
    })

    const relayout = () => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const max = (document.documentElement.dataset.measure === 'wide' ? 40 : 34) * root
      const g = geometry(document.documentElement.clientWidth, max, MIN_SIDE)
      screen.current!.style.setProperty('--side', `${g.side}px`)
      screen.current!.style.setProperty('--measure-px', `${g.measure}px`)
      pager.layout(g)
    }

    // "Keep this moment": a moment now, kept for good (0005).
    const keep = async () => {
      await save.flush().catch(() => {})
      if (failedNow || readOnlyNow.current) return
      await takeMoment(deps, piece.id, { kept: true })
      setAnnounce('Moment kept')
    }

    live.current = { editor, pager, piece, flush, keep, relayout, save, moment }
    flushRef.current = flush

    // Lay out once the fonts are in, so page breaks do not move after load (0011).
    relayout()
    restorePlace(editor.view, piece.place, sectionId)
    void document.fonts.ready.then(() => {
      relayout()
      if (piece.place?.sectionId === sectionId) showCaret(editor.view, pager)
    })
    // A font arriving late, for a script first used now, moves the breaks too.
    const fontsLoaded = () => pager.measure()
    document.fonts.addEventListener('loadingdone', fontsLoaded)

    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const onResize = () => {
      relayout()
      showCaret(editor.view, pager)
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    window.addEventListener('blur', onHide)
    window.addEventListener('resize', onResize)

    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('blur', onHide)
      window.removeEventListener('resize', onResize)
      document.fonts.removeEventListener('loadingdone', fontsLoaded)
      clearTimeout(retry)
      void flush().finally(() => {
        save.cancel()
        moment.cancel()
      })
      editor.destroy()
      live.current = null
      if (flushRef.current === flush) flushRef.current = null
    }
    // One editor per opened section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])

  // Text settings change the page: lay it out again and keep the caret's page.
  useEffect(() => {
    const l = live.current
    if (!l) return
    requestAnimationFrame(() => {
      l.relayout()
      showCaret(l.editor.view, l.pager)
    })
  }, [settings.size, settings.leading, settings.measure, settings.align, settings.dropcap, settings.indent])

  // Another window took the piece: stop writing here at once.
  useEffect(() => {
    live.current?.editor.view.setProps({})
  }, [readOnly])

  // Going to the library is switching pieces: keep a moment.
  // Coming to a new piece: the title takes the caret (the text, in a journal).
  useEffect(() => {
    if (covered) void live.current?.flush()
    else if (opened.fresh && !opened.focused && !readOnly) {
      opened.focused = true
      if (titleEditable) titleEl.current?.focus()
      else live.current?.editor.focus()
    }
  }, [covered, readOnly])

  // Turning pages: keys, the wheel (one page per gesture), a sideways swipe, the side margins.
  useEffect(() => {
    if (covered) return
    const el = screen.current!
    const pager = () => live.current?.pager

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowRight')) pager()?.next()
      else if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowLeft')) pager()?.previous()
      else return
      e.preventDefault()
    }

    let lastWheel = 0
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.sheet')) return
      e.preventDefault()
      const now = e.timeStamp
      const newGesture = now - lastWheel > 220
      lastWheel = now
      if (!newGesture) return
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (Math.abs(delta) < 4) {
        lastWheel = 0
        return
      }
      if (delta > 0) pager()?.next()
      else pager()?.previous()
    }

    let start: { x: number; y: number } | undefined
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      start = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : undefined
    }
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0]
      if (!start || !t) return
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      start = undefined
      if (Math.abs(dx) < 50 || Math.abs(dx) < 1.5 * Math.abs(dy)) return
      if (!window.getSelection()?.isCollapsed) return
      if (dx < 0) pager()?.next()
      else pager()?.previous()
    }

    const onClick = (e: MouseEvent) => {
      const g = pager()?.g
      if (!g || g.side < 120 || (e.target as HTMLElement).closest('button, .pager, .sheet, [contenteditable]')) return
      if (e.clientX < g.side) pager()?.previous()
      else if (e.clientX > g.side + g.measure) pager()?.next()
    }

    window.addEventListener('keydown', onKey)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('click', onClick)
    }
  }, [covered])

  // Escape closes what is open, innermost first: a sheet, then the tools.
  const openNow = useRef({ tools, sheet })
  openNow.current = { tools, sheet }
  useEffect(() => {
    if (covered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const { tools, sheet } = openNow.current
      if (sheet) setSheet(null)
      else if (tools) closeTools()
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

  const closeTools = () => {
    setTools(false)
    requestAnimationFrame(() => pageButton.current?.focus())
  }

  const exportMarkdown = async () => {
    const l = live.current
    if (!l) return
    const stored = await openPiece(deps, piece.id).catch(() => undefined)
    const current = { sectionId, title: '', content: l.editor.markdown() }
    const sections = stored ? stored.sections.map((s) => (s.sectionId === sectionId ? { ...s, content: current.content } : s)) : [current]
    if (!sections.some((s) => s.sectionId === sectionId)) sections.push({ ...current, title: opened.piece.sections.find((s) => s.sectionId === sectionId)?.title ?? '' })
    const title = titleEl.current?.textContent ?? ''
    const file = pieceAsMarkdown({ ...(stored?.piece ?? piece), title: piece.kind === 'essay' ? title : (stored?.piece ?? piece).title }, sections)
    download(file.name, file.text)
    return file.name
  }

  return (
    <div ref={screen} className="page-screen" inert={covered} aria-hidden={covered}>
      <div className="head">
        <button type="button" className="library-link" onClick={onLibrary}>
          Library
        </button>
        {page > 0 && <div className="running-head">{heading}</div>}
      </div>

      <div ref={viewport} className="pager">
        <div ref={flow} className="flow" lang={piece.lang}>
          <h1
            ref={(el) => {
              titleEl.current = el
              if (el && el.dataset.ready !== opened.sectionId) {
                el.textContent = titleOf(opened)
                el.dataset.ready = opened.sectionId
              }
            }}
            className="title"
            contentEditable={titleEditable ? 'plaintext-only' : undefined}
            aria-label={titleEditable ? 'Title' : undefined}
            data-placeholder={piece.kind === 'book' ? 'Chapter title' : 'Untitled'}
            spellcheck
            onInput={() => {
              setHeading(titleEl.current?.textContent ?? '')
              live.current?.save.touch()
              live.current?.moment.touch()
              requestAnimationFrame(() => live.current?.pager.measure())
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              // Return in the title goes on to the text.
              e.preventDefault()
              const view = live.current?.editor.view
              if (!view) return
              view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)))
              view.focus()
            }}
          />
          <div ref={mount} />
        </div>
      </div>

      {live.current && writing && !readOnly && keyboard > 0 && selection && (
        <WritingBar editor={live.current.editor} active={selection.active} keyboard={keyboard} />
      )}
      {live.current && !readOnly && keyboard === 0 && selection?.rect && (
        <SelectionMenu editor={live.current.editor} rect={selection.rect} active={selection.active} onKeep={() => void live.current?.keep()} />
      )}

      <div className={keyboard > 0 ? 'foot raised' : 'foot'} style={keyboard > 0 ? { bottom: keyboard } : undefined}>
        {tools ? (
          <ToolsBar
            page={page + 1}
            count={count}
            words={words}
            onClose={closeTools}
            onTextSettings={() => setSheet('text')}
            onExport={() => setSheet('export')}
          />
        ) : (
          <button
            ref={pageButton}
            type="button"
            className="page-button surface"
            aria-label={`Page ${page + 1} of ${count}. Open tools`}
            onClick={() => setTools(true)}
          >
            {page + 1}
          </button>
        )}
      </div>

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

      {writer === 'elsewhere' ? (
        <div className="line surface" role="status">
          Open in another window ·
          <button type="button" onClick={onWriteHere}>
            Write here
          </button>
        </div>
      ) : failed ? (
        <div className="line surface" role="alert">
          Can't save right now. Your words are still here.
          <button type="button" onClick={() => void exportMarkdown()}>
            Save a copy
          </button>
        </div>
      ) : (
        line && (
          <div className="line surface" role="status">
            {line}
          </div>
        )
      )}

      <div className="visually-hidden" aria-live="polite">
        {announce}
      </div>
    </div>
  )
}

function titleOf(opened: Opened): string {
  const { piece, sectionId } = opened
  if (piece.kind === 'essay') return piece.title
  const section = piece.sections.find((s) => s.sectionId === sectionId)
  return piece.kind === 'journal' ? dayTitle(section?.title ?? '') : (section?.title ?? '')
}

function showCaret(view: EditorView, pager: Pager) {
  const { head } = view.state.selection
  try {
    pager.show(view.coordsAtPos(head).left)
  } catch {
    // Not laid out yet.
  }
}

/** Where the writer is: the caret if writing, as a paragraph, an offset and its opening words. */
function placeOf(view: EditorView, sectionId: string, page: number): Place | undefined {
  const $head = view.state.selection.$head
  const paragraph = $head.index(0)
  const node = view.state.doc.maybeChild(paragraph)
  if (!node) return undefined
  return {
    sectionId,
    paragraph,
    offset: $head.parentOffset,
    snippet: node.textContent.slice(0, 160),
    page: page + 1,
    caret: view.hasFocus(),
    at: Date.now(),
  }
}

/** Finds the place again after edits made elsewhere: by its words, else the nearest paragraph. */
function restorePlace(view: EditorView, place: Place | undefined, sectionId: string) {
  if (!place || place.sectionId !== sectionId) return
  const doc = view.state.doc
  const key = place.snippet.slice(0, 40)
  let index = -1
  if (doc.maybeChild(place.paragraph)?.textContent.startsWith(key)) index = place.paragraph
  else doc.forEach((node, _, i) => {
    if (index < 0 && key && node.textContent.startsWith(key)) index = i
  })
  if (index < 0) index = Math.min(place.paragraph, doc.childCount - 1)
  let pos = 0
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize
  const node = doc.child(index)
  const at = pos + 1 + Math.min(place.offset, node.content.size)
  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, at)))
}
