import type { ReactElement } from 'react'

interface Props {
  name: string
  subtitle: string
}

/** A book's or a journal's title page as it was: the same page as the writing page's, its words read-only and no placeholder for what is empty but the name. */
export function OldTitlePage({ name, subtitle }: Props): ReactElement {
  return (
    <div className="title-page">
      <h1 className="book-title" data-placeholder="Untitled" data-empty={name === '' || undefined}>
        {name}
      </h1>
      {subtitle ? <p className="subtitle">{subtitle}</p> : null}
    </div>
  )
}
