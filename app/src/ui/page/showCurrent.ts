/** The current chapter brought into a long list's view. Returns its row. */
export function showCurrent(root: HTMLElement | null): HTMLElement | null {
  const list = root?.querySelector<HTMLElement>('.contents-list')
  const row = root?.querySelector<HTMLElement>('[aria-current="true"]')
  if (!list || !row) return null
  const gap = row.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom
  if (gap > 0) list.scrollTop += gap
  return row
}
