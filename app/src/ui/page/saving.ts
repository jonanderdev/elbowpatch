// Saving one open section (docs/decisions/0005, 0010): its words about a second after typing,
// at most every five; its titles when they changed; a moment when the writer pauses or leaves;
// and, when a save fails or the page hides, the words not stored yet into the unsaved journal,
// so nothing is lost. Plain TypeScript: useSaving makes one per section.

import { debounced, moments, type Scheduled } from '../../adapters/schedule'
import { pieceAsMarkdown } from '../../domain/export'
import type { Piece, Place, Screen } from '../../domain/model'
import { type Deps, openPiece, rename, renameSection, savePages, savePlace, setSubtitle, takeMoment, write } from '../../domain/pieces'
import { settledWithin } from '../app/settled'
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
  /** The pages closed before this one: settled once none of them can write any more. */
  closing(): Promise<void>
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
  /**
   * Reshapes the section (a chapter starting in it, or going back): `change` runs on the text the page holds, once
   * that is stored and no page closed before this one can still write. A late write would land on the reshaped
   * text and undo it, so a page that has not finished closing refuses it. From then on this page writes nothing,
   * for the text it holds is no longer the section's. False, with everything as it was, when the words could not
   * be stored, an earlier page has not finished, or `change` failed. `change` may also decline, with undefined:
   * nothing went wrong, so nothing is said, and the page goes on as before.
   */
  reshape(change: (whole: string) => Promise<Piece | undefined>): Promise<boolean>
  /** A split is running or has run: what this page holds and counts is no longer the section's. */
  sealed(): boolean
}

/** How long a split waits for the words to be stored, and earlier pages to finish, before leaving the text as it is. */
const SPLIT_WAIT = 1500

export function createSaving(o: SavingOptions): Saving {
  const stored: Stored = { ...o.stored }
  let piece = o.piece
  let failed = false
  let closed = false
  /** A split is running or has run: what the page holds must never be written again. */
  let sealed = false
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
    if (sealed) return
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
      // A new piece or chapter is stored by its first words or title: its pages are kept from then on.
      if (pages) await savePages(deps, piece.id, pages.screen, sectionId, pages.count)
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
    if (failed || sealed || o.readOnly()) return
    await takeMoment(o.deps, o.piece.id).catch(() => {})
    // A split may have started during the moment: the place has gone to the new chapter.
    if (sealed) return
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
      if (failed || sealed || o.readOnly()) return false
      return takeMoment(o.deps, o.piece.id, { kept: true }).then(
        () => true,
        () => false,
      )
    },
    journal(): void {
      if (closed || sealed || o.readOnly()) return
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
    sealed: () => sealed,
    async reshape(change): Promise<boolean> {
      if (closed || sealed || o.readOnly()) return false
      // Text read differently from how it is stored counts as a change too: it is stored first.
      if (changed(o.read())) save.touch()
      const [closedBehind, stored] = await Promise.all([
        settledWithin(o.closing(), SPLIT_WAIT),
        Promise.race([
          save.flush().then(
            () => true,
            () => false,
          ),
          new Promise<boolean>((r) => setTimeout(() => r(false), SPLIT_WAIT)),
        ]),
      ])
      const held = o.read()
      // `sealed`: another reshaping got here first, while this one waited.
      if (!closedBehind || !stored || closed || sealed || o.readOnly() || changed(held)) return false
      // No await between the check above and this: nothing can be typed or saved in between.
      sealed = true
      clearTimeout(retry)
      save.cancel()
      moment.cancel()
      try {
        const piece = await change(held.markdown)
        if (!piece) {
          sealed = false
          save.touch()
          moment.touch()
          return false
        }
        // These words are stored. Different ones kept earlier stay for Save a copy: older than the split, they never replay.
        unsaved.saved(o.sectionId, held.markdown, held.title)
        o.onStored(piece)
        // The closing moment. A crash before it is recovered from the working copies.
        void takeMoment(o.deps, o.piece.id).catch(() => {})
        return true
      } catch {
        sealed = false
        failed = true
        o.onFailed(true)
        retry = setTimeout(() => save.touch(), 5000)
        return false
      }
    },
  }
}
