/**
 * Fixture builders — real ProseMirror, parsed from real markdown.
 *
 * Hand-written PM literals drift from what the reader actually produces, and
 * a projection tested against a shape the pipeline never emits proves nothing.
 */

import { markdownToProseMirror } from '@uniweb/content-reader'

/** A section carrying content parsed from markdown. */
export function section(markdown, overrides = {}) {
  return {
    id: overrides.id ?? 0,
    stableId: overrides.stableId ?? null,
    type: overrides.type ?? null,
    params: overrides.params ?? {},
    content: markdown === null ? { type: 'doc', content: [] } : markdownToProseMirror(markdown),
    subsections: overrides.subsections ?? [],
    ...overrides,
  }
}

/** A collected page, with the fields the projections read. */
export function page(route, overrides = {}) {
  return {
    route,
    title: overrides.title ?? route,
    description: overrides.description ?? '',
    label: overrides.label ?? null,
    hidden: overrides.hidden ?? false,
    isDynamic: overrides.isDynamic ?? false,
    hasContent: overrides.hasContent ?? true,
    seo: {
      noindex: false,
      image: null,
      ogTitle: null,
      ogDescription: null,
      canonical: null,
      changefreq: null,
      priority: null,
      ...(overrides.seo || {}),
    },
    sections: overrides.sections ?? [],
    ...(({ seo, ...rest }) => rest)(overrides),
  }
}

/** A content-less container page — a structural group. */
export function container(route, title) {
  return page(route, { title, hasContent: false, sections: [] })
}

/** A site-content payload. */
export function site(pages, config = {}) {
  return { config: { name: 'Test Site', ...config }, pages }
}

/**
 * A section whose insets have been extracted, the way the BUILD does it.
 *
 * ⛔ `markdownToProseMirror` alone is not enough here. The reader emits
 * `inset_ref` (caption in `attrs.alt`, component in `attrs.component`); it is
 * the build's collector that splits those into an `insets[]` record plus an
 * `inset_placeholder` in the body — and the placeholder is what a projection
 * actually receives. A fixture stopping at the reader tests a shape no
 * projection ever sees.
 *
 * ⚠️ This mirrors `@uniweb/build`'s `src/site/content-collector.js` (the
 * `inset_ref` branch). It is a MIRROR, not the real thing: `projections` must
 * not depend on `build`, whose identity pulls Vite and would break this
 * package's environment contract. Re-read that branch if an inset field moves —
 * the fields copied here are `refId` / `type` / `embedKind` / `params` /
 * `title`, and the caption rides as `title`.
 */
export function sectionWithInsets(markdown, overrides = {}) {
  const content = markdownToProseMirror(markdown)
  const insets = []
  let refIndex = 0

  const visit = (nodes) => {
    if (!Array.isArray(nodes)) return
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (!node) continue
      if (node.type === 'inset_ref') {
        const { component, alt, embedKind, ...params } = node.attrs || {}
        const refId = `inset_${refIndex++}`
        insets.push({
          refId,
          type: component,
          embedKind: embedKind || 'visual',
          params: Object.keys(params).length > 0 ? params : {},
          title: alt || null
        })
        nodes[i] = { type: 'inset_placeholder', attrs: { refId, embedKind: embedKind || 'visual' } }
        continue
      }
      if (Array.isArray(node.content)) visit(node.content)
    }
  }
  visit(content.content)

  return section(null, { ...overrides, content, insets })
}
