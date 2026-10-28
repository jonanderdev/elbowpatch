import { useSyncExternalStore } from 'react'

// Words that could not be saved yet, kept here, not in a page that may close.
// While anything waits, the app says so and offers Save a copy (0010); a page
// opening the same section starts from these words and saves them. They are
// also kept in localStorage, a separate store that a dropped database
// connection does not touch, so a reload or a crash does not lose them.

export interface Unsaved {
  pieceId: string
  sectionId: string
  /** The file name and text for Save a copy. */
  name: string
  markdown: string
  title: string | null
  at: number
}

const KEY = 'elbowpatch.unsaved'
const waiting = new Map<string, Unsaved>(load().map((u) => [u.sectionId, u]))
const listeners = new Set<() => void>()
let snapshot: Unsaved[] = [...waiting.values()]

function load(): Unsaved[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function changed() {
  snapshot = [...waiting.values()]
  try {
    if (snapshot.length) localStorage.setItem(KEY, JSON.stringify(snapshot))
    else localStorage.removeItem(KEY)
  } catch {
    // Full too: the words stay in memory, and Save a copy still works.
  }
  listeners.forEach((l) => l())
}

export const unsaved = {
  keep(u: Omit<Unsaved, 'at'>) {
    waiting.set(u.sectionId, { ...u, at: Date.now() })
    changed()
  },
  saved(sectionId: string) {
    if (waiting.delete(sectionId)) changed()
  },
  get: (sectionId: string) => waiting.get(sectionId),
}

export function useUnsaved(): Unsaved[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
  )
}
