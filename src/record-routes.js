/**
 * Which of a site's queries become detail pages, and the base URL a record of each
 * is addressed at — derived from content alone.
 *
 * ⭐ **Why this is a function rather than a payload field.** A consumer that needs
 * this mapping had been reading `page.parentSchema`, a field with two producers
 * (framework's build and a backend projection), so its PRESENCE depended on which
 * lane published the site — and a field cannot fail loudly when a producer stops
 * emitting it. A function over content cannot have that problem: both lanes emit the
 * content, and a changed rule reaches every caller with the code.
 * *(Asked for by hosting, 2026-09-12, for `/_search`, `llms.txt` and per-page `.md`,
 * where a wrong base route is a link that ranks correctly and 404s on click.)*
 *
 * The rule, in two parts, each owned elsewhere so nothing is re-derived here:
 *
 *   - **which pages** — `recordRouteBase` (`@uniweb/core/route-match`): a page whose
 *     route ENDS in a parameter addresses one record; its base is the route minus
 *     that segment. A nested parametric page (`/members/:slug/cv`) and a static page
 *     both contribute nothing;
 *   - **which query** — `routeQuery` (`@uniweb/core/fetch-config`): the page's own
 *     query, else its parent page's, else the site's, else the key its own sections
 *     share. The same rule the runtime narrows by, so the name here is the name the
 *     record is delivered under.
 *
 * @module
 */

import { parentRouteOf, recordRouteBase } from '@uniweb/core/route-match'
import { routeQuery, sectionFetches } from '@uniweb/core/fetch-config'

/**
 * @param {Object} content - a site-content payload (`{ pages, config }`)
 * @returns {Array<{ name: string, route: string, path?: string }>} one entry per
 *   query that has a detail page: `name` is the `content.data` key the record
 *   arrives under, `route` the base a record's URL composes onto (`{route}/{param}`),
 *   and `path` the query's compiled data file when it has one.
 *
 *   ⭐ **`path` is returned rather than composed from `name`.** A consumer that
 *   templates a filename out of the key is betting that the key and the compiled
 *   file's basename are the same string — true today, and a promise between two of
 *   our conventions rather than a mechanism. Returning the authored path makes the
 *   `/data/` convention ours to keep and theirs to read (hosting, 2026-09-12).
 *   ⛔ **Absent when the query has no compiled file** — a records-service project, or
 *   an external query (one declaring `url:`, whose records are its address's). A
 *   consumer's static arm should read that as *no file to read*, not as a name to guess.
 *
 *   ⚖️ **One entry per name.** If two parametric pages resolve the same query, the
 *   first in page order wins — stated here so a caller never has to dedupe or depend
 *   on our page order for correctness, only for which of two duplicates it gets.
 */
export function recordRoutes(content) {
  const pages = Array.isArray(content?.pages) ? content.pages : []
  const byRoute = new Map()
  for (const page of pages) {
    if (page?.route && !byRoute.has(page.route)) byRoute.set(page.route, page)
  }
  const has = (route) => byRoute.has(route)
  const siteFetch = content?.config?.fetch ?? null

  const out = []
  const seen = new Set()
  for (const page of pages) {
    if (!page?.route) continue
    const base = recordRouteBase(page.route)
    if (base === null) continue
    const parentRoute = parentRouteOf(page.route, { declared: page.parent ?? null, has })
    const parent = parentRoute ? byRoute.get(parentRoute) : null
    const query = routeQuery({
      page: page.fetch,
      parent: parent?.fetch,
      site: siteFetch,
      sections: sectionFetches(page.sections),
    })
    if (!query?.key || seen.has(query.key)) continue
    seen.add(query.key)
    // A binding carries its compiled file's address even when its query is external;
    // an external query has no file, so none is handed out.
    const external = typeof content?.config?.queries?.[query.config?.query]?.url === 'string'
    const path = external ? null : query.config?.path
    out.push(typeof path === 'string' && path ? { name: query.key, route: base, path } : { name: query.key, route: base })
  }
  return out
}
