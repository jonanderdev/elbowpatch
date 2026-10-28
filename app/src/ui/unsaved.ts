import { useSyncExternalStore } from 'react'
import type { Piece } from '../domain/model'

// Words not stored yet, kept outside the page that holds them (0010): when a
// save fails, and synchronously when the page hides or unloads, since the
// database may not finish then. Each section has its own key in localStorage,
// read fresh every time, so windows never write over each other's words. A
// page opening the section starts from newer words here, and the next launch
// writes them first (App, replayJournal). While any wait, the app says so,
// with Save a copy.

export interface Unsaved {
  /** The piece as the page knew it, so a piece never stored yet can be written from this alone. */
  piece: Piece
  pieceId: string
  sectionId: string
  /** The file name for Save a copy. */
  name: string
  markdown: string
  /** Only when the title changed and is not stored yet. */
  title: string | null
  at: number
}

const PREFIX = 'elbowpatch.unsaved.'
// Private windows can refuse localStorage: then entries live only in memory, for Save a copy.
const memory = new Map<string, Unsaved>()
const listeners = new Set<() => void>()
let snapshot = read()

function read(): Unsaved[] {
  const out = new Map(memory)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(PREFIX)) continue
      const entry = JSON.parse(localStorage.getItem(key) ?? 'null') as Unsaved | null
      if (entry) out.set(entry.sectionId, entry)
    }
  } catch {}
  return [...out.values()]
}

function changed() {
  snapshot = read()
  listeners.forEach((l) => l())
}

// Another window kept or cleared words.
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => e.key?.startsWith(PREFIX) && changed())

export const unsaved = {
  /**
   * Keeps words for a section, unless what is kept there already is newer
   * than `since` (when this page read its text): an older save must not
   * replace newer words.
   */
  keep(u: Omit<Unsaved, 'at'>, since = Date.now()) {
    const there = unsaved.get(u.sectionId)
    if (there && there.at > since && there.markdown !== u.markdown) return
    const entry: Unsaved = { ...u, at: Date.now() }
    try {
      localStorage.setItem(PREFIX + u.sectionId, JSON.stringify(entry))
      memory.delete(u.sectionId)
    } catch {
      // Refused or full: the words stay in memory, and Save a copy still works.
      memory.set(u.sectionId, entry)
    }
    changed()
  },
  /** These words (and title) are stored now. Different words kept since stay. */
  saved(sectionId: string, markdown?: string, title?: string | null) {
    const there = unsaved.get(sectionId)
    if (!there) return
    if (markdown !== undefined && (there.markdown !== markdown || (there.title !== null && there.title !== title))) return
    memory.delete(sectionId)
    try {
      localStorage.removeItem(PREFIX + sectionId)
    } catch {}
    changed()
  },
  get(sectionId: string): Unsaved | undefined {
    if (memory.has(sectionId)) return memory.get(sectionId)
    try {
      const raw = localStorage.getItem(PREFIX + sectionId)
      if (raw) return JSON.parse(raw)
    } catch {}
    return undefined
  },
  all: (): Unsaved[] => read(),
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
