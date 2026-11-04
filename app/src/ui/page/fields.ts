// The page's title fields: an essay's title or a chapter's (a journal day's date, not editable),
// and on a book's or journal's title page its name and subtitle. They are uncontrolled
// contentEditable elements, filled each time a section opens and read when saving.

import type { RefObject } from 'react'
import type { Piece } from '../../domain/model'
import { dayTitle } from '../../domain/words'
import { type Unsaved, unsaved } from '../stores/unsaved'
import { type FieldHistory, fieldHistory } from './fieldHistory'

/**
 * Where a section opens when the writer goes to it: its opening page, from Contents; its opening
 * page turned on to, which takes the caret along as any turn does; its last page, turned back to; or
 * the join, where undo has just put the next chapter back onto its end.
 */
export type OpenAt = 'opening' | 'turned-on' | 'last' | 'join'

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
  /** Chosen, not returned to: it opens here rather than at the writer's place, and their place follows. */
  at?: OpenAt
  /** The writer was in the text when they went there: the caret goes with them. */
  writing?: boolean
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

/** Each title field's history, from the text it was filled with. */
const histories = new WeakMap<HTMLElement, FieldHistory>()

/** Fills the fields with the titles as stored (or as kept, when newer). Returns the section's title. */
export function fillTitleFields(opened: Opened, fields: TitleFields): string {
  const kept = keptFor(opened)
  const title = kept?.title ?? titleOf(opened)
  if (fields.title) fields.title.textContent = title
  if (fields.bookTitle) fields.bookTitle.textContent = kept?.bookTitle ?? opened.piece.title
  if (fields.subtitle) fields.subtitle.textContent = kept?.subtitle ?? opened.piece.subtitle ?? ''
  for (const el of [fields.title, fields.bookTitle, fields.subtitle]) {
    if (!el) continue
    emptied(el)
    histories.set(el, fieldHistory(el.textContent ?? ''))
  }
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

/** After any change to a field's text: its placeholder and its history keep up. */
export function fieldChanged(el: HTMLElement, at: number): void {
  emptied(el)
  histories.get(el)?.note(el.textContent ?? '', at)
}

/** The caret at the end of a field that has the focus. */
export function caretToFieldEnd(el: HTMLElement): void {
  const selection = getSelection()
  selection?.selectAllChildren(el)
  selection?.collapseToEnd()
}

/** Writes a field's text as if it were typed, so the page sees and saves it. */
export function fillField(el: HTMLElement, text: string): void {
  el.textContent = text
  el.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

/**
 * Takes a field a step back or on, and leaves the caret at its end. The change goes through the
 * field's own input, so the page sees and saves it as if it were typed. False with no step left.
 */
export function stepField(el: HTMLElement, way: 'undo' | 'redo'): boolean {
  const text = histories.get(el)?.[way]()
  if (text === null || text === undefined) return false
  fillField(el, text)
  caretToFieldEnd(el)
  return true
}

/** ⌘/Ctrl + Z and ⌘/Ctrl + Shift + Z in a field, as in the text. ⌘/Ctrl + Alt + Z is the Time Machine's. */
export function fieldUndoKeys(e: KeyboardEvent, onUndoPast?: () => void): void {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'z') return
  e.preventDefault()
  const stepped = stepField(e.currentTarget as HTMLElement, e.shiftKey ? 'redo' : 'undo')
  if (!stepped && !e.shiftKey) onUndoPast?.()
}
