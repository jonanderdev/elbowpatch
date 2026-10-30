import { type Selection, TextSelection, type Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { type RefObject, useEffect, useRef } from 'react'
import { drawnBeforeBreak, type LineMemory, moveLine, PAGED, showCaret, stepIfStuck } from '../../page/caret'
import type { Editor } from '../../page/editor'
import type { Pager } from '../../page/pager'

/** What the caret last did, shared by the keys and the following. */
interface CaretMemory {
  /** The caret the page placed itself (↑, ↓, a turn), already on the page it shows. */
  placed: Selection | null
  /** The last caret move by hand: -1 back (← or a click), 1 on (→), 0 anything else (typing). */
  lastMove: -1 | 0 | 1
  lines: LineMemory
}

export interface CaretKeys {
  /** For the editor's keys: ↑ and ↓ are the page's; ← and → the browser's, with a step where Firefox stops. */
  onKey(view: EditorView, e: KeyboardEvent): boolean
  /** For the editor's selection changes: notes a caret the page placed itself. */
  onSelection(tr: Transaction, selection: Selection): void
  memory: CaretMemory
}

/**
 * The editor's arrow keys on paged text (src/page/caret.ts). The browser's own ↑ and ↓ can jump
 * into a column out of view, so the page moves the caret itself; with Shift they stay the browser's.
 */
export function useCaretKeys(pager: Pager | null, flow: RefObject<HTMLDivElement | null>): CaretKeys {
  const memory = useRef<CaretMemory>({ placed: null, lastMove: 0, lines: { lastHead: -1 } }).current
  // Read when a key comes.
  const now = useRef({ pager, flow })
  now.current = { pager, flow }
  const keys = useRef<CaretKeys>({
    memory,
    onKey(view: EditorView, e: KeyboardEvent): boolean {
      memory.lastMove = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
      const plain = !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && plain && !e.isComposing) {
        stepIfStuck(view, e.key === 'ArrowRight' ? 1 : -1)
        return false
      }
      const { pager: p, flow: f } = now.current
      if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !plain || !p || !f.current) return false
      return moveLine(view, p, f.current, e.key === 'ArrowDown', e.repeat, memory.lines)
    },
    onSelection(tr: Transaction, selection: Selection): void {
      // A move the page made itself already shows the right page; any other, however soon after, is followed.
      memory.placed = tr.getMeta(PAGED) ? selection : null
    },
  })
  return keys.current
}

/**
 * The page follows the caret: after any caret move (keys, clicks, a phone keyboard, find in page),
 * once the browser has drawn it, show the page it is drawn on. One rule in one place, since the
 * browser's own moves can land in a column out of view.
 */
export function useCaretFollowing(
  editor: Editor | null,
  pager: Pager | null,
  flow: RefObject<HTMLDivElement | null>,
  mount: RefObject<HTMLDivElement | null>,
  memory: CaretMemory,
): void {
  useEffect(() => {
    const flowEl = flow.current
    const mountEl = mount.current
    if (!editor || !pager || !flowEl || !mountEl) return
    let frame = 0
    const follow = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const view = editor.view
        if ((memory.placed && view.state.selection.eq(memory.placed)) || !view.hasFocus()) return
        // Left by ←, → or a click where a page breaks mid-paragraph and drawn on the earlier page (as
        // Firefox does), the caret is painted at that page's top: a letter on, the way it went.
        const at = memory.lastMove ? drawnBeforeBreak(view, pager, flowEl) : null
        if (at !== null) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at + (memory.lastMove > 0 ? 1 : -1))))
          return
        }
        showCaret(view, pager)
      })
    }
    // A click places the caret like ←.
    const onPointer = (): void => {
      memory.lastMove = -1
    }
    // The browser scrolled the pager by itself to show the caret: settle on the caret's page.
    pager.onDrift = () => showCaret(editor.view, pager)
    document.addEventListener('selectionchange', follow)
    mountEl.addEventListener('mousedown', onPointer)
    return () => {
      cancelAnimationFrame(frame)
      pager.onDrift = undefined
      document.removeEventListener('selectionchange', follow)
      mountEl.removeEventListener('mousedown', onPointer)
    }
  }, [editor, pager, flow, mount, memory])
}
