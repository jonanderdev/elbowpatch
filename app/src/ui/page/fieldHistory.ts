/** A run of typing with gaps shorter than this is one step, as in the text (src/page/editor.ts). */
const NEW_STEP_AFTER = 1000

export interface FieldHistory {
  /** The field's text changed at this time, in ms. */
  note(text: string, at: number): void
  /** The text to put back, or null at the end of the history. */
  undo(): string | null
  redo(): string | null
}

/**
 * Undo for one title field, starting from the text it opened with. The browser's own undo is one
 * history for the whole document: run out of a title's steps, it goes on into the text, behind the
 * editor's back (DESIGN.md, Control).
 */
export function fieldHistory(opening: string): FieldHistory {
  const past: string[] = []
  const future: string[] = []
  let text = opening
  let last = -Infinity
  const move = (from: string[], to: string[]): string | null => {
    const next = from.pop()
    if (next === undefined) return null
    to.push(text)
    text = next
    // What is typed next is a step of its own.
    last = -Infinity
    return text
  }
  return {
    note(next, at) {
      if (next === text) return
      if (at - last >= NEW_STEP_AFTER) past.push(text)
      text = next
      last = at
      future.length = 0
    },
    undo: () => move(past, future),
    redo: () => move(future, past),
  }
}
