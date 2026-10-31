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
 * The output carries Uniweb dialect for icons (`![](lu-house)`). That is what
 * the author wrote, and it is more informative for an agent working on a
 * Uniweb site than a lossy translation to plain CommonMark would be.
 *
 * ⛔ An INSET contributes its caption as plain text, never its `@Component`:
 * a component name is a rendering assignment, like `type`
 * (`insets.js::resolveInsetCaptions`). *Until 2026-09-27 this said insets
 * survive as `![desc](@Component){params}` too — a shape this projection never
 * received while the site build extracted insets, and one it now resolves.*
 */

import { proseMirrorToMarkdown, unwritableNodes } from '@uniweb/content-writer'
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
 * ⭐ **A record's page** — one URL of a parametric page — is that page's markdown, then the
 * record (`recordBlocks`). ⛔ Until 2026-10-23 a host composed this itself.
 *
 * @param {Object} page - A collected page (`siteContent.pages[n]`); for a record's page, the
 *   parametric page
 * @param {Object} [options]
 * @param {boolean} [options.includeChildren=true] - Include nested sections
 * @param {*} [options.record] - the record a parametric page's URL names
 * @returns {string} Markdown, or '' when the page has no projectable content
 */
export function renderPageMarkdown(page, { includeChildren = true, record } = {}) {
  const markdown = collectPageBlocks(page, { includeChildren })
    .map(block => block.markdown)
    .join(BLOCK_SEPARATOR)
    .trim()
  if (record === undefined || record === null) return markdown
  return [markdown, ...recordBlocks(record)].filter(Boolean).join(BLOCK_SEPARATOR)
}

/**
 * A record as blocks: its fields as JSON, as they were fetched, with nothing guessed about how to
 * word them, then each of its rich-text fields as the markdown it already is at heart. An article's
 * body reads as an article, not as 39 KB of ProseMirror.
 *
 * ⭐ Only a field that holds a whole document, and only when markdown can carry all of it
 * (`richTextMarkdown`). A record with a data schema keeps its fields in sections, so the field is
 * looked for through objects (`body.content`), but not into a list, where it would lose its place.
 * Anything else stays in the JSON: a complex record has no markdown form that wouldn't lose something,
 * and an agent reads JSON fine.
 *
 * A lone field named `content` is the record's body and needs no introduction. Any other is named in
 * a comment above it, so what the JSON no longer says, the file still does.
 *
 * @param {*} record
 * @returns {string[]}
 */
function recordBlocks(record) {
  if (!isPlainObject(record)) return [jsonBlock(record)]

  const prose = []
  const fields = liftRichText(record, [], prose)

  const isBody = prose.length === 1 && prose[0].path.at(-1) === 'content'
  return [
    ...(Object.keys(fields).length ? [jsonBlock(fields)] : []),
    ...prose.map(({ path, markdown }) =>
      isBody ? markdown : `<!-- ${path.join('.')} -->${BLOCK_SEPARATOR}${markdown}`,
    ),
  ]
}

/**
 * A copy of `object` without the rich-text fields markdown can carry, each added to `prose` with its
 * path. A section the lift empties goes too; one that was empty already stays, as it was fetched.
 *
 * @param {Object} object
 * @param {string[]} path
 * @param {Array<{path: string[], markdown: string}>} prose
 * @returns {Object}
 */
function liftRichText(object, path, prose) {
  const kept = {}
  for (const [key, value] of Object.entries(object)) {
    const here = [...path, key]
    const markdown = richTextMarkdown(value)
    if (markdown) {
      prose.push({ path: here, markdown })
    } else if (isPlainObject(value) && !isDocument(value)) {
      const rest = liftRichText(value, here, prose)
      if (Object.keys(rest).length || !Object.keys(value).length) kept[key] = rest
    } else {
      kept[key] = value
    }
  }
  return kept
}

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const isDocument = (value) => value?.type === 'doc' && Array.isArray(value.content)

/**
 * A field's markdown, or null when it stays in the JSON: it holds no document, an empty one, or one
 * with a node markdown cannot carry. The writer leaves such a node out, and the JSON loses nothing.
 *
 * @param {*} value
 * @returns {string|null}
 */
function richTextMarkdown(value) {
  if (!isDocument(value)) return null
  const doc = resolveInsetCaptions(value)
  if (unwritableNodes(doc).length) return null
  return proseMirrorToMarkdown(doc).trim() || null
}

/**
 * A value as a fenced JSON block. The fence is longer than any run of backticks in the JSON, so
 * a value holding one cannot close it early.
 *
 * @param {*} value
 * @returns {string}
 */
function jsonBlock(value) {
  const json = JSON.stringify(value, null, 2)
  let longest = 0
  for (const run of json.matchAll(/`+/g)) longest = Math.max(longest, run[0].length)
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}json\n${json}\n${fence}`
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
  // A draft section (`hidden: true`) is not published content, whichever payload carries it —
  // the same rule as a hidden page. Its child sections go with it.
  if (section?.hidden) return
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
  return proseMirrorToMarkdown(resolveInsetCaptions(content)).trim()
}
