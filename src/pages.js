/**
 * @fileoverview Page-graph helpers: which pages a projection may describe,
 * how they group, and what URL points at one.
 *
 * The exclusion rules here are load-bearing, not tidy-up. An index is *more*
 * revealing than a sitemap because it describes pages rather than listing
 * them: an unlinked page becomes discoverable **and** summarized. Projections
 * are on by default, so weakening these turns the default into a leak.
 */

import { pageMarkdownFilename, normalizeExclude } from './config.js'

/**
 * Is this page a structural container rather than a page with content?
 *
 * Content-less folders (a `page.yml` with no markdown) exist in the hierarchy
 * as groups. They have no body to project, so they become index headings.
 *
 * @param {Object} page
 * @returns {boolean}
 */
export function isContainer(page) {
  return page?.hasContent === false
}

/**
 * Is this a dynamic route *template* (`/blog/:slug`) rather than a page?
 *
 * Templates are expanded into concrete pages by the prerender lane; the
 * template itself is not a page and must never be described as one.
 *
 * @param {Object} page
 * @returns {boolean}
 */
export function isDynamicTemplate(page) {
  return Boolean(page?.isDynamic) || (page?.route || '').includes(':')
}

/**
 * Does any route segment start with `_`? Drafts and private files never reach
 * the collected content, but a mounted tree can still carry one.
 *
 * @param {string} route
 * @returns {boolean}
 */
export function hasDraftSegment(route) {
  return (route || '').split('/').some(segment => segment.startsWith('_'))
}

/**
 * Is `route` at or beneath `prefix`?
 *
 * ⚠️ Exported for `corpus.js`, which composes the same exclusions with a
 * different policy — NOT re-exported from `index.js`. It is a package-internal
 * primitive, and one shared implementation of "is this route inside that
 * branch" is the point: two copies of prefix matching is how `/kb` starts
 * matching `/kbase`.
 *
 * @param {string} route
 * @param {string} prefix
 * @returns {boolean}
 */
export function isAtOrUnder(route, prefix) {
  if (prefix === '/') return true
  return route === prefix || route.startsWith(`${prefix}/`)
}

/**
 * The routes carrying `knowledge: true` — the roots of the agent-only branches.
 *
 * ⚠️ Defined here, in the lower layer, rather than in `corpus.js` where the
 * concept reads like it belongs. Both files need it and the dependency only
 * runs one way, so putting it there would mean a second copy of "is this route
 * inside that branch" — the failure {@link isAtOrUnder} exists to prevent.
 *
 * @param {Object[]} pages
 * @returns {string[]}
 */
export function knowledgeRoots(pages = []) {
  if (!Array.isArray(pages)) return []
  return pages.filter(page => page?.knowledge && page.route).map(page => page.route)
}

/**
 * Is `route` a knowledge route — carrying the flag, or beneath one that does?
 *
 * @param {string} route
 * @param {string[]} roots - {@link knowledgeRoots}
 * @returns {boolean}
 */
export function isKnowledgeRoute(route, roots) {
  if (!route) return false
  return roots.some(root => isAtOrUnder(route, root))
}

/**
 * Route prefixes whose whole branch is excluded.
 *
 * Three sources, with different reach — deliberately:
 *
 * - `agents.exclude` cascades. `exclude: [/internal]` plainly means the
 *   branch, not one page.
 * - `noindex` / `hidden` on a **container** cascades, because a container is
 *   pure structure: suppressing the heading while still listing its children
 *   would orphan them under the wrong group. On a page with content it stays
 *   per-page, matching how the sitemap reads `noindex`.
 * - **`knowledge: true` cascades**, by the same route-prefix rule
 *   {@link partitionKnowledgePages} renders by. A knowledge page is not
 *   rendered and cannot be reached by a visitor, so nothing describing the
 *   *public* site may name it.
 *
 * ⛔ **That last one is about who the prose is ADDRESSED to — it is not a
 * confidentiality boundary, and reading it as one produces wrong designs.**
 * A knowledge page is source material for a service the site runs for its
 * visitors; the explanations in it are written for that service to reason
 * with, not for a person or a crawler to read. So naming it in `llms.txt`,
 * `/{route}.md` or the search index is not "exposing a secret" — it is
 * serving a reader prose that was written for somebody else, in a file that
 * claims to describe the public site.
 *
 * ⚠️ **Do not build a security expectation on this.** The service can quote
 * its source material back to whoever prompts it — that is what it is for —
 * so knowledge content is reachable by a visitor through the service by
 * design. [Diego, 2026-08-13]: *"It is not the case that it's private in the
 * sense of sensitive. It is given to the agent so they can reason and respond
 * prompts."*
 *
 * The omission still mattered, just not for the reason first written here: it
 * also made {@link selectCorpusPages} degenerate. That selector is *public ∪
 * knowledge*, and while knowledge rode in the public half the union added
 * nothing and read as if it worked.
 *
 * @param {Object[]} pages
 * @param {string[]} exclude
 * @returns {string[]}
 */
function excludedBranches(pages, exclude) {
  const branches = normalizeExclude(exclude)
  for (const page of pages) {
    if (!isContainer(page)) continue
    if (page.seo?.noindex || page.hidden) branches.push(page.route)
  }
  return branches.concat(knowledgeRoots(pages))
}

/**
 * Should this page be described in the index / projected to markdown?
 *
 * @param {Object} page
 * @param {string[]} branches - Excluded route prefixes
 * @returns {boolean}
 */
function isIndexable(page, branches) {
  if (!page?.route) return false
  if (isDynamicTemplate(page)) return false
  if (page.seo?.noindex) return false
  if (page.hidden) return false
  if (hasDraftSegment(page.route)) return false
  if (branches.some(prefix => isAtOrUnder(page.route, prefix))) return false
  return true
}

/**
 * The pages a projection may describe: real pages, in build order.
 *
 * Containers are excluded — they have no body — but they survive as headings
 * via {@link groupPagesForIndex}.
 *
 * @param {Object[]} pages - `siteContent.pages` (flat, already ordered)
 * @param {Object} [options]
 * @param {string[]} [options.exclude] - Additional route prefixes
 * @returns {Object[]}
 */
export function selectIndexablePages(pages = [], { exclude = [], branch = null } = {}) {
  const branches = excludedBranches(pages, exclude)
  return pages.filter(
    page =>
      isIndexable(page, branches) &&
      !isContainer(page) &&
      (!branch || isAtOrUnder(page.route, branch))
  )
}

/** Route depth: `/docs` → 1, `/docs/authoring` → 2. */
function routeDepth(route) {
  return (route || '').split('/').filter(Boolean).length
}

/**
 * Branches that warrant an index of their own (`/docs/llms.txt`).
 *
 * **A branch index is ADDITIVE, never a delegation.** The root index keeps
 * enumerating every page: Phase 1's exit criterion is that a cold agent reaches
 * a leaf in *two hops* (`/llms.txt` → the `.md`), and routing it through a
 * branch index would make that three. So these are a scoped entry point for an
 * agent already inside a branch — not a way to shrink the root.
 *
 * Consequently this does **not** close the index-size question: the root is
 * still complete by design, so a large site's root index is still large. A
 * size-based split is a separate decision, and it has to reckon with the
 * two-hop criterion the same way.
 *
 * **Top-level containers only.** A branch index at every depth multiplies files
 * without adding reachability — everything under `/docs/authoring` is already
 * in both `/llms.txt` and `/docs/llms.txt`.
 *
 * @param {Object[]} pages - `siteContent.pages` (flat, already ordered)
 * @param {Object} [options]
 * @param {string[]} [options.exclude]
 * @param {number} [options.minPages=5] - Below this, a branch rides the root index alone
 * @returns {Array<{route: string, title: string, count: number}>}
 */
export function selectIndexBranches(pages = [], { exclude = [], minPages = 5 } = {}) {
  const branchExclusions = excludedBranches(pages, exclude)
  const out = []

  for (const container of pages) {
    if (!isContainer(container)) continue
    if (!isIndexable(container, branchExclusions)) continue
    if (routeDepth(container.route) !== 1) continue

    const count = pages.filter(
      page =>
        isIndexable(page, branchExclusions) &&
        !isContainer(page) &&
        isAtOrUnder(page.route, container.route)
    ).length

    if (count < minPages) continue
    out.push({
      route: container.route,
      title: container.title || container.label || container.route,
      count,
    })
  }

  return out
}

/**
 * Group indexable pages under their nearest content-less container.
 *
 * The grouping comes free from the page graph — no new structure is invented.
 * Pages with no container ancestor land in a leading, unheaded group.
 *
 * @param {Object[]} pages - `siteContent.pages` (flat, already ordered)
 * @param {Object} [options]
 * @param {string[]} [options.exclude]
 * @returns {Array<{heading: string|null, route: string|null, pages: Object[]}>}
 */
export function groupPagesForIndex(pages = [], { exclude = [], branch = null } = {}) {
  const branches = excludedBranches(pages, exclude)
  const containers = pages.filter(p => isContainer(p) && isIndexable(p, branches))
  const indexable = pages.filter(
    p => isIndexable(p, branches) && !isContainer(p) && (!branch || isAtOrUnder(p.route, branch))
  )

  // Nearest container ancestor = the longest container route the page sits under.
  const groupFor = page => {
    let best = null
    for (const container of containers) {
      if (container.route === page.route) continue
      // In a branch index the branch container is the document's own subject —
      // its title is already the H1 — so it must not also become a `## ` group.
      // Its direct children belong in the leading unheaded group instead.
      if (branch && container.route === branch) continue
      if (!isAtOrUnder(page.route, container.route)) continue
      if (!best || container.route.length > best.route.length) best = container
    }
    return best
  }

  const root = { heading: null, route: null, pages: [] }
  const groups = new Map()

  for (const page of indexable) {
    const container = groupFor(page)
    if (!container) {
      root.pages.push(page)
      continue
    }
    if (!groups.has(container.route)) {
      groups.set(container.route, {
        heading: container.title || container.label || container.route,
        route: container.route,
        pages: [],
      })
    }
    groups.get(container.route).pages.push(page)
  }

  const ordered = [...groups.values()]
  return root.pages.length ? [root, ...ordered] : ordered
}

/**
 * Translate a route into a locale's URL segments.
 *
 * Mirrors the sitemap's behavior so an agent index and a sitemap never
 * disagree about where a localized page lives.
 *
 * @param {string} route
 * @param {string} locale
 * @param {Object} [routeTranslations] - `config.i18n.routeTranslations`
 * @returns {string}
 */
export function applyRouteTranslation(route, locale, routeTranslations) {
  const localeMap = routeTranslations?.[locale]
  if (!localeMap) return route
  if (localeMap[route]) return localeMap[route]
  for (const [canonical, translated] of Object.entries(localeMap)) {
    if (route.startsWith(`${canonical}/`)) {
      return translated + route.slice(canonical.length)
    }
  }
  return route
}

/**
 * URL of a page's markdown projection.
 *
 * Absolute when a `baseUrl` is known, root-relative otherwise. A root-relative
 * link still resolves for an agent that arrived via the index, which is why an
 * unset `baseUrl` warns rather than suppressing the artifact the way the
 * sitemap does.
 *
 * @param {string} route
 * @param {Object} [options]
 * @param {string} [options.baseUrl] - Site origin, e.g. `https://example.com`
 * @param {string} [options.basePath] - Subdirectory deploy prefix, e.g. `/docs/`
 * @param {string} [options.locale] - Active locale
 * @param {string} [options.defaultLocale] - Locale served at the root
 * @param {Object} [options.routeTranslations]
 * @returns {string}
 */
export function buildPageUrl(route, options = {}) {
  const { baseUrl = '', basePath = '', locale, defaultLocale, routeTranslations } = options

  const localized =
    locale && defaultLocale && locale !== defaultLocale
      ? applyRouteTranslation(route, locale, routeTranslations)
      : route

  const localePrefix = locale && defaultLocale && locale !== defaultLocale ? `/${locale}` : ''
  const filename = pageMarkdownFilename(localized)
  const prefix = normalizeBasePath(basePath)

  const path = `${prefix}${localePrefix}/${filename}`
  if (!baseUrl) return path
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

/**
 * Normalize a base path to `''` or `/segment` (no trailing slash).
 * @param {string} basePath
 * @returns {string}
 */
function normalizeBasePath(basePath) {
  if (!basePath || basePath === '/') return ''
  const withSlash = basePath.startsWith('/') ? basePath : `/${basePath}`
  return withSlash.replace(/\/+$/, '')
}
