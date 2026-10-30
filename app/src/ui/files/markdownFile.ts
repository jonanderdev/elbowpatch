import { pieceAsMarkdown } from '../../domain/export'
import type { Piece } from '../../domain/model'
import { type Deps, openPiece } from '../../domain/pieces'

/**
 * The whole piece as one Markdown file (DESIGN.md, Export), with one section as the page holds it
 * now (it may not be stored yet). An essay's title comes from the page too.
 */
export async function markdownFile(deps: Deps, piece: Piece, sectionId: string, content: string, pageTitle: string): Promise<{ name: string; text: string }> {
  const stored = await openPiece(deps, piece.id).catch(() => undefined)
  const sections = stored ? stored.sections.map((s) => (s.sectionId === sectionId ? { ...s, content } : s)) : [{ sectionId, title: '', content }]
  if (!sections.some((s) => s.sectionId === sectionId))
    sections.push({ sectionId, title: piece.sections.find((s) => s.sectionId === sectionId)?.title ?? '', content })
  const base = stored?.piece ?? piece
  return pieceAsMarkdown({ ...base, title: piece.kind === 'essay' ? pageTitle : base.title }, sections)
}
