import { fileName, PdfLoadError } from '../../domain/export'
import type { Piece } from '../../domain/model'
import { paperFor } from '../../domain/paper'
import type { OpenSection } from '../../domain/pieces'
import { settingsNow } from '../stores/settings'
import { downloadBytes } from './download'

/**
 * The piece as a PDF, made here on the device: no writing leaves it. The PDF code and its fonts are
 * fetched when the first one is made, not before (docs/decisions/0019). Writes nothing to the piece.
 */
async function pdfFile(piece: Piece, sections: OpenSection[]): Promise<{ name: string; bytes: Uint8Array<ArrayBuffer> }> {
  const { makePdf } = await import('../../pdf/makePdf').catch((cause) => {
    throw new PdfLoadError('Could not fetch the PDF code', { cause })
  })
  const paper = paperFor(navigator.languages?.length ? navigator.languages : [navigator.language])
  const { indent, dropcap } = settingsNow()
  const made = await makePdf(piece, sections, paper, { indent, dropcap })
  return { name: fileName(piece.title, 'pdf'), bytes: new Uint8Array(made) }
}

/** Makes the piece's PDF and hands it to the writer. Gives the file's name. */
export async function savePdf(piece: Piece, sections: OpenSection[]): Promise<string> {
  const file = await pdfFile(piece, sections)
  downloadBytes(file.name, file.bytes, 'application/pdf')
  return file.name
}
