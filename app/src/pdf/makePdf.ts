// The PDF module (docs/decisions/0019): a piece, its sections and the paper in, the finished file out.
// Everything behind this one function, the layout and the writing, can change without a caller noticing.
// It is loaded when the first PDF is made, and is not part of the install.

import { parse } from '../domain/markdown'
import type { Piece } from '../domain/model'
import type { Paper } from '../domain/paper'
import type { OpenSection } from '../domain/pieces'
import { type Look, layOut } from './layout'
import { write } from './write'

export type { Look }

/**
 * The whole piece as a PDF. `look`: what the writer's own text settings add to the page; the rest of the
 * page is fixed, so a piece makes the same pages on every screen.
 */
export async function makePdf(piece: Piece, sections: OpenSection[], paper: Paper, look: Look): Promise<Uint8Array> {
  if (piece.kind !== 'essay') throw new Error('Only an essay has its PDF so far')
  const title = piece.title.trim()
  const pages = await layOut(title, parse(sections[0]?.content ?? ''), paper, piece.lang, look)
  return write({ pages, head: title, paper, title: title || 'Untitled', lang: piece.lang })
}
