// The page's title fields: an essay's title or a chapter's (a journal day's date, not editable),
// and on a book's or journal's title page its name and subtitle. They are uncontrolled
// contentEditable elements, filled each time a section opens and read when saving.

import type { RefObject } from 'react'
import type { Piece } from '../../domain/model'
import { dayTitle } from '../../domain/words'
import { type Unsaved, unsaved } from '../stores/unsaved'

/** A section of a piece, open on the page. */
export interface Opened {
  piece: Piece
  sectionId: string
  content: string
  /** When this section's text was last stored: kept words newer than this start the page. */
  updatedAt?: number
  /** Just made: the title takes the caret. */
  fresh?: boolean
  /** Which reading from storage this is: the page starts over for each. */
  readAt: number
}

export interface TitleFields {
  title: HTMLElement | null
  bookTitle: HTMLElement | null
  subtitle: HTMLElement | null
}

/** The same fields as refs, as the page holds them. */
export interface TitleRefs {
  title: RefObject<HTMLHeadingElement | null>
  bookTitle: RefObject<HTMLHeadingElement | null>
  subtitle: RefObject<HTMLParagraphElement | null>
}

/** The section's title as stored: an essay's own, a chapter's, or a journal day's date. */
export function titleOf(opened: Opened): string {
  const { piece, sectionId } = opened
  if (piece.kind === 'essay') return piece.title
  const section = piece.sections.find((s) => s.sectionId === sectionId)
  return piece.kind === 'journal' ? dayTitle(section?.title ?? '') : (section?.title ?? '')
}

/** Words kept for this section in the unsaved journal that are newer than what is stored. */
export function keptFor(opened: Opened): Unsaved | undefined {
  const kept = unsaved.get(opened.sectionId)
  return kept && kept.at > (opened.updatedAt ?? 0) ? kept : undefined
}

/** Fills the fields with the titles as stored (or as kept, when newer). Returns the section's title. */
export function fillTitleFields(opened: Opened, fields: TitleFields): string {
  const kept = keptFor(opened)
  const title = kept?.title ?? titleOf(opened)
  if (fields.title) fields.title.textContent = title
  if (fields.bookTitle) fields.bookTitle.textContent = kept?.bookTitle ?? opened.piece.title
  if (fields.subtitle) fields.subtitle.textContent = kept?.subtitle ?? opened.piece.subtitle ?? ''
  for (const el of [fields.title, fields.bookTitle, fields.subtitle]) if (el) emptied(el)
  return title
}

/**
 * An empty field holds one <br> and says so in data-empty, which shows its placeholder.
 * Without the <br>, Firefox puts the caret at the line's left edge, not where centred words start.
 */
export function emptied(el: HTMLElement): void {
  const empty = el.textContent === ''
  if (empty && !(el.childNodes.length === 1 && el.firstChild?.nodeName === 'BR')) el.replaceChildren(document.createElement('br'))
  el.toggleAttribute('data-empty', empty)
}
