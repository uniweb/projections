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
})
