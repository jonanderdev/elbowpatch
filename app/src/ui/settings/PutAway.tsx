import { type ReactElement, useEffect, useState } from 'react'
import type { Piece } from '../../domain/model'
import { type Deps, restore } from '../../domain/pieces'
import { longDate } from '../../domain/words'
import { KIND_WORD, Row } from './parts'

const DAY = 86_400_000

interface Props {
  deps: Deps
  /** Every piece, put-away ones included. */
  pieces: Piece[]
  onChanged(): Promise<void>
}

export function PutAway({ deps, pieces, onChanged }: Props): ReactElement {
  const [line, setLine] = useState<string | null>(null)
  useEffect(() => {
    if (!line) return
    const t = setTimeout(() => setLine(null), 4000)
    return () => clearTimeout(t)
  }, [line])
  const away = waiting(pieces)
  return (
    <>
      <p className="settings-lead">
        Pieces you put away wait here for 30 days, then go for good. Bringing one back returns it to the library as it was, with all its moments.
      </p>
      {away.length === 0 ? (
        <p className="settings-lead quiet">Nothing is put away.</p>
      ) : (
        <div className="area-rows">
          {away.map((p) => (
            <Row
              key={p.id}
              name={p.title.trim() || 'Untitled'}
              action="Bring back"
              status={`${KIND_WORD[p.kind]} · put away ${longDate(p.putAwayAt, Date.now())} · ${left(p)}`}
              onAction={async () => {
                await restore(deps, p.id)
                await onChanged()
                setLine('Brought back to the library.')
              }}
            />
          ))}
        </div>
      )}
      <p className="settings-note">Every full export includes what is put away, so a copy outlives the 30 days.</p>
      {line && (
        <div className="library-lines">
          <div className="line surface" role="status">
            {line}
          </div>
        </div>
      )}
    </>
  )
}

/** A piece that is put away, with the time it was. */
export type PutAway = Piece & { putAwayAt: number }

/** Put-away pieces, the one going soonest first. */
export function waiting(pieces: Piece[]): PutAway[] {
  return pieces.filter((p): p is PutAway => p.putAwayAt !== undefined).sort((a, b) => a.putAwayAt - b.putAwayAt)
}

function daysLeft(p: PutAway): number {
  return Math.max(0, Math.ceil((p.putAwayAt + 30 * DAY - Date.now()) / DAY))
}

/** "25 days left", and in its last week "goes in 4 days". */
function left(p: PutAway): string {
  const n = daysLeft(p)
  if (n > 7) return `${n} days left`
  return `goes ${goesIn(p)}`
}

export function goesIn(p: PutAway): string {
  const n = daysLeft(p)
  return n <= 1 ? 'in a day' : `in ${n} days`
}
