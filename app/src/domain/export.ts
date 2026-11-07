import type { Piece } from './model'
import type { OpenSection } from './pieces'
import { dayTitle } from './words'

/**
 * One piece as one `.md` file, with no history (docs/decisions/0007): an
 * essay under its title; a book or journal opens with its title as the `# `
 * heading and its subtitle as an italic line, then a `## ` heading per chapter
 * or day, a day's heading carrying the year. Import reads this back (archive).
 */
export function pieceAsMarkdown(piece: Piece, sections: OpenSection[]): { name: string; text: string } {
  const title = piece.title.trim() || 'Untitled'
  const parts =
    piece.kind === 'essay'
      ? [`# ${title}`, sections[0]?.content ?? '']
      : [
          `# ${title}`,
          subtitleLine(piece.subtitle),
          ...sections.flatMap((s) => [`## ${piece.kind === 'journal' ? dayTitle(s.title, true) : s.title.trim() || 'Untitled'}`, s.content]),
        ]
  return {
    name: `${title.replace(/[\\/:*?"<>|]/g, '').trim() || 'Untitled'}.md`,
    text: `${parts.filter((p) => p !== '').join('\n\n')}\n`,
  }
}

/** The subtitle as one italic line, with what would end it early escaped; nothing when there is none. */
function subtitleLine(subtitle: string | undefined): string {
  const text = (subtitle ?? '').replace(/\s+/g, ' ').trim()
  return text === '' ? '' : `*${text.replace(/[\\*_]/g, '\\$&')}*`
}
