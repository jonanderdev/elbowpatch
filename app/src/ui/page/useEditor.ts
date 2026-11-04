import type { EditorState } from 'prosemirror-state'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { createEditor, type Editor, type EditorOptions } from '../../page/editor'

/** What the page does when the editor reports something; read when it happens, not when made. */
export type EditorHandlers = Omit<EditorOptions, 'content' | 'lang' | 'resume'> & {
  /** The page closes: the state its text and its history ended on. */
  onClose?(state: EditorState): void
}

/**
 * The ProseMirror editor in `mount`, made before the first paint and destroyed with the page.
 * Its handlers are read through a ref, so each call sees the page as it is then.
 */
export function useEditor(
  mount: RefObject<HTMLDivElement | null>,
  content: string,
  lang: string,
  resume: EditorState | undefined,
  handlers: EditorHandlers,
): Editor | null {
  const [editor, setEditor] = useState<Editor | null>(null)
  const latest = useRef(handlers)
  latest.current = handlers
  // The text it opens with: the editor owns the text from then on.
  const initial = useRef({ content, lang, resume })

  useLayoutEffect(() => {
    const el = mount.current
    if (!el) return
    const made = createEditor(el, {
      ...initial.current,
      onChange: (markdown) => latest.current.onChange(markdown),
      onCaret: (view) => latest.current.onCaret(view),
      onFocusChange: (focused) => latest.current.onFocusChange?.(focused),
      editable: () => latest.current.editable?.() ?? true,
      onSelection: (view, tr) => latest.current.onSelection?.(view, tr),
      onKey: (view, e) => latest.current.onKey?.(view, e) ?? false,
      onChapterLine: (at) => latest.current.onChapterLine?.(at),
      onUndoPast: () => latest.current.onUndoPast?.() ?? false,
    })
    setEditor(made)
    return () => {
      latest.current.onClose?.(made.view.state)
      made.destroy()
    }
  }, [mount])

  return editor
}
