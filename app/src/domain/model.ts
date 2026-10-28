// The product's words are the code's words (docs/decisions/0009).

export type Kind = 'journal' | 'essay' | 'book'

export interface OutlineSection {
  sectionId: string
  title: string
}

/** The piece record: what the library lists, plus the outline being written. */
export interface Piece {
  id: string
  kind: Kind
  lang: string
  createdAt: number
  updatedAt: number
  /** The current title and sections, saved as you type; a moment turns a change into an outline version. */
  title: string
  sections: OutlineSection[]
  /** The outline version the current title and sections were last kept as. */
  outlineId: string | null
  putAwayAt?: number
  place?: Place
}

/** Where the writer was: a paragraph, an offset and a few words, so it survives edits made elsewhere. */
export interface Place {
  sectionId: string
  paragraph: number
  offset: number
  snippet: string
}

/** One section's full Markdown at a moment. Immutable once written (0001). */
export interface Version {
  id: string
  pieceId: string
  sectionId: string
  parentId: string | null
  /** The parent's seq plus one. Order comes from the parent, never the clock, and survives thinning. */
  seq: number
  createdAt: number
  content: string
  kept?: boolean
}

/** The piece's structure at a moment: its title and its sections' titles. Immutable. */
export interface Outline {
  id: string
  pieceId: string
  parentId: string | null
  seq: number
  createdAt: number
  title: string
  sections: OutlineSection[]
}

/** The one mutable copy of a section's text, saved about a second after typing stops. */
export interface Working {
  sectionId: string
  pieceId: string
  content: string
  baseVersionId: string | null
  updatedAt: number
}
