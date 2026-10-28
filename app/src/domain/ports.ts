import type { Outline, Piece, Version, Working } from './model'

// The outside world, as the domain sees it. Adapters implement these (0009).

export interface Clock {
  now(): number
}

export interface Ids {
  next(): string
}

/**
 * One transaction over the whole store. Inside `fn`, await only the
 * transaction's own calls: IndexedDB commits a transaction as soon as it is
 * left waiting on anything else.
 */
export interface Store {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>
}

export interface Tx {
  piece(id: string): Promise<Piece | undefined>
  pieces(): Promise<Piece[]>
  putPiece(piece: Piece): Promise<void>

  working(sectionId: string): Promise<Working | undefined>
  workingOf(pieceId: string): Promise<Working[]>
  putWorking(working: Working): Promise<void>

  version(id: string): Promise<Version | undefined>
  versionsOf(sectionId: string): Promise<Version[]>
  putVersion(version: Version): Promise<void>

  outline(id: string): Promise<Outline | undefined>
  putOutline(outline: Outline): Promise<void>
}

/** One window at a time writes a piece (docs/decisions/0010). */
export interface WriterLock {
  /** Holds the piece if no other window does; null when another window writes it. */
  hold(pieceId: string, onAsked: () => Promise<void>): Promise<Held | null>
  /** "Write here": asks the window that holds it to save and let go, then holds it. */
  take(pieceId: string, onAsked: () => Promise<void>): Promise<Held>
}

export interface Held {
  release(): void
  /** Settles when another window has taken the piece. */
  lost: Promise<void>
}
