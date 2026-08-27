/**
 * The retrieval projection.
 */

import { renderPageMarkdown } from '../src/markdown.js'
import { resolvePageDescription } from '../src/description.js'
import { page, section } from './helpers.js'

describe('renderPageMarkdown', () => {
  test('joins section bodies in page order', () => {
    const p = page('/about', {
      sections: [section('# About us\n\nWe build things.'), section('## Our team\n\nSix people.')],
    })
    expect(renderPageMarkdown(p)).toBe('# About us\n\nWe build things.\n\n## Our team\n\nSix people.')
  })

  test('skips sections with no content', () => {
    const p = page('/x', { sections: [section('# Kept'), section(null), section('Also kept.')] })
    expect(renderPageMarkdown(p)).toBe('# Kept\n\nAlso kept.')
  })

  test('a page with no sections projects to an empty string', () => {
    expect(renderPageMarkdown(page('/empty'))).toBe('')
    expect(renderPageMarkdown(null)).toBe('')
  })

  test('carries Uniweb dialect — icons and insets survive', () => {
    const p = page('/x', {
      sections: [section('![](lu-house)\n\n![A diagram](@NetworkDiagram){variant=compact}')],
    })
    const output = renderPageMarkdown(p)
    expect(output).toContain('![](lu-house)')
    expect(output).toContain('![A diagram](@NetworkDiagram){variant=compact}')
  })

  test('a concept block projects its PROSE, not a serialization artifact', () => {
    // The retrieval projection runs a whole section doc through content-writer,
    // so an unmapped node type surfaces here exactly as it does in the file
    // round trip: the block is omitted and the author's prose leaves with it.
    // An agent fetching this page would be told the FAQ does not exist.
    const p = page('/faq', {
      sections: [section('```md:faq\n# What plans do you have?\nWe have three.\n```')],
    })
    const output = renderPageMarkdown(p)

    expect(output).toContain('md:faq')
    expect(output).toContain('# What plans do you have?')
    expect(output).toContain('We have three.')
  })

  test('emits no frontmatter, no section type, no params', () => {
    const p = page('/x', {
      sections: [section('# Hero', { type: 'Hero', params: { columns: 3, variant: 'centered' } })],
    })
    const output = renderPageMarkdown(p)
    expect(output).toBe('# Hero')
    expect(output).not.toContain('Hero:')
    expect(output).not.toContain('columns')
    expect(output).not.toContain('---')
  })

  test('includes nested child sections in declared order', () => {
    const p = page('/x', {
      sections: [
        section('# Dashboard', {
          subsections: [section('## Stats\n\nNumbers.'), section('## Chart\n\nA chart.')],
        }),
      ],
    })
    expect(renderPageMarkdown(p)).toBe('# Dashboard\n\n## Stats\n\nNumbers.\n\n## Chart\n\nA chart.')
  })

  test('children can be suppressed', () => {
    const p = page('/x', {
      sections: [section('# Parent', { subsections: [section('## Child')] })],
    })
    expect(renderPageMarkdown(p, { includeChildren: false })).toBe('# Parent')
  })

  test('a code span holding a literal < > survives (the D1 path)', () => {
    const p = page('/x', { sections: [section('Read `/data/<name>.json` now.')] })
    expect(renderPageMarkdown(p)).toBe('Read `/data/<name>.json` now.')
  })
})

describe('resolvePageDescription', () => {
  test('authored page description wins', () => {
    const p = page('/x', {
      description: 'Authored.',
      seo: { ogDescription: 'OG.' },
      sections: [section('# T\n\nDerived.')],
    })
    expect(resolvePageDescription(p)).toBe('Authored.')
  })

  test('falls back to the SEO description', () => {
    const p = page('/x', { seo: { ogDescription: 'OG.' }, sections: [section('# T\n\nDerived.')] })
    expect(resolvePageDescription(p)).toBe('OG.')
  })

  test('falls back to the first paragraph', () => {
    const p = page('/x', { sections: [section('# T\n\nDerived.')] })
    expect(resolvePageDescription(p)).toBe('Derived.')
  })

  test('walks past a section that has only a heading', () => {
    // A page opening with a bare Hero still gets a description.
    const p = page('/x', { sections: [section('# Just a title'), section('The real summary.')] })
    expect(resolvePageDescription(p)).toBe('The real summary.')
  })

  test('returns empty string when there is nothing to say', () => {
    expect(resolvePageDescription(page('/x'))).toBe('')
  })
})

// ─── insets — the author's caption survives, the component never does ────────
//
// An inset is `![Platform overview](@Diagram)`: an author's caption plus a
// FOUNDATION COMPONENT to render it. The build splits them — caption and params
// into the section's `insets[]`, an `inset_placeholder` left in the body.
//
// ⛔ `proseMirrorToMarkdown` has no serializer for that node, so before this it
// was dropped with a per-build warning and EVERY inset caption was missing from
// EVERY agent-facing page.
describe('inset placeholders', () => {
  const page = (nodes, insets) => ({
    title: 'Home',
    route: '/',
    sections: [{ id: 'hero', content: { type: 'doc', content: nodes }, insets }]
  })
  const body = (md) => md.replace(/^---[\s\S]*?---/, '')

  it('renders a block-level inset as its caption', () => {
    const md = body(
      renderPageMarkdown(
        page(
          [{ type: 'inset_placeholder', attrs: { refId: 'a' } }],
          [{ refId: 'a', type: 'Diagram', title: 'Platform overview' }]
        ),
        {}
      )
    )
    expect(md).toContain('Platform overview')
  })

  it('renders an inline inset inside its sentence', () => {
    // ⛔ Block vs inline is not cosmetic: a bare text node at block level is not
    // serializable, so an unconditional text replacement restores NOTHING while
    // removing the warning that announced the loss. That was the first version.
    const md = body(
      renderPageMarkdown(
        page(
          [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'See ' },
                { type: 'inset_placeholder', attrs: { refId: 'b' } },
                { type: 'text', text: ' here.' }
              ]
            }
          ],
          [{ refId: 'b', type: 'Cite', title: 'Smith 2024' }]
        ),
        {}
      )
    )
    expect(md).toMatch(/See Smith 2024 here\./)
  })

  it('⛔ CONTROL — the foundation component NEVER reaches the output', () => {
    // The property this whole package rests on: a projection is of the SITE and
    // is identical under a swapped foundation. A component name is a rendering
    // assignment and must not leak, the same reason `type:` and params do not.
    const md = body(
      renderPageMarkdown(
        page(
          [{ type: 'inset_placeholder', attrs: { refId: 'a' } }],
          [{ refId: 'a', type: 'Diagram', title: 'Platform overview', params: { depth: 2 } }]
        ),
        {}
      )
    )
    expect(md).not.toMatch(/Diagram|depth|@/)
  })

  it('drops an inset with no caption, and says nothing about it', () => {
    // No caption means no author text — there is nothing a reader is missing, so
    // a warning here would be noise on every build of a perfectly fine site.
    const md = body(
      renderPageMarkdown(
        page(
          [
            { type: 'paragraph', content: [{ type: 'text', text: 'Copy.' }] },
            { type: 'inset_placeholder', attrs: { refId: 'c' } }
          ],
          [{ refId: 'c', type: 'Diagram', title: null }]
        ),
        {}
      )
    )
    expect(md).toContain('Copy.')
    expect(md).not.toMatch(/inset|refId/)
  })
})
