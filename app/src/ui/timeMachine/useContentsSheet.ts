import { useCallback, useEffect, useRef, useState } from 'react'

export interface ContentsSheetState {
  open: boolean
  /** It was opened by keyboard, so it takes the focus. */
  byKey: boolean
  /** Opens it from the running head, or closes it when it is open. */
  toggle(from: HTMLElement): void
  close(): void
}

/**
 * The phone's Contents sheet over the Time Machine: opened and closed by the running head, closed by Done, a
 * tap outside it and Escape, which closes it before it leaves the Time Machine. The focus goes back to the
 * running head when it was in the sheet.
 */
export function useContentsSheet(): ContentsSheetState {
  const [open, setOpen] = useState(false)
  const [byKey, setByKey] = useState(false)
  /** The running head that opened it: where the focus goes back to. */
  const opener = useRef<HTMLElement | null>(null)
  /** Read by the listeners, which stay on. */
  const isOpen = useRef(false)
  isOpen.current = open

  const close = useCallback((): void => {
    setOpen(false)
    const back = opener.current
    opener.current = null
    const active = document.activeElement
    if (back && (!active || active === document.body || active.closest('.sheet'))) requestAnimationFrame(() => back.focus())
  }, [])

  const toggle = (from: HTMLElement): void => {
    if (open) {
      close()
      return
    }
    opener.current = from
    setByKey(document.activeElement === from)
    setOpen(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || !isOpen.current) return
      e.preventDefault()
      close()
    }
    const onDown = (e: PointerEvent): void => {
      if (isOpen.current && !(e.target as Element).closest?.('.sheet, .running-control')) close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [close])

  return { open, byKey, toggle, close }
}
