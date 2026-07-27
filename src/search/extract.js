/**
 * Extract searchable content from site-content.json
 *
 * Walks through all pages and sections, extracting text content
 * for search indexing. Reuses patterns from i18n extraction.
 */

// Leaf subpath, not the bare `@uniweb/core` entry: this package's environment
// contract forbids the package root (it pulls semantic-parser + theming).
// Enforced by tests/environment.test.js.
import { sectionDomId } from '@uniweb/core/section-id'

/**
 * Extract all searchable content from site
 * @param {Object} siteContent - Parsed site-content.json
 * @param {Object} options - Extraction options
 * @param {boolean} [options.pages=true] - Include page metadata
 * @param {boolean} [options.sections=true] - Include section content
 * @param {boolean} [options.headings=true] - Include headings
 * @param {boolean} [options.paragraphs=true] - Include paragraphs
 * @param {boolean} [options.links=true] - Include link labels
 * @param {boolean} [options.lists=true] - Include list items
 * @param {Array<string>} [options.excludeRoutes=[]] - Routes to exclude
 * @param {Array<string>} [options.excludeComponents=[]] - Components to exclude
 * @returns {Array<Object>} Array of search entries
 */
export function extractSearchContent(siteContent, options = {}) {
  const {
    pages: includePagesFlag = true,
    sections: includeSections = true,
    headings: includeHeadings = true,
    paragraphs: includeParagraphs = true,
    links: includeLinks = true,
    lists: includeLists = true,
    excludeRoutes = [],
    excludeComponents = []
  } = options

  const entries = []

  for (const page of siteContent.pages || []) {
    const pageRoute = page.route || '/'

    // Skip excluded routes
    if (excludeRoutes.some(r => pageRoute.startsWith(r))) {
      continue
    }

    // Skip pages marked as noindex
    if (page.seo?.noindex) {
      continue
    }

    // Extract page-level entry
    if (includePagesFlag) {
      const pageEntry = extractFromPage(page)
      if (pageEntry) {
        entries.push(pageEntry)
      }
    }

    // Extract section-level entries
    if (includeSections) {
      for (const section of page.sections || []) {
        const sectionEntries = extractFromSection(section, page, {
          includeHeadings,
          includeParagraphs,
          includeLinks,
          includeLists,
          excludeComponents
        })
        entries.push(...sectionEntries)
      }
    }
  }

  return entries
}

/**
 * Extract search entry from page metadata
 * @param {Object} page - Page data
 * @returns {Object|null} Search entry or null
 */
function extractFromPage(page) {
  const route = page.route || '/'
  const title = page.title || ''
  const description = page.description || ''
  const keywords = page.keywords || page.seo?.keywords || []

  // Skip pages with no meaningful content
  if (!title && !description) {
    return null
  }

  return {
    id: `page:${route}`,
    type: 'page',
    route,
    title,
    description,
    keywords: Array.isArray(keywords) ? keywords : [keywords].filter(Boolean),
    content: [title, description].filter(Boolean).join(' '),
    // Boost factor for search ranking (pages are more important)
    weight: route === '/' ? 1.0 : 0.8
  }
}

/**
 * Extract search entries from a section (and subsections)
 *
 * @param {Object} section - Section data
 * @param {Object} page - Parent page
 * @param {Object} options - Extraction options
 * @param {string} [ancestorAnchor] - The anchor of the nearest ancestor that
 *   is actually rendered with a wrapper. Absent at the top level, where the
 *   section renders itself; inherited by every nested level. See the note on
 *   anchors below.
 * @returns {Array<Object>} Array of search entries
 */
function extractFromSection(section, page, options, ancestorAnchor) {
  const entries = []
  const {
    includeHeadings,
    includeParagraphs,
    includeLinks,
    includeLists,
    excludeComponents
  } = options

  const sectionId = section.id || 'unknown'
  const component = section.component || section.type || 'unknown'

  // Where a reader gets taken for a hit in this section.
  //
  // A top-level section is wrapped by the renderer and carries its own id, so
  // it is its own destination. A NESTED section usually is not: `<ChildBlocks>`
  // renders children bare by default — no wrapper, and therefore no id — and
  // whether a foundation opted into `wrapAs` is a runtime decision this
  // build-time pass cannot see. Emitting the child's own id produced a
  // fragment that existed nowhere, so a hit landed on the page without
  // scrolling and did nothing at all when the reader was already on it.
  //
  // The nearest rendered ancestor is the honest answer: it always exists, and
  // the child's content is physically inside it, so the reader lands where the
  // matching text actually is. Precision is lost only in the rarer `wrapAs`
  // case, where the alternative was being wrong in the common one.
  //
  // Consequence worth knowing: a parent and its children now share an anchor,
  // so several results can point at one destination. They are still distinct
  // content with their own titles and excerpts; which to surface is the
  // consumer's ranking decision, not ours to collapse here.
  const anchor = ancestorAnchor || sectionDomId(section)

  // Skip excluded components
  if (excludeComponents.includes(component)) {
    return entries
  }

  // Extract text from ProseMirror content
  const textParts = []
  let sectionTitle = ''

  if (section.content?.type === 'doc') {
    const extracted = extractFromProseMirrorDoc(section.content, {
      includeHeadings,
      includeParagraphs,
      includeLinks,
      includeLists
    })

    sectionTitle = extracted.title || ''
    textParts.push(...extracted.textParts)
  }

  // Also check params for title (from YAML frontmatter)
  if (!sectionTitle && section.params?.title) {
    sectionTitle = section.params.title
  }

  // Build content string
  const content = textParts.join(' ').trim()

  // Create entry if there's meaningful content
  if (sectionTitle || content) {
    entries.push({
      id: `section:${page.route}:${sectionId}`,
      type: 'section',
      route: page.route,
      sectionId,
      // Resolved above. Never spelled out here: the id format is the shared
      // rule's to own, which is exactly how these two drifted apart before.
      anchor,
      component,
      title: sectionTitle,
      pageTitle: page.title || '',
      content,
      // Generate excerpt (first ~160 chars)
      excerpt: generateExcerpt(content, 160),
      // Section weight is lower than page
      weight: 0.6
    })
  }

  // Recursively process subsections.
  //
  // `anchor` is passed down rather than the subsection resolving its own, so
  // every level below the rendered one inherits the same destination — a
  // grandchild is no more rendered than its parent, and inheriting only one
  // level would put it back to naming an id that does not exist.
  for (const subsection of section.subsections || []) {
    const subEntries = extractFromSection(subsection, page, options, anchor)
    entries.push(...subEntries)
  }

  return entries
}

/**
 * Extract text from ProseMirror document
 * @param {Object} doc - ProseMirror document
 * @param {Object} options - Extraction options
 * @returns {Object} Extracted content { title, textParts }
 */
function extractFromProseMirrorDoc(doc, options) {
  const { includeHeadings, includeParagraphs, includeLinks, includeLists } = options
  const textParts = []
  let title = ''
  let foundFirstHeading = false

  if (!doc.content) {
    return { title, textParts }
  }

  for (const node of doc.content) {
    if (node.type === 'heading') {
      const text = extractTextFromNode(node)
      if (!text) continue

      // First H1 becomes the title
      if (!foundFirstHeading && node.attrs?.level === 1) {
        title = text
        foundFirstHeading = true
      }

      if (includeHeadings) {
        textParts.push(text)
      }
    } else if (node.type === 'paragraph') {
      if (includeParagraphs) {
        const text = extractTextFromNode(node)
        if (text) {
          textParts.push(text)
        }
      }

      // Extract link labels separately if requested
      if (includeLinks) {
        const links = extractLinksFromNode(node)
        for (const link of links) {
          if (link.label) {
            textParts.push(link.label)
          }
        }
      }
    } else if ((node.type === 'bulletList' || node.type === 'orderedList') && includeLists) {
      const listTexts = extractFromList(node)
      textParts.push(...listTexts)
    }
  }

  return { title, textParts }
}

/**
 * Extract all text content from a node
 * @param {Object} node - ProseMirror node
 * @returns {string} Text content
 */
function extractTextFromNode(node) {
  if (!node.content) return ''

  const texts = []

  for (const child of node.content) {
    if (child.type === 'text') {
      texts.push(child.text || '')
    } else if (child.content) {
      // Recurse for nested nodes
      texts.push(extractTextFromNode(child))
    }
  }

  return texts.join('').trim()
}

/**
 * Extract links from a paragraph node
 * @param {Object} node - Paragraph node
 * @returns {Array<{label: string, href: string}>} Links
 */
function extractLinksFromNode(node) {
  const links = []

  if (!node.content) return links

  for (const child of node.content) {
    if (child.type === 'text' && child.marks) {
      const linkMark = child.marks.find(m => m.type === 'link')
      if (linkMark) {
        links.push({
          label: child.text || '',
          href: linkMark.attrs?.href || ''
        })
      }
    }
  }

  return links
}

/**
 * Extract text from list items
 * @param {Object} listNode - List node
 * @returns {Array<string>} List item texts
 */
function extractFromList(listNode) {
  const texts = []

  if (!listNode.content) return texts

  for (const listItem of listNode.content) {
    if (listItem.type === 'listItem' && listItem.content) {
      for (const child of listItem.content) {
        if (child.type === 'paragraph') {
          const text = extractTextFromNode(child)
          if (text) {
            texts.push(text)
          }
        }
      }
    }
  }

  return texts
}

/**
 * Generate excerpt from content
 * @param {string} content - Full content
 * @param {number} maxLength - Maximum length
 * @returns {string} Excerpt
 */
function generateExcerpt(content, maxLength = 160) {
  if (!content) return ''

  // Normalize whitespace
  const normalized = content.replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  // Find a good break point (word boundary)
  let breakPoint = normalized.lastIndexOf(' ', maxLength)
  if (breakPoint < maxLength * 0.5) {
    breakPoint = maxLength
  }

  return normalized.slice(0, breakPoint).trim() + '…'
}

export default extractSearchContent
