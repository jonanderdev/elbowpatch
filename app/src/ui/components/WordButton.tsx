import type { ReactElement } from 'react'
/**
 * A word that stands alone in the head and takes you somewhere (DESIGN.md, Control):
 * a hairline pill, 30px tall, inside a 44px tap area. Library, Settings, later Now,
 * Contents and Days. `keepFocus`: pressing it leaves the focus where it is.
 */
export function WordButton({ word, onClick, keepFocus }: { word: string; onClick(): void; keepFocus?: boolean }): ReactElement {
  return (
    <button type="button" className="word-button" onClick={onClick} onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}>
      <span className="word">{word}</span>
    </button>
  )
}
