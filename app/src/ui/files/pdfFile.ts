import { fileName } from '../../domain/export'
import type { Piece } from '../../domain/model'
import { paperFor } from '../../domain/paper'
import type { OpenSection } from '../../domain/pieces'
import { settingsNow } from '../stores/settings'

/**
 * The piece as a PDF, made here on the device: no writing leaves it. The PDF code and its fonts are
 * fetched when the first one is made, not before (docs/decisions/0019). Writes nothing to the piece.
 */
export async function pdfFile(piece: Piece, sections: OpenSection[]): Promise<{ name: string; bytes: Uint8Array<ArrayBuffer> }> {
  const { makePdf } = await import('../../pdf/makePdf')
  const paper = paperFor(navigator.languages?.length ? navigator.languages : [navigator.language])
  const made = await makePdf(piece, sections, paper, { indent: settingsNow().indent })
  return { name: fileName(piece.title, 'pdf'), bytes: new Uint8Array(made) }
}
