import { fileName, PdfLoadError } from '../../domain/export'
import type { Piece } from '../../domain/model'
import { paperFor } from '../../domain/paper'
import type { OpenSection } from '../../domain/pieces'
import { settingsNow } from '../stores/settings'
import { downloadBytes } from './download'

type PdfCode = typeof import('../../pdf/makePdf')

/** The name of the PDF code's file, which the build puts in place of this (vite.config.ts). */
const CODE_FILE = '__PDF_CODE_FILE__'

let code: PdfCode | undefined
let failures = 0

/** The PDF code's address with a mark that is new each time. Joined as text: Vite reads `new URL` with a variable as a folder of files. */
const again = () => `${import.meta.url.slice(0, import.meta.url.lastIndexOf('/') + 1)}${CODE_FILE}?again=${failures}`

/** The PDF module in what the chunk exports: the build wraps it under a name of its own, so it is looked for by what it holds. */
function moduleOf(chunk: object): PdfCode {
  const found = [chunk, ...Object.values(chunk)].find((it): it is PdfCode => typeof (it as Partial<PdfCode> | null)?.makePdf === 'function')
  if (!found) throw new Error('The PDF code has no makePdf')
  return found
}

/**
 * The PDF code, fetched the first time it is wanted and kept. WebKit remembers a module that failed to load, by its
 * address, until the page is loaded again, so a second try at the same address fails the same way: after a failure
 * the code is asked for under another address each time (docs/decisions/0019).
 */
async function pdfCode(): Promise<PdfCode> {
  if (code) return code
  try {
    code = failures === 0 || !import.meta.env.PROD ? await import('../../pdf/makePdf') : moduleOf(await import(/* @vite-ignore */ again()))
  } catch (cause) {
    failures++
    throw new PdfLoadError('Could not fetch the PDF code', { cause })
  }
  return code
}

/**
 * The piece as a PDF, made here on the device: no writing leaves it. The PDF code and its fonts are
 * fetched when the first one is made, not before (docs/decisions/0019). Writes nothing to the piece.
 */
async function pdfFile(piece: Piece, sections: OpenSection[]): Promise<{ name: string; bytes: Uint8Array<ArrayBuffer> }> {
  const { makePdf } = await pdfCode()
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
