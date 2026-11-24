import type { Piece } from './model'
import type { OpenSection } from './pieces'
import { dayTitle, oneLine } from './words'

/** What goes on the printed pages, in order, before any of it is laid out (DESIGN.md, Export). */
export type PrintItem =
  /** A title page: the title and the subtitle under it. It is not counted. */
  | { kind: 'title'; title: string; subtitle: string }
  /**
   * A book's contents: each chapter that follows, with the page it starts on. It is not numbered or counted,
   * and the numbers are not known here: they come from the pages once they are laid out.
   */
  | { kind: 'contents' }
  /** Text that opens on a fresh page under its heading, which is also the running head from its second page. */
  | { kind: 'section'; heading: string; content: string }

/**
 * The order of what a piece prints. It knows nothing of lines or pages: the PDF module lays each item
 * out. An essay is its text under its title. A journal opens with its title page, then each day that has
 * words, one after the other; a day with none is left out, and a journal with no words is its title page.
 * A book is its title page, its contents, then every chapter in its place, a chapter with no words
 * included, so a book with no words is still its title page, its contents and a page for each chapter.
 */
export function printOrder(piece: Piece, sections: OpenSection[]): PrintItem[] {
  const title = piece.title.trim()
  switch (piece.kind) {
    case 'essay':
      return [{ kind: 'section', heading: title, content: sections[0]?.content ?? '' }]
    case 'journal':
      return [
        { kind: 'title', title, subtitle: oneLine(piece.subtitle) },
        ...sections.filter((s) => s.content.trim() !== '').map((s): PrintItem => ({ kind: 'section', heading: dayTitle(s.title), content: s.content })),
      ]
    case 'book':
      return [
        { kind: 'title', title, subtitle: oneLine(piece.subtitle) },
        { kind: 'contents' },
        ...sections.map((s): PrintItem => ({ kind: 'section', heading: s.title.trim() || 'Untitled', content: s.content })),
      ]
  }
}
