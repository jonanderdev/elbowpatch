import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { createReader, type Reader } from '../../page/editor'

/** The old text in `mount`, made before the first paint and destroyed with the screen. */
export function useReader(mount: RefObject<HTMLDivElement | null>, content: string, lang: string): Reader | null {
  const [reader, setReader] = useState<Reader | null>(null)
  // The text it opens with: `show` changes it from then on.
  const first = useRef({ content, lang })

  useLayoutEffect(() => {
    if (!mount.current) return
    const made = createReader(mount.current, first.current.content, first.current.lang)
    setReader(made)
    return () => made.destroy()
  }, [mount])

  return reader
}
