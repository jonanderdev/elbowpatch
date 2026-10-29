// The caret on paged text (docs/decisions/0003). The text flows in columns, one per page, and
// browsers handle a caret in columns unevenly: their own ↑ and ↓ can jump into a column out of
// view, Firefox will not step ← or → into one, and where a line or a page wraps, one position
// both ends a line and starts the next, which browsers paint on different lines. So the page moves
// the caret itself for ↑ and ↓, and checks where the browser draws it everywhere else.
//
// Everything here works on a ProseMirror view and the pager; nothing here is React.

import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { linesOf, pageAt, type Line, type Pager } from './pager'

/** Marks a selection the page set itself, already on the page in view. */
export const PAGED = 'elbowpatch-paged'

/**
 * Where the caret is drawn. At a soft line break the same position is the end of one line and the
 * start of the next; the browser's own caret says which.
 */
export function caretRect(view: EditorView): DOMRect | null {
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

/**
 * Shows the page the caret is on, while writing in the text. Not when the writer is in a title
 * field or reading: then the page stays. `force` shows it anyway, to open at their place.
 */
export function showCaret(view: EditorView, pager: Pager, force: boolean = false): void {
  if (!force && !view.hasFocus()) return
  const rect = caretRect(view)
  if (rect) pager.show(rect.left)
}

/** Where a caret at `pos` would be drawn, without moving the caret there. */
export function drawnAt(view: EditorView, pos: number): DOMRect | null {
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

/**
 * The caret to the end of the text on the page in view, where words are added next. False when
 * the page holds no text. Found from the text's own boxes, not by asking what is at a point,
 * which a browser can answer with the title over the whole page.
 */
export function caretToEnd(view: EditorView, viewport: HTMLElement): boolean {
  const r = viewport.getBoundingClientRect()
  const onPage = (b: DOMRect) => b.right > r.left + 1 && b.left < r.right - 1 && b.height > 0
  const range = document.createRange()
  const blocks: { text: string; offset: number }[] = []
  view.state.doc.forEach((node, offset) => {
    blocks.push({ text: node.textContent, offset })
  })
  let pos: number | null = null
  for (const { text, offset } of blocks.reverse()) {
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement) || ![...dom.getClientRects()].some(onPage)) continue
    if (!text) {
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

/** What ↑ and ↓ remember between presses: the place across, and where they left the caret. */
export interface LineMemory {
  goalX?: number
  lastHead: number
}

/**
 * ↑ or ↓: the caret to the line above or below, at the same place across, turning the page when
 * that line is on another. At the text's first or last line, to its start or end. False when the
 * caret's line cannot be found, to leave the key to the browser.
 */
export function moveLine(view: EditorView, pager: Pager, flow: HTMLElement, down: boolean, repeat: boolean, memory: LineMemory): boolean {
  const caret = caretRect(view)
  if (!caret) return false
  const head = view.state.selection.head
  const edge = (page: number) => flow.getBoundingClientRect().left + page * pager.g.stride
  // The lines of this paragraph and the ones either side, as drawn; the caret's is the one it is drawn on.
  const lines = linesNear(view, head, pager, flow)
  const page = pageAt(caret.left - edge(0), pager.g)
  const at = lines.findIndex((l) => l.page === page && caret.top < l.bottom - 1 && caret.bottom > l.top + 1)
  if (at < 0) return false
  // Keep the place across while moving up and down, as text fields do.
  if (memory.goalX === undefined || !(repeat || memory.lastHead === head)) memory.goalX = caret.left - edge(page)
  const target = lines[at + (down ? 1 : -1)]
  if (!target) {
    const doc = view.state.doc
    view.dispatch(view.state.tr.setSelection(down ? TextSelection.atEnd(doc) : TextSelection.atStart(doc)).setMeta(PAGED, true))
    showCaret(view, pager)
  } else {
    // On another page: turn to it first, so the line is on screen to be found.
    if (target.page !== pager.page) pager.turnTo(target.page)
    const x = edge(target.page) + Math.min(Math.max(memory.goalX, target.left + 1), target.right - 1)
    const hit = view.posAtCoords({ left: x, top: (target.top + target.bottom) / 2 })
    if (hit) placeOn(view, hit.pos, target, edge(target.page), pager)
  }
  memory.lastHead = view.state.selection.head
  return true
}

/**
 * After ← or →, once the browser has moved: Firefox will not move the caret into a column out of
 * view, so at a page's edge it stops. When the move left the browser's caret where it was, step it
 * one letter. The browser's caret is read, not the editor's, which may not have caught up yet.
 */
export function stepIfStuck(view: EditorView, dir: 1 | -1): void {
  const dom = getSelection()
  const node = dom?.focusNode
  const offset = dom?.focusOffset ?? 0
  if (!view.state.selection.empty || !node) return
  requestAnimationFrame(() => {
    const now = getSelection()
    if (!now?.isCollapsed || now.focusNode !== node || now.focusOffset !== offset) return
    const next = stepped(view, view.posAtDOM(node, offset), dir)
    if (next !== null) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(next), dir)))
  })
}

/**
 * The caret's position when it sits where a page breaks mid-paragraph, after the earlier page's
 * last space (also the next page's first position), and is drawn on the earlier page: there a
 * browser (Firefox) paints it at that page's top. Null anywhere else.
 */
export function drawnBeforeBreak(view: EditorView, pager: Pager, flow: HTMLElement): number | null {
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
  const text = dir > 0 ? doc.textBetween(pos, Math.min(pos + 16, $pos.end()), '￼', '￼') : doc.textBetween(Math.max(pos - 16, $pos.start()), pos, '￼', '￼')
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
  const step = (dir > 0 ? parts[0] : parts.at(-1))?.segment.length ?? 1
  return pos + dir * step
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
