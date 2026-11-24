/** Hands the writer a file. Nothing leaves the device. */
export function download(name: string, text: string): void {
  hand(name, new Blob([text], { type: 'text/markdown;charset=utf-8' }), 1000)
}

/** The same for a file made of bytes. A page's PDF can be large, and a phone slow to take it, so its address lives longer. */
export function downloadBytes(name: string, bytes: Uint8Array<ArrayBuffer>, type: string): void {
  hand(name, new Blob([bytes], { type }), 60_000)
}

function hand(name: string, blob: Blob, keep: number): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), keep)
}
