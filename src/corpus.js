/**
 * @fileoverview The exploration projection: a whole site as greppable markdown.
 *
 * `renderSiteIndex` answers *"what pages exist"* and `renderPageMarkdown`
 * answers *"what does one page say"*. This answers the third question an agent
 * asks — *"where in this site is X"* — by producing the artifact `grep`,
 * `search` and `read_page` run against.
 *
 * ── WHY MARKDOWN, AND WHY ONE STRING PER PAGE ───────────────────────────────
 *
 * Tools of this kind are commonly built over a plain-text extraction, with
 * markdown produced separately and left unread. That loses exactly what an
 * agent navigates by: headings stop being headings, and links, code fences and
 * list structure vanish from what is searched.
 *
 * The subtler failure is line numbers. If a matcher numbers lines *within a
 * section* while a reader concatenates sections before returning them, a match
 * at "line 12" does not index into what the reader returns — and an agent
 * relies on those agreeing, the way they agree in a codebase.
 *
 * Both are addressed by *shape* rather than by care: a corpus page is **one
 * markdown string**, and every tool addresses that same string. The numbers
 * cannot disagree because there is only one thing to number.
 *
 * ── WHY SEGMENTS, RATHER THAN FIXED-SIZE CHUNKS ─────────────────────────────
 *
 * Keyword scoring needs a document unit, and a sliding window of ~N words is
 * the usual choice. Sections are a better one and cost nothing extra: they are
 * the authored boundary, they are what `search/extract.js` already indexes,
 * and — decisively — they carry `sectionDomId`, the anchor the renderer
 * actually emits. So a hit can be cited as `/route#section-3`, a link that
 * resolves in a browser. A word-window has no anchor, which is why tools built
 * on one return a route and leave the reader to find the passage.
 *
 * ⛔ Do NOT recover anchors by parsing headings out of the finished markdown.
 * A heading is prose the author wrote; `sectionDomId` is an id the renderer
 * emits. They are not the same thing and only one of them scrolls anywhere.
 */

import { collectPageBlocks, BLOCK_SEPARATOR } from './markdown.js'
import {
  selectIndexablePages,
  isContainer,
  isDynamicTemplate,
  hasDraftSegment,
  isAtOrUnder,
  knowledgeRoots,
  isKnowledgeRoute,
} from './pages.js'
import { normalizeExclude } from './config.js'

/**
 * Split pages into the agent-only set and the rendered set.
 *
 * A page is *knowledge* when it carries `knowledge: true`, or when it sits
 * beneath a route that does. The cascade is by route prefix, so `/kb` claims
 * `/kb/auth` and does **not** claim `/kbase`.
 *
 * ⚠️ This partition tells a **renderer** what to drop. It does not by itself
 * decide what the agent sees — {@link selectCorpusPages} does, and it is
 * deliberately not "everything left over". See the note there.
 *
 * @param {Object[]} pages - `siteContent.pages`
 * @returns {{knowledgePages: Object[], renderedPages: Object[]}}
 */
export function partitionKnowledgePages(pages = []) {
  if (!Array.isArray(pages)) return { knowledgePages: [], renderedPages: [] }

  const roots = knowledgeRoots(pages)

  const knowledgePages = []
  const renderedPages = []

  for (const page of pages) {
    if (isKnowledgePage(page, roots)) knowledgePages.push(page)
    else renderedPages.push(page)
  }

  return { knowledgePages, renderedPages }
}

/**
 * @param {Object} page
 * @param {string[]} roots - Routes carrying `knowledge: true`
 * @returns {boolean}
 */
function isKnowledgePage(page, roots) {
  // The flag is checked first rather than folded into the route test: a page
  // carrying it with no route at all is still not something to render.
  if (page?.knowledge) return true
  return isKnowledgeRoute(page?.route, roots)
}

/**
 * The pages a corpus may contain — **public by default; agent-only on request.**
 *
 * ⛔ **THE ARGUMENT ORDER IS THE SAFETY PROPERTY. Passing nothing gets you the
 * PUBLIC selection.** A caller who forgets the option, or copies a call from a
 * public-tier consumer, under-discloses. That is the failure we can afford;
 * the other direction puts agent-only content on a visitor-facing endpoint.
 * So `knowledge` defaults to `false` and the agent corpus is the one that has
 * to ask — the two tiers must not merely pass different arguments to one
 * selector, the public one must be what you get by passing none.
 *
 * ⛔ **AND EVEN WITH `knowledge: true`, THIS IS NOT "the site's full content".**
 * It is tempting to index every page — the agent is more useful the more it
 * knows — and to treat `knowledge: true` as purely a render-subtraction. That
 * is defensible for a private tool an author runs over their own content, and
 * wrong for a corpus that answers questions **for whoever can reach the site**.
 * An agent that greps `seo.noindex` pages and quotes them back is a disclosure
 * the author never agreed to, and `pages.js` already states the principle this
 * follows from: projections are on by default, so weakening the exclusions
 * turns the default into a leak.
 *
 * With `knowledge: true` the corpus is the public projection **plus** what the
 * author explicitly marked for agents:
 *
 * | signal | reach | why |
 * |---|---|---|
 * | the `agents:` selection | included | already the public projection's set |
 * | `knowledge: true` | **added** | an explicit opt-in to agent-visible content |
 * | `hidden`, `seo.noindex` | **overridden** for knowledge pages | they mean "not for browsers", and a knowledge page is *by definition* not rendered — honouring them would make `knowledge:` do nothing |
 * | `agents.exclude` | **always wins** | the one signal that says "keep agents out", so it outranks a conflicting `knowledge: true` |
 * | `_`-prefixed route | **always wins** | a draft is a draft |
 * | container, dynamic template | always excluded | shape, not policy — neither is a page with a body |
 *
 * The two "always wins" rows are the fail-closed half. Where the author has
 * contradicted themselves, the cost of honouring the exclusion is that the
 * agent knows less; the cost of ignoring it is private content on a public
 * endpoint. Those are not symmetric.
 *
 * ⚠️ **The `added` row is load-bearing and was not always doing anything.**
 * Until `excludedBranches` learned about `knowledge:`, the public half already
 * contained knowledge pages, so this union was a no-op and every test of it
 * passed for the wrong reason. That is the shape to watch for when reading a
 * union: it looks correct whether or not the two halves are actually disjoint.
 * `corpus.test.js` now pins the public half's *absence* of them directly.
 *
 * @param {Object[]} pages - `siteContent.pages`
 * @param {Object} [options]
 * @param {string[]} [options.exclude] - Additional excluded route prefixes
 * @param {boolean} [options.knowledge=false] - Admit `knowledge:` pages. Off by
 *   default; see the argument-order note above before changing that.
 * @returns {Object[]} Pages in build order, no duplicates
 */
export function selectCorpusPages(pages = [], { exclude = [], knowledge = false } = {}) {
  const publicPages = selectIndexablePages(pages, { exclude })
  if (!knowledge) return publicPages

  const publicSet = new Set(publicPages)
  const branches = normalizeExclude(exclude)
  const { knowledgePages } = partitionKnowledgePages(pages)

  const admissibleKnowledge = knowledgePages.filter(
    page =>
      page?.route &&
      !isContainer(page) &&
      !isDynamicTemplate(page) &&
      !hasDraftSegment(page.route) &&
      !branches.some(prefix => isAtOrUnder(page.route, prefix))
  )

  const admitted = new Set([...publicSet, ...admissibleKnowledge])

  // Build order, not selection order — the corpus is read by humans debugging it.
  return pages.filter(page => admitted.has(page))
}

/**
 * Build the greppable corpus for one locale of a site.
 *
 * **Public by default.** `knowledge: true` is the agent tier and has to be
 * asked for — see the argument-order note on {@link selectCorpusPages}.
 *
 * @param {Object} siteContent - Parsed site-content.json (one locale)
 * @param {Object} [options]
 * @param {string[]} [options.exclude] - Additional excluded route prefixes
 * @param {boolean} [options.includeChildren=true] - Include nested sections
 * @param {boolean} [options.knowledge=false] - Admit `knowledge:` pages
 * @returns {Array<CorpusPage>} Pages with content, in build order
 */
export function buildCorpus(
  siteContent,
  { exclude, includeChildren = true, knowledge = false } = {}
) {
  const pages = siteContent?.pages || []
  const config = siteContent?.config || {}
  const excluded = exclude ?? config.agents?.exclude ?? []

  // Only meaningful when knowledge pages were admitted; an empty set otherwise
  // keeps every `CorpusPage.knowledge` false, which is the truth on that tier.
  const agentOnly = knowledge
    ? new Set(partitionKnowledgePages(pages).knowledgePages.map(page => page.route))
    : new Set()

  const corpus = []

  for (const page of selectCorpusPages(pages, { exclude: excluded, knowledge })) {
    const built = buildCorpusPage(page, {
      includeChildren,
      knowledge: agentOnly.has(page.route),
    })
    // A page whose sections carry no projectable content is not a page the
    // agent can read. Listing it would produce read_page hits that return ''.
    if (built) corpus.push(built)
  }

  return corpus
}

/**
 * @typedef {Object} CorpusSegment
 * @property {string} anchor - `sectionDomId`; cite as `${route}#${anchor}`
 * @property {number} startLine - 1-based, into the page's `markdown`
 * @property {number} endLine - 1-based inclusive
 * @property {string} title - Leading heading text, or '' when the block has none
 * @property {string} markdown - This block alone
 */

/**
 * @typedef {Object} CorpusPage
 * @property {string} route
 * @property {string} title
 * @property {string} description
 * @property {boolean} knowledge - Agent-only (never rendered for a visitor)
 * @property {string} markdown - The whole page; every tool addresses THIS string
 * @property {number} lineCount
 * @property {CorpusSegment[]} segments
 */

/**
 * One page, as markdown plus a map of where each section landed in it.
 *
 * @param {Object} page
 * @param {Object} options
 * @param {boolean} options.includeChildren
 * @param {boolean} options.knowledge
 * @returns {CorpusPage|null} `null` when the page projects to nothing
 */
function buildCorpusPage(page, { includeChildren, knowledge }) {
  const blocks = collectPageBlocks(page, { includeChildren })
  if (blocks.length === 0) return null

  // Joining with a separator holding N newlines puts the next block's first
  // line N lines below the previous block's last: one newline merely ends that
  // last line, and each further one opens a blank line.
  //
  // ⚠️ Counting the separator's *lines* instead of its *newlines* is an
  // off-by-one that only shows up from the second block onward, which is why
  // `segment line ranges index into that exact string` slices every segment
  // back out of the finished markdown rather than checking arithmetic.
  const separatorNewlines = (BLOCK_SEPARATOR.match(/\n/g) || []).length
  const segments = []
  let line = 1

  for (const block of blocks) {
    const endLine = line + block.markdown.split('\n').length - 1
    segments.push({
      anchor: block.anchor,
      startLine: line,
      endLine,
      title: leadingHeading(block.markdown),
      markdown: block.markdown,
    })
    line = endLine + separatorNewlines
  }

  return {
    route: page.route,
    title: page.title || page.label || page.route,
    description: page.description || '',
    knowledge,
    markdown: blocks.map(block => block.markdown).join(BLOCK_SEPARATOR),
    lineCount: segments[segments.length - 1].endLine,
    segments,
  }
}

/**
 * The block's own heading, when it opens with one.
 *
 * Only the first line is considered, which is why no fenced-code guard is
 * needed: a fence cannot open and reach a `#` in the same line. A general
 * heading scan over the whole block WOULD need one — ``` blocks routinely
 * contain `# comment` — so do not widen this without adding it.
 *
 * @param {string} markdown
 * @returns {string}
 */
function leadingHeading(markdown) {
  const match = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(markdown.split('\n', 1)[0] || '')
  return match ? match[2] : ''
}

/**
 * The corpus table of contents — what `list_pages` answers from.
 *
 * Carries no body text, so an agent can hold the whole shape of a site in one
 * tool call and then read only what it needs. `lines` is what makes it useful
 * for planning: it is the cost of the `read_page` the agent is deciding whether
 * to spend.
 *
 * @param {CorpusPage[]} corpus
 * @returns {Array<{route: string, title: string, description: string, knowledge: boolean, lines: number, sections: Array<{anchor: string, title: string, startLine: number}>}>}
 */
export function buildCorpusManifest(corpus = []) {
  return corpus.map(page => ({
    route: page.route,
    title: page.title,
    description: page.description,
    knowledge: page.knowledge,
    lines: page.lineCount,
    sections: page.segments.map(segment => ({
      anchor: segment.anchor,
      title: segment.title,
      startLine: segment.startLine,
    })),
  }))
}
