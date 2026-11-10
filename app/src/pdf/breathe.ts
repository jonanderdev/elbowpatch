// Long work gives the page back to the browser every so often, so a piece of a thousand pages does not
// stop the screen, the taps or the "Setting your pages…" line while it is laid out and written (docs/decisions/0019).

/** How long work may run before the page is given back, in ms: under the 50 ms the browsers call a long task. */
const SLICE = 20
let since = performance.now()

/**
 * Call it freely inside a loop: it costs a clock read, and gives the page back only when the work has had
 * its slice. A timer, not a frame, so a page in the background goes on (slowly), and every browser takes the same path.
 */
export async function breathe(): Promise<void> {
  if (performance.now() - since < SLICE) return
  await new Promise<void>((done) => setTimeout(done, 0))
  since = performance.now()
}
