import { describe, test, expect } from 'vitest'
import { renderSiteIndex } from '../src/site-index.js'
import { renderPageMarkdown } from '../src/markdown.js'
import { generateRecordSearchIndex } from '../src/search/records.js'
import { page, container, section, site } from './helpers.js'

/**
 * The pages a parametric page makes of its records: listed in the site index, and each one's
 * markdown. A host handed the records says so to these two, and composes neither.
 */
const records = generateRecordSearchIndex(
  'posts',
  { pattern: '/blog/:slug' },
  [
    { $name: 'hello', title: 'Hello', summary: 'The first post.' },
    { $name: 'second', title: 'Second', summary: 'Another one.' },
  ],
  'en',
).entries

describe('renderSiteIndex lists record pages', () => {
  const content = site([
    page('/', { title: 'Home' }),
    container('/blog', 'Blog'),
    page('/blog/:slug', { title: 'Post', isDynamic: true }),
  ])

  test('each record entry, after the site pages, titled and described by the entry', () => {
    const index = renderSiteIndex(content, { records })
    expect(index).toContain('## Blog\n\n- [Hello](/blog/hello.md): Hello The first post.\n- [Second](/blog/second.md): Second Another one.')
    // CONTROL: without them, the parametric page lists nothing of its own.
    expect(renderSiteIndex(content)).not.toContain('/blog/')
  })

  test('leaves out what is no record, has no route, or sits in an excluded branch', () => {
    const index = renderSiteIndex(content, {
      records: [...records, { id: 'page:/x', type: 'page', route: '/x', title: 'Not a record' }, { type: 'record', title: 'No route' }],
      exclude: ['/blog/second'],
    })
    expect(index).toContain('/blog/hello.md')
    expect(index).not.toContain('/blog/second.md')
    expect(index).not.toContain('Not a record')
    expect(index).not.toContain('No route')
  })
})

describe("renderPageMarkdown — a record's page", () => {
  const template = page('/blog/:slug', { isDynamic: true, sections: [section('# A post\n\nFrom the blog.')] })

  test("is the parametric page's markdown, then the record as JSON", () => {
    expect(renderPageMarkdown(template, { record: { $name: 'hello', title: 'Hello' } })).toBe(
      '# A post\n\nFrom the blog.\n\n```json\n{\n  "$name": "hello",\n  "title": "Hello"\n}\n```',
    )
    // CONTROL: the page alone, as before.
    expect(renderPageMarkdown(template)).toBe('# A post\n\nFrom the blog.')
  })

  test('is the JSON alone when the page has nothing to project', () => {
    expect(renderPageMarkdown(page('/blog/:slug', { isDynamic: true }), { record: { a: 1 } })).toBe('```json\n{\n  "a": 1\n}\n```')
  })

  test('fences JSON holding backticks with a longer fence', () => {
    const md = renderPageMarkdown(page('/x'), { record: { code: 'use ```js``` here' } })
    expect(md.startsWith('````json\n')).toBe(true)
    expect(md.endsWith('\n````')).toBe(true)
  })

  describe('a rich-text field', () => {
    const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
    const doc = (...content) => ({ type: 'doc', content })
    const blank = page('/blog/:slug', { isDynamic: true })
    const json = (value) => '```json\n' + JSON.stringify(value, null, 2) + '\n```'

    test("reads as markdown after the record's other fields, which stay JSON", () => {
      const record = {
        title: 'Hello',
        content: doc({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Intro' }] }, paragraph('Body.')),
        $name: 'hello',
      }
      expect(renderPageMarkdown(blank, { record })).toBe(
        `${json({ title: 'Hello', $name: 'hello' })}\n\n## Intro\n\nBody.`,
      )
    })

    test("follows the page's own markdown", () => {
      expect(renderPageMarkdown(template, { record: { title: 'Hello', content: doc(paragraph('Body.')) } })).toBe(
        `# A post\n\nFrom the blog.\n\n${json({ title: 'Hello' })}\n\nBody.`,
      )
    })

    test('is all there is when the record has no other field', () => {
      expect(renderPageMarkdown(blank, { record: { content: doc(paragraph('Body.')) } })).toBe('Body.')
    })

    test('is named when it is not a lone content field', () => {
      expect(renderPageMarkdown(blank, { record: { bio: doc(paragraph('Jane writes.')) } })).toBe(
        '<!-- bio -->\n\nJane writes.',
      )
      expect(
        renderPageMarkdown(blank, { record: { abstract: doc(paragraph('Short.')), content: doc(paragraph('Long.')) } }),
      ).toBe('<!-- abstract -->\n\nShort.\n\n<!-- content -->\n\nLong.')
    })

    test('stays in the JSON, whole, when markdown cannot carry all of it', () => {
      const content = doc(paragraph('Before.'), { type: 'chart', attrs: { series: [1, 2] } }, paragraph('After.'))
      const warnings = []
      const warn = console.warn
      console.warn = (message) => warnings.push(message)
      try {
        expect(renderPageMarkdown(blank, { record: { title: 'Hello', content } })).toBe(json({ title: 'Hello', content }))
      } finally {
        console.warn = warn
      }
      // CONTROL: asking is not an omission, so nothing is reported as lost.
      expect(warnings).toEqual([])
    })

    test('stays in the JSON when it is empty', () => {
      const content = doc()
      expect(renderPageMarkdown(blank, { record: { content } })).toBe(json({ content }))
    })

    test("is found in a section, where a data schema keeps a record's fields", () => {
      const record = { $name: 'hello', brief: { title: 'Hello' }, body: { content: doc(paragraph('Body.')) } }
      expect(renderPageMarkdown(blank, { record })).toBe(
        `${json({ $name: 'hello', brief: { title: 'Hello' } })}\n\nBody.`,
      )
    })

    test('names its path when a section holds it under another name', () => {
      const record = { about: { text: doc(paragraph('A novel.')), pages: 280 } }
      expect(renderPageMarkdown(blank, { record })).toBe(
        `${json({ about: { pages: 280 } })}\n\n<!-- about.text -->\n\nA novel.`,
      )
    })

    test('leaves an empty section as it was fetched, and takes away only one the lift empties', () => {
      const record = { meta: {}, body: { content: doc(paragraph('Body.')) } }
      expect(renderPageMarkdown(blank, { record })).toBe(`${json({ meta: {} })}\n\nBody.`)
    })

    test('stays in the JSON, in its section, when markdown cannot carry it there', () => {
      const content = doc({ type: 'chart' })
      const record = { body: { content } }
      expect(renderPageMarkdown(blank, { record })).toBe(json(record))
    })

    test('stays in the JSON in a list, where a markdown form would lose its place', () => {
      const record = { sections: [{ title: 'One', body: doc(paragraph('Nested.')) }] }
      expect(renderPageMarkdown(blank, { record })).toBe(json(record))
    })

    test('leaves a string alone: a markdown field is already text', () => {
      const record = { content: '# Already markdown' }
      expect(renderPageMarkdown(blank, { record })).toBe(json(record))
    })

    test('leaves a look-alike alone', () => {
      const record = { shape: { type: 'doc' } }
      expect(renderPageMarkdown(blank, { record })).toBe(json(record))
    })

    test('gives an inset its caption, never its component', () => {
      const content = doc({ type: 'inset_ref', attrs: { alt: 'A diagram', component: 'Diagram' } }, paragraph('After.'))
      const md = renderPageMarkdown(blank, { record: { content } })
      expect(md).toBe('A diagram\n\nAfter.')
      expect(md).not.toContain('Diagram)')
    })

    test('a record that is not an object is JSON, as before', () => {
      expect(renderPageMarkdown(blank, { record: [1, 2] })).toBe(json([1, 2]))
    })
  })
})
