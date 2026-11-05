import type { ReactElement, ReactNode } from 'react'
import type { Kind } from '../../domain/model'

// What the Settings areas share.

export const KIND_WORD: Record<Kind, string> = { book: 'Book', journal: 'Journal', essay: 'Essay' }

/** A short answer under a small italic heading. */
export function Answer({ heading, children }: { heading: string; children: ReactNode }): ReactElement {
  return (
    <section className="help-part">
      <h2>{heading}</h2>
      {children}
    </section>
  )
}

/** One row like a place in Backup & sync: a name, its word at the right, a status line. */
export function Row(props: { name: string; action: string; status: string; onAction(): void; busy?: boolean; announce?: boolean }): ReactElement {
  return (
    <div className="area-row">
      <div className="area-top">
        <span className="area-name">{props.name}</span>
        <button type="button" className="area-action" aria-label={`${props.action} ${props.name}`} onClick={props.onAction} disabled={props.busy}>
          {props.action}
        </button>
      </div>
      {/* Only a result is announced, not what is already there. */}
      <p className="area-status" role={props.announce ? 'status' : undefined}>
        {props.status}
      </p>
    </div>
  )
}
