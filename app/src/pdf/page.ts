// The printed page, in points (DESIGN.md, Export). Nothing here follows the screen, the text settings
// or the theme: a piece makes the same pages on every one of them.

import type { Paper } from '../domain/paper'

const MM = 72 / 25.4

/** Paper sizes, in points. */
export const PAPER: Record<Paper, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595.276, height: 841.89 },
}

/** The reading column: about 65 characters, centred, so the margins are what is left. */
export const COLUMN: number = 117 * MM
export const MARGIN_TOP: number = 25 * MM
export const MARGIN_BOTTOM: number = 30 * MM

export const BODY = 11
export const LEADING = 1.55
/** Space between paragraphs, one line of the leading (the Ready frames of the printed pages). */
export const PARAGRAPH_GAP: number = BODY * LEADING
export const TITLE_SCALE = 2.05
export const RUNNING_HEAD = 8.5
export const PAGE_NUMBER = 9

/** Where a running head's top and a page number's top sit, from the paper's top and bottom edges. */
export const RUNNING_HEAD_TOP = 36
export const PAGE_NUMBER_FROM_BOTTOM = 52

/** A title page (the Ready frames of the printed title pages): the title 3 times the body, the subtitle 1.15 times, a gap between. */
export const TITLE_PAGE_TITLE: number = 3 * BODY
export const TITLE_PAGE_TITLE_LEADING = 1.12
export const TITLE_PAGE_SUBTITLE: number = 1.15 * BODY
export const TITLE_PAGE_SUBTITLE_LEADING = 1.4
export const TITLE_PAGE_GAP = 14
/** Where the title's first line begins, as a share of the paper's height: the upper third (189 pt on A4, 178 on Letter). */
export const TITLE_PAGE_TOP = 0.2245

/** A journal's margin rule: a hairline the sheet's height, this far left of the text. */
export const RULE_FROM_TEXT: number = 12 * MM
export const RULE_WIDTH = 1

export const INK = '#1f1f1f'
export const SECONDARY = '#676767'
export const RULE = '#e2e2de'

export function textHeight(paper: Paper): number {
  return PAPER[paper].height - MARGIN_TOP - MARGIN_BOTTOM
}

export function columnLeft(paper: Paper): number {
  return (PAPER[paper].width - COLUMN) / 2
}
