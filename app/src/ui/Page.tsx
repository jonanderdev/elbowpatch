import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Selection, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { debounced, moments } from '../adapters/schedule'
import { pieceAsMarkdown } from '../domain/export'
import { countWords } from '../domain/markdown'
import type { Piece, Place } from '../domain/model'
import { openPiece, rename, renameSection, savePlace, setSubtitle, takeMoment, write, type Deps } from '../domain/pieces'
import { dayTitle, words as wordsLine } from '../domain/words'
import { createEditor, type Editor } from '../page/editor'
import { geometry, linesOf, pageAt, Pager, type Line } from '../page/pager'
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
  // A book or a journal opens on its title page: its own name, then chapter 1 or the first day
  // on the next page (DESIGN.md, Books and chapters; The journal).
  const titlePage = piece.kind !== 'essay' && piece.sections[0]?.sectionId === sectionId

  // The title field is the page's own text (uncontrolled), set each time a section opens:
  // a rename from the library, or Write here, opens it again with the title as stored.
  useLayoutEffect(() => {
    const kept = keptFor(opened)
    const title = kept?.title ?? titleOf(opened)
    if (titleEl.current) titleEl.current.textContent = title
    if (bookTitleEl.current) bookTitleEl.current.textContent = kept?.bookTitle ?? opened.piece.title
    if (subtitleEl.current) subtitleEl.current.textContent = kept?.subtitle ?? opened.piece.subtitle ?? ''
    for (const el of [titleEl.current, bookTitleEl.current, subtitleEl.current]) if (el) emptied(el)
    setHeading(title)
  }, [opened])

  // Before the first paint, so a piece opens on its text at the writer's place, never a frame
  // of page 1 or of an empty page first.
  useLayoutEffect(() => {
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
      // Once kept, it stays until they move again: a later save, as the page closes behind the
      // library, would read a page no longer laid out as they left it.
      const place = moved.current ? placeOf(editor.view, sectionId, pager.page, viewport.current) : undefined
      moved.current = false
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
    // The caret the page placed itself (↑, ↓, a turn), already on the page it shows.
    let placed: Selection | null = null
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
        // A move the page made itself (↑, ↓, a turn) already shows the right page; any other
        // move, however soon after, is followed.
        placed = tr.getMeta(PAGED) ? view.state.selection : null
      },
      editable: () => !readOnlyNow.current,
      // ↑ and ↓ move a line at the same place across, and cross to the next page at a page's
      // edge. The browser's own caret moves are unreliable in columns (it can jump into a
      // column out of view), so plain ↑ and ↓ are the page's; with Shift they stay the browser's.
      onKey(view, e) {
        lastMove = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
        // ← and → are the browser's, but Firefox will not move the caret into a column out of
        // view: at a page's edge it stops. When a move left the caret where it was, step it.
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && !e.isComposing) {
          // The browser's own caret, not the editor's, which may not have caught up with it yet.
          const dom = getSelection()
          const node = dom?.focusNode
          const offset = dom?.focusOffset
          if (!view.state.selection.empty || !node) return false
          requestAnimationFrame(() => {
            const now = getSelection()
            if (!now?.isCollapsed || now.focusNode !== node || now.focusOffset !== offset) return
            const next = stepped(view, view.posAtDOM(node, offset ?? 0), e.key === 'ArrowRight' ? 1 : -1)
            if (next !== null) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(next), e.key === 'ArrowRight' ? 1 : -1)))
          })
          return false
        }
        if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return false
        const caret = caretRect(view)
        if (!caret) return false
        const down = e.key === 'ArrowDown'
        const head = view.state.selection.head
        const edge = (page: number) => flow.current!.getBoundingClientRect().left + page * pager.g.stride
        // The lines of this paragraph and the ones either side, as drawn; the caret's is the one
        // it is drawn on.
        const lines = linesNear(view, head, pager, flow.current!)
        const page = pageAt(caret.left - edge(0), pager.g)
        const at = lines.findIndex((l) => l.page === page && caret.top < l.bottom - 1 && caret.bottom > l.top + 1)
        if (at < 0) return false
        // Keep the place across while moving up and down, as text fields do.
        if (goalX === undefined || !(e.repeat || lastVertical === head)) goalX = caret.left - edge(page)
        const target = lines[at + (down ? 1 : -1)]
        if (!target) {
          // The first or last line of the text: to its start or end, as text fields do.
          const doc = view.state.doc
          view.dispatch(view.state.tr.setSelection(down ? TextSelection.atEnd(doc) : TextSelection.atStart(doc)).setMeta(PAGED, true))
          showCaret(view, pager)
          lastVertical = view.state.selection.head
          return true
        }
        // On another page: turn to it first, so the line is on screen to be found.
        if (target.page !== pager.page) pager.turnTo(target.page)
        const x = edge(target.page) + Math.min(Math.max(goalX, target.left + 1), target.right - 1)
        const hit = view.posAtCoords({ left: x, top: (target.top + target.bottom) / 2 })
        if (hit) placeOn(view, hit.pos, target, edge(target.page), pager)
        lastVertical = view.state.selection.head
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
    // Their page now, with the fonts there are; again once all have loaded.
    if (piece.place?.sectionId === sectionId) showCaret(editor.view, pager, true)
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
    // The last caret move by hand: -1 back (← or a click), 1 on (→), 0 anything else (typing).
    let lastMove = 0
    const follow = () => {
      cancelAnimationFrame(following)
      following = requestAnimationFrame(() => {
        if (placed && editor.view.state.selection.eq(placed)) return
        if (!editor.view.hasFocus()) return
        // Left, by ← → or a click, where a page breaks mid-paragraph and drawn on the earlier page
        // (as Firefox does), the caret is painted at that page's top: a letter on, the way it went.
        const at = lastMove ? drawnBeforeBreak(editor.view, pager, flow.current!) : null
        if (at !== null) {
          const view = editor.view
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at + (lastMove > 0 ? 1 : -1))))
          return
        }
        showCaret(editor.view, pager)
      })
    }
    // A click places the caret like ←: at a page's end, kept on that page.
    const onPointer = () => (lastMove = -1)
    mount.current!.addEventListener('mousedown', onPointer)
    document.addEventListener('selectionchange', follow)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    window.addEventListener('resize', onResize)

    return () => {
      document.removeEventListener('selectionchange', follow)
      mount.current?.removeEventListener('mousedown', onPointer)
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
  // Coming to a new piece: the title takes the caret (the text, in a journal). Coming back to
  // one left while writing: the caret is where it was, ready to type (DESIGN.md, Behaviour);
  // on a phone it waits for a tap, so the keyboard does not cover the page unasked.
  const firstCover = useRef(true)
  const writingWhenCovered = useRef(false)
  useEffect(() => {
    const first = firstCover.current
    firstCover.current = false
    // At launch the last piece is laid out behind the library: nothing to save yet, and its place must stay.
    if (covered) {
      if (!first) void live.current?.flush()
    } else if (writingWhenCovered.current && !readOnly) {
      // Back from the library to the piece being written: the caret where it was.
      writingWhenCovered.current = false
      if (matchMedia('(pointer: fine)').matches) live.current?.editor.focus()
    } else if (opened.fresh && !opened.focused && !readOnly) {
      opened.focused = true
      if (titlePage) {
        bookTitleEl.current?.focus()
        // A new journal is called "Journal": selected, so typing names it.
        if (piece.kind === 'journal') getSelection()?.selectAllChildren(bookTitleEl.current!)
      } else if (titleEditable) titleEl.current?.focus()
      else live.current?.editor.focus()
    } else if (!opened.fresh && !opened.focused && !readOnly) {
      opened.focused = true
      const place = piece.place
      if (place?.caret && place.sectionId === sectionId && matchMedia('(pointer: fine)').matches) live.current?.editor.focus()
    }
  }, [covered, readOnly])

  // Turning pages: keys, a sideways swipe on a phone, the side margins.
  useEffect(() => {
    if (covered) return
    const el = screen.current!
    // A turn by hand or key is the writer moving: their place follows.
    const pager = () => {
      moved.current = true
      return live.current?.pager
    }

    // A turn while writing takes the caret along to the end of the text on the new page, where
    // words are added next (DESIGN.md, Behaviour).
    const turn = (dir: 1 | -1) => {
      const p = pager()
      if (!p) return
      const from = p.page
      if (dir > 0) p.next()
      else p.previous()
      // At the first or last page nothing turns, and the caret stays put.
      const view = live.current?.editor.view
      if (p.page === from || !view || readOnlyNow.current) return
      // Ready to type at once: while writing, and on desktop also while reading. Not taken from
      // the tools or a sheet; on a phone a swipe does not raise the keyboard, and a tap places it.
      const writing = view.hasFocus()
      const active = document.activeElement
      if (!writing && (!matchMedia('(pointer: fine)').matches || active?.closest('.sheet, .foot'))) return
      // Placed before the text takes focus, so the browser never scrolls to the old caret first.
      if (caretToEnd(view, viewport.current!)) {
        if (!writing) view.focus()
        return
      }
      // A page with no text (a book's title page) takes it into the book's title.
      const title = bookTitleEl.current
      if (title) {
        title.focus()
        getSelection()?.collapse(title, title.childNodes.length)
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowRight')) turn(1)
      else if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowLeft')) turn(-1)
      else return
      e.preventDefault()
    }

    // Scrolling does not turn pages (DESIGN.md, Behaviour): the page is no scroll, and a sideways
    // swipe is the browser's Back. Swallowed here, so it does neither.
    const onWheel = (e: WheelEvent) => {
      if (!(e.target as HTMLElement).closest('.sheet')) e.preventDefault()
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
    // The margins are for turning: a click there never reaches the text, even with no page to
    // turn to, and the pointer shows the way while there is one.
    const side = (e: MouseEvent): 1 | -1 | 0 => {
      const g = live.current?.pager.g
      if (!g || g.side < 120 || (e.target as HTMLElement).closest('button, .pager, .sheet, [contenteditable]')) return 0
      if (e.clientX < g.side - MARGIN_CLEAR) return -1
      if (e.clientX > g.side + g.measure + MARGIN_CLEAR) return 1
      return 0
    }
    const onMouseMove = (e: MouseEvent) => {
      // While pressed, the arrow stays as it is: clicking through pages never flickers it.
      if (e.buttons) return
      const dir = side(e)
      const p = live.current?.pager
      const can = p && (dir < 0 ? p.page > 0 : dir > 0 && p.page < p.count - 1)
      el.dataset.turn = can ? (dir < 0 ? 'back' : 'on') : ''
    }
    let down: { x: number; y: number } | undefined
    const onMouseDown = (e: MouseEvent) => {
      down = { x: e.clientX, y: e.clientY }
      // Keeps the caret where it is, so a turn takes it along as a key does; a selection
      // is left to clear as usual.
      if (side(e) && window.getSelection()?.isCollapsed) e.preventDefault()
    }
    const onClick = (e: MouseEvent) => {
      const from = down
      down = undefined
      const dir = side(e)
      if (!dir) return
      if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4) return
      if (!window.getSelection()?.isCollapsed) return
      turn(dir)
      onMouseMove(e)
    }

    window.addEventListener('keydown', onKey)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('click', onClick)
    return () => {
      el.dataset.turn = ''
      el.removeEventListener('mousemove', onMouseMove)
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
        {/* Pressed, it leaves the caret where it is, so the place kept is the caret's. */}
        <WordButton
          word="Library"
          keepFocus
          onClick={() => {
            writingWhenCovered.current = !!live.current?.editor.view.hasFocus()
            onLibrary()
          }}
        />
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
                aria-label={readOnly ? undefined : piece.kind === 'book' ? 'Book title' : 'Journal name'}
                data-placeholder="Untitled"
                spellcheck
                onFocus={() => live.current?.pager.turnTo(0)}
                onInput={(e) => {
                  emptied(e.currentTarget)
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
                onInput={(e) => {
                  emptied(e.currentTarget)
                  live.current?.save.touch()
                  live.current?.moment.touch()
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  // Return goes on to chapter 1's title, or the first day's text, on the next page.
                  e.preventDefault()
                  if (titleEditable) titleEl.current?.focus()
                  else live.current?.editor.focus()
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
            onInput={(e) => {
              emptied(e.currentTarget)
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

/**
 * An empty field holds one <br> and says so in data-empty, which shows its placeholder.
 * Without the <br>, Firefox puts the caret at the line's left edge, not where centred words start.
 */
function emptied(el: HTMLElement) {
  const empty = el.textContent === ''
  if (empty && !(el.childNodes.length === 1 && el.firstChild?.nodeName === 'BR')) el.replaceChildren(document.createElement('br'))
  el.toggleAttribute('data-empty', empty)
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

/**
 * The caret to the end of the text on the page in view, where words are added next. False when
 * the page holds no text. Found from the text's own boxes, not by asking what is at a point,
 * which a browser can answer with the title over the whole page.
 */
function caretToEnd(view: EditorView, viewport: HTMLElement): boolean {
  const r = viewport.getBoundingClientRect()
  const onPage = (b: DOMRect) => b.right > r.left + 1 && b.left < r.right - 1 && b.height > 0
  const range = document.createRange()
  const blocks: { node: { textContent: string }; offset: number }[] = []
  view.state.doc.forEach((node, offset) => blocks.push({ node, offset }))
  let pos: number | null = null
  for (const { node, offset } of blocks.reverse()) {
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement) || ![...dom.getClientRects()].some(onPage)) continue
    if (!node.textContent) {
      pos = offset + 1
      break
    }
    const texts: Text[] = []
    const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.textContent) texts.push(t as Text)
    for (const t of texts.reverse()) {
      range.selectNodeContents(t)
      if (![...range.getClientRects()].some(onPage)) continue
      // The letters after this page sit right of it: the last on it, by halves.
      let lo = 0
      let hi = t.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        range.setStart(t, mid)
        range.setEnd(t, mid + 1)
        if (range.getBoundingClientRect().left < r.right + 1) lo = mid
        else hi = mid - 1
      }
      pos = view.posAtDOM(t, lo + 1)
      break
    }
    if (pos !== null) break
  }
  if (pos === null) return false
  // Where the page ends mid-paragraph, the position after its last letter is also the start of the
  // next page, and a browser may paint the caret there, or at the page's top. Just before that
  // letter (mostly the space after the last word) is on this page's last line only.
  let at: number = pos
  if (at < view.state.doc.resolve(at).end()) at--
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at), -1)).setMeta(PAGED, true))
  return true
}

/**
 * The lines of the paragraph holding `pos` and of the paragraphs either side, from the boxes the
 * browser draws its text in (an empty paragraph is one line).
 */
function linesNear(view: EditorView, pos: number, pager: Pager, flow: HTMLElement): Line[] {
  const index = view.state.doc.resolve(pos).index(0)
  const boxes: DOMRect[] = []
  const range = document.createRange()
  view.state.doc.forEach((_, offset, i) => {
    if (i < index - 1 || i > index + 1) return
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement)) return
    const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT)
    let text = false
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent) continue
      range.selectNodeContents(t)
      boxes.push(...range.getClientRects())
      text = true
    }
    if (!text) boxes.push(dom.getBoundingClientRect())
  })
  const lineHeight = parseFloat(getComputedStyle(view.dom).lineHeight) || 28
  return linesOf(boxes, pager.g, flow.getBoundingClientRect().left, lineHeight)
}

/**
 * Puts the caret at `pos`, on `line`. Where a line wraps, the same position ends one line and
 * starts the next, and browsers differ in which they draw it on: if it is drawn on the wrong
 * one, it moves a letter at a time onto the line.
 */
function placeOn(view: EditorView, pos: number, line: Line, edge: number, pager: Pager) {
  const end = view.state.doc.content.size
  let at = pos
  // Measured before the caret moves, since a caret drawn out of view makes the browser scroll to it.
  for (let step = 0; step < 3; step++) {
    const caret = drawnAt(view, at)
    if (!caret) break
    const page = pageAt(caret.left - (edge - line.page * pager.g.stride), pager.g)
    const before = page < line.page || (page === line.page && caret.bottom <= line.top + 1)
    const after = page > line.page || (page === line.page && caret.top >= line.bottom - 1)
    if (before && at < end) at++
    else if (after && at > 0) at--
    else break
  }
  // At a line's end where it wraps, after its last space, the position is also the next line's
  // start, and Firefox paints the caret there: just before that space is on this line only.
  const $at = view.state.doc.resolve(at)
  if ($at.parent.isTextblock && $at.parentOffset > 0 && at < $at.end() && /\s/.test(view.state.doc.textBetween(at - 1, at))) {
    const a = view.coordsAtPos(at, -1)
    const b = view.coordsAtPos(at, 1)
    if (Math.abs(a.left - b.left) > 1 && Math.abs(a.top - b.top) > 1 && Math.abs(a.top - line.top) < Math.abs(b.top - line.top)) at--
  }
  view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at))).setMeta(PAGED, true))
}

/**
 * The caret's position when it sits where a page breaks mid-paragraph, after the earlier page's
 * last space (also the next page's first position), and is drawn on the earlier page: there a
 * browser (Firefox) paints it at that page's top. Null anywhere else.
 */
function drawnBeforeBreak(view: EditorView, pager: Pager, flow: HTMLElement): number | null {
  const { empty, head, $head } = view.state.selection
  if (!empty || $head.parentOffset === 0 || $head.parentOffset === $head.parent.content.size) return null
  if (!/\s/.test(view.state.doc.textBetween(head - 1, head))) return null
  const start = flow.getBoundingClientRect().left
  const page = (x: number) => pageAt(x - start, pager.g)
  const before = page(view.coordsAtPos(head, -1).left)
  if (before === page(view.coordsAtPos(head, 1).left)) return null
  const caret = caretRect(view)
  return caret && page(caret.left) === before ? head : null
}

/** Where a caret at `pos` would be drawn, without moving the caret there. */
function drawnAt(view: EditorView, pos: number): DOMRect | null {
  try {
    const { node, offset } = view.domAtPos(pos)
    const range = document.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    const rects = range.getClientRects()
    const r = rects[rects.length - 1] ?? range.getBoundingClientRect()
    return r.width || r.height ? r : null
  } catch {
    return null
  }
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
  if (index < 0 && place.paragraph >= doc.childCount) {
    // Past the end (an empty last paragraph is not stored): the end of the text.
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(doc)))
    return
  }
  if (index < 0) index = place.paragraph
  let pos = 0
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize
  const node = doc.child(index)
  const at = pos + 1 + Math.min(place.offset, node.content.size)
  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, at)))
}
