import { useSyncExternalStore } from 'react'

// Text settings and the theme, remembered on this device. Until the writer
// picks a theme, it follows the system (DESIGN.md, Behaviour).
// shortcut: one set for every piece; per-piece settings and Settings › Writing defaults come later.

export interface Settings {
  theme?: 'paper' | 'night'
  size: 's' | 'm' | 'l'
  leading: 'tight' | 'normal' | 'loose'
  align: 'left' | 'justify'
  measure: 'narrow' | 'wide'
  dropcap: boolean
  indent: boolean
  firstRunDone: boolean
  /** The library as rows or as outlined objects on a shelf (DESIGN.md, The library). */
  libraryView: 'list' | 'shelf'
}

const KEY = 'elbowpatch.settings'
const defaults: Settings = {
  size: 'm',
  leading: 'normal',
  align: 'left',
  measure: 'narrow',
  dropcap: false,
  indent: false,
  firstRunDone: false,
  libraryView: 'list',
}

let current: Settings = load()
const listeners = new Set<() => void>()
const system = matchMedia('(prefers-color-scheme: dark)')
system.addEventListener('change', () => apply())

function load(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...defaults }
  }
}

export function theme(s: Settings = current): 'paper' | 'night' {
  return s.theme ?? (system.matches ? 'night' : 'paper')
}

export function apply(): void {
  const root = document.documentElement.dataset
  root.theme = theme()
  root.size = current.size
  root.leading = current.leading
  root.align = current.align
  root.measure = current.measure
  root.dropcap = String(current.dropcap)
  root.indent = String(current.indent)
  document.querySelector('meta[name="theme-color"]:not([media])')?.remove()
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = theme() === 'night' ? '#0e0e0e' : '#f3f3f0'
  document.head.append(meta)
  for (const l of listeners) l()
}

export function update(change: Partial<Settings>): void {
  current = { ...current, ...change }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Private windows can refuse storage: the setting still applies until reload.
  }
  apply()
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
