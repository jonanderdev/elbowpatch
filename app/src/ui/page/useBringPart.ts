import { useEffect, useRef } from 'react'
import type { Editor } from '../../page/editor'
import type { Pager } from '../../page/pager'
import { bringPassage } from '../../page/passage'
import type { Bringing } from './fields'

interface Options {
  editor: Editor | null
  pager: Pager | null
  bringing: Bringing | undefined
  /** Another screen (the library, the Time Machine) shows over the page. */
  covered: boolean
  writer: 'waiting' | 'here' | 'elsewhere'
  /** The passage is in, selected: say so. */
  onBrought(from: string): void
}

/**
 * Puts a passage brought back from the Time Machine into the text, once, when the page is showing and the
 * editor and the pager exist. It goes in as the editor's own step, so it saves like anything typed, one undo
 * takes it away, and it follows the writer lock: a window that does not write puts nothing in. The words are
 * left selected, with the focus in the text, so they can be moved or trimmed at once.
 */
export function useBringPart({ editor, pager, bringing, covered, writer, onBrought }: Options): void {
  /** The passage already dealt with, so a page that renders again does not put it in again. */
  const dealt = useRef<Bringing | undefined>(undefined)
  const brought = useRef(onBrought)
  brought.current = onBrought

  useEffect(() => {
    if (!bringing || dealt.current === bringing || covered || !editor || !pager || writer === 'waiting') return
    dealt.current = bringing
    if (writer === 'elsewhere') return
    const tr = bringPassage(editor.view.state, bringing.passage)
    if (!tr) return
    editor.focus()
    editor.view.dispatch(tr)
    brought.current(bringing.from)
  }, [bringing, covered, editor, pager, writer])
}
