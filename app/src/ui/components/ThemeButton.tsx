import type { ReactElement } from 'react'
import { theme, update, useSettings } from '../stores/settings'
import { IconButton } from './Icon'

/** Paper / night, the last of the head's icons, in the corner, on every screen that has it (DESIGN.md, Layout). */
export function ThemeButton(): ReactElement {
  const night = theme(useSettings()) === 'night'
  return <IconButton icon={night ? 'sun' : 'moon'} label={night ? 'Paper' : 'Night'} quiet onClick={() => update({ theme: night ? 'paper' : 'night' })} />
}
