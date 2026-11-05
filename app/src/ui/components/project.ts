// What the app says about itself.

export const SOURCE = 'https://github.com/jonanderdev/elbowpatch'

/** Set at build time from package.json, so the manifest itself stays out of the bundle (vite.config.ts). */
declare const __APP_VERSION__: string

/** Always in full, and the same wherever it shows (docs/decisions/0012). */
export const APP_VERSION: string = __APP_VERSION__
