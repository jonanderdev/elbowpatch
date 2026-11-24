export type Paper = 'letter' | 'a4'

/**
 * Where US Letter is the standard paper: CLDR's `measurementData`, release 48 (`paperSize`
 * "US-Letter"). Everywhere else, and the world as a whole, is A4.
 */
const LETTER = new Set(['BZ', 'CA', 'CL', 'CO', 'CR', 'GT', 'MX', 'NI', 'PA', 'PH', 'PR', 'SV', 'US', 'VE'])

/**
 * The paper a PDF is set on, from the device's languages (`navigator.languages`): a browser gives no
 * region of its own. The first language that names a region decides; where none does, the region a
 * language most likely has (a bare "en" is the United States) does. Nothing usable is A4.
 */
export function paperFor(languages: readonly string[]): Paper {
  const locales = languages.flatMap((tag) => {
    try {
      return [new Intl.Locale(tag)]
    } catch {
      return []
    }
  })
  const named = locales.find((l) => isRegion(l.region))?.region
  const likely = locales.find((l) => isRegion(l.maximize().region))?.maximize().region
  const region = named ?? likely
  return region && LETTER.has(region) ? 'letter' : 'a4'
}

/** A country, not the world ("001") or a group such as Latin America ("419"). */
function isRegion(region: string | undefined): region is string {
  return region !== undefined && /^[A-Z]{2}$/.test(region)
}
