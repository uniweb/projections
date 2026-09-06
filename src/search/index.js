/**
 * Search Index Generation Module
 *
 * Generates search indexes for Uniweb sites — a projection of the site's
 * authored content, in the same family as the agent index and the per-page
 * markdown. The generated indexes can be loaded at runtime for client-side
 * search.
 *
 * Moved here from `@uniweb/build` so that **one implementation serves every
 * publisher**. The code was always portable (no imports beyond a
 * zero-dependency locale helper); what made sharing unsafe was the package it
 * lived in, whose identity pulls Vite and Node APIs — which is why a second
 * copy of this logic was hand-maintained elsewhere and drifted from it.
 * `@uniweb/build` re-exports this module, so existing call sites are unchanged.
 *
 * @module @uniweb/projections/search
 *
 * @example
 * import { generateSearchIndex, isSearchEnabled } from '@uniweb/projections/search'
 *
 * // Check if search is enabled
 * if (isSearchEnabled(siteContent)) {
 *   // Generate index for current locale
 *   const index = generateSearchIndex(siteContent, {
 *     locale: 'en'
 *   })
 *
 *   // Write to file
 *   writeFileSync('dist/search-index.json', JSON.stringify(index))
 * }
 */

export {
  extractSearchContent,
  extractSearchContent as default
} from './extract.js'

export {
  generateSearchIndex,
  mergeSearchIndexes,
  isSearchEnabled,
  getSearchConfig,
  getSearchIndexFilename
} from './generate.js'

export { generateRecordSearchIndex } from './records.js'

// ── The engine: indexing and ranking the entries the generators above produce ──
//
// ⭐ Two jobs, one artifact between them. `generateSearchIndex` produces the
// ENTRIES; these index and rank them, so one site ranks the same wherever it is
// served. Contributed in full on 2026-09-06 from a server-side search lane that
// had measured the format against the alternative; the fuzzy fallback is ours.
export {
  buildSearchStructure,
  rankSearchEntries,
  prefixTerms,
  fuzzyTerms,
  fold,
  tokenize,
} from './engine.js'
