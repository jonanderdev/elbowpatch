// The fixed font files, as addresses: hashed assets, fetched when a PDF needs them and not part of the
// install (docs/decisions/0019). A file is a face in a group of scripts (runs.ts names it); a piece
// fetches only the files its characters need.
import { PdfLoadError } from '../domain/export'

const URLS = import.meta.glob<string>('./fonts/*.ttf', { query: '?url', import: 'default', eager: true })

export async function faceBytes(file: string): Promise<Uint8Array> {
  const url = URLS[`./fonts/${file}.ttf`]
  if (!url) throw new Error(`No font file for ${file}`)
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Status ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  } catch (cause) {
    throw new PdfLoadError(`Could not fetch ${file}`, { cause })
  }
}
