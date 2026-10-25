/**
 * @fileoverview `robots.txt` — a site's rules for crawlers, and where its sitemap is.
 *
 * From the site's content alone: its rules are `config.seo.robots`, and its address `config.url`
 * (`@uniweb/core/site-address`). So a static build and a host serving the site from its content
 * publish the same file, by one rule.
 *
 * ⭐ `robots.txt` IS READ ONLY AT A HOST'S ROOT. A site served under a base path — a GitHub project
 * site — cannot have one, so it gets none, rather than a file no crawler reads that points at a
 * sitemap where none is.
 *
 * ⭐ A SITE THAT SAYS NOTHING GETS NO FILE. With no rules and no sitemap to name, there is nothing
 * to tell a crawler, and a missing `robots.txt` already means "no restrictions".
 */

import { siteAddress } from '@uniweb/core/site-address'

/** The three defined Content Signals, in the order they are emitted. */
const CONTENT_SIGNAL_KEYS = ['search', 'ai-input', 'ai-train']

/**
 * Format the `Content-Signal:` directive from `seo.robots.contentSignals`.
 *
 * Content Signals express what a site permits its content to be *used for*,
 * which is a different axis from `Disallow:` — that governs fetching, this
 * governs use after fetching. The three defined signals:
 *
 * - `search`    — appear in search results
 * - `ai-input`  — be retrieved at inference time (RAG, grounding)
 * - `ai-train`  — be used to train a model
 *
 * **Emitted only when declared.** There is no default: a preference the site
 * owner did not state is not ours to assert, in either direction. An absent
 * signal means "unstated", which is not the same as `no`.
 *
 * Unknown keys are ignored rather than passed through — the vocabulary is a
 * closed set, and forwarding an invented signal would produce a directive no
 * crawler honors while reading as though it were doing something.
 *
 * @param {Object|null} signals - e.g. `{ search: true, 'ai-input': true, 'ai-train': false }`
 * @returns {string} The directive line, or `''` when nothing is declared
 */
export function formatContentSignals(signals) {
  if (!signals || typeof signals !== 'object') return ''

  const parts = []
  for (const key of CONTENT_SIGNAL_KEYS) {
    if (!(key in signals)) continue
    const value = signals[key]
    const yes = value === true || value === 'yes'
    const no = value === false || value === 'no'
    if (!yes && !no) continue
    parts.push(`${key}=${yes ? 'yes' : 'no'}`)
  }

  return parts.length ? `Content-Signal: ${parts.join(', ')}` : ''
}

/** Whether `seo.robots` says anything a crawler would act on. */
function hasRules(robots) {
  if (!robots || typeof robots !== 'object') return false
  return Boolean(
    robots.allow?.length ||
      robots.disallow?.length ||
      robots.crawlDelay ||
      robots.additionalSitemaps?.length ||
      formatContentSignals(robots.contentSignals)
  )
}

/**
 * Whether the site is served at its host's root: its address's path, else the base it is built
 * for (`config.base`).
 *
 * @param {Object} config
 * @returns {boolean}
 */
function servedAtHostRoot(config = {}) {
  const address = siteAddress(config?.url)
  if (address) return new URL(address).pathname === '/'
  const base = config?.base
  return !base || base === '/'
}

/**
 * A site's `robots.txt`: its declared rules and content signals, and a `Sitemap:` line for its
 * sitemap — or null when it has none to serve: the site is served under a base path, or it declares
 * no rules and has no sitemap to name.
 *
 * @param {Object} siteContent - the site's content, in any of its languages: the rules and the
 *   address are the site's (`config.seo.robots`, `config.url`, `config.base`)
 * @param {Object} [options]
 * @param {boolean} [options.sitemap=false] - whether the site serves a sitemap, at `sitemap.xml` on
 *   its address. Named only when the address is known, since a `Sitemap:` line must be absolute.
 * @returns {string|null}
 */
export function renderRobotsTxt(siteContent, { sitemap = false } = {}) {
  const config = siteContent?.config || {}
  if (!servedAtHostRoot(config)) return null

  const robots = config.seo?.robots
  const address = siteAddress(config.url)
  const sitemapUrl = sitemap && address ? new URL('sitemap.xml', address).href : null
  if (!sitemapUrl && !hasRules(robots)) return null

  const { disallow = [], allow = [], crawlDelay = null, additionalSitemaps = [], contentSignals = null } = robots || {}

  let content = 'User-agent: *\n'

  const signals = formatContentSignals(contentSignals)
  if (signals) {
    // Inside the User-agent group, before the rules — the directive applies to
    // the group it sits in.
    content += `${signals}\n`
  }
  for (const path of allow) content += `Allow: ${path}\n`
  for (const path of disallow) content += `Disallow: ${path}\n`
  if (crawlDelay) content += `Crawl-delay: ${crawlDelay}\n`

  const sitemaps = [sitemapUrl, ...additionalSitemaps].filter(Boolean)
  if (sitemaps.length) content += `\n${sitemaps.map((url) => `Sitemap: ${url}`).join('\n')}\n`
  return content
}
