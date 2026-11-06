import { useEffect, useRef, useState } from 'react'
import { type Listed, textAt } from '../../domain/lookBack'
import type { Piece, Screen } from '../../domain/model'
import { type ContentsChapter, contents, type Deps } from '../../domain/pieces'
import { fontsFor, measureChapter } from '../../page/measure'

const nextTask = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

/** What one count rests on: a chapter's text at a time, its title, whether the title page comes before it, and the page it is laid out on. */
const keyOf = (screen: Screen, c: Listed, at: number, first: boolean): string => `${screen}|${c.sectionId}|${at}|${first}|${c.title}`

/**
 * A book's Contents as it was (DESIGN.md, The Time Machine): the chapters of that moment under the titles of that
 * moment, each with the page it starts on and the book's pages once they are known, never short. The titles are
 * there at once. Page numbers come from laying the old text out on the Time Machine's page, one chapter at a time
 * and only while Contents is `wanted` on screen, so a long book is not read for a list nobody opened. They are
 * kept in memory only: nothing is saved, and the piece's own counts never change. A resized window drops them.
 */
export function useContentsAsItWas(
  deps: Pick<Deps, 'store'>,
  piece: Piece,
  chapters: Listed[] | undefined,
  at: number | undefined,
  screen: Screen,
  wanted: boolean,
): { chapters: ContentsChapter[]; pages?: number } | undefined {
  /** Counts by what they rest on. Mutated as chapters are measured; `measured` is what re-renders. */
  const counts = useRef(new Map<string, number>())
  const [measured, setMeasured] = useState(0)
  const [layout, setLayout] = useState(0)

  useEffect(() => {
    const dropped = (): void => {
      counts.current.clear()
      setLayout((n) => n + 1)
    }
    window.addEventListener('resize', dropped)
    return () => window.removeEventListener('resize', dropped)
  }, [])

  /** The chapters in hand, read when measuring starts: `chapters` itself is new on every render. */
  const listed = useRef(chapters)
  listed.current = chapters
  const signature = chapters?.map((c) => `${c.sectionId}:${c.title}`).join('\n')

  // biome-ignore lint/correctness/useExhaustiveDependencies: `layout` is the trigger (a resize measures again), and `signature` stands for the chapters.
  useEffect(() => {
    const chapters = listed.current
    if (!wanted || !chapters || at === undefined) return
    let alive = true
    void (async () => {
      for (const [i, c] of chapters.entries()) {
        const key = keyOf(screen, c, at, i === 0)
        if (counts.current.has(key)) continue
        // A pause between chapters, so a long book never holds the screen.
        await nextTask()
        const content = await textAt(deps, c.sectionId, at)
        const chapter = { title: c.title, content, lang: piece.lang, titlePage: i === 0 }
        await fontsFor(chapter)
        if (!alive) return
        counts.current.set(key, measureChapter(chapter, true))
        setMeasured((n) => n + 1)
      }
    })().catch(() => {
      // Numbers that cannot be had stay unknown: none is better than a wrong one.
    })
    return () => {
      alive = false
    }
  }, [deps, piece.lang, signature, at, screen, wanted, layout])

  if (!chapters || at === undefined) return undefined
  // Read at render: `measured` says there is more to read.
  void measured
  const known: Record<string, number> = {}
  for (const [i, c] of chapters.entries()) {
    const n = counts.current.get(keyOf(screen, c, at, i === 0))
    if (n !== undefined) known[c.sectionId] = n
  }
  return contents({ ...piece, sections: chapters, pages: { [screen]: known } }, screen)
}
