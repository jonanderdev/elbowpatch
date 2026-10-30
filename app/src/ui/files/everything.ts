import { zip } from '../../adapters/zip'
import { exportAll } from '../../domain/archive'
import type { Deps } from '../../domain/pieces'
import { longDate } from '../../domain/words'

// "Export everything", from Settings or from the library's reminder: one zip,
// downloaded at once, remembered as the last export on this device.

const LAST_EXPORT = 'elbowpatch.lastExport'

export async function downloadEverything(deps: Deps): Promise<string> {
  const now = Date.now()
  const name = `Elbowpatch ${longDate(now, now, true)}`
  const blob = await zip(name, await exportAll(deps))
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.zip`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  try {
    localStorage.setItem(LAST_EXPORT, String(now))
  } catch {}
  return `${name}.zip`
}

export function lastExport(): number | null {
  try {
    const v = localStorage.getItem(LAST_EXPORT)
    return v ? Number(v) : null
  } catch {
    return null
  }
}
