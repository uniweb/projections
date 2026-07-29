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
 */

import { groupPagesForIndex, buildPageUrl } from './pages.js'
import { resolvePageDescription } from './description.js'

/** Heading for pages that sit under no container. */
const ROOT_GROUP_TITLE = 'Pages'

/**
 * Render the agent index for one locale of a site.
 *
 * @param {Object} siteContent - Parsed site-content.json (one locale)
 * @param {Object} [options]
 * @param {string} [options.baseUrl] - Site origin; links are root-relative without it
 * @param {string} [options.basePath] - Subdirectory deploy prefix
 * @param {string} [options.locale] - Locale being rendered
 * @param {string} [options.defaultLocale] - Locale served at the root
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
 * @returns {string} The index document
 */
export function renderSiteIndex(siteContent, options = {}) {
  const config = siteContent?.config || {}
  const { branch = null } = options

  // A branch index is titled by its container, not by the site.
  const branchPage = branch
    ? (siteContent?.pages || []).find(page => page.route === branch)
    : null

  const {
    baseUrl = config.seo?.baseUrl || '',
    basePath = '',
    locale = config.activeLocale,
    defaultLocale,
    exclude = [],
    title = branchPage?.title || branchPage?.label || config.title || config.name || 'Site',
    description = branchPage?.description || (branch ? '' : config.description || ''),
    rootGroupTitle = ROOT_GROUP_TITLE,
    maxDescriptionChars = 200,
  } = options

  const urlOptions = {
    baseUrl,
    basePath,
    locale,
    defaultLocale,
    routeTranslations: config.i18n?.routeTranslations,
  }

  const lines = [`# ${title}`]

  if (description) {
    lines.push('', ...blockquote(description))
  }

  const groups = groupPagesForIndex(siteContent?.pages, { exclude, branch })

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

  const url = buildPageUrl(page.route, urlOptions)
  const description = resolvePageDescription(page, { maxChars })

  return description
    ? `- [${title}](${url}): ${description}`
    : `- [${title}](${url})`
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
