import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { debounced, moments } from '../adapters/schedule'
import { pieceAsMarkdown } from '../domain/export'
import { countWords } from '../domain/markdown'
import type { Piece, Place } from '../domain/model'
import { openPiece, rename, renameSection, savePlace, setSubtitle, takeMoment, write, type Deps } from '../domain/pieces'
import { dayTitle, words as wordsLine } from '../domain/words'
import { createEditor, type Editor } from '../page/editor'
import { geometry, Pager } from '../page/pager'
import { download } from './download'
import { ExportSheet } from './Export'
import { update, useSettings } from './settings'
import { WordButton } from './WordButton'
import { unsaved } from './unsaved'
import { TextSettings, ToolsBar } from './Tools'
import { SelectionMenu, useKeyboard, WritingBar } from './Writing'

export interface Opened {
  piece: Piece
  sectionId: string
  content: string
  /** When this section's text was last stored: kept words newer than this start the page. */
  updatedAt?: number
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
  /** The closing page's last save, so the app lets go of the piece only after it. */
  closingRef: { current: Promise<void> }
  /** The library shows over the page; the page stays laid out behind it, inert. */
  covered: boolean
  onLibrary(): void
  onChange(piece: Piece): void
}

const MIN_SIDE = 24
/** How far beside the text a click in the margin must be to turn the page. */
const MARGIN_CLEAR = 80

export function Page({ deps, opened, writer, onWriteHere, flushRef, closingRef, covered, onLibrary, onChange }: Props) {
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
  /** A book's own title, on its title page before chapter 1. */
  const bookTitleEl = useRef<HTMLHeadingElement>(null)
  /** Its subtitle, under the title on the title page. */
  const subtitleEl = useRef<HTMLParagraphElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const pageButton = useRef<HTMLButtonElement>(null)
  /** The writer typed, clicked into the text or turned a page since this section opened. */
  const moved = useRef(false)
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
  // A book opens on its title page: its own title, then chapter 1 on the next page (DESIGN.md, Books and chapters).
  const titlePage = piece.kind === 'book' && piece.sections[0]?.sectionId === sectionId

  // The title field is the page's own text (uncontrolled), set each time a section opens:
  // a rename from the library, or Write here, opens it again with the title as stored.
  useLayoutEffect(() => {
    const kept = keptFor(opened)
    const title = kept?.title ?? titleOf(opened)
    if (titleEl.current) titleEl.current.textContent = title
    if (bookTitleEl.current) bookTitleEl.current.textContent = kept?.bookTitle ?? opened.piece.title
    if (subtitleEl.current) subtitleEl.current.textContent = kept?.subtitle ?? opened.piece.subtitle ?? ''
    setHeading(title)
  }, [opened])

  useEffect(() => {
    moved.current = false
    // Words kept for this section and newer than what is stored start this page, and it saves them.
    const waiting = keptFor(opened)
    const state = { piece, title: titleOf(opened), bookTitle: piece.title, subtitle: piece.subtitle ?? '', saved: opened.content }
    let failedNow = false
    let closed = false
    let retry: ReturnType<typeof setTimeout> | undefined
    /** What this page holds that is not stored: a title only when it changed. */
    const readBookTitle = () => (bookTitleEl.current ? (bookTitleEl.current.textContent ?? state.bookTitle) : null)
    const readSubtitle = () => (subtitleEl.current ? (subtitleEl.current.textContent ?? state.subtitle) : null)
    const entry = (markdown: string, title: string | null, bookTitle: string | null = readBookTitle(), subtitle: string | null = readSubtitle()) => ({
      bookTitle: bookTitle !== null && bookTitle !== state.bookTitle ? bookTitle : null,
      subtitle: subtitle !== null && subtitle !== state.subtitle ? subtitle : null,
      piece: state.piece,
      pieceId: piece.id,
      sectionId,
      name: pieceAsMarkdown(state.piece, []).name,
      markdown,
      title: title !== null && title !== state.title ? title : null,
    })

    const save = debounced(
      async () => {
        // Read everything before the first await: the page may close while this runs.
        const since = Date.now()
        const markdown = editor.markdown()
        const title = piece.kind === 'journal' ? null : (titleEl.current?.textContent ?? state.title)
        const bookTitle = readBookTitle()
        const subtitle = readSubtitle()
        const changed =
          markdown !== state.saved ||
          (title !== null && title !== state.title) ||
          (bookTitle !== null && bookTitle !== state.bookTitle) ||
          (subtitle !== null && subtitle !== state.subtitle)
        if (readOnlyNow.current) {
          // Another window writes this piece now: what was not saved here waits, with Save a copy.
          if (changed) unsaved.keep(entry(markdown, title, bookTitle, subtitle), since)
          return
        }
        try {
          await write(deps, state.piece, sectionId, markdown)
          state.saved = markdown
          // A journal day's title is its date, never written here.
          if (title !== null && title !== state.title) {
            if (piece.kind === 'essay') await rename(deps, state.piece, title)
            else await renameSection(deps, state.piece, sectionId, title)
            state.title = title
          }
          if (bookTitle !== null && bookTitle !== state.bookTitle) {
            await rename(deps, state.piece, bookTitle)
            state.bookTitle = bookTitle
          }
          if (subtitle !== null && subtitle !== state.subtitle) {
            await setSubtitle(deps, state.piece, subtitle)
            state.subtitle = subtitle
          }
          // Clears only these words: newer ones kept meanwhile (the page hid) stay.
          unsaved.saved(sectionId, markdown, title)
          const stored = await openPiece(deps, piece.id)
          if (stored) {
            state.piece = stored.piece
            onChange(stored.piece)
          }
          if (failedNow) setFailed((failedNow = false))
        } catch (error) {
          // The words stay; say so, and keep trying while this page is open (0010).
          // A closed page hands them on and never writes again.
          unsaved.keep(entry(markdown, title, bookTitle, subtitle), since)
          if (!closed) {
            setFailed((failedNow = true))
            clearTimeout(retry)
            retry = setTimeout(() => save.touch(), 5000)
          }
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
      // Only a place the writer reached here: opening a piece and leaving it untouched moves nothing.
      const place = moved.current ? placeOf(editor.view, sectionId, pager.page, viewport.current) : undefined
      if (place) await savePlace(deps, piece.id, place).catch(() => {})
      const stored = await openPiece(deps, piece.id).catch(() => undefined)
      if (stored) onChange(stored.piece)
    })

    // Leaving, hiding, closing: save now and keep a moment (0005).
    const flush = async () => {
      moment.touch()
      await moment.flush()
    }

    let shown = -1
    let goalX: number | undefined
    let skipUntil = 0
    let lastVertical = -1
    const pager = new Pager(viewport.current!, flow.current!, (p, c) => {
      setPage(p)
      setCount(c)
      // A turn is announced; a page added by typing is not (DESIGN.md, Behaviour).
      if (p !== shown && shown !== -1) setAnnounce(`Page ${p + 1} of ${c}`)
      shown = p
    })
    pager.onDrift = () => showCaret(editor.view, pager)

    const editor = createEditor(mount.current!, {
      content: waiting?.markdown ?? opened.content,
      lang: piece.lang,
      onChange(markdown) {
        moved.current = true
        setWords(countWords(markdown))
        save.touch()
        moment.touch()
        requestAnimationFrame(() => pager.measure())
      },
      onCaret: (view) => showCaret(view, pager),
      onFocusChange(focused) {
        if (focused) moved.current = true
        setWriting(focused)
        if (focused) setSelection((s) => s ?? { rect: null, active: editor.active() })
        else {
          setSelection(null)
          void flush()
        }
      },
      onSelection(view, tr) {
        const { from, to, empty } = view.state.selection
        let rect: DOMRect | null = null
        if (!empty && view.hasFocus()) {
          const a = view.coordsAtPos(from)
          const b = view.coordsAtPos(to)
          rect = new DOMRect(Math.min(a.left, b.left), Math.min(a.top, b.top), Math.abs(b.right - a.left), Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top))
        }
        setSelection({ rect, active: editor.active() })
        // A move the page made itself (↑, ↓, a turn) already shows the right page.
        if (tr.getMeta(PAGED)) skipUntil = performance.now() + 150
      },
      editable: () => !readOnlyNow.current,
      // ↑ and ↓ move a line at the same place across, and cross to the next page at a page's
      // edge. The browser's own caret moves are unreliable in columns (it can jump into a
      // column out of view), so plain ↑ and ↓ are the page's; with Shift they stay the browser's.
      onKey(view, e) {
        // ← and → are the browser's, but Firefox will not move the caret into a column out of
        // view: at a page's edge it stops. When a move left the caret where it was, step it.
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && !e.isComposing) {
          const before = view.state.selection
          requestAnimationFrame(() => {
            if (!view.state.selection.eq(before) || !before.empty) return
            const next = stepped(view, before.head, e.key === 'ArrowRight' ? 1 : -1)
            if (next !== null) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(next), e.key === 'ArrowRight' ? 1 : -1)))
          })
          return false
        }
        if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return false
        const caret = caretRect(view)
        if (!caret) return false
        const box = viewport.current!.getBoundingClientRect()
        const line = caret.height || 20
        const down = e.key === 'ArrowDown'
        // Keep the place across while moving up and down, as text fields do.
        goalX = e.repeat || lastVertical === view.state.selection.head ? (goalX ?? caret.left) : caret.left
        const x = Math.min(Math.max(goalX, box.left + 1), box.right - 1)
        // Step past paragraph gaps until a different line answers.
        let hit: { pos: number } | null = null
        for (let y = down ? caret.bottom + 2 : caret.top - 2; y >= box.top && y <= box.bottom; y += down ? 3 : -3) {
          const h = view.posAtCoords({ left: x, top: y })
          if (!h) continue
          const top = view.coordsAtPos(h.pos, 1).top
          if (down ? top > caret.top + 2 : top < caret.top - 2) {
            hit = h
            break
          }
        }
        if (!hit) {
          // No line left on this page that way: the next page's first line, or the previous one's last.
          if (down ? pager.page >= pager.count - 1 : pager.page === 0) return true
          if (down) pager.next()
          else pager.previous()
          hit = view.posAtCoords({ left: x, top: down ? box.top + line / 2 : lastLineTop(view, box) })
        }
        if (hit) {
          view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(hit.pos))).setMeta(PAGED, true))
          lastVertical = view.state.selection.head
        }
        return true
      },
    })

    const relayout = () => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const max = (document.documentElement.dataset.measure === 'wide' ? 40 : 34) * root
      // The journal's margin rule sits 24px in on a phone, with the text at 44px (DESIGN.md, The journal).
      const g = geometry(document.documentElement.clientWidth, max, MIN_SIDE, piece.kind === 'journal' ? 44 : MIN_SIDE)
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
    // Kept words (and title, set above) are the page's now: save them.
    if (waiting) save.touch()

    // Lay out once the fonts are in, so page breaks do not move after load (0011).
    relayout()
    restorePlace(editor.view, piece.place, sectionId)
    void document.fonts.ready.then(() => {
      relayout()
      if (piece.place?.sectionId === sectionId) showCaret(editor.view, pager, true)
    })
    // A font arriving late, for a script first used now, moves the breaks too.
    const fontsLoaded = () => pager.measure()
    document.fonts.addEventListener('loadingdone', fontsLoaded)

    // Leaving: the database may not finish while the page unloads, so first put what is
    // not stored yet in the journal (synchronous), then save; a launch writes the journal first.
    const journal = () => {
      if (closed || readOnlyNow.current) return
      const markdown = editor.markdown()
      const title = piece.kind === 'journal' ? null : (titleEl.current?.textContent ?? state.title)
      const bookTitle = readBookTitle()
      const subtitle = readSubtitle()
      if (
        markdown !== state.saved ||
        (title !== null && title !== state.title) ||
        (bookTitle !== null && bookTitle !== state.bookTitle) ||
        (subtitle !== null && subtitle !== state.subtitle)
      )
        unsaved.keep(entry(markdown, title, bookTitle, subtitle))
    }
    const onHide = (e: Event) => {
      if (e.type === 'pagehide' || document.visibilityState === 'hidden') {
        journal()
        void flush()
      }
    }
    const onResize = () => {
      relayout()
      showCaret(editor.view, pager)
    }
    // The page follows the caret: after any caret move (keys, clicks, a phone keyboard,
    // find in page), once the browser has drawn it, show the page it is drawn on. One rule
    // in one place, since the browser's own moves can land in a column out of view.
    let following = 0
    const follow = () => {
      cancelAnimationFrame(following)
      following = requestAnimationFrame(() => {
        if (performance.now() > skipUntil && editor.view.hasFocus()) showCaret(editor.view, pager)
      })
    }
    document.addEventListener('selectionchange', follow)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    window.addEventListener('resize', onResize)

    return () => {
      document.removeEventListener('selectionchange', follow)
      cancelAnimationFrame(following)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      window.removeEventListener('resize', onResize)
      document.fonts.removeEventListener('loadingdone', fontsLoaded)
      clearTimeout(retry)
      // The last save runs on what the page holds now; it never retries after this.
      const last = flush().finally(() => {
        closed = true
        save.cancel()
        moment.cancel()
      })
      closed = true
      closingRef.current = last
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
  const firstCover = useRef(true)
  useEffect(() => {
    const first = firstCover.current
    firstCover.current = false
    // At launch the last piece is laid out behind the library: nothing to save yet, and its place must stay.
    if (covered) {
      if (!first) void live.current?.flush()
    } else if (opened.fresh && !opened.focused && !readOnly) {
      opened.focused = true
      if (titlePage) bookTitleEl.current?.focus()
      else if (titleEditable) titleEl.current?.focus()
      else live.current?.editor.focus()
    }
  }, [covered, readOnly])

  // Turning pages: keys, the wheel (one page per gesture), a sideways swipe, the side margins.
  useEffect(() => {
    if (covered) return
    const el = screen.current!
    // A turn by hand, wheel or key is the writer moving: their place follows.
    const pager = () => {
      moved.current = true
      return live.current?.pager
    }

    // A turn while writing takes the caret along to the top of the new page,
    // so typing goes on where the writer is looking.
    const turn = (dir: 1 | -1) => {
      const p = pager()
      if (!p) return
      if (dir > 0) p.next()
      else p.previous()
      const view = live.current?.editor.view
      if (view?.hasFocus()) caretToTop(view, viewport.current!)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowRight')) turn(1)
      else if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowLeft')) turn(-1)
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
      if (delta > 0) turn(1)
      else turn(-1)
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
      if (dx < 0) turn(1)
      else turn(-1)
    }

    // A click in the side margins turns the page, but not near the text, where a click is
    // likely aimed at a word, and never after a drag, which is selecting (DESIGN.md, Behaviour).
    let down: { x: number; y: number } | undefined
    const onMouseDown = (e: MouseEvent) => (down = { x: e.clientX, y: e.clientY })
    const onClick = (e: MouseEvent) => {
      const from = down
      down = undefined
      const g = live.current?.pager.g
      if (!g || g.side < 120 || (e.target as HTMLElement).closest('button, .pager, .sheet, [contenteditable]')) return
      if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4) return
      if (!window.getSelection()?.isCollapsed) return
      if (e.clientX < g.side - MARGIN_CLEAR) turn(-1)
      else if (e.clientX > g.side + g.measure + MARGIN_CLEAR) turn(1)
    }

    window.addEventListener('keydown', onKey)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('mousedown', onMouseDown)
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
    // Closing the tools closes what was opened from them.
    setSheet(null)
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
    <div ref={screen} className={piece.kind === 'journal' ? 'page-screen journal' : 'page-screen'} inert={covered} aria-hidden={covered}>
      <div className="head">
        <WordButton word="Library" onClick={onLibrary} />
        {page > (titlePage ? 1 : 0) && <div className="running-head">{heading}</div>}
      </div>

      <div ref={viewport} className="pager">
        <div ref={flow} className="flow" lang={piece.lang}>
          {titlePage && (
            // The title page, as in a printed book: the title and its subtitle, centred, in the
            // upper third; chapter 1 begins on the next page (DESIGN.md, Books and chapters).
            <div className="title-page">
              <h1
                ref={bookTitleEl}
                className="book-title"
                contentEditable={readOnly ? undefined : 'plaintext-only'}
                aria-label={readOnly ? undefined : 'Book title'}
                data-placeholder="Untitled"
                spellcheck
                onFocus={() => live.current?.pager.turnTo(0)}
                onInput={() => {
                  live.current?.save.touch()
                  live.current?.moment.touch()
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  // Return goes on to the subtitle.
                  e.preventDefault()
                  subtitleEl.current?.focus()
                }}
              />
              <p
                ref={subtitleEl}
                className="subtitle"
                contentEditable={readOnly ? undefined : 'plaintext-only'}
                aria-label={readOnly ? undefined : 'Subtitle'}
                data-placeholder="Subtitle"
                spellcheck
                onFocus={() => live.current?.pager.turnTo(0)}
                onInput={() => {
                  live.current?.save.touch()
                  live.current?.moment.touch()
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  // Return goes on to chapter 1's title, on the next page.
                  e.preventDefault()
                  titleEl.current?.focus()
                }}
              />
            </div>
          )}
          <h1
            ref={titleEl}
            className={titlePage ? 'title chapter-opening' : 'title'}
            contentEditable={titleEditable ? 'plaintext-only' : undefined}
            aria-label={titleEditable ? 'Title' : undefined}
            data-placeholder={piece.kind === 'book' ? 'Chapter title' : 'Untitled'}
            spellcheck
            onFocus={(e) => live.current?.pager.show((e.currentTarget as HTMLElement).getBoundingClientRect().left)}
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
        {/* The day's words, at the text's left edge, level with the page button. */}
        {piece.kind === 'journal' && !tools && <span className="day-words">{wordsLine(words)}</span>}
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
          <>
          {/* The way in, shown once: until the tools are first opened on this device (DESIGN.md, Control). */}
          {!settings.toolsSeen && keyboard === 0 && !failed && !line && writer !== 'elsewhere' && (
            <span className="way-in" aria-hidden="true">
              Your tools are here
            </span>
          )}
          <button
            ref={pageButton}
            type="button"
            className="page-button surface"
            aria-label={`Page ${page + 1} of ${count}. Open tools`}
            onClick={() => {
              setTools(true)
              if (!settings.toolsSeen) update({ toolsSeen: true })
            }}
          >
            {page + 1}
          </button>
          </>
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

/** Words kept for this section that are newer than what is stored for it. */
function keptFor(opened: Opened) {
  const kept = unsaved.get(opened.sectionId)
  return kept && kept.at > (opened.updatedAt ?? 0) ? kept : undefined
}

function titleOf(opened: Opened): string {
  const { piece, sectionId } = opened
  if (piece.kind === 'essay') return piece.title
  const section = piece.sections.find((s) => s.sectionId === sectionId)
  return piece.kind === 'journal' ? dayTitle(section?.title ?? '') : (section?.title ?? '')
}

/** One character on from `pos`, a whole one (an emoji is one), or into the next block; null at the end. */
function stepped(view: EditorView, pos: number, dir: 1 | -1): number | null {
  const doc = view.state.doc
  const $pos = doc.resolve(pos)
  const inBlock = dir > 0 ? $pos.parentOffset < $pos.parent.content.size : $pos.parentOffset > 0
  if (!inBlock) {
    // Across a block edge: the next block's start, or the previous one's end.
    const target = dir > 0 ? $pos.after() + 1 : $pos.before() - 1
    return target > 0 && target < doc.content.size ? target : null
  }
  const text = dir > 0 ? doc.textBetween(pos, Math.min(pos + 16, $pos.end()), '\ufffc', '\ufffc') : doc.textBetween(Math.max(pos - 16, $pos.start()), pos, '\ufffc', '\ufffc')
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
  const step = (dir > 0 ? parts[0] : parts.at(-1))?.segment.length ?? 1
  return pos + dir * step
}

/** The caret to the first line on screen. */
function caretToTop(view: EditorView, viewport: HTMLElement) {
  const r = viewport.getBoundingClientRect()
  const hit = view.posAtCoords({ left: r.left + 2, top: r.top + 4 })
  if (!hit) return
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(hit.pos))).setMeta(PAGED, true))
}

/** Marks a selection the page set itself, already on the page in view. */
const PAGED = 'elbowpatch-paged'

/**
 * Shows the page the text's caret is on, while writing in the text. Not when the writer is
 * in a title field or reading: then the page stays. `place` forces it, to open at their place.
 */
function showCaret(view: EditorView, pager: Pager, place = false) {
  if (!place && !view.hasFocus()) return
  const rect = caretRect(view)
  if (rect) pager.show(rect.left)
}

/**
 * Where the caret is drawn. At a soft line break the same position is the end
 * of one line and the start of the next; the browser's own caret says which.
 */
function caretRect(view: EditorView): DOMRect | null {
  if (view.hasFocus()) {
    const selection = view.dom.ownerDocument.getSelection()
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0).cloneRange()
      range.collapse(selection.focusNode === range.endContainer && selection.focusOffset === range.endOffset)
      const rects = range.getClientRects()
      const r = rects[rects.length - 1] ?? range.getBoundingClientRect()
      if (r && (r.width || r.height)) return r
    }
  }
  try {
    const c = view.coordsAtPos(view.state.selection.head, 1)
    return new DOMRect(c.left, c.top, 0, c.bottom - c.top)
  } catch {
    return null // not laid out yet
  }
}

/** The top of the last line of text on the page in view, to land the caret on it. */
function lastLineTop(view: EditorView, box: DOMRect): number {
  for (let y = box.bottom - 4; y > box.top; y -= 6) {
    const hit = view.posAtCoords({ left: box.left + 2, top: y })
    if (hit && hit.inside >= 0) return y
  }
  return box.bottom - 10
}

/** Where the writer is: the caret if writing, as a paragraph, an offset and its opening words. */
function placeOf(view: EditorView, sectionId: string, page: number, viewport: HTMLElement | null): Place | undefined {
  // Writing: the caret. Reading: the first line on screen (DESIGN.md, Behaviour).
  let pos = view.state.selection.head
  if (!view.hasFocus() && viewport) {
    const r = viewport.getBoundingClientRect()
    pos = view.posAtCoords({ left: r.left + 2, top: r.top + 2 })?.pos ?? pos
  }
  const $head = view.state.doc.resolve(pos)
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
