/**
 * Inset captions reach BOTH projections, and say the same thing in each.
 *
 * An inset is `![Platform overview](@Diagram)` — an author's caption plus a
 * FOUNDATION COMPONENT to render it with. ⛔ Until 2026-08-28 the search index missed
 * captions the markdown projection had — the two artifacts disagreed about one page —
 * so **the cross-projection agreement is the property under test here**, not either
 * projection alone. *(Until 2026-09-28 these tests also fed both the shape the build
 * extracted before 2026-09-27 — an `inset_placeholder` plus a stored `insets[]`; no
 * store serves that shape now.)*
 */

import { describe, it, expect } from 'vitest'
import { renderPageMarkdown } from '../src/markdown.js'
import { extractSearchContent } from '../src/search/extract.js'
import { page, site, section } from './helpers.js'

const MD = '![Platform overview](@Diagram)\n\nSee ![Smith 2024](@Cite) here.'

const searchText = (p) =>
  extractSearchContent(site([p]))
    .filter((e) => e.type === 'section')
    .map((e) => e.content)
    .join(' ')

/**
 * Since 2026-09-27 a section's content keeps the `inset_ref` the author wrote — the
 * build no longer extracts it — so a projection receives the node itself, caption in
 * `attrs.alt`. ⛔ content-writer SERIALIZES an `inset_ref`, as `![caption](@Diagram)`,
 * so an unresolved one would put the component name into the page's `.md`.
 */
describe('inset captions, from the node as the author wrote it', () => {
  const asWritten = () => page('/arch', { title: 'Architecture', sections: [section(MD)] })

  it('reaches both projections, block-level and inline', () => {
    const p = asWritten()
    const md = renderPageMarkdown(p, {})
    const text = searchText(p)
    for (const caption of ['Platform overview', 'Smith 2024']) {
      expect(md).toContain(caption)
      expect(text).toContain(caption)
    }
    expect(text).toContain('See Smith 2024 here.')
  })

  it('never leaks the component name into either', () => {
    const p = asWritten()
    for (const out of [renderPageMarkdown(p, {}), searchText(p)]) {
      expect(out).not.toContain('@Diagram')
      expect(out).not.toContain('Diagram')
      expect(out).not.toContain('Cite')
    }
  })

  it('drops a captionless inset quietly', () => {
    const p = page('/x', { title: 'X', sections: [section('Before\n\n![](@Spacer)')] })
    expect(renderPageMarkdown(p, {})).not.toContain('Spacer')
    expect(searchText(p)).not.toContain('Spacer')
  })
})
