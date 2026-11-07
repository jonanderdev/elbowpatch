// The PDF module (docs/decisions/0019): a piece, its sections and the paper in, the finished file out.
// Everything behind this one function, the layout and the writing, can change without a caller noticing.
// It is loaded when the first PDF is made, and is not part of the install.

import { parse } from '../domain/markdown'
import type { Piece } from '../domain/model'
import type { Paper } from '../domain/paper'
import type { OpenSection } from '../domain/pieces'
import { printOrder } from '../domain/printOrder'
import { type Look, layOut } from './layout'
import { type Sheet, write } from './write'

export type { Look }

/**
 * The whole piece as a PDF. `look`: what the writer's own text settings add to the page; the rest of the
 * page is fixed, so a piece makes the same pages on every screen.
 */
export async function makePdf(piece: Piece, sections: OpenSection[], paper: Paper, look: Look): Promise<Uint8Array> {
  const sheets: Sheet[] = []
  let number = 0
  // A book's contents lists the same rows the pages are laid out from, and is written with them once every
  // page is laid out: the number beside a chapter is the one its first page is printed with, so they cannot disagree.
  const chapters: { title: string; number: number }[] = []
  for (const item of printOrder(piece, sections)) {
    if (item.kind === 'title') {
      sheets.push(item)
      continue
    }
    if (item.kind === 'contents') {
      sheets.push({ kind: 'contents', rows: chapters })
      continue
    }
    chapters.push({ title: item.heading, number: number + 1 })
    const pages = await layOut(item.heading, parse(item.content), paper, piece.lang, look)
    // The running head carries from a section's second page; its first opens under its heading. Only text is counted.
    for (const [i, lines] of pages.entries()) sheets.push({ kind: 'text', lines, head: i > 0 ? item.heading : '', number: ++number })
  }
  return write({ sheets, ruled: piece.kind === 'journal', paper, title: piece.title.trim() || 'Untitled', lang: piece.lang })
}
