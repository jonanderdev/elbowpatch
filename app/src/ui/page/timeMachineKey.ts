/**
 * ⌘/Ctrl + Alt + Z, a step further back than undo (0008). The letter decides where it is one; where Option
 * has turned it into another sign, as on a Mac, the key's place does. AltGr reports Ctrl and Alt on
 * Windows, and types letters of its own.
 */
export function isTimeMachineKey(e: KeyboardEvent): boolean {
  if (!e.altKey || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.getModifierState('AltGraph')) return false
  return /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() === 'z' : e.code === 'KeyZ'
}
