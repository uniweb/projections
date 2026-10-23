import { describe, it, expect } from 'vitest'
import { resolveRoute } from '@uniweb/core/resolve-route'
import { buildPageUrl, resolveMarkdownRequest } from '../src/index.js'

/**
 * `resolveMarkdownRequest` — what a request for a page's markdown names. It is `resolveRoute`'s
 * answer for the page the `.md` path names, read as the visitor asked for it, locale prefix kept.
 */
const routeTranslations = { fr: { '/blog': '/blogue' } }
const pages = [
  { route: '/', title: 'Home', sections: [{}] },
  { route: '/blog', title: 'Blog', sections: [{}] },
  { route: '/docs', title: 'Docs', hasContent: false },
  { route: '/docs/intro', title: 'Intro', sections: [{}] },
  { route: '/old', title: 'Old', redirect: '/blog#latest', sections: [{}] },
  { route: '/brochure', title: 'Brochure', redirect: '/files/brochure.pdf', sections: [{}] },
  { route: '/away', title: 'Away', redirect: 'https://example.com/elsewhere', sections: [{}] },
]
const content = (activeLocale) => ({
  pages,
  config: { languages: ['en', 'fr'], defaultLanguage: 'en', activeLocale, i18n: { routeTranslations } },
})
const en = content('en')
const fr = content('fr')

describe('resolveMarkdownRequest', () => {
  it('names the page a .md path names, at the root of the site and of a locale', () => {
    expect(resolveMarkdownRequest(en, '/index.md')).toMatchObject({ kind: 'page', route: '/' })
    expect(resolveMarkdownRequest(en, '/blog.md')).toMatchObject({ kind: 'page', route: '/blog' })
    expect(resolveMarkdownRequest(fr, '/fr/index.md')).toMatchObject({ kind: 'page', route: '/' })
    expect(resolveMarkdownRequest(fr, '/fr/blogue.md')).toMatchObject({ kind: 'page', route: '/blog' })
    expect(resolveMarkdownRequest(fr, '/fr/docs/intro.md')).toMatchObject({ kind: 'page', route: '/docs/intro' })
  })

  it('answers every markdown link the site index makes with its page', () => {
    for (const [locale, site] of [['en', en], ['fr', fr]]) {
      for (const route of ['/', '/blog', '/docs/intro']) {
        const url = buildPageUrl(route, { locale, defaultLocale: 'en', routeTranslations })
        expect(resolveMarkdownRequest(site, url), url).toMatchObject({ kind: 'page', route })
      }
    }
  })

  it("sends a redirect to the markdown of the page it goes to, where the page's own answer goes to the HTML", () => {
    expect(resolveMarkdownRequest(fr, '/fr/blog.md')).toMatchObject({ kind: 'redirect', status: 301, location: '/fr/blogue.md' })
    // The composition this replaces: the prefix stripped, the rest resolved.
    expect(resolveRoute(fr, '/blog', { activeLocale: 'fr' })).toMatchObject({ kind: 'redirect', location: '/fr/blogue' })

    // The unprefixed locale asked for with its prefix, a container, and an authored redirect.
    expect(resolveMarkdownRequest(en, '/en/blog.md')).toMatchObject({ status: 301, location: '/blog.md' })
    expect(resolveMarkdownRequest(fr, '/fr/docs.md')).toMatchObject({ status: 302, location: '/fr/docs/intro.md' })
    expect(resolveMarkdownRequest(en, '/old.md')).toMatchObject({ status: 302, location: '/blog.md#latest' })
  })

  it('leaves a redirect to anything but a page of the site as written', () => {
    expect(resolveMarkdownRequest(en, '/brochure.md')).toMatchObject({ kind: 'redirect', location: '/files/brochure.pdf' })
    expect(resolveMarkdownRequest(en, '/away.md')).toMatchObject({ kind: 'redirect', location: 'https://example.com/elsewhere' })
  })

  it('answers not found for a .md path that names no page', () => {
    expect(resolveMarkdownRequest(en, '/nope.md')).toMatchObject({ kind: 'notFound', status: 404 })
    expect(resolveMarkdownRequest(fr, '/fr/nope.md')).toMatchObject({ kind: 'notFound' })
  })

  it('says null for a path that is not a .md path', () => {
    for (const path of ['/blog', '/fr/', '/fr/.md', '/blog.html']) {
      expect(resolveMarkdownRequest(en, path), path).toBeNull()
    }
  })
})
