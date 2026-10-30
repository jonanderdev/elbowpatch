// Saving one open section (docs/decisions/0005, 0010): its words about a second after typing,
// at most every five; its titles when they changed; a moment when the writer pauses or leaves;
// and, when a save fails or the page hides, the words not stored yet into the unsaved journal,
// so nothing is lost. Plain TypeScript: useSaving makes one per section.

import { debounced, moments, type Scheduled } from '../../adapters/schedule'
import { pieceAsMarkdown } from '../../domain/export'
import type { Piece, Place, Screen } from '../../domain/model'
import { type Deps, openPiece, rename, renameSection, savePages, savePlace, setSubtitle, takeMoment, write } from '../../domain/pieces'
import { type Unsaved, unsaved } from '../stores/unsaved'

/** What the page holds now. A title is null when the page has no such field. */
export interface Held {
  markdown: string
  title: string | null
  bookTitle: string | null
  subtitle: string | null
}

/** What is stored now, so only changes are written. */
export interface Stored {
  markdown: string
  title: string
  bookTitle: string
  subtitle: string
}

export interface SavingOptions {
  deps: Deps
  piece: Piece
  sectionId: string
  stored: Stored
  read(): Held
  /** Another window writes the piece: nothing is written here, words wait in the journal. */
  readOnly(): boolean
  /** The writer's place, when they moved since the last moment. */
  place(): Place | undefined
  /** The section's page count as laid out now, and on which screen's page; null before it is laid out. */
  pages(): { screen: Screen; count: number } | null
  onStored(piece: Piece): void
  onFailed(failed: boolean): void
}

export interface Saving {
  /** Something changed: save soon, and keep a moment when the writer pauses. */
  touch(): void
  /** Leaving, hiding, closing: save now and keep a moment (0005). */
  flush(): Promise<void>
  /** "Keep this moment": a moment now, kept for good (0005). False when nothing could be kept. */
  keep(): Promise<boolean>
  /** The page is hiding or unloading: what is not stored yet goes to the journal first (synchronous). */
  journal(): void
  /** The page closes: one last save on what it holds now, then nothing more. */
  close(): Promise<void>
}

export function createSaving(o: SavingOptions): Saving {
  const stored: Stored = { ...o.stored }
  let piece = o.piece
  let failed = false
  let closed = false
  let retry: ReturnType<typeof setTimeout> | undefined

  const changed = (h: Held): boolean =>
    h.markdown !== stored.markdown ||
    (h.title !== null && h.title !== stored.title) ||
    (h.bookTitle !== null && h.bookTitle !== stored.bookTitle) ||
    (h.subtitle !== null && h.subtitle !== stored.subtitle)

  /** What the journal keeps for this section: the words, and a title only when it changed. */
  const entry = (h: Held): Omit<Unsaved, 'at'> => ({
    piece,
    pieceId: o.piece.id,
    sectionId: o.sectionId,
    name: pieceAsMarkdown(piece, []).name,
    markdown: h.markdown,
    title: h.title !== null && h.title !== stored.title ? h.title : null,
    bookTitle: h.bookTitle !== null && h.bookTitle !== stored.bookTitle ? h.bookTitle : null,
    subtitle: h.subtitle !== null && h.subtitle !== stored.subtitle ? h.subtitle : null,
  })

  async function saveWords(): Promise<void> {
    const { deps, sectionId } = o
    // Read everything before the first await: the page may close while this runs.
    const since = Date.now()
    const held = o.read()
    const pages = o.pages()
    if (o.readOnly()) {
      // Another window writes this piece now: what was not saved here waits, with Save a copy.
      if (changed(held)) unsaved.keep(entry(held), since)
      return
    }
    try {
      await write(deps, piece, sectionId, held.markdown)
      stored.markdown = held.markdown
      // A new piece is stored by its first words: its pages are kept from then on.
      if (pages) await savePages(deps, piece.id, pages.screen, sectionId, pages.count)
      // A journal day's title is its date, never written here (its title is null).
      if (held.title !== null && held.title !== stored.title) {
        if (piece.kind === 'essay') await rename(deps, piece, held.title)
        else await renameSection(deps, piece, sectionId, held.title)
        stored.title = held.title
      }
      if (held.bookTitle !== null && held.bookTitle !== stored.bookTitle) {
        await rename(deps, piece, held.bookTitle)
        stored.bookTitle = held.bookTitle
      }
      if (held.subtitle !== null && held.subtitle !== stored.subtitle) {
        await setSubtitle(deps, piece, held.subtitle)
        stored.subtitle = held.subtitle
      }
      // Clears only these words: newer ones kept meanwhile (the page hid) stay.
      unsaved.saved(sectionId, held.markdown, held.title)
      const found = await openPiece(deps, o.piece.id)
      if (found) {
        piece = found.piece
        o.onStored(found.piece)
      }
      if (failed) {
        failed = false
        o.onFailed(false)
      }
    } catch (error) {
      // The words stay; say so, and keep trying while this page is open (0010).
      // A closed page hands them on and never writes again.
      unsaved.keep(entry(held), since)
      if (!closed) {
        failed = true
        o.onFailed(true)
        clearTimeout(retry)
        retry = setTimeout(() => save.touch(), 5000)
      }
      throw error
    }
  }

  async function keepMoment(): Promise<void> {
    await save.flush().catch(() => {})
    if (failed || o.readOnly()) return
    await takeMoment(o.deps, o.piece.id).catch(() => {})
    const place = o.place()
    if (place) await savePlace(o.deps, o.piece.id, place).catch(() => {})
    const found = await openPiece(o.deps, o.piece.id).catch(() => undefined)
    if (found) o.onStored(found.piece)
  }

  const save: Scheduled = debounced(saveWords, 1000, 5000)
  const moment: Scheduled = moments(keepMoment)

  const flush = async (): Promise<void> => {
    moment.touch()
    await moment.flush()
  }

  return {
    touch(): void {
      save.touch()
      moment.touch()
    },
    flush,
    async keep(): Promise<boolean> {
      await save.flush().catch(() => {})
      if (failed || o.readOnly()) return false
      return takeMoment(o.deps, o.piece.id, { kept: true }).then(
        () => true,
        () => false,
      )
    },
    journal(): void {
      if (closed || o.readOnly()) return
      const held = o.read()
      if (changed(held)) unsaved.keep(entry(held))
    },
    close(): Promise<void> {
      clearTimeout(retry)
      const last = flush().finally(() => {
        save.cancel()
        moment.cancel()
      })
      closed = true
      return last
    },
  }
}
