/**
 * `generateRecordSearchIndex` — the entries behind a dynamic route.
 *
 * The function was exported, re-exported by `@uniweb/build`, and never called
 * by either lane, so nothing had ever fed it the shape the build actually
 * emits. Two defects were sitting in that gap, and both fail *quietly*:
 *
 *   1. The cascade file `data/{name}.json` is written as a BARE ARRAY
 *      (`writeCollectionFiles` → `JSON.stringify(items)`). Reading
 *      `recordData.items` off it yields `undefined` → an index with zero
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
import { generateRecordSearchIndex } from '../src/search/records.js'

const config = { route: '/blog', search: { fields: ['title'] } }

// Exactly what the build emits: a bare array whose records already carry
// `route`, stamped by `collectItems` when `collections[name].route` is set.
const emitted = [
  { slug: 'my-post', title: 'My Post', route: '/blog/my-post' },
  { slug: 'other', title: 'Other', route: '/blog/other' },
]

describe('the cascade shape the build actually writes', () => {
  test('reads a bare array — the emitted form', () => {
    const index = generateRecordSearchIndex('articles', config, emitted, 'en')
    expect(index.entries).toHaveLength(2)
    expect(index.entries[0].id).toBe('record:articles:my-post')
  })

  test('still reads an { items } envelope, for a host that carries one', () => {
    const index = generateRecordSearchIndex('articles', config, { items: emitted }, 'en')
    expect(index.entries).toHaveLength(2)
  })

  test('an empty or absent collection yields no entries, not a throw', () => {
    expect(generateRecordSearchIndex('articles', config, [], 'en').entries).toEqual([])
    expect(generateRecordSearchIndex('articles', config, null, 'en').entries).toEqual([])
  })
})

describe('the link — the record’s own route wins', () => {
  test('uses item.route when the build stamped one', () => {
    const index = generateRecordSearchIndex('articles', config, emitted, 'en')
    expect(index.entries.map(e => e.route)).toEqual(['/blog/my-post', '/blog/other'])
  })

  // The divergence that motivated reading rather than recomputing: the build
  // strips the trailing slash, so composing here without stripping disagrees.
  test('never disagrees with the build over a trailing slash', () => {
    const withSlash = { ...config, route: '/blog/' }
    const index = generateRecordSearchIndex('articles', withSlash, emitted, 'en')
    expect(index.entries[0].route).toBe('/blog/my-post')

    // And when the record carries no route, the fallback normalizes the same way.
    const bare = [{ slug: 'my-post', title: 'My Post' }]
    const composed = generateRecordSearchIndex('articles', withSlash, bare, 'en')
    expect(composed.entries[0].route).toBe('/blog/my-post')
  })

  test('composes from config.route for records that arrived without one', () => {
    const bare = [{ slug: 'my-post', title: 'My Post' }]
    const index = generateRecordSearchIndex('articles', config, bare, 'en')
    expect(index.entries[0].route).toBe('/blog/my-post')
  })

  // A missing key is detectable; "undefined/my-post" is a link that ranks
  // correctly, looks plausible in results, and 404s on click.
  test('omits route entirely when neither source can supply one', () => {
    const bare = [{ slug: 'my-post', title: 'My Post' }]
    const index = generateRecordSearchIndex('articles', { search: {} }, bare, 'en')
    expect(index.entries[0]).not.toHaveProperty('route')
    expect(JSON.stringify(index)).not.toContain('undefined')
  })
})

/**
 * ⛔ The two schema claims this function used to make, both removed 2026-08-25.
 *
 * The suite above passes identically before and after that change, because
 * every case in it declares `search: { fields: ['title'] }` and asserts only
 * `id` and `route`. A green run there says nothing about either default —
 * which is why these exist and why each has a control that would fail under
 * the old behaviour.
 */
describe('no schema claims — a collection that is not a blog', () => {
  // A `people` collection: no `title` anywhere, and fields no blog has.
  const person = {
    slug: 'a-okafor',
    name: 'Ada Okafor',
    department: 'Biology',
    tenured: true,
    route: '/staff/a-okafor',
  }

  test('CONTROL: with no declared fields, a record without `title` is still searchable', () => {
    // ⛔ Under the old `|| ['title']` default this was `content: ''` — the
    // record entered the index and matched nothing. Present, countable, silent.
    const index = generateRecordSearchIndex('staff', {}, [person], 'en')
    const entry = index.entries[0]

    expect(entry.content).toContain('Ada Okafor')
    expect(entry.content).toContain('Biology')
  })

  test('wiring keys we authored are not indexed as content', () => {
    const entry = generateRecordSearchIndex('staff', {}, [person], 'en').entries[0]

    expect(entry.content).not.toContain('a-okafor')
    expect(entry.content).not.toContain('/staff/')
  })

  test('an authored `search.fields` still wins over the default', () => {
    const cfg = { search: { fields: ['department'] } }
    const entry = generateRecordSearchIndex('staff', cfg, [person], 'en').entries[0]

    expect(entry.content).toBe('Biology')
    expect(entry.content).not.toContain('Ada Okafor')
  })

  test("CONTROL: `item` keeps the author's own fields", () => {
    // ⛔ `pickDisplayFields` used to destructure a fixed blog shape, so
    // `department` and `tenured` were dropped from every result card.
    const entry = generateRecordSearchIndex('staff', {}, [person], 'en').entries[0]

    expect(entry.item.department).toBe('Biology')
    expect(entry.item.tenured).toBe(true)
    expect(entry.item.name).toBe('Ada Okafor')
  })

  test('`item` drops our wiring keys, structure, and long text', () => {
    const heavy = {
      slug: 'x',
      route: '/x',
      label: 'Short label',
      body: 'y'.repeat(500),
      content: { type: 'doc', content: [] },
      tags: ['a', 'b'],
    }
    const entry = generateRecordSearchIndex('things', {}, [heavy], 'en').entries[0]

    expect(entry.item.label).toBe('Short label')
    expect(entry.item).not.toHaveProperty('slug') // ours
    expect(entry.item).not.toHaveProperty('route') // ours
    expect(entry.item).not.toHaveProperty('content') // structure a card cannot render
    expect(entry.item).not.toHaveProperty('tags') // ditto
    expect(entry.item).not.toHaveProperty('body') // already in content/excerpt
  })

  test('a long field is still SEARCHABLE even though it is not displayed', () => {
    // The cap is a display-payload decision, not an indexing one — dropping it
    // from both would make long-form records unfindable.
    const heavy = { slug: 'x', body: 'needle '.repeat(80) }
    const entry = generateRecordSearchIndex('things', {}, [heavy], 'en').entries[0]

    expect(entry.content).toContain('needle')
    expect(entry.item).not.toHaveProperty('body')
  })
})
