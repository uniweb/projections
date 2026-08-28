/**
 * @fileoverview The retrieval projection: one page as markdown.
 *
 * Retrieval needs *fidelity*, so this reads `section.content` — the stored
 * ProseMirror document — through `content-writer`, rather than reconstructing
 * prose from the semantic parser's flattened groups.
 *
 * What is deliberately absent: no frontmatter, no section `type`, no params.
 * `type` names which component renders a section — a rendering assignment,
 * and foundation-specific. Emitting it would break the property that makes
 * this projection worth having: it is a projection of the *site* ingredient
 * alone, identical under a swapped foundation.
 *
 * The output carries Uniweb dialect (`![](lu-house)` icons,
 * `![desc](@Component){params}` insets). That is what the author wrote, and
 * it is more informative for an agent working on a Uniweb site than a
 * lossy translation to plain CommonMark would be.
 */

import { proseMirrorToMarkdown } from '@uniweb/content-writer'
import { sectionDomId } from '@uniweb/core/section-id'
import { resolveInsetCaptions } from './insets.js'

/**
 * How blocks are joined into a page. Exported because the corpus projection
 * reconstructs the same string while tracking line offsets into it, and the
 * two must not be able to disagree about the separator.
 */
export const BLOCK_SEPARATOR = '\n\n'

/**
 * Render one page as markdown.
 *
 * @param {Object} page - A collected page (`siteContent.pages[n]`)
 * @param {Object} [options]
 * @param {boolean} [options.includeChildren=true] - Include nested sections
 * @returns {string} Markdown, or '' when the page has no projectable content
 */
export function renderPageMarkdown(page, { includeChildren = true } = {}) {
  return collectPageBlocks(page, { includeChildren })
    .map(block => block.markdown)
    .join(BLOCK_SEPARATOR)
    .trim()
}

/**
 * The same blocks, still separate and each tagged with the anchor that links
 * to it.
 *
 * Exists so the corpus projection can say *where in the page* a match landed.
 * `renderPageMarkdown` throws that away by joining, and reconstructing it by
 * re-parsing the finished markdown is exactly the mistake this package exists
 * to prevent: headings in the output are prose, while `sectionDomId` is the id
 * the renderer actually emits. Only one of those resolves in a browser.
 *
 * ⚠️ Blocks are non-empty and individually trimmed, which is what lets the
 * corpus treat `join(BLOCK_SEPARATOR)` as equal to `renderPageMarkdown`'s
 * output without re-trimming. `tests/corpus.test.js` asserts that equality
 * rather than assuming it.
 *
 * @param {Object} page - A collected page (`siteContent.pages[n]`)
 * @param {Object} [options]
 * @param {boolean} [options.includeChildren=true] - Include nested sections
 * @returns {Array<{anchor: string, markdown: string}>}
 */
export function collectPageBlocks(page, { includeChildren = true } = {}) {
  const blocks = []

  for (const section of page?.sections || []) {
    collectSection(section, blocks, includeChildren, null)
  }

  return blocks
}

/**
 * Serialize one section, then its children in declared order.
 *
 * Child sections (`@`-prefixed files attached via `nest:`) are real authored
 * content that happens to render inside a parent. Skipping them would drop
 * body text an author wrote, which is exactly what retrieval is for.
 *
 * `ancestorAnchor` is threaded down rather than each child resolving its own,
 * matching `search/extract.js` — a nested section renders *inside* its parent,
 * so the parent's id is the fragment that actually scrolls to it. Consequence
 * worth knowing: a parent and its children share an anchor.
 *
 * @param {Object} section
 * @param {Array<{anchor: string, markdown: string}>} blocks
 * @param {boolean} includeChildren
 * @param {string|null} ancestorAnchor
 */
function collectSection(section, blocks, includeChildren, ancestorAnchor) {
  const anchor = ancestorAnchor || sectionDomId(section)
  const markdown = serializeSectionContent(section)
  if (markdown) blocks.push({ anchor, markdown })

  if (!includeChildren) return
  for (const child of section?.subsections || []) {
    collectSection(child, blocks, includeChildren, anchor)
  }
}

/**
 * @param {Object} section
 * @returns {string}
 */
function serializeSectionContent(section) {
  const content = section?.content
  if (!content?.content?.length) return ''
  return proseMirrorToMarkdown(resolveInsetCaptions(content, section?.insets)).trim()
}
