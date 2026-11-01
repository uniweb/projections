/**
 * Version folders: how a site keeps older versions of its docs.
 *
 * A folder named `v1` or `v2.1` holds a version of the pages beside it. The pages beside it are the
 * latest; with none beside it, the highest-numbered folder is.
 *
 * ⭐ THE NAME NEVER CHANGES A URL. A version folder's URL is its path, like any folder's, so a built
 * site and a site published to a backend answer the same URLs, and nothing that deals in routes has
 * to know this file exists. The name only says what a foundation may draw (kit's `useVersion`), what
 * a site's own search keeps to, and where the folder sorts among its siblings.
 *
 * ⛔ Imports nothing, so kit's search client and `useVersion` take this without the package.
 */

const VERSION_FOLDER = /^v\d+(\.\d+)*$/

/**
 * Whether a folder's name, or one segment of a route, names a version.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isVersionFolder(name) {
  return typeof name === 'string' && VERSION_FOLDER.test(name)
}

/**
 * Newest first, by number: `v2.10` before `v2.9`, `v2` before `v1.9`, `v2.1` before `v2`.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareVersionFolders(a, b) {
  const numbers = (name) => name.slice(1).split('.').map(Number)
  const [left, right] = [numbers(a), numbers(b)]
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (right[i] ?? -1) - (left[i] ?? -1)
    if (difference) return difference
  }
  return 0
}

/**
 * Whether a route passes through a version folder: `/docs/v1/guide` and `/docs/v1`, not `/docs`.
 *
 * @param {string} route
 * @returns {boolean}
 */
export function inVersionFolder(route) {
  return typeof route === 'string' && route.split('/').some(isVersionFolder)
}
