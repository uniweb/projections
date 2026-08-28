/**
 * Inset captions — the one place that decides what an inset contributes.
 *
 * Shared by BOTH projections on purpose. The markdown page and the search index
 * are two views of ONE site, so "what words did the author write here" has to be
 * answered once. It was answered twice — markdown resolved captions and search
 * did not — and the two artifacts disagreed about the same page.
 */

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
export function resolveInsetCaptions(content, insets) {
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
