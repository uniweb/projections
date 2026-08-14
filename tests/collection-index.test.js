/**
 * `generateCollectionIndex` — the entries behind a dynamic route.
 *
 * The function was exported, re-exported by `@uniweb/build`, and never called
 * by either lane, so nothing had ever fed it the shape the build actually
 * emits. Two defects were sitting in that gap, and both fail *quietly*:
 *
 *   1. The cascade file `data/{name}.json` is written as a BARE ARRAY
 *      (`writeCollectionFiles` → `JSON.stringify(items)`). Reading
 *      `collectionData.items` off it yields `undefined` → an index with zero
 *      entries and no error.
 *   2. Each entry's link was recomputed as `${config.route}/${slug}` while the
 *      build had already stamped `item.route` using its own normalization — so
 *      a `route:` authored with a trailing slash produced `/blog//my-post`
 *      here and `/blog/my-post` there.
 *
 * Both produce output that ranks and renders correctly and only fails when a
 * visitor clicks, which is why they are pinned rather than left to a caller.
 */

import { describe, test, expect } from 'vitest'
import { generateCollectionIndex } from '../src/search/collections.js'

const config = { route: '/blog', search: { fields: ['title'] } }

// Exactly what the build emits: a bare array whose records already carry
// `route`, stamped by `collectItems` when `collections[name].route` is set.
const emitted = [
  { slug: 'my-post', title: 'My Post', route: '/blog/my-post' },
  { slug: 'other', title: 'Other', route: '/blog/other' },
]

describe('the cascade shape the build actually writes', () => {
  test('reads a bare array — the emitted form', () => {
    const index = generateCollectionIndex('articles', config, emitted, 'en')
    expect(index.entries).toHaveLength(2)
    expect(index.entries[0].id).toBe('collection:articles:my-post')
  })

  test('still reads an { items } envelope, for a host that carries one', () => {
    const index = generateCollectionIndex('articles', config, { items: emitted }, 'en')
    expect(index.entries).toHaveLength(2)
  })

  test('an empty or absent collection yields no entries, not a throw', () => {
    expect(generateCollectionIndex('articles', config, [], 'en').entries).toEqual([])
    expect(generateCollectionIndex('articles', config, null, 'en').entries).toEqual([])
  })
})

describe('the link — the record’s own route wins', () => {
  test('uses item.route when the build stamped one', () => {
    const index = generateCollectionIndex('articles', config, emitted, 'en')
    expect(index.entries.map(e => e.route)).toEqual(['/blog/my-post', '/blog/other'])
  })

  // The divergence that motivated reading rather than recomputing: the build
  // strips the trailing slash, so composing here without stripping disagrees.
  test('never disagrees with the build over a trailing slash', () => {
    const withSlash = { ...config, route: '/blog/' }
    const index = generateCollectionIndex('articles', withSlash, emitted, 'en')
    expect(index.entries[0].route).toBe('/blog/my-post')

    // And when the record carries no route, the fallback normalizes the same way.
    const bare = [{ slug: 'my-post', title: 'My Post' }]
    const composed = generateCollectionIndex('articles', withSlash, bare, 'en')
    expect(composed.entries[0].route).toBe('/blog/my-post')
  })

  test('composes from config.route for records that arrived without one', () => {
    const bare = [{ slug: 'my-post', title: 'My Post' }]
    const index = generateCollectionIndex('articles', config, bare, 'en')
    expect(index.entries[0].route).toBe('/blog/my-post')
  })

  // A missing key is detectable; "undefined/my-post" is a link that ranks
  // correctly, looks plausible in results, and 404s on click.
  test('omits route entirely when neither source can supply one', () => {
    const bare = [{ slug: 'my-post', title: 'My Post' }]
    const index = generateCollectionIndex('articles', { search: {} }, bare, 'en')
    expect(index.entries[0]).not.toHaveProperty('route')
    expect(JSON.stringify(index)).not.toContain('undefined')
  })
})
