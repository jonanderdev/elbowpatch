import { type ReactElement, useEffect, useRef } from 'react'
import { number, words as wordsWord } from '../../domain/words'
import { pagesWord, RAIL_ID } from './Contents'
import { showCurrent } from './showCurrent'

interface PagesRailProps {
  /** Each page's first words, in order; a page with no words has none. Empty until the pages are known. */
  pages: readonly string[]
  /** The page on screen, from 0. */
  current: number
  /** The words of the whole text. */
  words: number
  open: boolean
  onTurn(page: number): void
  /** Escape, from inside it. */
  onLeave(): void
}

/**
 * An essay's pages on desktop: the rail, by their first words, the page on screen tinted (DESIGN.md,
 * Layout). The pages come as data, so it shows any text laid out in pages, whichever moment it is from.
 */
export function PagesRail({ pages, current, words, open, onTurn, onLeave }: PagesRailProps): ReactElement {
  const ref = useRef<HTMLElement>(null)
  // The page on screen stays in view in a long list, as it turns and as the rail opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `current` and `pages` move the row it finds in the DOM.
  useEffect(() => {
    if (open) showCurrent(ref.current)
  }, [open, current, pages])
  return (
    <nav
      ref={ref}
      id={RAIL_ID}
      className="rail contents-rail pages-rail"
      aria-label="Pages"
      data-folded={open ? undefined : ''}
      // A press in the rail leaves the focus where it is: a page chosen while writing keeps the caret going.
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onLeave()
      }}
    >
      <p className="rail-line">
        {wordsWord(words)}
        {pages.length ? ` · ${pagesWord(pages.length)}` : null}
      </p>
      <ol className="contents-list">
        {pages.map((opening, page) => (
          // The pages are their places: a row is its page, whatever words it holds.
          <li key={page} className="contents-line">
            <button
              type="button"
              className="contents-row"
              aria-current={page === current ? 'true' : undefined}
              aria-label={`Page ${number(page + 1)}: ${opening || 'nothing yet'}`}
              onClick={() => onTurn(page)}
            >
              <span className="contents-title">{opening || 'Nothing yet'}</span>
              <span className="contents-page">{number(page + 1)}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
