/** Whether a promise settled within `wait` ms. False means it may still land. Never rejects. */
export function settledWithin(p: Promise<unknown>, wait: number): Promise<boolean> {
  return Promise.race([
    p.then(
      () => true,
      () => true,
    ),
    new Promise<boolean>((r) => setTimeout(() => r(false), wait)),
  ])
}

/** A promise that settled, or two seconds, whichever comes first; never rejects. */
export async function settled(p: Promise<unknown>): Promise<void> {
  await settledWithin(p, 2000)
}

/** Settles once both pages have closed: a later page closing never hides an earlier one that is still writing. Never rejects. */
export async function closingAfter(earlier: Promise<unknown>, last: Promise<unknown>): Promise<void> {
  await Promise.allSettled([earlier, last])
}
