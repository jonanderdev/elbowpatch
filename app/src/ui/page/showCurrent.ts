/** The current chapter brought into a long list's view. Returns its row. */
export function showCurrent(root: HTMLElement | null): HTMLElement | null {
  const list = root?.querySelector<HTMLElement>('.contents-list')
  const row = root?.querySelector<HTMLElement>('[aria-current="true"]')
  if (!list || !row) return null
  // Up to the list's padding, not its edge: that is the room for the row's focus ring.
  const gap = row.getBoundingClientRect().bottom + Number.parseFloat(getComputedStyle(list).paddingBottom) - list.getBoundingClientRect().bottom
  if (gap > 0) list.scrollTop += gap
  return row
}
