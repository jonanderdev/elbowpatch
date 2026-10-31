import { describe, expect, it } from 'vitest'
import { liftFor } from './caret'

describe('lifting the text over the phone keyboard', () => {
  const band = { top: 80, bottom: 400 }

  it('a caret below the band lifts the text until it stands on the band', () => {
    expect(liftFor({ top: 420, bottom: 450 }, 0, band)).toBe(50)
    expect(liftFor({ top: 390, bottom: 420 }, 50, band)).toBe(70)
  })

  it('a caret above the band lowers the text again', () => {
    expect(liftFor({ top: 60, bottom: 90 }, 70, band)).toBe(50)
  })

  it('a caret inside the band leaves the text where it is', () => {
    expect(liftFor({ top: 200, bottom: 230 }, 30, band)).toBe(30)
  })

  it('the text is never pushed below where it lies', () => {
    expect(liftFor({ top: 10, bottom: 40 }, 20, band)).toBe(0)
  })
})
