import { pieceAsMarkdown } from '../../domain/export'
import type { Piece } from '../../domain/model'
import type { Deps, OpenSection } from '../../domain/pieces'
import { openPiece, withOpenSection } from '../../domain/pieces'

/**
 * The piece and its sections as the page holds them now: one section as the page has it (it may not be
 * stored yet), where the draft has it. A chapter with nothing in it yet is left out. An essay's title comes
 * from the page too. Markdown and PDF are both made from this (DESIGN.md, Export).
 */
export async function pieceAsPageHolds(
  deps: Deps,
  piece: Piece,
  sectionId: string,
  content: string,
  pageTitle: string,
): Promise<{ piece: Piece; sections: OpenSection[] }> {
  const stored = await openPiece(deps, piece.id).catch(() => undefined)
  const sections = stored ? stored.sections.map((s) => (s.sectionId === sectionId ? { ...s, content } : s)) : [{ sectionId, title: '', content }]
  if (stored && !sections.some((s) => s.sectionId === sectionId)) {
    // A journal's day keeps its date; the title of a chapter not stored yet is only on the page.
    const title = piece.sections.find((s) => s.sectionId === sectionId)?.title || pageTitle
    const at = withOpenSection(stored.piece, piece, sectionId).sections.findIndex((s) => s.sectionId === sectionId)
    if (content !== '' || title !== '') sections.splice(at, 0, { sectionId, title, content })
  }
  const base = stored?.piece ?? piece
  return { piece: { ...base, title: piece.kind === 'essay' ? pageTitle : base.title }, sections }
}

/** The whole piece as one Markdown file, from the page as it holds it now. */
export async function markdownFile(deps: Deps, piece: Piece, sectionId: string, content: string, pageTitle: string): Promise<{ name: string; text: string }> {
  const held = await pieceAsPageHolds(deps, piece, sectionId, content, pageTitle)
  return pieceAsMarkdown(held.piece, held.sections)
}
