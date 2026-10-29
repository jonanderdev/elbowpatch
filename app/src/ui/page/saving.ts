// Saving one open section (docs/decisions/0005, 0010): its words about a second after typing,
// at most every five; its titles when they changed; a moment when the writer pauses or leaves;
// and, when a save fails or the page hides, the words not stored yet into the unsaved journal,
// so nothing is lost. Not React: the page session creates one per section and closes it.

import { debounced, moments } from '../../adapters/schedule'
import { pieceAsMarkdown } from '../../domain/export'
import type { Piece, Place } from '../../domain/model'
import { openPiece, rename, renameSection, savePlace, setSubtitle, takeMoment, write, type Deps } from '../../domain/pieces'
import { unsaved } from '../unsaved'

/** What the page holds now. A title is null when the page has no such field. */
export interface Held {
  markdown: string
  title: string | null
  bookTitle: string | null
  subtitle: string | null
}

export interface SavingOptions {
  deps: Deps
  piece: Piece
  sectionId: string
  /** What is stored now, so only changes are written. */
  stored: { markdown: string; title: string; bookTitle: string; subtitle: string }
  read(): Held
  /** Another window writes the piece: nothing is written here, words wait in the journal. */
  readOnly(): boolean
  /** The writer's place, when they moved since the last moment. */
  place(): Place | undefined
  onStored(piece: Piece): void
  onFailed(failed: boolean): void
}

export class Saving {
  readonly save: ReturnType<typeof debounced>
  readonly moment: ReturnType<typeof moments>
  private stored: SavingOptions['stored']
  private piece: Piece
  private failed = false
  private closed = false
  private retry: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly o: SavingOptions) {
    this.stored = { ...o.stored }
    this.piece = o.piece
    this.save = debounced(() => this.write(), 1000, 5000)
    this.moment = moments(() => this.keepMoment())
  }

  /** Something changed: save soon, and keep a moment when the writer pauses. */
  touch() {
    this.save.touch()
    this.moment.touch()
  }

  /** Leaving, hiding, closing: save now and keep a moment (0005). */
  async flush() {
    this.moment.touch()
    await this.moment.flush()
  }

  /** "Keep this moment": a moment now, kept for good (0005). False when nothing could be kept. */
  async keep(): Promise<boolean> {
    await this.save.flush().catch(() => {})
    if (this.failed || this.o.readOnly()) return false
    await takeMoment(this.o.deps, this.o.piece.id, { kept: true })
    return true
  }

  /**
   * The page is hiding or unloading and the database may not finish: put what is not stored yet
   * in the journal first (synchronous); the next launch writes it (0010).
   */
  journal() {
    if (this.closed || this.o.readOnly()) return
    const held = this.o.read()
    if (this.changed(held)) unsaved.keep(this.entry(held))
  }

  /** The page closes: one last save on what it holds now, then nothing more. */
  close(): Promise<void> {
    clearTimeout(this.retry)
    const last = this.flush().finally(() => {
      this.save.cancel()
      this.moment.cancel()
    })
    this.closed = true
    return last
  }

  private changed(h: Held) {
    const s = this.stored
    return (
      h.markdown !== s.markdown ||
      (h.title !== null && h.title !== s.title) ||
      (h.bookTitle !== null && h.bookTitle !== s.bookTitle) ||
      (h.subtitle !== null && h.subtitle !== s.subtitle)
    )
  }

  /** What the journal keeps for this section: the words, and a title only when it changed. */
  private entry(h: Held) {
    const s = this.stored
    return {
      piece: this.piece,
      pieceId: this.o.piece.id,
      sectionId: this.o.sectionId,
      name: pieceAsMarkdown(this.piece, []).name,
      markdown: h.markdown,
      title: h.title !== null && h.title !== s.title ? h.title : null,
      bookTitle: h.bookTitle !== null && h.bookTitle !== s.bookTitle ? h.bookTitle : null,
      subtitle: h.subtitle !== null && h.subtitle !== s.subtitle ? h.subtitle : null,
    }
  }

  private async write() {
    const { deps, sectionId } = this.o
    // Read everything before the first await: the page may close while this runs.
    const since = Date.now()
    const held = this.o.read()
    if (this.o.readOnly()) {
      // Another window writes this piece now: what was not saved here waits, with Save a copy.
      if (this.changed(held)) unsaved.keep(this.entry(held), since)
      return
    }
    try {
      await write(deps, this.piece, sectionId, held.markdown)
      this.stored.markdown = held.markdown
      // A journal day's title is its date, never written here (its title is null).
      if (held.title !== null && held.title !== this.stored.title) {
        if (this.piece.kind === 'essay') await rename(deps, this.piece, held.title)
        else await renameSection(deps, this.piece, sectionId, held.title)
        this.stored.title = held.title
      }
      if (held.bookTitle !== null && held.bookTitle !== this.stored.bookTitle) {
        await rename(deps, this.piece, held.bookTitle)
        this.stored.bookTitle = held.bookTitle
      }
      if (held.subtitle !== null && held.subtitle !== this.stored.subtitle) {
        await setSubtitle(deps, this.piece, held.subtitle)
        this.stored.subtitle = held.subtitle
      }
      // Clears only these words: newer ones kept meanwhile (the page hid) stay.
      unsaved.saved(sectionId, held.markdown, held.title)
      const stored = await openPiece(deps, this.o.piece.id)
      if (stored) {
        this.piece = stored.piece
        this.o.onStored(stored.piece)
      }
      if (this.failed) this.o.onFailed((this.failed = false))
    } catch (error) {
      // The words stay; say so, and keep trying while this page is open (0010).
      // A closed page hands them on and never writes again.
      unsaved.keep(this.entry(held), since)
      if (!this.closed) {
        this.o.onFailed((this.failed = true))
        clearTimeout(this.retry)
        this.retry = setTimeout(() => this.save.touch(), 5000)
      }
      throw error
    }
  }

  private async keepMoment() {
    const { deps } = this.o
    await this.save.flush().catch(() => {})
    if (this.failed || this.o.readOnly()) return
    await takeMoment(deps, this.o.piece.id).catch(() => {})
    const place = this.o.place()
    if (place) await savePlace(deps, this.o.piece.id, place).catch(() => {})
    const stored = await openPiece(deps, this.o.piece.id).catch(() => undefined)
    if (stored) this.o.onStored(stored.piece)
  }
}
