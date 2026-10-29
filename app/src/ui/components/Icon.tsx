import type { CSSProperties } from 'react'
import add from './icons/add.svg'
import alignLeft from './icons/align-left.svg'
import close from './icons/close.svg'
import exportIcon from './icons/export.svg'
import history from './icons/history.svg'
import keyboard from './icons/keyboard.svg'
import redo from './icons/redo.svg'
import section from './icons/section.svg'
import undo from './icons/undo.svg'
import justify from './icons/justify.svg'
import keep from './icons/keep.svg'
import moon from './icons/moon.svg'
import quote from './icons/quote.svg'
import settings from './icons/settings.svg'
import sun from './icons/sun.svg'
import viewList from './icons/view-list.svg'
import viewShelf from './icons/view-shelf.svg'

const icons = { add, alignLeft, close, export: exportIcon, history, justify, keep, keyboard, moon, quote, redo, section, settings, sun, undo, viewList, viewShelf }

export type IconName = keyof typeof icons

/** One icon set drawn for the app, in the current text colour (DESIGN.md, Control). */
export function Icon({ name }: { name: IconName }) {
  return <span className="icon" aria-hidden="true" style={{ '--icon': `url("${icons[name]}")` } as CSSProperties} />
}

export function IconButton(props: { icon: IconName; label: string; onClick(): void; quiet?: boolean; pressed?: boolean }) {
  return (
    <button
      type="button"
      className={props.quiet ? 'icon-button quiet' : 'icon-button'}
      aria-label={props.label}
      aria-pressed={props.pressed}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
    </button>
  )
}
