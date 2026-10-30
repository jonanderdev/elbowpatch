import type { ReactElement } from 'react'
/**
 * A word that starts something (DESIGN.md, Control): a hairline pill, 30px tall, inside a 44px tap
 * area. *Write* on the desktop rail. `expanded`: what it opened is open, and it keeps the pressed tint.
 */
export function WordButton({ word, onClick, expanded }: { word: string; onClick(): void; expanded?: boolean }): ReactElement {
  return (
    <button type="button" className="word-button" aria-expanded={expanded} onClick={onClick}>
      <span className="word">{word}</span>
    </button>
  )
}
