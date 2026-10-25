/**
 * @fileoverview `sitemap.xml` — every page a site serves, at the URL it states, with its URL in each
 * of the site's languages.
 *
 * From the site's content alone, by the rules a page states its own URLs with
 * (`@uniweb/core/site-address`, `@uniweb/core/resolve-route`): a page's entry is the canonical and
 * the hreflang alternates its `<head>` states (`Page#getHeadMeta`). So a static build and a host
 * serving the site from its content list the same pages at the same URLs, and neither lists a page
 * at a URL its own head disagrees with.
 *
 * ⭐ A PAGE IS LISTED WHERE ITS URL ANSWERS WITH IT. Each page is asked for at the URL its language
 * shows it at, as a visitor would ask (`resolveRoute`). A redirect — authored, or a page with no
 * content going to its content — a rewrite, or nothing is no page to list; a folder that renders its
 * index page lists that page, once. Then the page's own rules: a page kept out of search
 * (`seo.noindex`, its own or the site's), or naming another URL as its canonical, is not listed.
 *
 * ⭐ A RECORD'S PAGE IS A PAGE. A parametric page (`/books/:slug`) is one template in the content,
 * never listed itself. The record pages the caller serves are listed after the site's own pages, as
 * `llms.txt` lists them, each by its template's rules.
 *
 * ⭐ NO ADDRESS, NO ENTRIES. A sitemap's URLs must be absolute, and the content states the address
 * (`config.url`); one guessed from where the site was loaded could be another copy of it.
 */

import { absoluteUrl, pageUrl, siteAddress } from '@uniweb/core/site-address'
import { localeUrl, resolveRoute, routeIndex } from '@uniweb/core/resolve-route'
import { isDynamicTemplate, isKnowledgeRoute, knowledgeRoots } from './pages.js'

/**
 * A page's own route, as `Page#getNavRoute` has it: an index page's (`/articles/index`) is its
 * folder's (`/articles`).
 */
function navRouteOf(page) {
  if (page?.isIndex && page.route.endsWith('/index')) return page.route.slice(0, -'/index'.length) || '/'
  return page.route
}

/**
 * What a URL a language shows names, by the resolver every lane asks. A locale on a domain of its
 * own (`config.domainLocales`) is shown there unprefixed, as that domain's own locale.
 */
function resolveShown(index, shown, locale, context) {
  if (/^https?:\/\//i.test(shown)) {
    return resolveRoute(index, new URL(shown).pathname, { activeLocale: locale, defaultLocale: locale })
  }
  return resolveRoute(index, shown, context)
}

/**
 * The sitemap entries of one language of a site: each page it serves in that language, at its URL,
 * with its URL in each of the site's languages when it has several. Empty when the content states no
 * address.
 *
 * @param {Object} siteContent - one language's site content, as authored: a parametric page is its
 *   template (`/books/:slug`)
 * @param {Object} [options]
 * @param {Object[]} [options.records] - the record pages served in this language: the record entries
 *   of its search index (`generateRecordSearchIndex(...).entries`), or any `{ type: 'record', route }`.
 *   Each is listed as a page, by the rules of the template its route matches.
 * @param {string} [options.locale] - the language the content is in. Default: `config.activeLocale`,
 *   else the site's default. A host holding each language's content apart passes it.
 * @returns {Array<{ route: string, loc: string, alternates: Array<{ hreflang: string, url: string }>,
 *   lastmod: string|null, changefreq: string|null, priority: (string|number)|null }>} in page order,
 *   the site's own pages first; `route` is the page's own, as the content holds it
 */
export function sitemapEntries(siteContent, { records, locale } = {}) {
  if (records != null && !Array.isArray(records)) {
    throw new TypeError('sitemapEntries: `records` must be an array of record entries')
  }
  const config = siteContent?.config || {}
  const address = siteAddress(config.url)
  if (!address) return []

  const pages = Array.isArray(siteContent?.pages) ? siteContent.pages : []
  const index = routeIndex(siteContent)
  const active = locale || index.activeLocale
  const context = { activeLocale: active, defaultLocale: index.defaultLocale }
  const trailingSlash = config.trailingSlash === true
  // As `normalizeSeo` (`@uniweb/core`) reads the site's and a page's `seo`.
  const siteNoindex = Boolean(config.seo?.noindex)
  const knowledge = knowledgeRoots(pages)

  /** A route's URL in a language: the one `Website#getPageUrl` states. */
  const urlOf = (route, code) => pageUrl(address, localeUrl(index, code, route, context), { trailingSlash })

  /** `Website#getPageAlternates`: the URL in each language, and the site's default as `x-default`. */
  const alternatesOf = (route) => {
    if (index.locales.length < 2) return []
    const alternates = []
    for (const code of index.locales) {
      const url = urlOf(route, code)
      if (url) alternates.push({ hreflang: code, url })
    }
    const fallback = urlOf(route, index.siteDefaultLocale)
    if (fallback) alternates.push({ hreflang: 'x-default', url: fallback })
    return alternates
  }

  const candidates = []
  for (const page of pages) {
    if (typeof page?.route !== 'string' || !page.route || isDynamicTemplate(page)) continue
    candidates.push({ route: navRouteOf(page), record: Boolean(page.dynamicContext) })
  }
  for (const entry of records || []) {
    if (entry?.type === 'record' && typeof entry.route === 'string' && entry.route) {
      candidates.push({ route: entry.route, record: true })
    }
  }

  const entries = []
  const listed = new Set()
  for (const candidate of candidates) {
    const resolved = resolveShown(index, localeUrl(index, active, candidate.route, context), active, context)
    if (resolved.kind !== 'page' || !resolved.page) continue
    const { page } = resolved
    // A record's page is its template's, at the record's route; any other is the page's own.
    const own = resolved.template ? resolved.route : navRouteOf(page)
    // A draft, and a page written for a site's services rather than its visitors, are not served
    // to crawlers.
    if (page.hidden || isKnowledgeRoute(page.route, knowledge)) continue
    if (page.seo?.noindex || siteNoindex) continue

    const loc = urlOf(own, active)
    if (!loc || listed.has(loc)) continue
    const authored = page.seo?.canonical
    const canonical = authored ? absoluteUrl(address, authored) || authored : loc
    if (canonical !== loc) continue
    listed.add(loc)

    // A record's page has no file of its own, so no date of its own: none is better than its
    // template's.
    const dated = !resolved.template && !candidate.record && !page.dynamicContext
    entries.push({
      route: own,
      loc,
      alternates: alternatesOf(own),
      lastmod: dated && page.lastModified ? String(page.lastModified).split('T')[0] : null,
      changefreq: page.seo?.changefreq || null,
      priority: page.seo?.priority || null,
    })
  }
  return entries
}

/** Escape a value for XML text or a double-quoted attribute. */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * `sitemap.xml` for entries — every language's in one file, each with its alternates when the site
 * has several languages — or null when there are none, since a sitemap must list a URL.
 *
 * @param {Array} entries - `sitemapEntries` results, each language's concatenated. A URL listed
 *   twice is listed once, the first time.
 * @returns {string|null}
 */
export function renderSitemap(entries) {
  if (!Array.isArray(entries)) throw new TypeError('renderSitemap: `entries` must be an array of sitemap entries')
  const seen = new Set()
  const unique = entries.filter((entry) => {
    if (!entry?.loc || seen.has(entry.loc)) return false
    seen.add(entry.loc)
    return true
  })
  if (!unique.length) return null

  const alternated = unique.some((entry) => entry.alternates?.length)
  const urls = unique.map((entry) => {
    const lines = [`    <loc>${escapeXml(entry.loc)}</loc>`]
    if (entry.lastmod) lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`)
    if (entry.changefreq) lines.push(`    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`)
    if (entry.priority !== null && entry.priority !== undefined) lines.push(`    <priority>${escapeXml(entry.priority)}</priority>`)
    for (const { hreflang, url } of entry.alternates || []) {
      lines.push(`    <xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(url)}" />`)
    }
    return `  <url>\n${lines.join('\n')}\n  </url>`
  })
  const xmlns = alternated ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xmlns}>\n${urls.join('\n')}\n</urlset>\n`
}
