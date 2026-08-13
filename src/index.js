/**
 * @uniweb/projections — everything derived from the *site* ingredient alone.
 *
 * A Uniweb site is content; a foundation is code; the runtime orchestrates
 * them. Rendering HTML needs all three. These artifacts need only the first,
 * which is what makes them identical in every context — SPA, prerender,
 * JIT-SSR isolate, desktop, `unipress` — and stable across foundation and
 * runtime changes.
 *
 * **Environment contract: runs anywhere JS runs.** No `node:*`, no Vite, no
 * DOM, no filesystem. That is not incidental; it is the package's reason to
 * exist. A Uniweb project is dual-published — the CLI and the app are both
 * JavaScript clients of one backend, and either may be the publisher. An
 * artifact derived from site content must therefore be produced *identically*
 * by whichever side publishes, or a deployed site's artifacts oscillate with
 * the publisher. One implementation, imported by both; the backend stores and
 * serves opaque bytes and generates nothing.
 *
 * The contract is enforced by a test (`tests/environment.test.js`), because a
 * subpath export of a Node-flavored package is one careless import away from
 * breaking a consumer it never sees.
 *
 * @module @uniweb/projections
 */

export { renderSiteIndex } from './site-index.js'
export { renderPageMarkdown } from './markdown.js'
export { resolvePageDescription } from './description.js'

export {
  buildCorpus,
  buildCorpusManifest,
  selectCorpusPages,
  partitionKnowledgePages,
} from './corpus.js'

export {
  INDEX_FILENAME,
  DEFAULT_BRANCH_MIN_PAGES,
  AGENTS_KEYS,
  pageMarkdownFilename,
  branchIndexFilename,
  resolveAgentsConfig,
} from './config.js'

export {
  selectIndexablePages,
  selectIndexBranches,
  groupPagesForIndex,
  buildPageUrl,
  applyRouteTranslation,
  isContainer,
  isDynamicTemplate,
} from './pages.js'

export {
  extractSearchContent,
  generateSearchIndex,
  mergeSearchIndexes,
  generateCollectionIndex,
  isSearchEnabled,
  getSearchConfig,
  getSearchIndexFilename,
} from './search/index.js'
