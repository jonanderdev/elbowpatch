export interface LayoutWatch {
  /** Sees the layout now. A change forgets the counts, then records it; undefined if it is no change. */
  see(layout: string): Promise<void> | undefined
  /** Counts the layouts seen: a measurement begun under an earlier one is not kept. */
  generation(): number
}

interface Options {
  /** The layout this device's counts were laid out at. */
  read(): string | undefined
  write(layout: string): void
  forget(): Promise<void>
}

/**
 * Follows the layout (0003). The new layout is recorded only once the counts are forgotten, so a change not
 * seen through, by a failure or a crash, is found at the next launch. Only the latest change records it.
 */
export function layoutWatch({ read, write, forget }: Options): LayoutWatch {
  let seen = read()
  let generation = 0
  return {
    see(layout) {
      if (layout === seen) return undefined
      seen = layout
      const mine = ++generation
      return forget().then(() => {
        if (mine === generation) write(layout)
      })
    },
    generation: () => generation,
  }
}
