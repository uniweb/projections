/**
 * A search result's snippet: the stretch of an entry's text around its first match, as
 * text and as HTML with each match in a `<mark>`.
 *
 * Where the matches are is the engine's to say (`matchRanges` in `./engine.js`), by its
 * own fold and tokenizer. This only renders them, so it loads no engine.
 */

import { escapeHtml } from '@uniweb/core/escape-html'

/**
 * Build a snippet from content with optional match highlighting
 *
 * @param {string} text - Full text content
 * @param {Array} matches - match ranges, in the shape `searchResult` gives
 *   (`{ key, indices: [[start, end], …] }`, `end` inclusive)
 * @param {Object} options - Options
 * @param {string} [options.key='content'] - Key to find matches for
 * @param {number} [options.maxLength=160] - Maximum snippet length
 * @param {number} [options.contextChars=60] - Characters before/after match
 * @param {string} [options.highlightTag='mark'] - HTML tag for highlights
 * @returns {{ text: string, html: string }} Plain text and HTML snippets
 *
 * @example
 * const snippet = buildSnippet(
 *   'This is a long text about authentication and security.',
 *   matches,
 *   { key: 'content' }
 * )
 * // snippet.html contains '<mark>authentication</mark>' highlighted
 */
export function buildSnippet(text, matches, options = {}) {
  const {
    key = 'content',
    maxLength = 160,
    contextChars = 60,
    highlightTag = 'mark'
  } = options

  if (!text) {
    return { text: '', html: '' }
  }

  // Find matches for the specified key
  const keyMatch = matches?.find(match => match.key === key)

  // No matches - return truncated content
  if (!keyMatch || !keyMatch.indices || keyMatch.indices.length === 0) {
    const snippet = text.slice(0, maxLength)
    const suffix = text.length > maxLength ? '…' : ''
    return {
      text: snippet + suffix,
      html: escapeHtml(snippet) + suffix
    }
  }

  // Get the first match position
  const [firstStart, firstEnd] = keyMatch.indices[0]

  // Calculate slice boundaries around the first match
  const sliceStart = Math.max(0, firstStart - contextChars)
  const sliceEnd = Math.min(text.length, firstEnd + contextChars + 1)

  // Extract the snippet
  const snippet = text.slice(sliceStart, sliceEnd)

  // Adjust match indices to be relative to the snippet
  const adjustedIndices = keyMatch.indices
    .map(([start, end]) => [start - sliceStart, end - sliceStart])
    .filter(([start, end]) => end >= 0 && start < snippet.length)

  // Build highlighted HTML
  const html = highlightMatches(snippet, adjustedIndices, { tag: highlightTag })

  // Add ellipsis indicators
  const prefix = sliceStart > 0 ? '…' : ''
  const suffix = sliceEnd < text.length ? '…' : ''

  return {
    text: `${prefix}${snippet}${suffix}`,
    html: `${prefix}${html}${suffix}`
  }
}

/**
 * Highlight matches in text using HTML tags
 *
 * @param {string} text - Text to highlight
 * @param {Array<[number, number]>} indices - Array of [start, end] index pairs, `end` inclusive
 * @param {Object} options - Options
 * @param {string} [options.tag='mark'] - HTML tag to use
 * @param {string} [options.className] - Optional CSS class for the tag
 * @returns {string} HTML string with highlighted matches
 *
 * @example
 * highlightMatches('hello world', [[0, 4]], { tag: 'mark' })
 * // Returns: '<mark>hello</mark> world'
 */
export function highlightMatches(text, indices, options = {}) {
  const { tag = 'mark', className } = options

  if (!text || !indices || indices.length === 0) {
    return escapeHtml(text || '')
  }

  // Sort indices by start position
  const sortedIndices = [...indices].sort((a, b) => a[0] - b[0])

  // Build HTML string
  let cursor = 0
  let html = ''
  const openTag = className ? `<${tag} class="${className}">` : `<${tag}>`
  const closeTag = `</${tag}>`

  for (const [start, end] of sortedIndices) {
    // Ensure valid bounds
    const safeStart = Math.max(0, Math.min(start, text.length))
    const safeEnd = Math.max(0, Math.min(end + 1, text.length))

    // Skip invalid ranges
    if (safeStart >= safeEnd || safeStart < cursor) continue

    // Add text before the match
    if (safeStart > cursor) {
      html += escapeHtml(text.slice(cursor, safeStart))
    }

    // Add highlighted match
    html += openTag + escapeHtml(text.slice(safeStart, safeEnd)) + closeTag
    cursor = safeEnd
  }

  // Add remaining text
  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor))
  }

  return html
}
