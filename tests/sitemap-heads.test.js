/**
 * ⭐ THE SITEMAP AND THE PAGES CANNOT DISAGREE — the guard for `src/sitemap.js`, whose rule reads a
 * site's content alone, while each page's `<head>` is written from core's Page (`Page#getHeadMeta`).
 *
 * For each language of a site: every entry is a page whose head states the entry's URL as its
 * canonical and the entry's alternates as its hreflang; and the entries are exactly the pages a
 * static build wrote and listed by their heads — its rule until 2026-10-25, kept here as the
 * oracle. A change to how a page states its URL that the sitemap's rule does not follow fails here.
 */

import { Website } from '@uniweb/core'
import { sitemapEntries } from '../src/sitemap.js'
import { page, container, section } from './helpers.js'

const ADDRESS = 'https://example.com/'
const body = () => [section('# Body\n\nText.')]
const RECORDS = [
  { type: 'record', route: '/books/dune' },
  { type: 'record', route: '/books/emma' },
]

/** One language's content, as a static build holds it: canonical routes, its language active. */
function content(activeLocale, config = {}) {
  return {
    config: {
      name: 'Site',
      defaultLanguage: 'en',
      languages: ['en', 'fr', 'es'],
      i18n: { routeTranslations: { fr: { '/books': '/livres', '/about': '/a-propos' }, es: { '/books': '/libros' } } },
      url: ADDRESS,
      trailingSlash: true,
      activeLocale,
      ...config,
    },
    theme: {},
    pages: [
      page('/', { isIndex: true, title: 'Home', sections: body(), lastModified: '2026-10-20T10:00:00.000Z' }),
      page('/about', { sections: body(), seo: { changefreq: 'monthly', priority: 0.4 } }),
      page('/books', { sections: body() }),
      page('/books/:slug', { isDynamic: true, sections: body(), seo: { changefreq: 'weekly' } }),
      container('/docs', 'Docs'),
      page('/docs/intro', { isIndex: true, sections: body() }),
      page('/docs/guide', { sections: body() }),
      container('/guide', 'Guide'),
      page('/guide/start', { sections: body() }),
      page('/articles/index', { isIndex: true, sections: body() }),
      container('/empty', 'Empty'),
      page('/moved', { sections: body(), redirect: '/about' }),
      page('/proxy', { sections: body(), rewrite: 'https://other.example/' }),
      page('/secret', { sections: body(), seo: { noindex: true } }),
      page('/old', { sections: body(), seo: { canonical: '/about' } }),
      page('/self', { sections: body(), seo: { canonical: `${ADDRESS}self/` } }),
    ],
  }
}

/** What a static build wrote and listed until 2026-10-25: each page it wrote, by its head. */
function listedByHeads(website, recordRoutes) {
  const out = []
  const list = (rendered) => {
    const meta = rendered.getHeadMeta()
    if (!meta.canonical || meta.robots?.includes('noindex')) return
    const own = website.getPageUrl(rendered)
    if (!own || meta.canonical !== own) return
    if (!out.some((entry) => entry.loc === own)) out.push({ loc: own, alternates: meta.alternates })
  }
  for (const p of website.pages) {
    if (p.route.includes(':') || p.redirect || p.rewrite) continue
    if (!p.hasContent()) {
      const target = p.getNavigableRoute()
      if (target && target !== p.route) continue
    }
    list(p.getRenderableSelf())
  }
  for (const route of recordRoutes) list(website.getPage(route))
  return out
}

const byLoc = (a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0)

describe.each(['en', 'fr', 'es'])('the sitemap and the pages agree — %s', (locale) => {
  const siteContent = content(locale)
  const website = new Website({ content: structuredClone(siteContent) })
  const entries = sitemapEntries(siteContent, { records: RECORDS })

  test('⭐ every entry is a page whose head states its URL and its alternates', () => {
    expect(entries.length).toBeGreaterThan(5)
    for (const entry of entries) {
      const rendered = website.getPage(entry.route)?.getRenderableSelf()
      expect(rendered, entry.route).toBeTruthy()
      const meta = rendered.getHeadMeta()
      expect(meta.canonical, entry.route).toBe(entry.loc)
      expect(meta.alternates, entry.route).toEqual(entry.alternates)
      expect(meta.robots, entry.route).toBeNull()
    }
  })

  test('⭐ the entries are the pages a static build listed by their heads', () => {
    const fromHeads = listedByHeads(website, RECORDS.map((record) => record.route)).sort(byLoc)
    expect(entries.map(({ loc, alternates }) => ({ loc, alternates })).sort(byLoc)).toEqual(fromHeads)
  })
})

describe('the sitemap and the pages agree — the cases that move a URL', () => {
  test('a site whose pages end without a slash, served at its host’s root', () => {
    const siteContent = content('fr', { trailingSlash: undefined, url: 'https://example.org' })
    const website = new Website({ content: structuredClone(siteContent) })
    const entries = sitemapEntries(siteContent, { records: RECORDS })
    expect(entries.map(({ loc, alternates }) => ({ loc, alternates })).sort(byLoc)).toEqual(
      listedByHeads(website, RECORDS.map((record) => record.route)).sort(byLoc)
    )
    expect(entries.map((entry) => entry.loc)).toContain('https://example.org/fr/livres/dune')
  })

  test('a site kept out of search lists nothing, and its pages say so', () => {
    const siteContent = content('en', { seo: { noindex: true } })
    const website = new Website({ content: structuredClone(siteContent) })
    expect(sitemapEntries(siteContent, { records: RECORDS })).toEqual([])
    expect(listedByHeads(website, [])).toEqual([])
  })
})
