import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { type Listed, type TextIndex, textIndexOf } from '../../domain/lookBack'
import type { Piece, Screen } from '../../domain/model'
import { type ContentsChapter, contents, type Deps } from '../../domain/pieces'
import { fontsFor, fontsReady, measureChapter } from '../../page/measure'

const nextTask = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

/** What one count rests on: the text the chapter held (named by `TextIndex`), its title, whether the title page comes before it, and the page it is laid out on. */
const keyOf = (screen: Screen, c: Listed, text: string, first: boolean): string => `${screen}|${c.sectionId}|${text}|${first}|${c.title}`

/** The chapter the writer is looking at, whose words the Time Machine already holds. */
export interface ChapterHere {
  sectionId: string
  content: string
}

/**
 * A book's Contents as it was (DESIGN.md, The Time Machine): the chapters of that moment under the titles of that
 * moment, each with the page it starts on and the book's pages once they are known, never short. The titles are
 * there at once. Page numbers come from laying the old text out on the Time Machine's page, one chapter at a time
 * and only while Contents is `wanted` on screen, so a long book is not read for a list nobody opened. They are
 * kept in memory only: nothing is saved, and the piece's own counts never change. A resized window drops them.
 *
 * A count belongs to the words it was made of, not to the moment: moving along the tape lays out only the chapter
 * whose words changed, and the others keep their numbers. The chapter on screen is laid out before the next paint
 * (its words are in hand), so the numbers after it never go blank for a step. Only a laid-out count is kept,
 * and `here` is left out when the fonts are not yet loaded: the chapters are then counted one at a time.
 */
export function useContentsAsItWas(
  deps: Pick<Deps, 'store'>,
  piece: Piece,
  chapters: Listed[] | undefined,
  at: number | undefined,
  screen: Screen,
  wanted: boolean,
  here?: ChapterHere,
): { chapters: ContentsChapter[]; pages?: number } | undefined {
  /** Counts by what they rest on. Mutated as chapters are measured; `measured` is what re-renders. */
  const counts = useRef(new Map<string, number>())
  /** Each chapter's text over time, read once: the history is fixed while the Time Machine is open. */
  const indexes = useRef(new Map<string, TextIndex>())
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

  // Before paint: the chapter on screen is counted from the words in hand, so the chapters after it, whose first
  // pages rest on its count, never stand without numbers for a frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `layout` is the trigger (a resize measures again), `signature` stands for the chapters, and `measured` says its index has been read.
  useLayoutEffect(() => {
    if (!wanted || !chapters || at === undefined || !here) return
    const i = chapters.findIndex((c) => c.sectionId === here.sectionId)
    const c = chapters[i]
    const index = indexes.current.get(here.sectionId)
    if (!c || !index) return
    const key = keyOf(screen, c, index.keyAt(at), i === 0)
    if (counts.current.has(key)) return
    const chapter = { title: c.title, content: here.content, lang: piece.lang, titlePage: i === 0 }
    if (!fontsReady(chapter)) return
    counts.current.set(key, measureChapter(chapter, true))
    setMeasured((n) => n + 1)
  }, [piece.lang, signature, at, screen, wanted, layout, here?.sectionId, here?.content, measured])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `layout` is the trigger (a resize measures again), and `signature` stands for the chapters.
  useEffect(() => {
    const chapters = listed.current
    if (!wanted || !chapters || at === undefined) return
    let alive = true
    void (async () => {
      for (const [i, c] of chapters.entries()) {
        let index = indexes.current.get(c.sectionId)
        if (!index) {
          // A pause between chapters, so a long book never holds the screen.
          await nextTask()
          index = await textIndexOf(deps, c.sectionId)
          indexes.current.set(c.sectionId, index)
          if (!alive) return
          setMeasured((n) => n + 1)
        }
        const text = index.keyAt(at)
        const key = keyOf(screen, c, text, i === 0)
        if (counts.current.has(key)) continue
        await nextTask()
        const content = await index.read(text)
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
    const index = indexes.current.get(c.sectionId)
    const n = index && counts.current.get(keyOf(screen, c, index.keyAt(at), i === 0))
    if (n !== undefined) known[c.sectionId] = n
  }
  return contents({ ...piece, sections: chapters, pages: { [screen]: known } }, screen)
}
