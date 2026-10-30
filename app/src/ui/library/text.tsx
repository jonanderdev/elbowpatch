import type { ReactNode } from 'react'
import type { Piece } from '../../domain/model'
import { totalWords } from '../../domain/pieces'
import { dayTitle, number, shortDate, words } from '../../domain/words'

export function excerpt(piece: Piece): string {
  return piece.place?.snippet.trim() || 'Begin anywhere.'
}

export function continueMeta(piece: Piece): ReactNode {
  const section = piece.sections.find((s) => s.sectionId === piece.place?.sectionId)
  if (piece.kind === 'essay') return piece.title.trim() || 'Untitled'
  const part = piece.kind === 'journal' ? dayTitle(section?.title ?? '') : section?.title.trim() || 'Untitled'
  return (
    <>
      <i>{part}</i> · {piece.title.trim() || 'Untitled'}
    </>
  )
}

export function meta(piece: Piece, today: string, now: number): string {
  const date = shortDate(piece.updatedAt, now)
  if (piece.kind === 'essay') return `${words(totalWords(piece))} · ${date}`
  if (piece.kind === 'book') {
    const n = piece.sections.length
    return `${n} ${n === 1 ? 'chapter' : 'chapters'} · ${date}`
  }
  const todays = piece.sections.find((s) => s.title === today)
  const days = piece.sections.length
  const todayWords = todays ? (piece.words?.[todays.sectionId] ?? 0) : 0
  return `${number(days)} ${days === 1 ? 'day' : 'days'} · ${todayWords ? `${words(todayWords)} today` : 'nothing yet today'}`
}

/** The foot of a shelf object: counts only, one per line; dates are left to the list. */
export function shelfMeta(piece: Piece): string {
  if (piece.kind === 'essay') return words(totalWords(piece))
  const n = piece.sections.length
  // shortcut: a book's page count ("21 pages") waits until pieces keep one; pages follow the screen.
  if (piece.kind === 'book') return `${n} ${n === 1 ? 'chapter' : 'chapters'}`
  return `${number(n)} ${n === 1 ? 'day' : 'days'}`
}
