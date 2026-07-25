/**
 * @fileoverview One line describing a page, for the agent index.
 *
 * Discovery needs *meaning*, not just a URL — a bare list of links is what an
 * agent could already get from a sitemap. The whole value of the index is
 * that each entry says what the page is for.
 *
 * Never requires an author to have written anything: the docs corpus this was
 * measured against has no frontmatter at all, so every description there comes
 * from the derived path.
 */

import { docSummaryText } from '@uniweb/content-writer'

/**
 * Resolve a page's one-line description.
 *
 * Order: authored `page.yml::description` › authored SEO description ›
 * the first paragraph of the page's first section.
 *
 * Note on the second step: the collected page carries `seo.ogDescription`
 * (the Open Graph override), not a bare `seo.description` — `page.description`
 * *is* the meta description, and it is already step one.
 *
 * @param {Object} page - A collected page
 * @param {Object} [options]
 * @param {number} [options.maxChars=200] - Soft bound on the derived summary
 * @returns {string} A plain-text description, or '' when there is nothing
 */
export function resolvePageDescription(page, { maxChars = 200 } = {}) {
  const authored = page?.description?.trim()
  if (authored) return authored

  const seoDescription = page?.seo?.ogDescription?.trim()
  if (seoDescription) return seoDescription

  return deriveDescription(page, { maxChars })
}

/**
 * First paragraph of the first section that has one.
 *
 * Walks sections rather than reading only the first, so a page opening with a
 * bare Hero (a title and nothing else) still gets a description from the
 * section below it.
 *
 * @param {Object} page
 * @param {Object} options
 * @returns {string}
 */
function deriveDescription(page, { maxChars }) {
  for (const section of page?.sections || []) {
    const summary = docSummaryText(section?.content, { maxChars })
    if (summary) return summary
  }
  return ''
}
