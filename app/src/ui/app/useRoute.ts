import { useCallback, useEffect, useState } from 'react'

/** URLs use the hash, so any static host works (0011): #/ is the library, #/p/<id> a piece, #/settings… */
export function useRoute(): [string, (to: string) => void] {
  const [route, setRoute] = useState(() => location.hash.slice(1) || '/')
  useEffect(() => {
    const on = () => setRoute(location.hash.slice(1) || '/')
    window.addEventListener('hashchange', on)
    // A change between the first read and now would otherwise be missed.
    on()
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((to: string) => {
    // Follow at once; hashchange arrives a tick later and finds nothing to do.
    setRoute(to)
    if (location.hash.slice(1) !== to) location.hash = to
  }, [])
  return [route, go]
}
