import { useRef } from 'react'
import type { Piece } from '../../domain/model'
import { type Deps, type Removed, removeChapter } from '../../domain/pieces'
import type { Editor } from '../../page/editor'
import { forgetChapter } from '../../page/undoMemory'
import { settledWithin } from '../app/settled'
import { type Unsaved, unsaved } from '../stores/unsaved'
import { reshapeHeld } from './reshapeHeld'
import type { Saving } from './saving'

/** How long a removal waits for a page still closing, which may hold that chapter's last words. */
const CLOSING_WAIT = 1500

/** What the unsaved journal holds for a chapter: any of it not blank keeps the chapter. */
export function heldIn(kept: Unsaved | undefined): string[] {
  if (!kept) return []
  return [kept.markdown, kept.title ?? '', kept.bookTitle ?? '', kept.subtitle ?? '']
}

interface Options {
  deps: Deps
  pieceId: string
  sectionId: string
  /** The book as it stands now. */
  outline(): Piece
  /** The chapter on the page is stored: one that is not goes by being left. */
  storedHere(): boolean
  /** The pages closed before this one: settled once none of them can write any more. */
  closing(): Promise<void>
  editor: Editor | null
  saving: Saving | null
  keyboard: boolean
  /** Leaves a chapter never stored for the one named. */
  onLeave(to: string, writing: boolean): void
  onRemovedHere(removed: Removed, writing: boolean): void
  /** Another chapter left the book: the page stays. */
  onRemoved(piece: Piece): void
  /** The chapter on the page became the first, and needs the title page. */
  onReopen(): void
}

/**
 * Takes an empty chapter out of the book (DESIGN.md, Books and chapters). A chapter that turns out to hold
 * something stays, and nothing is said: the words are what matter, and they are kept.
 */
export function useRemoveChapter(o: Options): (chosen: string) => Promise<void> {
  const { deps, pieceId, sectionId, editor, saving, keyboard } = o
  /** A removal is running: a second press waits for nothing and does nothing. */
  const running = useRef(false)

  async function removeHere(): Promise<void> {
    if (!editor || !saving) return
    const writing = editor.view.hasFocus() || keyboard
    if (!o.storedHere()) {
      const { sections } = o.outline()
      const at = sections.findIndex((s) => s.sectionId === sectionId)
      const to = sections[at - 1] ?? sections[at + 1]
      if (to) o.onLeave(to.sectionId, writing)
      return
    }
    let back: Removed | undefined
    const done = await reshapeHeld(editor, saving, keyboard, async (whole) => {
      // Read here, past the wait: a closing save that failed keeps its words as it ends.
      back = await removeChapter(deps, pieceId, { sectionId, held: [whole, ...heldIn(unsaved.get(sectionId))] })
      return back?.piece
    })
    if (done && back) {
      forgetChapter(sectionId)
      o.onRemovedHere(back, writing)
      return
    }
    // The text stays as it is, and the writer stays in it.
    if (writing) editor.focus()
  }

  async function removeOther(chosen: string): Promise<void> {
    if (!saving || saving.sealed()) return
    // A closing save landing afterwards would write the chapter back; one that fails leaves its words in the journal.
    if (!(await settledWithin(o.closing(), CLOSING_WAIT))) return
    const { sections } = o.outline()
    const titlePageComes = sections[0]?.sectionId === chosen && sections[1]?.sectionId === sectionId
    // First, so the place kept for this page is counted as it is laid out now.
    await saving.flush().catch(() => {})
    const back = await removeChapter(deps, pieceId, { sectionId: chosen, held: heldIn(unsaved.get(chosen)) }).catch(() => undefined)
    if (!back) return
    forgetChapter(chosen)
    unsaved.saved(chosen)
    o.onRemoved(back.piece)
    if (titlePageComes) o.onReopen()
  }

  return async (chosen) => {
    if (running.current) return
    running.current = true
    try {
      await (chosen === sectionId ? removeHere() : removeOther(chosen))
    } finally {
      running.current = false
    }
  }
}
