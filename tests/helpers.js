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
