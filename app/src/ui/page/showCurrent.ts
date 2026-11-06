/** The current chapter brought into a long list's view. Returns its row. */
export function showCurrent(root: HTMLElement | null): HTMLElement | null {
  const list = root?.querySelector<HTMLElement>('.contents-list')
  const row = root?.querySelector<HTMLElement>('[aria-current="true"]')
  if (!list || !row) return null
  // Up to the list's scroll padding, not its edge: the room for the row's focus ring, or for a line over the rail.
  const gap = row.getBoundingClientRect().bottom + Number.parseFloat(getComputedStyle(list).scrollPaddingBottom) - list.getBoundingClientRect().bottom
  // Not when every row already fits: the room a line leaves under the last row is out of flow and makes the list scrollable,
  // but a short book has nothing to scroll to, and scrolling would crop its first rows.
  const last = list.lastElementChild
  const fits = !last || last.getBoundingClientRect().bottom + list.scrollTop <= list.getBoundingClientRect().bottom
  if (gap > 0 && !fits) list.scrollTop += gap
  // And back up: a folded rail keeps its scroll, so on opening again the current row can lie above what shows.
  const over = list.getBoundingClientRect().top + Number.parseFloat(getComputedStyle(list).scrollPaddingTop) - row.getBoundingClientRect().top
  if (over > 0) list.scrollTop -= over
  return row
}
