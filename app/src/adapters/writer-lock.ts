import type { Held, WriterLock } from '../domain/ports'

// One writer per piece, across windows (docs/decisions/0010): a Web Lock per
// piece, and a channel to ask the window that holds it to save and let go.

const ASK_TIMEOUT = 3000
const HOLD_WAIT = 1500

export function writerLock(): WriterLock {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (!locks || typeof BroadcastChannel === 'undefined') return alone()
  const channel = new BroadcastChannel('elbowpatch.writer')
  const name = (id: string) => `elbowpatch.piece.${id}`

  // Hold a lock until released; `lost` settles if another window steals it.
  function holding(id: string, options: LockOptions, onAsked: () => Promise<void>): Promise<Held | null> {
    return new Promise((resolve) => {
      let release!: () => void
      let lose!: () => void
      const lost = new Promise<void>((r) => (lose = r))
      const held = new Promise<void>((r) => (release = r))
      const onMessage = async (e: MessageEvent) => {
        if (e.data?.ask !== id) return
        // Another window wants to write here: save first, then let go.
        await onAsked().catch(() => {})
        lose()
        release()
      }
      let granted = false
      locks
        .request(name(id), options, async (lock) => {
          if (!lock) return resolve(null)
          granted = true
          channel.addEventListener('message', onMessage)
          resolve({ release, lost })
          await held
        })
        // Stolen once held; or the wait ran out (or was given up) before it was granted.
        .catch(() => (granted ? lose() : resolve(null)))
        .finally(() => channel.removeEventListener('message', onMessage))
    })
  }

  return {
    // Waits a moment: a page just reloaded or closed lets go of its locks a little after it goes.
    hold: (id, onAsked) => holding(id, { signal: AbortSignal.timeout(HOLD_WAIT) }, onAsked),
    async take(id, onAsked) {
      channel.postMessage({ ask: id })
      const waiting = new AbortController()
      const waited = holding(id, { signal: waiting.signal }, onAsked) as Promise<Held>
      const timeout = new Promise<'late'>((r) => setTimeout(() => r('late'), ASK_TIMEOUT))
      const first = await Promise.race([waited, timeout])
      if (first !== 'late') return first
      // Leave the queue, or the request would later hold the piece with no one to let it go.
      waiting.abort()
      // The other window did not answer (frozen or closing): it saved when it was hidden. Take it.
      return (await holding(id, { steal: true }, onAsked)) as Held
    },
  }
}

/** No Web Locks: assume one writer, never refuse to write. */
function alone(): WriterLock {
  const held = (): Held => ({ release() {}, lost: new Promise(() => {}) })
  return { hold: async () => held(), take: async () => held() }
}
