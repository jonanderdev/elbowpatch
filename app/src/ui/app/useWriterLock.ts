import { useCallback, useEffect, useRef, useState } from 'react'
import type { Held, WriterLock } from '../../domain/ports'
import { settled } from './settled'

export type Writer = 'waiting' | 'here' | 'elsewhere'

/**
 * One window writes a piece (0010). The lock follows the open piece, not the page, so reopening
 * the same piece never locks this window out. `writer` says whether this window writes it now,
 * waits for the lock, or another window writes it; `writeHere()` takes it over.
 *
 * `flushPage` saves the open page before another window takes the piece; `closing` is the
 * closing page's last save, which the lock is let go only after.
 */
export function useWriterLock(lock: WriterLock, pieceId: string | undefined, flushPage: { current: (() => Promise<void>) | null }, closing: { current: Promise<void> }) {
  // Kept with the piece it is about, so a newly opened piece is never taken for one already held.
  const [writerOf, setWriterOf] = useState<{ pieceId?: string; state: Writer }>({ state: 'waiting' })
  const held = useRef<Held | null>(null)
  const pieceIdNow = useRef(pieceId)
  pieceIdNow.current = pieceId
  const setWriter = useCallback((state: Writer, id = pieceIdNow.current) => setWriterOf({ pieceId: id, state }), [])

  // Another window asks for the piece: save here first, then let it write.
  const onAsked = useCallback(async () => {
    await flushPage.current?.()
    setWriter('elsewhere')
  }, [flushPage, setWriter])

  const follow = useCallback(
    (h: Held) => {
      held.current = h
      setWriter('here')
      void h.lost.then(() => {
        if (held.current !== h) return
        held.current = null
        setWriter('elsewhere')
      })
    },
    [setWriter],
  )

  useEffect(() => {
    if (!pieceId) return
    let alive = true
    setWriter('waiting')
    void (async () => {
      let h = await lock.hold(pieceId, onAsked)
      // Back to a piece this window just left: its lock goes once the last save there settles.
      if (!h && alive) {
        await settled(closing.current)
        if (alive) h = await lock.hold(pieceId, onAsked)
      }
      if (!alive) return h?.release()
      if (h) follow(h)
      else setWriter('elsewhere')
    })()
    return () => {
      alive = false
      const h = held.current
      held.current = null
      // Let go after the closing page's last save, so no other window writes alongside it, but
      // never wait on a stuck save for long. (A timeout: the page's cleanup, which sets
      // `closing`, runs after this one.)
      setTimeout(() => void settled(closing.current).then(() => h?.release()), 0)
    }
  }, [pieceId, lock, onAsked, follow, setWriter, closing])

  /**
   * Takes the piece over from another window. `reload` runs once the lock is held and before this
   * window becomes the writer, so the page starts from what the other window saved and never
   * writes its older text over it. Nothing happens if this window moved on meanwhile.
   */
  const writeHere = useCallback(
    async (reload: () => Promise<void>) => {
      const id = pieceIdNow.current
      if (!id) return
      const h = await lock.take(id, onAsked)
      if (pieceIdNow.current !== id) return h.release()
      await reload()
      follow(h)
    },
    [lock, onAsked, follow],
  )

  return { writer: writerOf.pieceId === pieceId ? writerOf.state : 'waiting', writeHere }
}
