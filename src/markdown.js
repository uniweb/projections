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
 * Replace `inset_placeholder` nodes with the author's own words.
 *
 * ## Why this is not "restore the inset"
 *
 * An inset is `![Platform overview](@Diagram)` — an author's caption plus a
 * FOUNDATION COMPONENT to render it with. The build splits them: the caption and
 * params go to the section's `insets[]`, and the body keeps an
 * `inset_placeholder` carrying only `{ refId, embedKind }`.
 *
 * ⛔ **`@Diagram` must never reach this output.** A component name is a rendering
 * assignment, and this package's whole property is that a projection is of the
 * SITE — identical under a swapped foundation. Emitting it here would break the
 * same rule that keeps `type:` and params out (see the package's README/notes on
 * why the exclusions are load-bearing rather than tidy-up).
 *
 * ⭐ **But the caption IS site content** — the author wrote it, and an agent
 * retrieving this page should read it. So the placeholder becomes its title, as
 * plain text, and nothing else.
 *
 * ⚠️ Before this, `proseMirrorToMarkdown` had no serializer for the node and
 * dropped it with a warning per build — *"this is a tracked capability gap"*. It
 * was: every inset caption was missing from every agent-facing page.
 *
 * @param {Object} content - the section's ProseMirror document
 * @param {Array} insets - the section's `insets[]` (`{ refId, title }`)
 * @returns {Object} content with placeholders resolved to text
 */
function resolveInsetCaptions(content, insets) {
  if (!content?.content?.length) return content
  // No insets array → nothing to resolve against. Dropping is then still the only
  // option, but it is silent: the caption is genuinely not reachable from here.
  const titleByRef = new Map(
    (Array.isArray(insets) ? insets : [])
      .filter((i) => i && typeof i.refId === 'string' && i.title)
      .map((i) => [i.refId, String(i.title)])
  )

  // ⛔ THE REPLACEMENT'S SHAPE DEPENDS ON WHERE IT SITS, and getting this wrong
  // fails SILENTLY IN THE WORSE DIRECTION: a bare text node at block level is not
  // serializable, so the caption vanishes exactly as before — but the warning that
  // used to announce it is gone. Measured while writing this: the first version
  // emitted text unconditionally, removed the warning, and restored nothing.
  const TEXTBLOCKS = new Set(['paragraph', 'heading'])

  const visit = (nodes, inline) =>
    nodes.flatMap((node) => {
      if (!node) return []
      if (node.type === 'inset_placeholder') {
        const title = titleByRef.get(node.attrs?.refId)
        // An inset with no caption contributes no author text — drop it, and do
        // so quietly: there is nothing a reader is missing.
        if (!title) return []
        const text = { type: 'text', text: title }
        return inline ? [text] : [{ type: 'paragraph', content: [text] }]
      }
      if (Array.isArray(node.content)) {
        return [{ ...node, content: visit(node.content, TEXTBLOCKS.has(node.type)) }]
      }
      return [node]
    })

  return { ...content, content: visit(content.content, false) }
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
