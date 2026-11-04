// What the app says about itself.

/** Set at build time from package.json, so the manifest itself stays out of the bundle (vite.config.ts). */
declare const __APP_VERSION__: string

/** Always in full, and the same wherever it shows (docs/decisions/0012). */
export const VERSION: string = __APP_VERSION__
