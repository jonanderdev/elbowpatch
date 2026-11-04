import type { Settings } from './settings'

// The text settings this device's page counts were laid out at, so a change made in another window, or
// cut short by a crash, is still noticed at the next launch. Read from localStorage once; kept in memory after.

const KEY = 'elbowpatch.layout'
let kept = read()

function read(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined
  } catch {
    return undefined
  }
}

/** What moves a page's breaks. The theme does not. */
export function layoutOf({ size, leading, measure, align, dropcap, indent }: Settings): string {
  return [size, leading, measure, align, dropcap, indent].join(' ')
}

export function readLayout(): string | undefined {
  return kept
}

export function writeLayout(layout: string): void {
  kept = layout
  try {
    localStorage.setItem(KEY, layout)
  } catch {}
}
