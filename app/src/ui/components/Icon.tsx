import type { CSSProperties, ReactElement } from 'react'
import add from './icons/add.svg'
import alignLeft from './icons/align-left.svg'
import close from './icons/close.svg'
import exportIcon from './icons/export.svg'
import history from './icons/history.svg'
import justify from './icons/justify.svg'
import keep from './icons/keep.svg'
import keyboard from './icons/keyboard.svg'
import moon from './icons/moon.svg'
import quote from './icons/quote.svg'
import redo from './icons/redo.svg'
import section from './icons/section.svg'
import settings from './icons/settings.svg'
import sun from './icons/sun.svg'
import undo from './icons/undo.svg'
import viewList from './icons/view-list.svg'
import viewShelf from './icons/view-shelf.svg'

export type IconName =
  | 'add'
  | 'alignLeft'
  | 'close'
  | 'export'
  | 'history'
  | 'justify'
  | 'keep'
  | 'keyboard'
  | 'moon'
  | 'quote'
  | 'redo'
  | 'section'
  | 'settings'
  | 'sun'
  | 'undo'
  | 'viewList'
  | 'viewShelf'

const icons: Record<IconName, string> = {
  add,
  alignLeft,
  close,
  export: exportIcon,
  history,
  justify,
  keep,
  keyboard,
  moon,
  quote,
  redo,
  section,
  settings,
  sun,
  undo,
  viewList,
  viewShelf,
}

/** One icon set drawn for the app, in the current text colour (DESIGN.md, Control). */
export function Icon({ name }: { name: IconName }): ReactElement {
  return <span className="icon" aria-hidden="true" style={{ '--icon': `url("${icons[name]}")` } as CSSProperties} />
}

/** A button that is its icon. `keepFocus`: pressing it leaves the focus (and a selection) where it is. */
export function IconButton(props: { icon: IconName; label: string; onClick(): void; quiet?: boolean; pressed?: boolean; keepFocus?: boolean }): ReactElement {
  return (
    <button
      type="button"
      className={props.quiet ? 'icon-button quiet' : 'icon-button'}
      aria-label={props.label}
      aria-pressed={props.pressed}
      onClick={props.onClick}
      onMouseDown={props.keepFocus ? (e) => e.preventDefault() : undefined}
    >
      <Icon name={props.icon} />
    </button>
  )
}
