import type { ReactElement } from 'react'

export interface Crumb {
  word: string
  /** Takes you back to that place; without it, the word only names where you are. */
  onClick?(): void
}

/**
 * The way back (DESIGN.md, Control): §, the app's mark, goes home to the library; a slash in
 * secondary grey, then each place you came from. `keepFocus`: pressing § leaves the focus where it is.
 */
export function Path({ crumbs = [], onHome, keepFocus }: { crumbs?: Crumb[]; onHome(): void; keepFocus?: boolean }): ReactElement {
  return (
    <nav className="path" aria-label="Path">
      <button type="button" className="home" aria-label="Library" onClick={onHome} onMouseDown={keepFocus ? (e) => e.preventDefault() : undefined}>
        <span aria-hidden="true">§</span>
      </button>
      {crumbs.length > 0 && (
        <span className="crumbs">
          {crumbs.map((c) => (
            <span key={c.word} className="crumb">
              <wbr />
              <span className="slash" aria-hidden="true">
                /
              </span>
              {c.onClick ? (
                <button type="button" className="crumb-word" onClick={c.onClick}>
                  {c.word}
                </button>
              ) : (
                <span className="crumb-word">{c.word}</span>
              )}
            </span>
          ))}
        </span>
      )}
    </nav>
  )
}
