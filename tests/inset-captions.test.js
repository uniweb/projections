/**
 * Inset captions reach BOTH projections, and say the same thing in each.
 *
 * An inset is `![Platform overview](@Diagram)` — an author's caption plus a
 * FOUNDATION COMPONENT to render it with. The build splits them: the caption
 * goes to the section's `insets[]`, the body keeps an `inset_placeholder`
 * carrying only `{ refId, embedKind }`. So a projection that walks the body
 * alone never sees a word the author wrote.
 *
 * ⛔ That was true of the search index until 2026-08-28, AFTER the markdown
 * projection had been fixed — so the two artifacts disagreed about the same
 * page: a caption was plainly present in `/page.md` and unfindable through
 * search. **The cross-projection agreement is the property under test here**,
 * not either projection alone; testing them separately is what let them drift.
 */

import { describe, it, expect } from 'vitest'
import { renderPageMarkdown } from '../src/markdown.js'
import { extractSearchContent } from '../src/search/extract.js'
import { page, site, sectionWithInsets } from './helpers.js'

const MD = '![Platform overview](@Diagram)\n\nSee ![Smith 2024](@Cite) here.'

const fixture = () =>
  page('/arch', { title: 'Architecture', sections: [sectionWithInsets(MD)] })

const searchText = (p) =>
  extractSearchContent(site([p]))
    .filter((e) => e.type === 'section')
    .map((e) => e.content)
    .join(' ')

describe('inset captions', () => {
  it('reaches the search index from a BLOCK-level inset', () => {
    expect(searchText(fixture())).toContain('Platform overview')
  })

  it('reaches the search index from an INLINE inset', () => {
    expect(searchText(fixture())).toContain('Smith 2024')
  })

  it('splices an inline caption into its sentence rather than leaving a hole', () => {
    // ⛔ The inline case failed in the WORSE direction: the placeholder
    // contributed nothing, so the indexed text read "See  here." — mangled
    // prose with a doubled space, not an obvious omission. A test asserting
    // only `toContain('Smith 2024')` would pass on text appended anywhere, so
    // assert the SENTENCE.
    expect(searchText(fixture())).toContain('See Smith 2024 here.')
  })

  it('never leaks the component name into the index', () => {
    // The property the whole package rests on: a projection is of the SITE, so
    // it must be identical under a swapped foundation. `@Diagram` is a
    // rendering assignment, not content.
    const text = searchText(fixture())
    expect(text).not.toContain('Diagram')
    expect(text).not.toContain('Cite')
  })

  it('agrees with the markdown projection — every caption in one is in the other', () => {
    const p = fixture()
    const md = renderPageMarkdown(p, {})
    const text = searchText(p)
    for (const caption of ['Platform overview', 'Smith 2024']) {
      expect(md).toContain(caption)
      expect(text).toContain(caption)
    }
  })

  it('drops a captionless inset from both, quietly', () => {
    // Nothing the author wrote is being lost, so there is nothing to announce.
    const p = page('/x', { title: 'X', sections: [sectionWithInsets('![](@Spacer)')] })
    expect(searchText(p)).not.toContain('Spacer')
    expect(renderPageMarkdown(p, {})).not.toContain('Spacer')
  })
})
