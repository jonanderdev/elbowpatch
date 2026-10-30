import type { ReactElement } from 'react'
import type { Kind } from '../../domain/model'
import { number } from '../../domain/words'
import { KINDS, WriteMenu } from './NewPiece'

/** Where the library rail stands: the whole library, or one kind's pieces alone. */
export type Place = 'all' | Kind

interface Props {
  place: Place
  /** How many pieces of each kind, and in all. */
  counts: Record<Place, number>
  /** How many pieces are put away. */
  away: number
  today: string
  onPlace(place: Place): void
  onNew(kind: Kind): void
  onPutAway(): void
  onSettings(): void
}

/**
 * The library rail, on desktop (DESIGN.md, The library): the wordmark and Write on its top line, the
 * places under it, each with its count, and Put away and Settings at its foot. A kind with nothing in
 * it stays, in secondary grey, so the library always shows what it can hold.
 */
export function Rail({ place, counts, away, today, onPlace, onNew, onPutAway, onSettings }: Props): ReactElement {
  const places: { place: Place; word: string }[] = [{ place: 'all', word: 'Library' }, ...KINDS.map(({ kind, group }) => ({ place: kind, word: group }))]
  return (
    <nav className="rail" aria-label="Library">
      <div className="rail-top">
        {/* Set as the path on a page: § then the place's name (DESIGN.md, One head). */}
        <p className="rail-mark">
          <span className="home" aria-hidden="true">
            §
          </span>
          Elbowpatch
        </p>
        <WriteMenu today={today} onNew={onNew} />
      </div>
      <ul className="rail-places">
        {places.map((p) => (
          <li key={p.place}>
            <button
              type="button"
              className={counts[p.place] === 0 ? 'rail-place none' : 'rail-place'}
              aria-current={place === p.place ? 'page' : undefined}
              onClick={() => onPlace(p.place)}
            >
              {p.word}
              <span className="rail-count">{number(counts[p.place])}</span>
            </button>
          </li>
        ))}
      </ul>
      <ul className="rail-places rail-foot">
        <li>
          <button type="button" className="rail-place" onClick={onPutAway}>
            Put away
            {away > 0 && <span className="rail-count">{number(away)}</span>}
          </button>
        </li>
        <li>
          <button type="button" className="rail-place" onClick={onSettings}>
            Settings
          </button>
        </li>
      </ul>
    </nav>
  )
}
