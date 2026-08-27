/**
 * Publisher parity — the framework half.
 *
 * A Uniweb project is dual-published: the CLI and the app both *derive* these
 * artifacts in JavaScript, and either may be the publisher. An artifact derived
 * from site content must therefore come out **identical** whichever side
 * publishes, or a deployed site's artifacts oscillate — and an `llms.txt` that
 * exists after a CLI publish and vanishes after an app publish is worse than
 * none, because agents are being told to rely on it.
 *
 * (Precisely: on the backend lane the app does not send a publish *payload* —
 * it derives the bytes, writes them through the asset lane, and triggers a
 * publish. Same generator, different delivery. The earlier wording here said
 * "both are JavaScript clients of one backend", which conflated deriving with
 * publishing; the app agent corrected it from its own code.)
 *
 * The cross-publisher half of this test arrives once the app imports this
 * package. What is testable today is the property that makes that half
 * possible: for one input, this implementation is deterministic and depends on
 * nothing ambient — no clock, no locale, no environment, no mutation of its
 * input. If any of those leaked in, byte-identical output across two
 * publishers would be unachievable no matter how the app called it.
 *
 * The search index used to be the deliberate exception, stamping `generated`.
 * That field is gone: a clock in a derived artifact cannot be content-addressed,
 * so an unchanged index re-uploaded on every publish. Parity is now a
 * whole-artifact property with no carve-outs.
 */

import { renderSiteIndex } from '../src/site-index.js'
import { renderPageMarkdown } from '../src/markdown.js'
import { generateSearchIndex, generateRecordSearchIndex, mergeSearchIndexes, getSearchIndexFilename } from '../src/search/index.js'
import { page, container, section, site } from './helpers.js'

const fixture = () =>
  site(
    [
      page('/', { title: 'Home', sections: [section('# Home\n\nWelcome to the site.')] }),
      container('/docs', 'Docs'),
      page('/docs/start', { title: 'Start', sections: [section('# Start\n\nBegin here now.')] }),
      page('/docs/deep', { title: 'Deep', description: 'Authored.', sections: [section('# Deep')] }),
    ],
    { title: 'Parity', description: 'A fixture.', seo: { baseUrl: 'https://example.com' } }
  )

describe('deterministic output', () => {
  test('the index is byte-identical across repeated runs', () => {
    expect(renderSiteIndex(fixture())).toBe(renderSiteIndex(fixture()))
  })

  test('page markdown is byte-identical across repeated runs', () => {
    const p = fixture().pages[2]
    expect(renderPageMarkdown(p)).toBe(renderPageMarkdown(p))
  })

  test('the index is identical for two separately-constructed equal inputs', () => {
    // Same content, different object identities — the shape a second publisher
    // would hand in.
    expect(renderSiteIndex(fixture())).toBe(renderSiteIndex(structuredClone(fixture())))
  })

  test('output does not depend on key order in the input', () => {
    const reordered = fixture()
    reordered.pages = reordered.pages.map(p => {
      const { sections, route, title, ...rest } = p
      return { title, ...rest, route, sections }
    })
    expect(renderSiteIndex(reordered)).toBe(renderSiteIndex(fixture()))
  })
})

describe('no ambient input', () => {
  test('the projections do not mutate the site content they are given', () => {
    const content = fixture()
    const before = structuredClone(content)
    renderSiteIndex(content)
    renderPageMarkdown(content.pages[0])
    expect(content).toEqual(before)
  })

  test('the index carries no timestamp', () => {
    // A clock in the output would make cross-publisher parity impossible.
    expect(renderSiteIndex(fixture())).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  test('the search index carries no timestamp either — parity is whole-artifact', () => {
    // This used to assert the opposite, documenting `generated` as a known
    // exception a byte-comparison had to exclude. The field is gone: a clock
    // in a derived artifact cannot be content-addressed, so an unchanged index
    // was re-uploading on every publish, and parity had to be argued per-field
    // rather than simply held. The exception was the bug.
    const index = generateSearchIndex(fixture(), { locale: 'en' })
    expect(index.generated).toBeUndefined()

    expect(index).toEqual(generateSearchIndex(fixture(), { locale: 'en' }))
  })

  test('a collection index carries no timestamp', () => {
    const config = { route: '/blog', search: { fields: ['title'] } }
    const data = { items: [{ slug: 'a', title: 'Alpha' }] }

    const index = generateRecordSearchIndex('posts', config, data, 'en')
    expect(index.generated).toBeUndefined()

    expect(index).toEqual(generateRecordSearchIndex('posts', config, data, 'en'))
  })
})

describe('index layouts — split for servers, merged for browsers', () => {
  const collectionIndex = (name, entries) => ({
    type: 'collection',
    collection: name,
    locale: 'en',
    entries
  })

  test('merges page and collection entries into one index', () => {
    const pages = generateSearchIndex(fixture(), { locale: 'en' })
    const posts = collectionIndex('posts', [{ id: 'collection:posts:a', title: 'Alpha' }])
    const team = collectionIndex('team', [{ id: 'collection:team:b', title: 'Bea' }])

    const merged = mergeSearchIndexes(pages, [posts, team])

    expect(merged.entries).toHaveLength(pages.entries.length + 2)
    expect(merged.count).toBe(merged.entries.length)
    expect(merged.locale).toBe('en')
    expect(merged.entries.map(e => e.id)).toEqual(
      expect.arrayContaining(['collection:posts:a', 'collection:team:b'])
    )
  })

  test('is a faithful superset — no page entry is lost to the merge', () => {
    // The merged form is what the browser lane reads, so anything the split
    // form would have served has to survive it.
    const pages = generateSearchIndex(fixture(), { locale: 'en' })
    const merged = mergeSearchIndexes(pages, [])

    expect(merged.entries).toEqual(pages.entries)
  })

  test('tolerates missing or empty collection indexes', () => {
    const pages = generateSearchIndex(fixture(), { locale: 'en' })

    expect(mergeSearchIndexes(pages).entries).toEqual(pages.entries)
    expect(mergeSearchIndexes(pages, [null, { entries: [] }]).entries).toEqual(pages.entries)
  })

  test('carries no timestamp, like every other derived artifact', () => {
    const merged = mergeSearchIndexes(generateSearchIndex(fixture(), { locale: 'en' }), [])
    expect(merged.generated).toBeUndefined()
  })

  test('the default-locale filename is what the client asks for', () => {
    // The bug this fixes: the link lane emitted only the split files while
    // kit's index provider asks for this name, so search 404'd on that lane.
    expect(getSearchIndexFilename('en', 'en')).toBe('search-index.json')
    expect(getSearchIndexFilename('fr', 'en')).toBe('fr/search-index.json')
  })
})
