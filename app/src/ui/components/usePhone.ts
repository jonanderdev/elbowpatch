import { useSyncExternalStore } from 'react'
import { PHONE_BELOW } from '../../page/pager'

const phone = matchMedia(`(max-width: ${PHONE_BELOW - 0.02}px)`)

/** Whether this screen takes the phone's page, and follows a window crossing the line. */
export function usePhone(): boolean {
  return useSyncExternalStore(
    (changed) => {
      phone.addEventListener('change', changed)
      return () => phone.removeEventListener('change', changed)
    },
    () => phone.matches,
  )
}
