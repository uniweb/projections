/**
 * @fileoverview What a request for a page's markdown names, for a host that answers one.
 *
 * `renderSiteIndex` links each page's markdown at `markdownPathOf` of the page's own URL: the
 * locale's prefix, then the page's route as that locale shows it, as a filename (`/fr/blogue.md`,
 * `/fr/index.md`). A host serving those links answers each request with `resolveMarkdownRequest`,
 * the same answer `resolveRoute` gives for the page's own URL.
 *
 * ⛔ Until 2026-10-23 a host composed this itself, and neither composition is right:
 * - Reading the whole path with `markdownFilenameRoute` makes `/fr/index.md` a page called
 *   `/fr/index` (measured by a host that day).
 * - Stripping the prefix first finds the page. But a redirect's `location` is then the page's own
 *   URL: `/fr/blog.md` goes to `/fr/blogue`, the HTML, not `/fr/blogue.md`.
 */

import { localeOfPath, resolveRoute, routeIndex } from '@uniweb/core/resolve-route'
import { markdownFilenameRoute, pageMarkdownFilename } from './config.js'

/**
 * The path a `.md` request names a page by, as a visitor would ask for the page: the locale's
 * prefix as requested, then the route the filename reads as. `index` is the root of the site or
 * of a locale. The inverse of `markdownPathOf`.
 *
 * @param {string} path
 * @param {Object} config - the content's `config` (`languages`, `defaultLanguage`, `domainLocale`)
 * @returns {string|null} null for anything that is not a `.md` path
 */
function pagePathOf(path, config) {
  const { prefixed, path: rest } = localeOfPath(path, config)
  const route = markdownFilenameRoute(rest)
  if (route === null) return null
  if (!prefixed) return route
  const prefix = path.slice(0, path.length - rest.length)
  return route === '/' ? prefix : `${prefix}${route}`
}

/**
 * Where the markdown of the page at a path is: the locale's prefix, then the rest of the path as a
 * filename — `/fr/blogue` → `/fr/blogue.md`, `/fr/` and `/fr` → `/fr/index.md`, `/` → `/index.md`.
 * The inverse of `pagePathOf`; `renderSiteIndex` links each page's markdown here.
 *
 * @param {string} path - a page's URL path, as its locale shows it, with no base
 * @param {Object} config - the content's `config` (`languages`, `defaultLanguage`)
 * @returns {string}
 */
export function markdownPathOf(path, config) {
  const { locale, prefixed, path: rest } = localeOfPath(path, config)
  return `${prefixed ? `/${locale}` : ''}/${pageMarkdownFilename(rest)}`
}

/**
 * A redirect's location for a `.md` request: the markdown of the page it names (`/fr/blogue` →
 * `/fr/blogue.md`, `/fr` → `/fr/index.md`, `/` → `/index.md`), with any query or fragment after
 * the `.md`. A location that names no page of the site is returned as written: one off the site,
 * or an authored redirect to a file.
 *
 * @param {string} location
 * @param {Object} index - the content's `routeIndex`
 * @param {Object} config
 * @param {Object} context - `resolveRoute`'s
 * @returns {string}
 */
function markdownLocation(location, index, config, context) {
  if (typeof location !== 'string' || !location.startsWith('/') || location.startsWith('//')) return location
  const cut = location.search(/[?#]/)
  const pathPart = cut === -1 ? location : location.slice(0, cut)
  const suffix = cut === -1 ? '' : location.slice(cut)
  if (resolveRoute(index, pathPart, context).kind === 'notFound') return location
  return `${markdownPathOf(pathPart, config)}${suffix}`
}

/**
 * ⭐ **WHAT A REQUEST FOR A PAGE'S MARKDOWN NAMES.** It gives `resolveRoute`'s answer for the page
 * the `.md` path names, so a host serves the markdown of `answer.page` exactly when it would serve
 * the page:
 * - `/index.md` names the site's root and `/blog.md` names `/blog`;
 * - `/fr/index.md` names the French root and `/fr/blogue.md` the page French shows at `/blogue`;
 * - a redirect's `location` is the markdown of the page it goes to. `/fr/blog.md` is a `301` to
 *   `/fr/blogue.md`, and a container's `.md` is a `302` to its content's. A redirect to anything
 *   but a page of the site goes as written.
 *
 * ⚠️ A page whose own route is `/index`, or `/<locale>/index` on the site's default locale, cannot
 * be told from that root, as with `markdownFilenameRoute`.
 *
 * @param {Object} content - one locale's site content (`{ pages, config }`), the content
 *   `resolveRoute` reads
 * @param {string} path - the request path, with any deployment base removed
 * @param {Object} [context] - `resolveRoute`'s (`activeLocale`, `defaultLocale`)
 * @returns {Object|null} `resolveRoute`'s answer, or null when the path is not a `.md` path
 */
export function resolveMarkdownRequest(content, path, context = {}) {
  const config = content?.config || {}
  const pagePath = pagePathOf(typeof path === 'string' && path ? path : '/', config)
  if (pagePath === null) return null
  const index = routeIndex(content)
  const answer = resolveRoute(index, pagePath, context)
  if (answer.kind !== 'redirect') return answer
  return { ...answer, location: markdownLocation(answer.location, index, config, context) }
}
