import type { Piece } from './model'
import type { OpenSection } from './pieces'
import { dayTitle } from './words'

/**
 * One piece as one `.md` file, with no history (docs/decisions/0007): an
 * essay under its title, a book with a `# ` heading per chapter, a journal
 * with a `# ` heading per day that carries the year.
 */
export function pieceAsMarkdown(piece: Piece, sections: OpenSection[]): { name: string; text: string } {
  const title = piece.title.trim() || 'Untitled'
  const parts =
    piece.kind === 'essay'
      ? [`# ${title}`, sections[0]?.content ?? '']
      : sections.flatMap((s) => [`# ${piece.kind === 'journal' ? dayTitle(s.title, true) : s.title.trim() || 'Untitled'}`, s.content])
  return {
    name: `${title.replace(/[\\/:*?"<>|]/g, '').trim() || 'Untitled'}.md`,
    text: `${parts.filter((p) => p !== '').join('\n\n')}\n`,
  }
}
