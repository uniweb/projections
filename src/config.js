/**
 * @fileoverview Config surface and output filenames.
 *
 * The internal vocabulary is *projections*. `llms.txt` is one emitter's
 * filename — a third-party convention that may not survive — so it appears
 * exactly once, here, at the edge. A change of convention costs a constant.
 */

/** Filename of the agent index within a locale's output root. */
export const INDEX_FILENAME = 'llms.txt'

/** Defaults for the `agents:` block. Free capability, on by default.  */
const DEFAULTS = { index: true, markdown: true, exclude: [] }

/**
 * Read the site's `agents:` block.
 *
 * Deliberately NOT `features:` — that list is the billing-intent declaration
 * paired with a server-side entitlement gate, and projections are free. A
 * free capability in that list would blur what `features:` means for
 * everything else in it.
 *
 * @param {Object} [siteConfig] - `siteContent.config`
 * @returns {{index: boolean, markdown: boolean, exclude: string[]}}
 */
export function resolveAgentsConfig(siteConfig = {}) {
  const agents = siteConfig?.agents

  // `agents: false` turns the whole capability off in one word.
  if (agents === false) return { index: false, markdown: false, exclude: [] }
  if (!agents || typeof agents !== 'object') return { ...DEFAULTS }

  return {
    index: agents.index !== false,
    markdown: agents.markdown !== false,
    exclude: normalizeExclude(agents.exclude),
  }
}

/**
 * Normalize `exclude:` to a list of leading-slash route prefixes.
 *
 * Exported because exclusions arrive two ways — from `site.yml`'s `agents:`
 * block and as a direct option — and both have to be normalized or one path
 * silently stops excluding.
 *
 * @param {*} value
 * @returns {string[]}
 */
export function normalizeExclude(value) {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list
    .filter(v => typeof v === 'string' && v.trim())
    .map(v => {
      const trimmed = v.trim()
      const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
      // Strip a trailing slash so `/internal/` and `/internal` behave alike.
      return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash
    })
}

/**
 * Output path of a page's markdown projection, relative to the locale root.
 *
 * 1:1 with the route, matching how `agents.md` names pages: the page at
 * `/docs/authoring/collections` projects to `docs/authoring/collections.md`.
 * The site root is `index.md` — `dist/index.html` is the page, `index.md` is
 * free beside it.
 *
 * @param {string} route
 * @returns {string}
 */
export function pageMarkdownFilename(route) {
  if (!route || route === '/') return 'index.md'
  return `${route.replace(/^\/+/, '').replace(/\/+$/, '')}.md`
}
