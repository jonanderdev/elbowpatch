// The product's words are the code's words (docs/decisions/0009).

export type Kind = 'journal' | 'essay' | 'book'

/** The two pages a piece is laid out on: a phone's and a larger screen's (DESIGN.md, Layout). */
export type Screen = 'phone' | 'desktop'

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
  /** A book's subtitle, on its title page under the title. */
  subtitle?: string
  sections: OutlineSection[]
  /** The outline version the current title and sections were last kept as. */
  outlineId: string | null
  putAwayAt?: number
  place?: Place
  /** Each section's word count as last written, so the library never opens the text. */
  words?: Record<string, number>
  /** Each section's page count as last laid out, on each screen's page, so the library never lays the text out. */
  pages?: Partial<Record<Screen, Record<string, number>>>
  /** Imported beside a different piece with the same id: which export copy it was (archive). */
  copyOf?: string
}

/** Where the writer was: a paragraph, an offset and a few words, so it survives edits made elsewhere. */
export interface Place {
  sectionId: string
  paragraph: number
  offset: number
  /** The paragraph's opening words: finds the place again after edits, and is the library's excerpt. */
  snippet: string
  /** The page it was on: for orientation only, it differs between a phone's page and a desktop's. */
  page: number
  /** True when the caret was there; otherwise it is the first line on screen. */
  caret: boolean
  at: number
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
  /** The text a "bring back" replaced: never thinned (0005). */
  beforeBringBack?: boolean
}

/** The piece's structure at a moment: its title and its sections' titles. Immutable. */
export interface Outline {
  id: string
  pieceId: string
  parentId: string | null
  seq: number
  createdAt: number
  title: string
  subtitle?: string
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
