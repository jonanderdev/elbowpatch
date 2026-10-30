import { type ReactElement, useEffect, useRef } from 'react'
import type { Piece } from '../../domain/model'
import type { Deps } from '../../domain/pieces'
import { longDate, number } from '../../domain/words'
import { WordButton } from '../components/WordButton'
import { lastExport } from '../files/everything'
import { ExportImport } from './ExportImport'
import { goesIn, PutAway, waiting } from './PutAway'

// Settings (DESIGN.md, Settings): opened from the library only. The areas
// here are the ones that work today, Export & import and Put away.
// shortcut: Writing, Appearance, Time Machine, Backup & sync and About & privacy arrive as they are built.

// Help and About open from the library's colophon, so they go back to the library.
// shortcut: Help and About are empty until their words are written (DESIGN.md, Gaps).
export type Area = 'list' | 'export' | 'put-away' | 'help' | 'about'

const TITLES: Record<Area, string> = { list: 'Settings', export: 'Export & import', 'put-away': 'Put away', help: 'Help', about: 'About' }

interface Props {
  deps: Deps
  area: Area
  /** Every piece, put-away ones included. */
  pieces: Piece[]
  go(to: string): void
  /** Save the open page first, so an export holds its last words. */
  beforeExport(): Promise<void>
  onChanged(): Promise<void>
}

export function Settings(props: Props): ReactElement {
  const heading = useRef<HTMLHeadingElement>(null)
  // Each area opens with the focus on its heading, for screen readers and the keyboard.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the area is the trigger, not read inside.
  useEffect(() => heading.current?.focus(), [props.area])
  const toLibrary = props.area === 'list' || props.area === 'help' || props.area === 'about'
  return (
    <main className="settings">
      <div className="settings-head">
        <WordButton word={toLibrary ? 'Library' : 'Settings'} onClick={() => props.go(toLibrary ? '/' : '/settings')} />
      </div>
      <div className="settings-inner">
        <h1 ref={heading} tabIndex={-1} className="settings-title">
          {TITLES[props.area]}
        </h1>
        {props.area === 'list' && <List pieces={props.pieces} go={props.go} />}
        {props.area === 'export' && <ExportImport deps={props.deps} beforeExport={props.beforeExport} onChanged={props.onChanged} />}
        {props.area === 'put-away' && <PutAway deps={props.deps} pieces={props.pieces} onChanged={props.onChanged} />}
      </div>
    </main>
  )
}

function List({ pieces, go }: Pick<Props, 'pieces' | 'go'>) {
  const away = waiting(pieces)
  const last = lastExport()
  return (
    <ul className="rows">
      <li>
        <button type="button" className="row" onClick={() => go('/settings/export')}>
          <span className="row-title">Export &amp; import</span>
          <span className="row-meta">{last ? `Last exported ${longDate(last, Date.now())}` : 'Never exported yet'}</span>
        </button>
      </li>
      <li>
        <button type="button" className="row" onClick={() => go('/settings/put-away')}>
          <span className="row-title">Put away</span>
          <span className="row-meta">
            {away.length === 0 ? 'Nothing put away' : `${number(away.length)} ${away.length === 1 ? 'piece' : 'pieces'} · the next goes ${goesIn(away[0]!)}`}
          </span>
        </button>
      </li>
    </ul>
  )
}
