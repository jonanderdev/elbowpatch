import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Piece, Place, Screen } from '../../domain/model'
import type { Deps } from '../../domain/pieces'
import type { Editor } from '../../page/editor'
import { keptFor, type Opened, type TitleRefs, titleOf } from './fields'
import { createSaving, type Held, type Saving } from './saving'

interface Options {
  deps: Deps
  opened: Opened
  /** The editor as it is when a save runs. */
  editor(): Editor | null
  titles: TitleRefs
  readOnly: boolean
  /** The writer's place, when they moved since the last moment. */
  place(): Place | undefined
  /** The section's page count as laid out now, and on which screen's page. */
  pages(): { screen: Screen; count: number } | null
  onStored(piece: Piece): void
  /** Lets the app ask the page to save now, before another window takes the piece. */
  flushRef: { current: (() => Promise<void>) | null }
  /** The closing page's last save, so the app lets go of the piece only after it. */
  closingRef: { current: Promise<void> }
}

/**
 * Saving for the open section (see saving.ts). Made when the page opens and closed with it; on
 * hiding or closing the window, the words not stored yet go to the journal first. Declare it
 * before useEditor: its last save, as the page closes, reads the editor's text.
 */
export function useSaving({ deps, opened, editor, titles, readOnly, place, pages, onStored, flushRef, closingRef }: Options): {
  saving: Saving | null
  failed: boolean
} {
  const [saving, setSaving] = useState<Saving | null>(null)
  const [failed, setFailed] = useState(false)
  // Read when a save runs, long after this render.
  const now = useRef({ editor, titles, readOnly, place, pages, onStored })
  now.current = { editor, titles, readOnly, place, pages, onStored }
  const first = useRef({ deps, opened, flushRef, closingRef })

  useLayoutEffect(() => {
    const { deps, opened, flushRef, closingRef } = first.current
    const { piece, sectionId } = opened
    const read = (): Held => {
      const f = now.current.titles
      return {
        markdown: now.current.editor()?.markdown() ?? opened.content,
        // A journal day's title is its date: never read back from the page.
        title: piece.kind === 'journal' ? null : (f.title.current?.textContent ?? null),
        bookTitle: f.bookTitle.current ? (f.bookTitle.current.textContent ?? '') : null,
        subtitle: f.subtitle.current ? (f.subtitle.current.textContent ?? '') : null,
      }
    }
    const s = createSaving({
      deps,
      piece,
      sectionId,
      stored: { markdown: opened.content, title: titleOf(opened), bookTitle: piece.title, subtitle: piece.subtitle ?? '' },
      read,
      readOnly: () => now.current.readOnly,
      place: () => now.current.place(),
      pages: () => now.current.pages(),
      onStored: (p) => now.current.onStored(p),
      onFailed: setFailed,
    })
    // Words kept for this section and newer than what is stored start the page: save them.
    if (keptFor(opened)) s.touch()
    setSaving(s)
    flushRef.current = () => s.flush()
    return () => {
      flushRef.current = null
      closingRef.current = s.close()
    }
    // One saving per page, made when it opens: the page is remounted for each section.
  }, [])

  // Hiding or closing the window: the database may not finish, so the journal first (0010).
  useEffect(() => {
    if (!saving) return
    const leave = (): void => {
      saving.journal()
      void saving.flush()
    }
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') leave()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', leave)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', leave)
    }
  }, [saving])

  return { saving, failed }
}
