/**
 * @fileoverview The discovery projection: an annotated index of the site.
 *
 * Answers the question an agent cannot answer by guessing — "does this page
 * exist, and where?" — and answers it with meaning attached, so the agent can
 * pick a page rather than fetch several to find out.
 *
 * Follows the external `llms.txt` convention: H1 title, blockquote summary,
 * `##` groups of annotated links. Link targets are the `.md` projections, so
 * following an entry is one hop rather than a fetch-then-strip.
 *
 * ⭐ A LINK IS THE PAGE'S OWN URL IN THE CONTENT'S LANGUAGE, as a `.md` filename: the URL the
 * page's head and the sitemap state (`@uniweb/core/resolve-route`), and the path
 * `resolveMarkdownRequest` answers with that page. ⛔ Until 2026-10-27 a link was localized only
 * when the caller also passed `defaultLocale`, which the content already states; a host that
 * passed the content alone got a French index linking `/evenements.md` where the page's markdown
 * is at `/fr/evenements.md`.
 */

import { localeUrl, localeUrlOnAddress, routeIndex } from '@uniweb/core/resolve-route'
import { siteAddress } from '@uniweb/core/site-address'
import { groupPagesForIndex, normalizeBasePath } from './pages.js'
import { markdownPathOf } from './markdown-request.js'
import { resolvePageDescription } from './description.js'

/** Heading for pages that sit under no container. */
const ROOT_GROUP_TITLE = 'Pages'

/**
 * Render the agent index for one locale of a site.
 *
 * @param {Object} siteContent - Parsed site-content.json (one locale)
 * @param {Object} [options]
 * @param {string} [options.address] - The site's address — links are absolute on it, root-relative
 *   without it. Default: the one the site states, `config.url`. ⛔ It replaced the `baseUrl` option,
 *   an origin put before a root-relative link, which is refused since 2026-10-27.
 * @param {string} [options.basePath] - Subdirectory deploy prefix, for root-relative links. Default:
 *   `config.base`
 * @param {string} [options.locale] - the language the content is in. Default: `config.activeLocale`,
 *   else the site's default. A host holding each language's content apart passes it. ⛔ There is no
 *   `defaultLocale` option since 2026-10-27: the content states its languages, as the sitemap reads
 *   them.
 * @param {string[]} [options.exclude] - Additional excluded route prefixes
 * @param {string} [options.title] - Override the site title
 * @param {string} [options.description] - Override the site summary
 * @param {string} [options.rootGroupTitle] - Heading for ungrouped pages
 * @param {number} [options.maxDescriptionChars=200]
 * @param {string} [options.branch] - Scope to one route subtree (a branch index).
 *   Title and summary then come from that branch's container page. The document
 *   is otherwise identical, so one renderer serves both — see
 *   {@link selectIndexBranches} for why a branch index is additive rather than a
 *   delegation.
 * @param {Object[]} [options.records] - the record entries of a search index
 *   (`generateRecordSearchIndex(...).entries`), for the pages a parametric page
 *   makes of them. Each is listed as a page of the site after the site's own, titled
 *   by its `title` and described by its `excerpt`, under the same exclusions. Content
 *   holds the parametric page alone, which is never listed.
 * @returns {string} The index document
 */
export function renderSiteIndex(siteContent, options = {}) {
  if (options.baseUrl !== undefined) {
    throw new TypeError("renderSiteIndex: `baseUrl` is retired; pass `address`, the site's root URL with its base path")
  }
  const config = siteContent?.config || {}
  const { branch = null } = options

  // A branch index is titled by its container, not by the site.
  const branchPage = branch
    ? (siteContent?.pages || []).find(page => page.route === branch)
    : null

  const {
    // ⭐ What the content states about where it is served — never an author's address for another
    // host. ⛔ Until 2026-10-25 this defaulted to `config.seo.baseUrl`, which a site wrote for a
    // static host and a host serving the same site would then have linked to.
    address = config.url || null,
    basePath = config.base || '',
    locale,
    exclude = [],
    title = branchPage?.title || branchPage?.label || config.title || config.name || 'Site',
    description = branchPage?.description || (branch ? '' : config.description || ''),
    rootGroupTitle = ROOT_GROUP_TITLE,
    maxDescriptionChars = 200,
  } = options

  // The content's languages, as the sitemap reads them, with the address the links are made on.
  const root = siteAddress(address)
  const index = routeIndex(root ? { ...siteContent, config: { ...config, url: root } } : siteContent)
  const activeLocale = locale || index.activeLocale
  const urlOptions = {
    index,
    config,
    root,
    basePath,
    context: { activeLocale, defaultLocale: index.defaultLocale },
  }

  const lines = [`# ${title}`]

  if (description) {
    lines.push('', ...blockquote(description))
  }

  const groups = groupPagesForIndex(withRecordPages(siteContent?.pages, options.records), { exclude, branch })

  for (const group of groups) {
    const entries = group.pages
      .map(page => renderEntry(page, urlOptions, maxDescriptionChars))
      .filter(Boolean)
    if (!entries.length) continue

    lines.push('', `## ${group.heading || rootGroupTitle}`, '', ...entries)
  }

  return `${lines.join('\n')}\n`
}

/**
 * The site's pages, then a page for each record entry that has a route — what a host listing a
 * site's record pages hands in. ⛔ Until 2026-10-23 a host built these itself and appended them
 * to the content's pages, so which page fields this reads was its to keep in step with.
 *
 * @param {Object[]} [pages]
 * @param {Object[]} [records]
 * @returns {Object[]}
 */
function withRecordPages(pages = [], records) {
  if (!Array.isArray(records) || !records.length) return pages
  const recordPages = records
    .filter((entry) => entry?.type === 'record' && typeof entry.route === 'string' && entry.route)
    .map((entry) => ({ route: entry.route, title: entry.title || '', description: entry.excerpt || '' }))
  return recordPages.length ? [...(pages || []), ...recordPages] : pages
}

/**
 * One `- [Title](url): description` entry.
 *
 * @param {Object} page
 * @param {Object} urlOptions
 * @param {number} maxChars
 * @returns {string}
 */
function renderEntry(page, urlOptions, maxChars) {
  const title = page.title || page.label || page.route
  if (!title) return ''

  const url = markdownUrl(page.route, urlOptions)
  const description = resolvePageDescription(page, { maxChars })

  return description
    ? `- [${title}](${url}): ${description}`
    : `- [${title}](${url})`
}

/**
 * Where a page's markdown is, in the content's language. On the site's address, at the page's URL
 * as the address serves it (`localeUrlOnAddress`, the sitemap's rule). With the address unknown,
 * root-relative under the base, as the host serving the index shows the page (`localeUrl`). A
 * language with a domain of its own is linked there.
 *
 * @param {string} route - the page's route, canonical or as the content's language shows it
 * @param {Object} urlOptions
 * @returns {string}
 */
function markdownUrl(route, { index, config, root, basePath, context }) {
  const shown = (root ? localeUrlOnAddress : localeUrl)(index, context.activeLocale, route, context)
  if (/^https?:\/\//i.test(shown)) {
    const { origin, pathname } = new URL(shown)
    return new URL(markdownPathOf(pathname, config), origin).href
  }
  const path = markdownPathOf(shown, config)
  if (root) return new URL(path.slice(1), root).href
  return `${normalizeBasePath(basePath)}${path}`
}

/**
 * Wrap a summary as a markdown blockquote, one line per source line.
 * @param {string} text
 * @returns {string[]}
 */
function blockquote(text) {
  return text
    .trim()
    .split('\n')
    .map(line => `> ${line}`.trimEnd())
}
