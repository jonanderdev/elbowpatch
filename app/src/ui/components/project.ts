// What the app says about itself.

/** For an <a>: the project's source, in a new tab. */
export const SOURCE_LINK = { href: 'https://github.com/jonanderdev/elbowpatch', target: '_blank', rel: 'noopener noreferrer' } as const

/** Set at build time from package.json, so the manifest itself stays out of the bundle (vite.config.ts). */
declare const __APP_VERSION__: string

/** Always in full, and the same wherever it shows (docs/decisions/0012). */
export const APP_VERSION: string = __APP_VERSION__
