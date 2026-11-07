import type { FaceName } from './layout'

// The fixed font files, as addresses: hashed assets, fetched when the first PDF is made and not part of
// the install (docs/decisions/0019).
const URLS = import.meta.glob<string>('./fonts/*.ttf', { query: '?url', import: 'default', eager: true })

export async function faceBytes(face: FaceName): Promise<Uint8Array> {
  const url = URLS[`./fonts/${face}.ttf`]
  if (!url) throw new Error(`No font file for ${face}`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not fetch ${face}`)
  return new Uint8Array(await response.arrayBuffer())
}
