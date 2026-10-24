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
 * Some keys are *enforced by the host* rather than by this package.
 * `expectedOrigins` is one: the host checks the `Origin` of requests to its agent
 * endpoint against it. It still reads the key by this package's rule
 * ({@link resolveAgentsConfig}, {@link acceptsOrigin}), so every host checks the
 * same thing. ⛔ *Until 2026-10-23 this package never read it, and a host read the
 * key raw.*
 *
 * ⛔ **Every key has to be listed here, and the reason is the whole point of the
 * list.** The block reaches a backend as opaque JSON, so nothing
 * downstream can reject a typo — an author who writes `expectedOrgins` gets a
 * site that looks configured and checks nothing, silently, forever. The only
 * lane that can catch it is the one that owns the words. `uniweb doctor` reads
 * this list; if you add a key to the block and not to this list, doctor will
 * call the author's correct spelling a typo.
 */
export const AGENTS_KEYS = Object.freeze([
  ...Object.keys(DEFAULTS),
  // Enforced by the host — see the note above before removing.
  'expectedOrigins',
])

/**
 * Read the site's `agents:` block.
 *
 * Deliberately NOT `features:`, and the reason is now stronger than when this
 * was written: framework reads `features:` NOWHERE. The sync lane does not
 * carry it (it is not in `uwx/site.js`'s allowlist) and the bundle lane spreads
 * site.yml whole, so it lands at `config.features` on a static payload where
 * nothing consumes it.
 *
 * ⚠️ This read "the billing-intent declaration paired with a server-side
 * entitlement gate" until 2026-09-10 — a live meaning it does not have on our
 * side. Backend removed `publish_features` from the site-content entity on the
 * ruling that a requested service comes from `services` only [Diego,
 * 2026-09-08]. Projections being free is still true and still a reason; the
 * list it was contrasted against is inert.
 *
 * `expectedOrigins` is the origins the block declares, as a browser's `Origin` header spells
 * them (`expectedOriginsOf`). It is null when nothing is declared, which means no check.
 *
 * @param {Object} [siteConfig] - `siteContent.config`
 * @returns {{index: boolean, markdown: boolean, exclude: string[], branchIndexes: boolean,
 *   branchMinPages: number, expectedOrigins: string[]|null}}
 */
export function resolveAgentsConfig(siteConfig = {}) {
  const agents = siteConfig?.agents

  // `agents: false` turns the whole capability off in one word.
  if (agents === false) {
    return { index: false, markdown: false, exclude: [], branchIndexes: false, branchMinPages: DEFAULT_BRANCH_MIN_PAGES, expectedOrigins: null }
  }
  if (!agents || typeof agents !== 'object') return { ...DEFAULTS, expectedOrigins: null }

  return {
    expectedOrigins: expectedOriginsOf(agents.expectedOrigins),
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
 * The origins an `expectedOrigins:` declaration names, as a browser's `Origin` header spells them:
 * `https://app.example.com/` is `https://app.example.com`, and a path is dropped. An entry that is
 * no http(s) URL is dropped, and a repeated one kept once.
 *
 * @param {*} value - the declared value: a list, or one entry
 * @returns {string[]|null} null when nothing is declared; `[]` when the list names no origin,
 *   which accepts the site's own origins only
 */
function expectedOriginsOf(value) {
  if (value === undefined || value === null) return null
  const out = []
  for (const entry of Array.isArray(value) ? value : [value]) {
    const origin = httpOrigin(entry)
    if (origin && !out.includes(origin)) out.push(origin)
  }
  return out
}

/** An http(s) URL's origin, or null for anything else (including the `null` origin). */
function httpOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  let url
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
}

/**
 * ⭐ **WHETHER A HOST THAT OFFERS AN AGENT ACCEPTS A REQUEST FROM `origin`**, by the rule the
 * site's `agents.expectedOrigins` declares (the public reference's § *Expected origins*):
 * - nothing declared: every request;
 * - a request with no `Origin`: accepted, since a server calling the agent sends none;
 * - one of the site's own origins: always;
 * - otherwise: a declared origin, compared as origins.
 *
 * ⛔ It is a declaration, not a gate. Anything but a browser sends any `Origin` it likes, so this
 * stops casual misuse and embedding, never spending.
 *
 * @param {string[]|null} expectedOrigins - `resolveAgentsConfig(config).expectedOrigins`
 * @param {string|null|undefined} origin - the request's `Origin` header
 * @param {{ siteOrigins?: string[] }} [options] - the origins the host serves the site at
 * @returns {boolean}
 */
export function acceptsOrigin(expectedOrigins, origin, { siteOrigins = [] } = {}) {
  if (expectedOrigins == null) return true
  if (origin === undefined || origin === null || origin === '') return true
  const asked = httpOrigin(origin)
  if (!asked) return false
  if (siteOrigins.some((own) => httpOrigin(own) === asked)) return true
  return expectedOrigins.includes(asked)
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

/**
 * The route a page's markdown projection is for — the inverse of `pageMarkdownFilename`, for a
 * host answering a request for one: `/index.md` → `/`, `/blog.md` → `/blog`,
 * `docs/authoring/collections.md` → `/docs/authoring/collections`. A leading slash is optional.
 *
 * ⚠️ `index.md` is the site root's, so a page whose own route is `/index` cannot be told from it;
 * the forward function maps both there.
 *
 * @param {string} path - a request path or a projection's filename
 * @returns {string|null} the route, or null for anything that is not a `.md` path
 */
export function markdownFilenameRoute(path) {
  if (typeof path !== 'string' || !path.endsWith('.md')) return null
  const name = path.replace(/^\/+/, '').slice(0, -'.md'.length)
  if (!name || name.endsWith('/')) return null
  return name === 'index' ? '/' : `/${name}`
}
