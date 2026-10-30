// The piece this window opened last, for Continue and the next launch. Read
// from localStorage once, at load; kept in memory after.

const LAST = 'elbowpatch.last'
let last = read()

function read(): string | undefined {
  try {
    return localStorage.getItem(LAST) || undefined
  } catch {
    return undefined
  }
}

export function readLast(): string | undefined {
  return last
}

export function writeLast(id: string): void {
  last = id
  try {
    localStorage.setItem(LAST, id)
  } catch {}
}
