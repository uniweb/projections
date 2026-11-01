/**
 * Version folders: the name, the order, and what a version's `noindex` means to each reader.
 */
import { describe, it, expect } from 'vitest'
import { compareVersionFolders, inVersionFolder, isVersionFolder } from '../src/versions.js'
import { selectIndexablePages, selectSearchablePages } from '../src/pages.js'
import { extractSearchContent } from '../src/search/extract.js'
import { sitemapEntries } from '../src/sitemap.js'
import { renderSiteIndex } from '../src/site-index.js'

describe('the name', () => {
  it.each(['v1', 'v2', 'v1.0', 'v2.1', 'v10', 'v1.2.3'])('%s is a version', (name) => {
    expect(isVersionFolder(name)).toBe(true)
  })
  it.each(['1', 'v', 'V1', 'version1', 'v1-beta', 'v1.', 'v.1', 'next', 'latest', '', null, undefined])('%s is not', (name) => {
    expect(isVersionFolder(name)).toBe(false)
  })
})

describe('the order', () => {
  it('is newest first, by number', () => {
    const sorted = ['v1', 'v2.9', 'v10', 'v2', 'v2.10', 'v2.1'].sort(compareVersionFolders)
    expect(sorted).toEqual(['v10', 'v2.10', 'v2.9', 'v2.1', 'v2', 'v1'])
  })
})

describe('inVersionFolder', () => {
  it('is any route through one', () => {
    expect(inVersionFolder('/docs/v1')).toBe(true)
    expect(inVersionFolder('/docs/v1/guide')).toBe(true)
    expect(inVersionFolder('/v2.1/guide')).toBe(true)
    expect(inVersionFolder('/docs/guide')).toBe(false)
    expect(inVersionFolder('/')).toBe(false)
    expect(inVersionFolder(null)).toBe(false)
  })
})

describe('an older version kept out of search engines', () => {
  const text = (value) => ({ type: 'paragraph', content: [{ type: 'text', text: value }] })
  const section = (value) => ({ id: '1', stableId: 'content', type: 'Text', content: { type: 'doc', content: [text(value)] } })
  const page = (route, extra = {}) => ({ route, title: route, hasContent: true, sections: [section(`words on ${route}`)], ...extra })
  const site = {
    config: { name: 'Docs', url: 'https://example.com' },
    pages: [
      page('/docs/guide'),
      { route: '/docs/v1', title: '1.x', hasContent: false, sections: [], seo: { noindex: true } },
      page('/docs/v1/guide'),
      page('/thanks', { seo: { noindex: true } }),
      page('/docs/v2/hidden', { hidden: true }),
    ],
  }
  const routes = (pages) => pages.map((p) => p.route)

  it('is left out of what a search engine or an agent reads', () => {
    expect(routes(selectIndexablePages(site.pages))).toEqual(['/docs/guide'])
    const inSitemap = JSON.stringify(sitemapEntries(site))
    expect(inSitemap).toContain('/docs/guide')
    expect(inSitemap).not.toContain('/docs/v1')
    const inIndex = renderSiteIndex(site)
    expect(inIndex).toContain('/docs/guide')
    expect(inIndex).not.toContain('/docs/v1')
  })

  it('stays in the site\'s own search', () => {
    expect(routes(selectSearchablePages(site.pages))).toEqual(['/docs/guide', '/docs/v1/guide'])
    const found = extractSearchContent(site).map((entry) => entry.route)
    expect(found).toContain('/docs/v1/guide')
  })

  it('every other reason to leave a page out of search still holds', () => {
    const found = routes(selectSearchablePages(site.pages))
    expect(found).not.toContain('/thanks')
    expect(found).not.toContain('/docs/v2/hidden')
  })

  it('leaves the pages it was given as they were', () => {
    selectSearchablePages(site.pages)
    expect(site.pages[1].seo.noindex).toBe(true)
  })
})
