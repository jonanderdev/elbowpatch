import { pieceAsMarkdown } from '../../domain/export'
import type { Piece } from '../../domain/model'
import { type Deps, openPiece, withDraft } from '../../domain/pieces'

/**
 * The whole piece as one Markdown file (DESIGN.md, Export), with one section as the page holds it
 * now (it may not be stored yet), where the draft has it. A chapter with nothing in it yet is not in
 * the file. An essay's title comes from the page too.
 */
export async function markdownFile(deps: Deps, piece: Piece, sectionId: string, content: string, pageTitle: string): Promise<{ name: string; text: string }> {
  const stored = await openPiece(deps, piece.id).catch(() => undefined)
  const sections = stored ? stored.sections.map((s) => (s.sectionId === sectionId ? { ...s, content } : s)) : [{ sectionId, title: '', content }]
  if (stored && !sections.some((s) => s.sectionId === sectionId)) {
    // A journal's day keeps its date; a draft chapter's title is only on the page.
    const title = piece.sections.find((s) => s.sectionId === sectionId)?.title || pageTitle
    const at = withDraft(stored.piece, piece, sectionId).sections.findIndex((s) => s.sectionId === sectionId)
    if (content !== '' || title !== '') sections.splice(at, 0, { sectionId, title, content })
  }
  const base = stored?.piece ?? piece
  return pieceAsMarkdown({ ...base, title: piece.kind === 'essay' ? pageTitle : base.title }, sections)
}
