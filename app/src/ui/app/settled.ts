/** A promise that settled, or two seconds, whichever comes first; never rejects. */
export function settled(p: Promise<unknown>): Promise<void> {
  return Promise.race([p.then(() => {}, () => {}), new Promise<void>((r) => setTimeout(r, 2000))])
}
