import { describe, expect, it } from 'vitest'
import { isTimeMachineKey } from './timeMachineKey'

const press = (over: Partial<KeyboardEvent> & { altGraph?: boolean }): KeyboardEvent =>
  ({
    key: 'z',
    code: 'KeyZ',
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    getModifierState: (name: string) => name === 'AltGraph' && !!over.altGraph,
    ...over,
  }) as KeyboardEvent

describe('the Time Machine key', () => {
  it('is ⌘ or Ctrl with Alt and Z', () => {
    expect(isTimeMachineKey(press({ metaKey: true }))).toBe(true)
    expect(isTimeMachineKey(press({ ctrlKey: true }))).toBe(true)
  })

  it('is found on a Mac, where Option changes the letter', () => {
    expect(isTimeMachineKey(press({ metaKey: true, key: 'Ω' }))).toBe(true)
  })

  it('follows the letter on a layout where Z stands elsewhere', () => {
    expect(isTimeMachineKey(press({ ctrlKey: true, key: 'z', code: 'KeyY' }))).toBe(true)
    expect(isTimeMachineKey(press({ ctrlKey: true, key: 'y', code: 'KeyZ' }))).toBe(false)
  })

  it('is not undo, redo or Alt alone', () => {
    expect(isTimeMachineKey(press({ metaKey: true, altKey: false }))).toBe(false)
    expect(isTimeMachineKey(press({ metaKey: true, shiftKey: true }))).toBe(false)
    expect(isTimeMachineKey(press({}))).toBe(false)
  })

  it('leaves AltGr to type its letter', () => {
    expect(isTimeMachineKey(press({ ctrlKey: true, key: 'ż', altGraph: true }))).toBe(false)
  })
})
