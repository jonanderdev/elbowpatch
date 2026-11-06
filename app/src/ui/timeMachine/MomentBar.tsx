import type { ReactElement, ReactNode } from 'react'
import type { Kind } from '../../domain/model'
import { IconButton } from '../components/Icon'

const BRING_BACK: Record<Kind, string> = { book: 'Bring chapter back', journal: 'Bring day back', essay: 'Bring essay back' }

/** The way back to now, at the bar's top right in every state (DESIGN.md, ✕ never moves). */
function BackToNow({ onBack }: { onBack(): void }): ReactElement {
  return (
    <div className="moment-close">
      <IconButton icon="close" label="Back to now" onClick={onBack} />
    </div>
  )
}

/** The bar's two actions. They show from here on; what they do comes with their own tickets. */
function Actions({ kind }: { kind: Kind }): ReactElement {
  return (
    <div className="moment-actions">
      <button type="button" className="moment-action leading">
        {BRING_BACK[kind]}
      </button>
      <span className="bar-separator" />
      <button type="button" className="moment-action">
        Keep a copy
      </button>
    </div>
  )
}

/** The moment bar with moments: the moment named, the tape under it (passed in), then the actions. */
export function MomentsBar({ kind, name, tape, onBack }: { kind: Kind; name: string; tape: ReactNode; onBack(): void }): ReactElement {
  return (
    <div className="moment-bar surface">
      <p className="moment-name">{name}</p>
      {tape}
      <Actions kind={kind} />
      <BackToNow onBack={onBack} />
    </div>
  )
}

/** While moments load: full height, so nothing jumps when they arrive. */
export function LoadingBar({ kind, tape, onBack }: { kind: Kind; tape: ReactNode; onBack(): void }): ReactElement {
  return (
    <div className="moment-bar surface" data-loading>
      <p className="moment-name">Finding your moments…</p>
      {tape}
      <Actions kind={kind} />
      <BackToNow onBack={onBack} />
    </div>
  )
}

/** Nothing to look back on: one line, no tape, no actions. */
export function NothingEarlierBar({ onBack }: { onBack(): void }): ReactElement {
  return (
    <div className="moment-bar surface" data-state="nothing">
      <p className="moment-note" role="status">
        Nothing earlier yet. Moments are kept as you write.
      </p>
      <BackToNow onBack={onBack} />
    </div>
  )
}

/** Something went wrong: what happened, with Try again under it. #84 and #86 use this shape with their own words. */
export function ErrorBar({ line, onAgain, onBack }: { line: string; onAgain(): void; onBack(): void }): ReactElement {
  return (
    <div className="moment-bar surface" data-state="error">
      <p className="moment-note" role="alert">
        {line}
      </p>
      <button type="button" className="moment-again" onClick={onAgain}>
        Try again
      </button>
      <BackToNow onBack={onBack} />
    </div>
  )
}
