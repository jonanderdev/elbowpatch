import type { ArchiveFile } from '../domain/archive'

// The export zip (docs/decisions/0007). fflate is loaded only when exporting
// or importing, so it costs nothing at launch (0011).

export async function zip(folder: string, files: ArchiveFile[]): Promise<Blob> {
  const { zipSync, strToU8 } = await import('fflate')
  const entries: Record<string, Uint8Array> = {}
  for (const f of files) entries[`${folder}/${f.path}`] = strToU8(f.text)
  return new Blob([zipSync(entries, { level: 6 })], { type: 'application/zip' })
}

export async function unzip(data: ArrayBuffer): Promise<ArchiveFile[]> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const entries = unzipSync(new Uint8Array(data))
  return Object.entries(entries)
    .filter(([path]) => !path.endsWith('/') && !path.startsWith('__MACOSX/'))
    .map(([path, bytes]) => ({ path, text: strFromU8(bytes) }))
}
