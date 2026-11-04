import { type RefObject, useRef } from 'react'
import type { Piece } from '../../domain/model'
import { type Deps, startChapterAt } from '../../domain/pieces'
import type { Editor } from '../../page/editor'
import { type Halves, halvesAt, halvesAtLine } from '../../page/split'
import { rememberSplit } from '../../page/undoMemory'
import { caretToFieldEnd, fillField } from './fields'
import type { Saving } from './saving'
import { raiseKeyboard } from './useFocusOnOpen'

interface Options {
  deps: Deps
  pieceId: string
  sectionId: string
  /** A book, in the window that writes it: anywhere else `# ` is ordinary text. */
  writes: boolean
  editor: Editor | null
  saving: Saving | null
  title: RefObject<HTMLHeadingElement | null>
  keyboard: boolean
  /** The caret is at the very end of the text: a new, empty chapter right after this one. */
  onAddAfter(): void
  onStarted(piece: Piece, sectionId: string, content: string): void
}

/**
 * One rule for where a chapter starts (DESIGN.md, Control). `here` is §, at the caret or the start of
 * a selection; `line` is a `# ` just typed. Both end in a split, unless the point is at an end of the text.
 */
export function useChapterStart({ deps, pieceId, sectionId, writes, editor, saving, title, keyboard, onAddAfter, onStarted }: Options): {
  here(): void
  line(at: number): void
} {
  /** A split is running: a second press, or a `# ` typed behind it, waits for nothing and does nothing. */
  const splitting = useRef(false)

  function toTitle(): void {
    const field = title.current
    if (!field) return
    field.focus()
    caretToFieldEnd(field)
  }

  async function split(halves: Halves): Promise<void> {
    if (!editor || !saving || splitting.current) return
    splitting.current = true
    // From here to the end the text cannot change, so the halves stay true to it.
    editor.hold(true)
    if (keyboard) raiseKeyboard()
    const newSectionId = deps.ids.next()
    let piece: Piece | undefined
    const done = await saving.split(async (whole) => {
      piece = await startChapterAt(deps, pieceId, { sectionId, whole, ...halves, newSectionId })
      return piece
    })
    if (done && piece) {
      rememberSplit(newSectionId, { into: sectionId, after: halves.after, seam: halves.seam })
      onStarted(piece, newSectionId, halves.after)
      return
    }
    // The text stays as it is, and the writer stays in it.
    editor.hold(false)
    splitting.current = false
    editor.focus()
  }

  function here(): void {
    if (!editor) return
    const { doc, selection } = editor.view.state
    const halves = halvesAt(doc, selection.from)
    if (!halves.before.trim()) toTitle()
    else if (!halves.after.trim()) onAddAfter()
    else void split(halves)
  }

  /** A `# ` line at the very start of the text goes into an empty title. Under a title, it stays text. */
  function lineToTitle(at: number, text: string): void {
    if (!editor || title.current?.textContent) return
    const { state } = editor.view
    const $at = state.doc.resolve(at)
    const end = lineEndAfter(editor, at)
    const whole = at === $at.start() && end === $at.end() && state.doc.childCount > 1
    editor.view.dispatch(whole ? state.tr.delete($at.before(), $at.after()) : state.tr.delete(at, end))
    const field = title.current
    if (!field) return
    field.focus()
    fillField(field, text)
    caretToFieldEnd(field)
  }

  function line(at: number): void {
    if (!writes || !editor) return
    const halves = halvesAtLine(editor.view.state.doc, at)
    if (!halves.before.trim()) lineToTitle(at, halves.title)
    else if (halves.title || halves.after.trim()) void split(halves)
    else {
      // Nothing to move and nothing to name: as § at the end, with the `# ` taken back.
      const { state } = editor.view
      editor.view.dispatch(state.tr.delete(at, lineEndAfter(editor, at)))
      onAddAfter()
    }
  }

  return { here, line }
}

/** Where the line starting at `at` ends, past its line break if it has one. */
function lineEndAfter(editor: Editor, at: number): number {
  const { doc } = editor.view.state
  const $at = doc.resolve(at)
  let end = $at.end()
  $at.parent.forEach((child, offset) => {
    const pos = $at.start() + offset
    if (pos >= at && pos < end && child.type.name === 'hard_break') end = pos + 1
  })
  return end
}
