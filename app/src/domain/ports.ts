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
