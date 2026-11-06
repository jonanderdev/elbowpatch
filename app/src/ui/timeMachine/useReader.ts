import type { EditorView } from 'prosemirror-view'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { createReader, type Reader } from '../../page/editor'

/**
 * The old text in `mount`, made before the first paint and destroyed with the screen. `onSelection` hears
 * of the words selected in it, as they change.
 */
export function useReader(mount: RefObject<HTMLDivElement | null>, content: string, lang: string, onSelection?: (view: EditorView) => void): Reader | null {
  const [reader, setReader] = useState<Reader | null>(null)
  // The text it opens with: `show` changes it from then on.
  const first = useRef({ content, lang })
  // Read when the selection changes, so it hears the screen as it is then.
  const heard = useRef(onSelection)
  heard.current = onSelection

  useLayoutEffect(() => {
    if (!mount.current) return
    const made = createReader(mount.current, first.current.content, first.current.lang, (view) => heard.current?.(view))
    setReader(made)
    return () => made.destroy()
  }, [mount])

  return reader
}
