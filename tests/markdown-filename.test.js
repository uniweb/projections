import { describe, it, expect } from 'vitest'
import { pageMarkdownFilename, markdownFilenameRoute } from '../src/index.js'

/**
 * A page's markdown projection is named for its route (`pageMarkdownFilename`), and a host that
 * answers a request for one asks the way back (`markdownFilenameRoute`) rather than keeping its own
 * mapping — asked for by a host, 2026-10-23.
 */
describe('markdownFilenameRoute — the inverse of pageMarkdownFilename', () => {
  it('names the route a projection is for, from a request path or a filename', () => {
    expect(markdownFilenameRoute('/index.md')).toBe('/')
    expect(markdownFilenameRoute('/blog.md')).toBe('/blog')
    expect(markdownFilenameRoute('docs/authoring/collections.md')).toBe('/docs/authoring/collections')
  })

  it('round-trips every route the forward function names', () => {
    for (const route of ['/', '/blog', '/docs/authoring/collections', '/a/b/c/d']) {
      expect(markdownFilenameRoute(pageMarkdownFilename(route))).toBe(route)
      expect(markdownFilenameRoute(`/${pageMarkdownFilename(route)}`)).toBe(route)
    }
  })

  it('says null for anything that is not a projection path', () => {
    for (const path of ['/blog', '/blog.html', '/.md', '/docs/.md', '', null, undefined]) {
      expect(markdownFilenameRoute(path)).toBeNull()
    }
  })
})
