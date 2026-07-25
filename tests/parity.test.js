/**
 * Publisher parity — the framework half.
 *
 * A Uniweb project is dual-published: the CLI and the app are both JavaScript
 * clients of one backend, and either may be the publisher. An artifact derived
 * from site content must therefore come out **identical** whichever side
 * publishes, or a deployed site's artifacts oscillate — and an `llms.txt` that
 * exists after a CLI publish and vanishes after an app publish is worse than
 * none, because agents are being told to rely on it.
 *
 * The cross-publisher half of this test arrives once the app imports this
 * package. What is testable today is the property that makes that half
 * possible: for one input, this implementation is deterministic and depends on
 * nothing ambient — no clock, no locale, no environment, no mutation of its
 * input. If any of those leaked in, byte-identical output across two
 * publishers would be unachievable no matter how the app called it.
 *
 * Note the deliberate contrast with the search index, whose `generated`
 * timestamp makes it non-deterministic by construction (see the last test).
 */

import { renderSiteIndex } from '../src/site-index.js'
import { renderPageMarkdown } from '../src/markdown.js'
import { generateSearchIndex } from '../src/search/index.js'
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

  test('the search index DOES carry a timestamp — parity is per-field', () => {
    // Documenting the known exception rather than pretending it away: the
    // search index stamps `generated`, so a byte-comparison across publishers
    // has to exclude that field (or the field has to go).
    const index = generateSearchIndex(fixture(), { locale: 'en' })
    expect(index.generated).toBeTruthy()

    const { generated: _a, ...a } = index
    const { generated: _b, ...b } = generateSearchIndex(fixture(), { locale: 'en' })
    expect(a).toEqual(b)
  })
})
