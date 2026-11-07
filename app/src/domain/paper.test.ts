import { describe, expect, it } from 'vitest'
import { paperFor } from './paper'

describe('the paper a region prints on', () => {
  it.each(['en-US', 'en-CA', 'fr-CA', 'es-MX', 'es-CL', 'es-CO', 'en-PH', 'es-VE', 'es-PA', 'es-CR', 'es-GT', 'es-SV', 'es-NI', 'en-BZ', 'es-PR'])(
    '%s is Letter',
    (tag) => {
      expect(paperFor([tag])).toBe('letter')
    },
  )

  it.each(['en-GB', 'de-DE', 'fr-FR', 'es-ES', 'pt-BR', 'ja-JP', 'en-AU', 'en-IN', 'es-AR', 'es-PE'])('%s is A4', (tag) => {
    expect(paperFor([tag])).toBe('a4')
  })

  it('takes the likely region of a language with none, as the browser does for a bare "en"', () => {
    expect(paperFor(['en'])).toBe('letter')
    expect(paperFor(['fr'])).toBe('a4')
    expect(paperFor(['tl'])).toBe('letter')
  })

  it('goes by the first language that names a region', () => {
    expect(paperFor(['en-GB', 'en-US'])).toBe('a4')
    expect(paperFor(['en-US', 'en-GB'])).toBe('letter')
  })

  it('reads a region named later in the list before guessing from a bare language', () => {
    expect(paperFor(['en', 'en-GB'])).toBe('a4')
    expect(paperFor(['en', 'en-US'])).toBe('letter')
  })

  it('is A4 where the region is the world or unknown, or the tag is not one', () => {
    expect(paperFor(['en-001'])).toBe('a4')
    expect(paperFor(['es-419'])).toBe('a4')
    expect(paperFor(['not a tag!'])).toBe('a4')
    expect(paperFor([])).toBe('a4')
  })
})
