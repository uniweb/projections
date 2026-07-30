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
