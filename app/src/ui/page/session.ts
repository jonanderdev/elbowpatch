// One open section on the page: its editor, its pager and its saving, and the rules that keep
// the caret and the page together. Imperative, like the editor it wraps: React creates one per
// opened section (usePageSession), reads its state through the events, and destroys it.

import type { Selection } from 'prosemirror-state'
import { TextSelection } from 'prosemirror-state'
import { countWords } from '../../domain/markdown'
import type { Piece } from '../../domain/model'
import type { Deps } from '../../domain/pieces'
import { caretToEnd, drawnBeforeBreak, moveLine, PAGED, showCaret, stepIfStuck, type LineMemory } from '../../page/caret'
import { createEditor, type Editor } from '../../page/editor'
import { geometry, Pager } from '../../page/pager'
import { placeOf, restorePlace } from '../../page/place'
import { keptFor, titleOf, type Opened, type TitleFields } from './fields'
import { Saving } from './saving'

/** The narrowest side margin, on a phone. */
const MIN_SIDE = 24

export interface SelectionState {
  /** Where a non-empty selection is, for the selection menu; null when the caret is collapsed. */
  rect: DOMRect | null
  active: ReturnType<Editor['active']>
}

export interface SessionEvents {
  /** The page in view or the page count changed; `turned` when it was a turn (announced). */
  pages(page: number, count: number, turned: boolean): void
  words(count: number): void
  failed(failed: boolean): void
  selection(selection: SelectionState | null): void
  writing(focused: boolean): void
  /** The piece as stored now, after a save or a moment. */
  stored(piece: Piece): void
}

export interface SessionOptions {
  deps: Deps
  opened: Opened
  elements: TitleFields & { screen: HTMLElement; viewport: HTMLElement; flow: HTMLElement; mount: HTMLElement }
  /** Another window writes the piece (0010). */
  readOnly(): boolean
  events: SessionEvents
}

export class PageSession {
  readonly editor: Editor
  readonly pager: Pager
  readonly saving: Saving
  /** The writer typed, clicked into the text or turned a page since this section opened. */
  moved = false
  /** The caret the page placed itself (↑, ↓, a turn), already on the page it shows. */
  private placed: Selection | null = null
  /** The last caret move by hand: -1 back (← or a click), 1 on (→), 0 anything else (typing). */
  private lastMove: -1 | 0 | 1 = 0
  private lines: LineMemory = { lastHead: -1 }
  private following = 0
  private shownPage = -1
  private readonly stop: (() => void)[] = []
  private destroyed = false

  constructor(private readonly o: SessionOptions) {
    const { opened, elements: el, events } = o
    const { piece, sectionId } = opened
    // Words kept for this section and newer than what is stored start this page, and it saves them.
    const waiting = keptFor(opened)

    this.pager = new Pager(el.viewport, el.flow, (page, count) => {
      events.pages(page, count, this.shownPage !== -1 && page !== this.shownPage)
      this.shownPage = page
    })
    this.pager.onDrift = () => showCaret(this.editor.view, this.pager)

    this.saving = new Saving({
      deps: o.deps,
      piece,
      sectionId,
      stored: { markdown: opened.content, title: titleOf(opened), bookTitle: piece.title, subtitle: piece.subtitle ?? '' },
      read: () => ({
        markdown: this.editor.markdown(),
        // A journal day's title is its date: never read back from the page.
        title: piece.kind === 'journal' ? null : (el.title?.textContent ?? null),
        bookTitle: el.bookTitle ? (el.bookTitle.textContent ?? '') : null,
        subtitle: el.subtitle ? (el.subtitle.textContent ?? '') : null,
      }),
      readOnly: o.readOnly,
      // Only a place the writer reached here: opening a piece and leaving it untouched moves nothing.
      // Once kept, it stays until they move again: a later save, as the page closes behind the
      // library, would read a page no longer laid out as they left it.
      place: () => {
        const place = this.moved ? placeOf(this.editor.view, sectionId, this.pager.page, el.viewport) : undefined
        this.moved = false
        return place
      },
      onStored: events.stored,
      onFailed: events.failed,
    })

    this.editor = createEditor(el.mount, {
      content: waiting?.markdown ?? opened.content,
      lang: piece.lang,
      editable: () => !o.readOnly(),
      onChange: (markdown) => {
        this.moved = true
        events.words(countWords(markdown))
        this.saving.touch()
        requestAnimationFrame(() => this.pager.measure())
      },
      onCaret: (view) => showCaret(view, this.pager),
      onFocusChange: (focused) => {
        if (focused) this.moved = true
        events.writing(focused)
        events.selection(focused ? selectionState(this.editor) : null)
        if (!focused) void this.saving.flush()
      },
      onSelection: (view, tr) => {
        events.selection(selectionState(this.editor))
        // A move the page made itself already shows the right page; any other, however soon after, is followed.
        this.placed = tr.getMeta(PAGED) ? view.state.selection : null
      },
      onKey: (view, e) => this.onKey(view, e),
    })

    // Kept words (and titles, already in the fields) are the page's now: save them.
    if (waiting) this.saving.save.touch()

    this.relayout()
    restorePlace(this.editor.view, piece.place, sectionId)
    // Their page now, with the fonts there are; again once all have loaded (0011).
    const atPlace = piece.place?.sectionId === sectionId
    if (atPlace) showCaret(this.editor.view, this.pager, true)
    void document.fonts.ready.then(() => {
      if (this.destroyed) return
      this.relayout()
      if (atPlace) showCaret(this.editor.view, this.pager, true)
    })

    this.listen(document.fonts, 'loadingdone', () => this.pager.measure()) // a late font moves the breaks
    this.listen(document, 'selectionchange', () => this.follow())
    this.listen(el.mount, 'mousedown', () => (this.lastMove = -1)) // a click places the caret like ←
    this.listen(document, 'visibilitychange', () => document.visibilityState === 'hidden' && this.leave())
    this.listen(window, 'pagehide', () => this.leave())
    this.listen(window, 'resize', () => {
      this.relayout()
      showCaret(this.editor.view, this.pager)
    })
  }

  /** Lays the pages out for the screen and the text settings. */
  relayout() {
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const max = (document.documentElement.dataset.measure === 'wide' ? 40 : 34) * root
    // The journal's margin rule sits 24px in on a phone, with the text at 44px (DESIGN.md, The journal).
    // The screen's own width: in a window smaller than the app's least size, the screen keeps that size.
    const g = geometry(this.o.elements.screen.clientWidth, max, MIN_SIDE, this.o.opened.piece.kind === 'journal' ? 44 : MIN_SIDE)
    this.o.elements.screen.style.setProperty('--side', `${g.side}px`)
    this.o.elements.screen.style.setProperty('--measure-px', `${g.measure}px`)
    this.pager.layout(g)
  }

  /** Shows the page the caret is on. */
  showCaret() {
    showCaret(this.editor.view, this.pager)
  }

  /**
   * A turn by hand: a page on or back. It takes the caret along, to the end of the text on the new
   * page, where words are added next: always while writing, and on desktop also while reading, so
   * a turn leaves the page ready to type (DESIGN.md, Behaviour). Not taken from the tools or a
   * sheet; on a phone a swipe does not raise the keyboard, and a tap places it.
   */
  turn(dir: 1 | -1) {
    this.moved = true
    const from = this.pager.page
    if (dir > 0) this.pager.next()
    else this.pager.previous()
    // At the first or last page nothing turns, and the caret stays put.
    if (this.pager.page === from || this.o.readOnly()) return
    const view = this.editor.view
    const writing = view.hasFocus()
    if (!writing && (!matchMedia('(pointer: fine)').matches || document.activeElement?.closest('.sheet, .foot'))) return
    // Placed before the text takes focus, so the browser never scrolls to the old caret first.
    if (caretToEnd(view, this.o.elements.viewport)) {
      if (!writing) view.focus()
      return
    }
    // A page with no text (a book's title page) takes it into the book's title.
    const title = this.o.elements.bookTitle
    if (title) {
      title.focus()
      getSelection()?.collapse(title, title.childNodes.length)
    }
  }

  /** Leaving for good, or for a while (hidden, closed): the journal first, then a save. */
  private leave() {
    this.saving.journal()
    void this.saving.flush()
  }

  /** Ends the session. Resolves when its last save is done, so the piece can be let go after it. */
  destroy(): Promise<void> {
    this.destroyed = true
    for (const off of this.stop.splice(0)) off()
    cancelAnimationFrame(this.following)
    const last = this.saving.close()
    this.editor.destroy()
    return last
  }

  /**
   * ↑ and ↓ are the page's: the browser's own moves are unreliable in columns (they can jump into
   * a column out of view). With Shift they stay the browser's. ← and → are the browser's, with a
   * step where Firefox will not move into a column out of view.
   */
  private onKey(view: Editor['view'], e: KeyboardEvent): boolean {
    this.lastMove = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    const plain = !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && plain && !e.isComposing) {
      stepIfStuck(view, e.key === 'ArrowRight' ? 1 : -1)
      return false
    }
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !plain) return false
    return moveLine(view, this.pager, this.o.elements.flow, e.key === 'ArrowDown', e.repeat, this.lines)
  }

  /**
   * The page follows the caret: after any caret move (keys, clicks, a phone keyboard, find in page),
   * once the browser has drawn it, show the page it is drawn on. One rule in one place, since the
   * browser's own moves can land in a column out of view.
   */
  private follow() {
    cancelAnimationFrame(this.following)
    this.following = requestAnimationFrame(() => {
      const view = this.editor.view
      if ((this.placed && view.state.selection.eq(this.placed)) || !view.hasFocus()) return
      // Left by ←, → or a click where a page breaks mid-paragraph and drawn on the earlier page (as
      // Firefox does), the caret is painted at that page's top: a letter on, the way it went.
      const at = this.lastMove ? drawnBeforeBreak(view, this.pager, this.o.elements.flow) : null
      if (at !== null) {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at + (this.lastMove > 0 ? 1 : -1))))
        return
      }
      showCaret(view, this.pager)
    })
  }

  private listen<T extends EventTarget>(target: T, type: string, handler: (e: Event) => void) {
    target.addEventListener(type, handler)
    this.stop.push(() => target.removeEventListener(type, handler))
  }
}

/** The selection for the selection menu and the writing bar. */
function selectionState(editor: Editor): SelectionState {
  const view = editor.view
  const { from, to, empty } = view.state.selection
  let rect: DOMRect | null = null
  if (!empty && view.hasFocus()) {
    const a = view.coordsAtPos(from)
    const b = view.coordsAtPos(to)
    rect = new DOMRect(Math.min(a.left, b.left), Math.min(a.top, b.top), Math.abs(b.right - a.left), Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top))
  }
  return { rect, active: editor.active() }
}
