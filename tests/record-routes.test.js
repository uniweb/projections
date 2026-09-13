import { describe, it, expect } from 'vitest'
import { recordRoutes } from '../src/record-routes.js'

/**
 * `recordRoutes(content)` — which queries become detail pages, and the base a
 * record's URL composes onto. Asked for by hosting (2026-09-12) to replace a read
 * of `page.parentSchema`, a field with two producers whose presence depended on
 * which lane published the site.
 *
 * The requirement that shapes the selection: every route it returns must be one a
 * record can actually be addressed at. A base that still holds a `:param` produces
 * a link that ranks in an index and 404s on click.
 */
const site = (pages, config = {}) => ({ pages, config })
const list = (route, as) => ({ route, fetch: { query: as, path: `/data/${as}.json`, as } })

describe('recordRoutes', () => {
  it('pairs a parametric page with its route query, at the base a record composes onto', () => {
    const content = site([
      list('/blog', 'articles'),
      { route: '/blog/:slug', parent: '/blog', isDynamic: true },
    ])
    expect(recordRoutes(content)).toMatchObject([{ name: 'articles', route: '/blog' }])
  })

  it('returns the query\'s compiled data file, so a consumer templates no filename', () => {
    const content = site([
      list('/blog', 'articles'),
      { route: '/blog/:slug', parent: '/blog', isDynamic: true },
    ])
    expect(recordRoutes(content)).toEqual([{ name: 'articles', route: '/blog', path: '/data/articles.json' }])
  })

  it('⛔ omits `path` when the query has no compiled file — a records-service project or a remote url', () => {
    const live = site([
      { route: '/members', fetch: { query: 'members', as: 'members' } },
      { route: '/members/:slug', parent: '/members', isDynamic: true },
    ])
    expect(recordRoutes(live)).toEqual([{ name: 'members', route: '/members' }])

    // an external query: its binding carries a derived `path`, and there is no file behind it
    const external = site([
      { route: '/items', fetch: { query: 'items', path: '/data/items.json', as: 'items' } },
      { route: '/items/:id', parent: '/items', isDynamic: true },
    ])
    external.config = { ...external.config, queries: { items: { url: 'https://api.example.com/items' } } }
    expect(recordRoutes(external)).toEqual([{ name: 'items', route: '/items' }])
  })

  it('a catch-all page is a record page too', () => {
    const content = site([
      list('/docs', 'guides'),
      { route: '/docs/:path*', parent: '/docs', isDynamic: true },
    ])
    expect(recordRoutes(content)).toEqual([{ name: 'guides', route: '/docs', path: '/data/guides.json' }])
  })

  it('⛔ a page NESTED inside a parametric one contributes nothing — even when it declares its OWN query', () => {
    // ⚠️ The nested page carries its own query deliberately. Without it this case
    // passes for the wrong reason: a nested page with no query resolves no route
    // query either, so the test would stay green even if the SELECTION rule let it
    // through. Measured — an earlier version of this test did exactly that.
    const content = site([
      list('/members', 'people'),
      { route: '/members/:slug', parent: '/members', isDynamic: true },
      { route: '/members/:slug/cv', parent: '/members/:slug', isDynamic: true, fetch: { query: 'cvs', as: 'cvs' } },
    ])
    const out = recordRoutes(content)
    expect(out).toEqual([{ name: 'people', route: '/members', path: '/data/people.json' }])
    // The requirement behind the rule: a record must be addressable at what we return.
    expect(out.every((entry) => !entry.route.includes(':'))).toBe(true)
  })

  it('a page that only fetches to render itself contributes nothing', () => {
    expect(recordRoutes(site([list('/', 'articles'), list('/team', 'people')]))).toEqual([])
  })

  it('reads the query from the page itself, or the site, when the parent declares none', () => {
    const own = site([
      { route: '/blog' },
      { route: '/blog/:slug', parent: '/blog', fetch: { query: 'articles', as: 'articles' } },
    ])
    expect(recordRoutes(own)).toEqual([{ name: 'articles', route: '/blog' }])

    const fromSite = site(
      [{ route: '/blog' }, { route: '/blog/:slug', parent: '/blog' }],
      { fetch: { query: 'articles', as: 'articles' } }
    )
    expect(recordRoutes(fromSite)).toEqual([{ name: 'articles', route: '/blog' }])
  })

  it('reads the key a page\'s own sections share when no level declares one', () => {
    const content = site([
      { route: '/blog' },
      {
        route: '/blog/:slug',
        parent: '/blog',
        sections: [{ fetch: { query: 'articles', as: 'articles' } }, { fetch: { query: 'articles', as: 'articles' } }],
      },
    ])
    expect(recordRoutes(content)).toEqual([{ name: 'articles', route: '/blog' }])
  })

  it('one entry per query — the first parametric page in page order wins', () => {
    const content = site([
      list('/blog', 'articles'),
      { route: '/blog/:slug', parent: '/blog', isDynamic: true },
      list('/news', 'articles'),
      { route: '/news/:slug', parent: '/news', isDynamic: true },
    ])
    expect(recordRoutes(content)).toEqual([{ name: 'articles', route: '/blog', path: '/data/articles.json' }])
  })

  it('a root-level parametric page composes onto /', () => {
    const content = site([{ route: '/:slug', fetch: { query: 'pages', as: 'pages' } }])
    expect(recordRoutes(content)).toEqual([{ name: 'pages', route: '/' }])
  })

  it('no pages, no content, nothing parametric — an empty list, never a throw', () => {
    expect(recordRoutes(undefined)).toEqual([])
    expect(recordRoutes({})).toEqual([])
    expect(recordRoutes(site([{ route: '/blog/:slug' }]))).toEqual([])
  })
})
