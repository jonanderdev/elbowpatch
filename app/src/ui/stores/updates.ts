import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

// A new version waits for the next launch. While it waits, the library says
// so quietly; the page never does (0010).
let waiting = false
let restart: (() => Promise<void>) | undefined
const listeners = new Set<() => void>()

export function watchForUpdates() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  restart = registerSW({
    onNeedRefresh() {
      waiting = true
      listeners.forEach((l) => l())
    },
  })
}

export function useUpdateWaiting(): (() => void) | undefined {
  const ready = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => waiting,
  )
  return ready && restart ? () => void restart!() : undefined
}
