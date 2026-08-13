/**
 * @fileoverview Config surface and output filenames.
 *
 * The internal vocabulary is *projections*. `llms.txt` is one emitter's
 * filename — a third-party convention that may not survive — so it appears
 * exactly once, here, at the edge. A change of convention costs a constant.
 */

/** Filename of the agent index within a locale's output root. */
export const INDEX_FILENAME = 'llms.txt'

/** Default minimum indexable pages before a branch earns its own index. */
export const DEFAULT_BRANCH_MIN_PAGES = 5

/** Defaults for the `agents:` block. Free capability, on by default.  */
const DEFAULTS = {
  index: true,
  markdown: true,
  exclude: [],
  branchIndexes: true,
  branchMinPages: DEFAULT_BRANCH_MIN_PAGES,
}

/**
 * Every key the `agents:` block accepts — the author-facing vocabulary.
 *
 * ⚠️ **This is deliberately WIDER than what {@link resolveAgentsConfig} reads.**
 * Some keys are *carried* rather than honoured: the framework passes them
 * through to the host, which enforces them, and this package never looks at
 * them. `expectedOrigins` is the first — the host checks the `Origin` of
 * requests to its agent endpoint against it.
 *
 * ⛔ **A carry-only key still has to be listed here, and the reason is the whole
 * point of the list.** The block reaches a backend as opaque JSON, so nothing
 * downstream can reject a typo — an author who writes `expectedOrgins` gets a
 * site that looks configured and checks nothing, silently, forever. The only
 * lane that can catch it is the one that owns the words. `uniweb doctor` reads
 * this list; if you add a key to the block and not to this list, doctor will
 * call the author's correct spelling a typo.
 */
export const AGENTS_KEYS = Object.freeze([
  ...Object.keys(DEFAULTS),
  // Carried, not honoured here — see the note above before removing.
  'expectedOrigins',
])

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
  if (agents === false) {
    return { index: false, markdown: false, exclude: [], branchIndexes: false, branchMinPages: DEFAULT_BRANCH_MIN_PAGES }
  }
  if (!agents || typeof agents !== 'object') return { ...DEFAULTS }

  return {
    index: agents.index !== false,
    markdown: agents.markdown !== false,
    exclude: normalizeExclude(agents.exclude),
    // On by default, but gated on size — so a small site gets none and a large
    // one gets them without anyone opting in. An explicit list pins the set.
    branchIndexes: agents.branchIndexes !== false,
    branchMinPages: Number.isInteger(agents.branchMinPages)
      ? agents.branchMinPages
      : DEFAULT_BRANCH_MIN_PAGES,
  }
}

/**
 * Output path of a branch index, relative to the locale root.
 *
 * `/docs` → `docs/llms.txt`, sitting beside that branch's pages so the external
 * convention ("the index lives at the root of what it indexes") holds at every
 * level a site publishes one.
 *
 * @param {string} route
 * @returns {string}
 */
export function branchIndexFilename(route) {
  const clean = (route || '').replace(/^\/+/, '').replace(/\/+$/, '')
  return clean ? `${clean}/${INDEX_FILENAME}` : INDEX_FILENAME
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
