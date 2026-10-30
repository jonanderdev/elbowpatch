import type { ReactNode } from 'react'
import type { Piece, Screen } from '../../domain/model'
import { bookPages, totalWords } from '../../domain/pieces'
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

/** A book's chapters, and its pages on this screen's page once every chapter has been laid out there. */
function bookCounts(piece: Piece, screen: Screen): string[] {
  const n = piece.sections.length
  const pages = bookPages(piece, screen)
  return [`${n} ${n === 1 ? 'chapter' : 'chapters'}`, ...(pages ? [`${number(pages)} ${pages === 1 ? 'page' : 'pages'}`] : [])]
}

export function meta(piece: Piece, today: string, now: number, screen: Screen): string {
  const date = shortDate(piece.updatedAt, now)
  if (piece.kind === 'essay') return `${words(totalWords(piece))} · ${date}`
  if (piece.kind === 'book') return [...bookCounts(piece, screen), date].join(' · ')
  const todays = piece.sections.find((s) => s.title === today)
  const days = piece.sections.length
  const todayWords = todays ? (piece.words?.[todays.sectionId] ?? 0) : 0
  return `${number(days)} ${days === 1 ? 'day' : 'days'} · ${todayWords ? `${words(todayWords)} today` : 'nothing yet today'}`
}

/** The foot of a shelf object: counts only, one per line; dates are left to the list. */
export function shelfMeta(piece: Piece, screen: Screen): string {
  if (piece.kind === 'essay') return words(totalWords(piece))
  if (piece.kind === 'book') return bookCounts(piece, screen).join('\n')
  const n = piece.sections.length
  return `${number(n)} ${n === 1 ? 'day' : 'days'}`
}
