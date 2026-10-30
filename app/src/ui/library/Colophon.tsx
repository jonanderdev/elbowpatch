import type { ReactElement } from 'react'

const SOURCE = 'https://github.com/jonanderdev/elbowpatch'

/** Help · About · Source: the library's plain links (DESIGN.md, The colophon). */
export function FootLinks({ atFoot }: { atFoot?: boolean }): ReactElement {
  return (
    <nav className={atFoot ? 'colophon-links at-foot' : 'colophon-links'} aria-label="About Elbowpatch">
      <a className="text-link strong" href="#/settings/help">
        Help
      </a>
      <span aria-hidden="true">·</span>
      <a className="text-link strong" href="#/settings/about">
        About
      </a>
      <span aria-hidden="true">·</span>
      <a className="text-link strong" href={SOURCE} target="_blank" rel="noopener noreferrer">
        Source
      </a>
    </nav>
  )
}

/** The library ends with its maker's mark, a signature and never a button, and the links under it. */
export function Colophon(): ReactElement {
  return (
    <footer className="colophon">
      <p className="colophon-mark">
        <span aria-hidden="true">§</span> Elbowpatch
      </p>
      <FootLinks />
    </footer>
  )
}
