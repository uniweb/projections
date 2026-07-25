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

/**
 * Render one page as markdown.
 *
 * @param {Object} page - A collected page (`siteContent.pages[n]`)
 * @param {Object} [options]
 * @param {boolean} [options.includeChildren=true] - Include nested sections
 * @returns {string} Markdown, or '' when the page has no projectable content
 */
export function renderPageMarkdown(page, { includeChildren = true } = {}) {
  const blocks = []

  for (const section of page?.sections || []) {
    collectSection(section, blocks, includeChildren)
  }

  return blocks.join('\n\n').trim()
}

/**
 * Serialize one section, then its children in declared order.
 *
 * Child sections (`@`-prefixed files attached via `nest:`) are real authored
 * content that happens to render inside a parent. Skipping them would drop
 * body text an author wrote, which is exactly what retrieval is for.
 *
 * @param {Object} section
 * @param {string[]} blocks
 * @param {boolean} includeChildren
 */
function collectSection(section, blocks, includeChildren) {
  const markdown = serializeSectionContent(section)
  if (markdown) blocks.push(markdown)

  if (!includeChildren) return
  for (const child of section?.subsections || []) {
    collectSection(child, blocks, includeChildren)
  }
}

/**
 * @param {Object} section
 * @returns {string}
 */
function serializeSectionContent(section) {
  const content = section?.content
  if (!content?.content?.length) return ''
  return proseMirrorToMarkdown(content).trim()
}
