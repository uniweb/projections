/**
 * The site's not-found page is the answer for a URL that names no page, never a page of its own:
 * `resolveRoute` answers `/404` with `notFound` (`@uniweb/core/resolve-route`). A static build holds
 * it apart, as `content.notFound`; content may carry it among its pages, at `/404`, and core reads
 * either shape the same. So does every projection that describes the site's pages.
 *
 * ⛔ Until 2026-10-27 the shared selector listed a not-found page carried among the pages: `llms.txt`
 * linked `/404.md`, which `resolveMarkdownRequest` answers with `notFound`, and the search index and
 * the corpus described it. Measured by a host on a site's content as served.
 */

import { describe, it, expect } from 'vitest'
import { resolveRoute } from '@uniweb/core/resolve-route'
import { renderSiteIndex } from '../src/site-index.js'
import { resolveMarkdownRequest } from '../src/markdown-request.js'
import { selectIndexablePages } from '../src/pages.js'
import { selectCorpusPages } from '../src/corpus.js'
import { sitemapEntries } from '../src/sitemap.js'
import { generateSearchIndex } from '../src/search/index.js'
import { page, section, site } from './helpers.js'

const notFound = page('/404', { title: 'Page not found', sections: [section('Nothing lives at this address.')] })
const pages = [
  page('/', { title: 'Home', isIndex: true, sections: [section('Welcome.')] }),
  page('/events', { title: 'Events', sections: [section('What is on.')] }),
]
const config = { url: 'https://demo.example/', languages: ['en', 'fr'], defaultLanguage: 'en' }

/** The not-found page among the pages, as a host may serve the content. */
const carried = (activeLocale) => site([...pages, notFound], { ...config, activeLocale })
/** The not-found page held apart, as a static build collects it. */
const held = (activeLocale) => ({ ...site(pages, { ...config, activeLocale }), notFound })

const linksOf = (index) => [...index.matchAll(/\]\(([^)]+)\)/g)].map(([, url]) => new URL(url).pathname)
const routesOf = (list) => list.map((p) => p.route)

describe('the not-found page is no page of the site', () => {
  it('its route answers 404, with it, and the sitemap leaves it out', () => {
    const answer = resolveRoute(carried('en'), '/404')
    expect(answer.kind).toBe('notFound')
    expect(answer.page.title).toBe('Page not found')
    expect(routesOf(sitemapEntries(carried('en')))).toEqual(['/', '/events'])
  })

  it.each(['en', 'fr'])('llms.txt links only what answers with its page (%s)', (locale) => {
    const content = carried(locale)
    const index = renderSiteIndex(content)
    const links = linksOf(index)
    expect(links).toHaveLength(2)
    for (const link of links) expect(resolveMarkdownRequest(content, link).kind).toBe('page')
    expect(index).not.toContain('Page not found')
  })

  it('carried among the pages or held apart, the index is the same', () => {
    expect(renderSiteIndex(carried('fr'))).toBe(renderSiteIndex(held('fr')))
  })

  it('no markdown is made of it', () => {
    expect(routesOf(selectIndexablePages(carried('en').pages))).toEqual(['/', '/events'])
  })

  it('the search index does not offer it', () => {
    const index = generateSearchIndex(carried('en'), { locale: 'en' })
    expect([...new Set(index.entries.map((entry) => entry.route))]).toEqual(['/', '/events'])
    expect(JSON.stringify(index)).not.toContain('Nothing lives at this address.')
  })

  it('nor does the corpus', () => {
    expect(routesOf(selectCorpusPages(carried('en').pages))).toEqual(['/', '/events'])
  })
})
