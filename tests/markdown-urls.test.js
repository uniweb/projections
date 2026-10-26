/**
 * Where each page's markdown is, for its head to link — the links the index gives.
 *
 * The parity block is the point: a page's head and the site index name one document, so an agent
 * reaches the same markdown whichever it starts from. The rest pins which pages get an address at
 * all, since a link to a file the build never wrote is worse than no link.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { pageMarkdownUrls } from '../src/markdown-urls.js'
import { renderSiteIndex } from '../src/site-index.js'
import { page, container, section, site } from './helpers.js'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/** The index's links, as `route → url` read back from its entries. */
function indexLinks(content, options) {
  return [...renderSiteIndex(content, options).matchAll(/^- \[[^\]]*\]\(([^)]+)\)/gm)].map((m) => m[1])
}

const PAGES = [
  page('/', { title: 'Home', sections: [section('# Home\n\nWelcome.')] }),
  container('/docs', 'Docs'),
  page('/docs/intro', { title: 'Intro', sections: [section('# Intro\n\nStart here.')] }),
  page('/blog', { title: 'Blog', sections: [section('# Blog')] }),
]

describe('⭐ parity — a page’s head names the document the index links', () => {
  for (const [label, config, indexOptions] of [
    ['with no address', {}, {}],
    ['on the site’s address', { url: 'https://example.com/handbook/' }, {}],
    ['under a base path', { base: '/handbook/' }, {}],
    [
      'in a locale other than the default, with translated routes',
      {
        languages: ['en', 'fr'],
        defaultLanguage: 'en',
        activeLocale: 'fr',
        i18n: { routeTranslations: { fr: { '/blog': '/blogue' } } },
      },
      // What the build passes for a locale's content (`languageOf` in @uniweb/build).
      { locale: 'fr', defaultLocale: 'en' },
    ],
  ]) {
    it(label, () => {
      const content = site(PAGES, config)
      expect([...pageMarkdownUrls(content).values()].sort()).toEqual(indexLinks(content, indexOptions).sort())
    })
  }
})

describe('the address', () => {
  it('is root-relative when the site’s address is unknown, and the root is index.md', () => {
    const urls = pageMarkdownUrls(site(PAGES))
    expect(urls.get('/')).toBe('/index.md')
    expect(urls.get('/docs/intro')).toBe('/docs/intro.md')
  })

  it('is absolute on the site’s address when the content states one', () => {
    const urls = pageMarkdownUrls(site(PAGES, { url: 'https://example.com/handbook/' }))
    expect(urls.get('/docs/intro')).toBe('https://example.com/handbook/docs/intro.md')
  })

  it('carries the locale’s prefix and its translated route', () => {
    const urls = pageMarkdownUrls(
      site(PAGES, {
        languages: ['en', 'fr'],
        defaultLanguage: 'en',
        activeLocale: 'fr',
        i18n: { routeTranslations: { fr: { '/blog': '/blogue' } } },
      })
    )
    expect(urls.get('/blog')).toBe('/fr/blogue.md')
    expect(urls.get('/')).toBe('/fr/index.md')
  })

  it('has no locale prefix in the default locale', () => {
    const urls = pageMarkdownUrls(site(PAGES, { languages: ['en', 'fr'], defaultLanguage: 'en', activeLocale: 'en' }))
    expect(urls.get('/blog')).toBe('/blog.md')
  })
})

describe('which pages have one', () => {
  it('none when `agents:` turns markdown off, in either spelling', () => {
    expect(pageMarkdownUrls(site(PAGES, { agents: false })).size).toBe(0)
    expect(pageMarkdownUrls(site(PAGES, { agents: { markdown: false } })).size).toBe(0)
  })

  it('every listed page when only the index is turned off — the files are still written', () => {
    expect(pageMarkdownUrls(site(PAGES, { agents: { index: false } })).has('/docs/intro')).toBe(true)
  })

  it('not a container, which has no body to project', () => {
    expect(pageMarkdownUrls(site(PAGES)).has('/docs')).toBe(false)
  })

  it('not a page the index leaves out', () => {
    const urls = pageMarkdownUrls(
      site(
        [
          ...PAGES,
          page('/internal/notes', { title: 'Notes' }),
          page('/secret', { title: 'Secret', seo: { noindex: true } }),
          page('/draft', { title: 'Draft', hidden: true }),
          page('/blog/:slug', { title: 'Post', isDynamic: true }),
          page('/docs/_wip', { title: 'WIP' }),
          page('/kb', { title: 'KB', knowledge: true }),
          page('/kb/answers', { title: 'Answers' }),
        ],
        { agents: { exclude: ['/internal'] } }
      )
    )
    for (const route of ['/internal/notes', '/secret', '/draft', '/blog/:slug', '/docs/_wip', '/kb', '/kb/answers']) {
      expect(urls.has(route), route).toBe(false)
    }
    expect(urls.has('/docs/intro')).toBe(true)
  })

  it('not a page under a container the index leaves out', () => {
    const urls = pageMarkdownUrls(
      site([
        page('/private', { title: 'Private', hasContent: false, seo: { noindex: true } }),
        page('/private/page', { title: 'Page' }),
      ])
    )
    expect(urls.has('/private/page')).toBe(false)
  })

  it('none for content with no pages', () => {
    expect(pageMarkdownUrls(site([])).size).toBe(0)
    expect(pageMarkdownUrls(undefined).size).toBe(0)
  })
})

/** Every package a module reaches, through its own relative imports and theirs. */
function packagesReachedFrom(file, seen = new Set(), found = new Set()) {
  if (seen.has(file)) return found
  seen.add(file)
  const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const [, spec] of code.matchAll(/\b(?:import|export)\s+[^'"]*from\s*['"]([^'"]+)['"]/g)) {
    if (spec.startsWith('.')) packagesReachedFrom(resolve(dirname(file), spec), seen, found)
    else found.add(spec)
  }
  return found
}

describe('the subpath the runtime imports', () => {
  it('reaches no renderer — every browser that boots a site downloads what it imports', () => {
    expect([...packagesReachedFrom(join(SRC, 'markdown-urls.js'))].sort()).toEqual([
      '@uniweb/core/locale-config',
      '@uniweb/core/site-address',
    ])
  })

  it('CONTROL — the walk reaches a renderer from a module that has one', () => {
    expect(packagesReachedFrom(join(SRC, 'index.js')).has('@uniweb/content-writer')).toBe(true)
  })
})
