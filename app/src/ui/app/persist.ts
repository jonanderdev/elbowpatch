let asked = false

/**
 * Asks the browser to keep this site's storage, once there is something to keep.
 * Not at launch: some browsers ask the writer, and a first visit is no time for it (0010).
 */
export function askToPersist(): void {
  if (asked) return
  asked = true
  void navigator.storage?.persist?.().catch(() => {})
}
