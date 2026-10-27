/**
 * `sitemap.xml` (`src/sitemap.js`) — every page a site serves, at the URL it states, from the site's
 * content alone, so a static build and a host serving the site from its content list the same
 * pages at the same URLs.
 */

import { sitemapEntries, renderSitemap } from '../src/sitemap.js'
import { page, container, section, site } from './helpers.js'

const ADDRESS = 'https://octocat.github.io/handbook/'
const body = () => [section('# Body\n\nText.')]

/** A site with a home and a books page, at ADDRESS, its pages served as directories. */
function content(pages = [], config = {}) {
  return site(
    [
      page('/', { isIndex: true, title: 'Home', sections: body(), lastModified: '2026-10-20T10:00:00.000Z' }),
      page('/books', { title: 'Books', sections: body() }),
      ...pages,
    ],
    { defaultLanguage: 'en', url: ADDRESS, trailingSlash: true, ...config }
  )
}
const locs = (entries) => entries.map((entry) => entry.loc)

describe('sitemapEntries — a page at the URL it states', () => {
  test('⭐ with the base path, as a static host answers it', () => {
    expect(sitemapEntries(content())).toEqual([
      { route: '/', loc: ADDRESS, alternates: [], lastmod: '2026-10-20', changefreq: null, priority: null },
      { route: '/books', loc: `${ADDRESS}books/`, alternates: [], lastmod: null, changefreq: null, priority: null },
    ])
  })

  test('without a trailing slash where the host says its pages end without one', () => {
    expect(locs(sitemapEntries(content([], { url: 'https://example.com', trailingSlash: undefined })))).toEqual([
      'https://example.com/',
      'https://example.com/books',
    ])
  })

  test('nothing, for content that states no address', () => {
    expect(sitemapEntries(content([], { url: undefined }))).toEqual([])
    expect(sitemapEntries(content([], { url: 'localhost:8080' }))).toEqual([])
    expect(sitemapEntries({})).toEqual([])
    expect(sitemapEntries(undefined)).toEqual([])
  })

  test('only what the author set: changefreq and priority', () => {
    const entries = sitemapEntries(content([page('/news', { sections: body(), seo: { changefreq: 'daily', priority: 0.9 } })]))
    expect(entries.find((entry) => entry.route === '/news')).toMatchObject({ changefreq: 'daily', priority: 0.9 })
  })

  test('an index page is listed at its folder’s URL', () => {
    const entries = sitemapEntries(content([page('/articles/index', { isIndex: true, sections: body() })]))
    expect(locs(entries)).toContain(`${ADDRESS}articles/`)
    expect(locs(entries)).not.toContain(`${ADDRESS}articles/index/`)
  })
})

describe('sitemapEntries — what is not listed', () => {
  test('a page kept out of search, by its own seo or the site’s', () => {
    const entries = sitemapEntries(content([page('/drafts', { sections: body(), seo: { noindex: true } })]))
    expect(locs(entries)).not.toContain(`${ADDRESS}drafts/`)
    expect(sitemapEntries(content([], { seo: { noindex: true } }))).toEqual([])
  })

  test('a page naming another URL its canonical — and one naming its own is listed', () => {
    const entries = sitemapEntries(
      content([
        page('/old', { sections: body(), seo: { canonical: '/books' } }),
        page('/same', { sections: body(), seo: { canonical: `${ADDRESS}same/` } }),
      ])
    )
    expect(locs(entries)).not.toContain(`${ADDRESS}old/`)
    expect(locs(entries)).toContain(`${ADDRESS}same/`)
  })

  test('⭐ a URL that redirects or proxies: an authored redirect, a rewrite, a container going to its content', () => {
    const entries = sitemapEntries(
      content([
        page('/moved', { sections: body(), redirect: '/books' }),
        page('/elsewhere', { sections: body(), rewrite: 'https://other.example/x' }),
        container('/guide', 'Guide'),
        page('/guide/start', { sections: body() }),
      ])
    )
    expect(locs(entries)).toEqual([ADDRESS, `${ADDRESS}books/`, `${ADDRESS}guide/start/`])
  })

  test('a folder that renders its index page lists that page, once', () => {
    const entries = sitemapEntries(content([container('/docs', 'Docs'), page('/docs/intro', { isIndex: true, sections: body() })]))
    expect(locs(entries).filter((loc) => loc.includes('/docs'))).toEqual([`${ADDRESS}docs/intro/`])
  })

  test('a container with nothing in it is the page it renders, as it is served', () => {
    expect(locs(sitemapEntries(content([container('/empty', 'Empty')])))).toContain(`${ADDRESS}empty/`)
  })

  test('a draft, and a page written for the site’s services rather than its visitors', () => {
    const entries = sitemapEntries(
      content([
        page('/wip', { sections: body(), hidden: true }),
        page('/kb', { sections: body(), knowledge: true }),
        page('/kb/answer', { sections: body() }),
      ])
    )
    expect(locs(entries)).toEqual([ADDRESS, `${ADDRESS}books/`])
  })

  test('a parametric page’s template, ever', () => {
    const entries = sitemapEntries(content([page('/books/:slug', { isDynamic: true, sections: body() })]))
    expect(locs(entries)).toEqual([ADDRESS, `${ADDRESS}books/`])
  })
})

describe('sitemapEntries — record pages', () => {
  const template = (seo = {}) => page('/books/:slug', { isDynamic: true, sections: body(), seo, lastModified: '2026-10-01' })
  const records = [
    { type: 'record', route: '/books/dune', title: 'Dune' },
    { type: 'record', route: '/books/caf%C3%A9', title: 'Café' },
    { type: 'page', route: '/books' },
    { route: '/books/no-type' },
  ]

  test('⭐ each record page the caller serves, after the site’s own pages, by its template’s rules', () => {
    const entries = sitemapEntries(content([template({ changefreq: 'weekly' })]), { records })
    expect(entries.slice(2)).toEqual([
      { route: '/books/dune', loc: `${ADDRESS}books/dune/`, alternates: [], lastmod: null, changefreq: 'weekly', priority: null },
      { route: '/books/café', loc: `${ADDRESS}books/caf%C3%A9/`, alternates: [], lastmod: null, changefreq: 'weekly', priority: null },
    ])
  })

  test('none, when the template is kept out of search', () => {
    expect(sitemapEntries(content([template({ noindex: true })]), { records })).toHaveLength(2)
  })

  test('a record whose route a static page holds is that page, listed once', () => {
    const entries = sitemapEntries(content([template(), page('/books/about', { sections: body() })]), {
      records: [{ type: 'record', route: '/books/about' }],
    })
    expect(locs(entries).filter((loc) => loc.endsWith('/about/'))).toEqual([`${ADDRESS}books/about/`])
  })

  test('a record route no page answers is not listed', () => {
    expect(sitemapEntries(content(), { records: [{ type: 'record', route: '/nowhere/x' }] })).toHaveLength(2)
  })

  test('records must be an array', () => {
    expect(() => sitemapEntries(content(), { records: { entries: [] } })).toThrow(TypeError)
    expect(sitemapEntries(content(), { records: null })).toHaveLength(2)
  })
})

describe('sitemapEntries — a site in several languages', () => {
  const translations = { fr: { '/books': '/livres' } }
  const multilingual = (config = {}) =>
    content([page('/books/:slug', { isDynamic: true, sections: body() })], {
      languages: ['en', 'fr'],
      i18n: { routeTranslations: translations },
      ...config,
    })

  test('⭐ each page carries its URL in each language, and the default as x-default', () => {
    const [, books] = sitemapEntries(multilingual())
    expect(books.alternates).toEqual([
      { hreflang: 'en', url: `${ADDRESS}books/` },
      { hreflang: 'fr', url: `${ADDRESS}fr/livres/` },
      { hreflang: 'x-default', url: `${ADDRESS}books/` },
    ])
  })

  test('⭐ another language’s content is listed at that language’s URLs', () => {
    const french = sitemapEntries(multilingual({ activeLocale: 'fr' }), { records: [{ type: 'record', route: '/books/dune' }] })
    expect(locs(french)).toEqual([`${ADDRESS}fr/`, `${ADDRESS}fr/livres/`, `${ADDRESS}fr/livres/dune/`])
    // told the language, as a host holding each language's content apart tells it
    expect(locs(sitemapEntries(multilingual(), { locale: 'fr' }))).toEqual([`${ADDRESS}fr/`, `${ADDRESS}fr/livres/`])
  })

  test('a payload whose pages carry the language’s own routes lists the same URLs', () => {
    const french = site(
      [
        page('/', { isIndex: true, sections: body() }),
        page('/livres', { sections: body() }),
      ],
      { defaultLanguage: 'en', url: ADDRESS, trailingSlash: true, languages: ['en', 'fr'], i18n: { routeTranslations: translations }, activeLocale: 'fr' }
    )
    expect(locs(sitemapEntries(french))).toEqual([`${ADDRESS}fr/`, `${ADDRESS}fr/livres/`])
  })

  test('a language on a domain of its own is listed there', () => {
    const french = sitemapEntries(multilingual({ activeLocale: 'fr', domainLocales: { 'fr.example.com': 'fr' } }))
    expect(locs(french)).toEqual(['https://fr.example.com/', 'https://fr.example.com/livres'])
  })

  test('⭐ content served on a domain pinned to another language lists the URLs the address serves', () => {
    // fr.example.com serves French unprefixed and English at /en/…; the address serves English unprefixed
    const served = (activeLocale) => multilingual({ activeLocale, domainLocale: 'fr', domainLocales: { 'fr.example.com': 'fr' } })
    expect(locs(sitemapEntries(served('en')))).toEqual([ADDRESS, `${ADDRESS}books/`])
    const [, books] = sitemapEntries(served('fr'))
    expect(books.alternates).toEqual([
      { hreflang: 'en', url: `${ADDRESS}books/` },
      { hreflang: 'fr', url: 'https://fr.example.com/livres' },
      { hreflang: 'x-default', url: `${ADDRESS}books/` },
    ])
  })
})

describe('renderSitemap', () => {
  test('one url per entry, escaped; the xhtml namespace only when an entry has alternates', () => {
    const xml = renderSitemap([{ loc: 'https://example.com/a?b=1&c=2', alternates: [], lastmod: null }])
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '  <url>\n    <loc>https://example.com/a?b=1&amp;c=2</loc>\n  </url>\n</urlset>\n'
    )
    const withAlternates = renderSitemap([
      { loc: 'https://example.com/', alternates: [{ hreflang: 'fr', url: 'https://example.com/fr/' }], lastmod: '2026-10-20', changefreq: 'daily', priority: 0.5 },
    ])
    expect(withAlternates).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(withAlternates).toContain(
      '    <loc>https://example.com/</loc>\n    <lastmod>2026-10-20</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.5</priority>\n' +
        '    <xhtml:link rel="alternate" hreflang="fr" href="https://example.com/fr/" />\n'
    )
  })

  test('every language in one file, a URL listed once', () => {
    const multilingual = content([], { languages: ['en', 'fr'] })
    const entries = [...sitemapEntries(multilingual), ...sitemapEntries(multilingual, { locale: 'fr' }), ...sitemapEntries(multilingual)]
    const xml = renderSitemap(entries)
    expect(xml.match(/<loc>/g)).toHaveLength(4)
    expect(xml).toContain(`<loc>${ADDRESS}fr/books/</loc>`)
  })

  test('⭐ none, when there is nothing to list — a sitemap must list a URL', () => {
    expect(renderSitemap([])).toBeNull()
    expect(renderSitemap(sitemapEntries(content([], { url: undefined })))).toBeNull()
    expect(() => renderSitemap(null)).toThrow(TypeError)
  })
})

describe('deterministic', () => {
  test('one input, one output, and the input is left as it was', () => {
    const input = content([page('/books/:slug', { isDynamic: true, sections: body() })], { languages: ['en', 'fr'] })
    const records = [{ type: 'record', route: '/books/dune' }]
    const before = structuredClone(input)
    const xml = renderSitemap(sitemapEntries(input, { records }))
    expect(renderSitemap(sitemapEntries(structuredClone(input), { records: structuredClone(records) }))).toBe(xml)
    expect(input).toEqual(before)
  })
})
