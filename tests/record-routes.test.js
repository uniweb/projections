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
    expect(recordRoutes(content)).toEqual([{ name: 'articles', route: '/blog', pattern: '/blog/:slug', path: '/data/articles.json' }])
  })

  it('⛔ omits `path` when the query has no compiled file — a records-service project or a remote url', () => {
    const live = site([
      { route: '/members', fetch: { query: 'members', as: 'members' } },
      { route: '/members/:slug', parent: '/members', isDynamic: true },
    ])
    expect(recordRoutes(live)).toEqual([{ name: 'members', route: '/members', pattern: '/members/:slug' }])

    // an external query: its binding carries a derived `path`, and there is no file behind it
    const external = site([
      { route: '/items', fetch: { query: 'items', path: '/data/items.json', as: 'items' } },
      { route: '/items/:id', parent: '/items', isDynamic: true },
    ])
    external.config = { ...external.config, queries: { items: { url: 'https://api.example.com/items' } } }
    expect(recordRoutes(external)).toEqual([{ name: 'items', route: '/items', pattern: '/items/:id' }])
  })

  it('a catch-all page is a record page too', () => {
    const content = site([
      list('/docs', 'guides'),
      { route: '/docs/:path*', parent: '/docs', isDynamic: true },
    ])
    expect(recordRoutes(content)).toEqual([{ name: 'guides', route: '/docs', pattern: '/docs/:path*', path: '/data/guides.json' }])
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
    expect(out).toEqual([{ name: 'people', route: '/members', pattern: '/members/:slug', path: '/data/people.json' }])
    // The requirement behind the rule: a record must be addressable at what we return.
    expect(out.every((entry) => !entry.route.includes(':'))).toBe(true)
  })

  it('a page that only fetches to render itself contributes nothing', () => {
    expect(recordRoutes(site([list('/', 'articles'), list('/team', 'people')]))).toEqual([])
  })

  it('reads the query from the page itself, or — for a top-level page — the site, when the parent declares none', () => {
    const own = site([
      { route: '/blog' },
      { route: '/blog/:slug', parent: '/blog', fetch: { query: 'articles', as: 'articles' } },
    ])
    expect(recordRoutes(own)).toEqual([{ name: 'articles', route: '/blog', pattern: '/blog/:slug' }])

    const fromSite = site([{ route: '/:slug' }], { fetch: { query: 'articles', as: 'articles' } })
    expect(recordRoutes(fromSite)).toEqual([{ name: 'articles', route: '/', pattern: '/:slug' }])

    // ⛔ the site's binding is no deeper page's route query (ruled 2026-09-13)
    const deeper = site(
      [{ route: '/blog' }, { route: '/blog/:slug', parent: '/blog' }],
      { fetch: { query: 'articles', as: 'articles' } }
    )
    expect(recordRoutes(deeper)).toEqual([])
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
    expect(recordRoutes(content)).toEqual([{ name: 'articles', route: '/blog', pattern: '/blog/:slug' }])
  })

  it('one entry per query — the first parametric page in page order wins', () => {
    const content = site([
      list('/blog', 'articles'),
      { route: '/blog/:slug', parent: '/blog', isDynamic: true },
      list('/news', 'articles'),
      { route: '/news/:slug', parent: '/news', isDynamic: true },
    ])
    expect(recordRoutes(content)).toEqual([{ name: 'articles', route: '/blog', pattern: '/blog/:slug', path: '/data/articles.json' }])
  })

  it('a root-level parametric page composes onto /', () => {
    const content = site([{ route: '/:slug', fetch: { query: 'pages', as: 'pages' } }])
    expect(recordRoutes(content)).toEqual([{ name: 'pages', route: '/', pattern: '/:slug' }])
  })

  it('no pages, no content, nothing parametric — an empty list, never a throw', () => {
    expect(recordRoutes(undefined)).toEqual([])
    expect(recordRoutes({})).toEqual([])
    expect(recordRoutes(site([{ route: '/blog/:slug' }]))).toEqual([])
  })
})

describe('a record search entry fills its URL from the page\'s pattern (2026-09-14)', async () => {
  const { generateRecordSearchIndex } = await import('../src/search/records.js')
  const records = [
    { slug: 'river-survey', title: 'River survey', path: 'field' },
    { slug: 'welcome', title: 'Welcome', path: '' },
    { title: 'No handle' },
  ]

  it('⭐ a `[...path]` page: the record\'s placement is part of its URL, as `$route` has it', () => {
    const [entry] = recordRoutes(site([list('/logbook', 'logbook'), { route: '/logbook/:path*', parent: '/logbook', isDynamic: true }]))
    const index = generateRecordSearchIndex('logbook', entry, records, 'en')
    expect(index.entries.map((e) => e.route)).toEqual(['/logbook/field/river-survey', '/logbook/welcome', undefined])
  })

  it('a `[slug]` page — and a record\'s own `route` field is the author\'s, never its URL', () => {
    const [entry] = recordRoutes(site([list('/blog', 'articles'), { route: '/blog/:slug', parent: '/blog', isDynamic: true }]))
    const index = generateRecordSearchIndex('articles', entry, [{ slug: 'a post', title: 'A', route: 'north-trail' }], 'en')
    expect(index.entries[0].route).toBe('/blog/a%20post')
  })

  it('CONTROL — without a pattern, the older composition stands: the record\'s `route`, else `{route}/{slug}`', () => {
    const index = generateRecordSearchIndex('articles', { route: '/blog' }, [{ slug: 'x', title: 'X' }, { slug: 'y', title: 'Y', route: '/baked/y' }], 'en')
    expect(index.entries.map((e) => e.route)).toEqual(['/blog/x', '/baked/y'])
  })
})
