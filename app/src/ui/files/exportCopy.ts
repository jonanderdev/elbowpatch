// The words around exporting: the lines under the PDF row (DESIGN.md, Export) and the line that follows a copy.

import type { Kind } from '../../domain/model'

/** The line under a piece's PDF row, by kind. */
export function pdfNote(kind: Kind): string {
  if (kind === 'essay') return 'Numbered pages to print or keep.'
  if (kind === 'journal') return 'Numbered pages to print or keep, each day on a fresh page.'
  return 'Numbered pages to print or keep, with contents at the front.'
}

/** What the PDF row says while the file is made, and when it cannot be (offline before the first one, or for another reason). */
export const PDF_LINES = {
  working: 'Setting your pages…',
  // A first PDF needs its code and fonts from the network; once they are kept it needs nothing.
  offline: 'PDF needs a connection the first time. Nothing has changed.',
  failed: 'Couldn’t make the PDF just now. Nothing has changed; try again.',
} as const

/** The calm line after a file is handed over. */
export function savedAs(name: string): string {
  return `Saved as ${name}.`
}
