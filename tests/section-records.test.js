/**
 * ⭐ A PAGE'S MARKDOWN CARRIES THE RECORDS ITS SECTIONS SHOW — after each section, as its render read
 * them (`sections`, from `@uniweb/runtime/ssr`'s `render(…, { sectionData: true })`), named by the
 * site's word for them.
 *
 * A pricing page whose cards show each tier's price from records had no price in its Markdown: the
 * copy held what the author wrote and nothing a section drew from records.
 */
import { renderPageMarkdown } from '../src/markdown.js'
import { collectPageBlocks, BLOCK_SEPARATOR } from '../src/markdown.js'
import { page, section } from './helpers.js'

const TIERS = [
  { $name: 'basic', title: 'Basic', price: 148 },
  { $name: 'pro', title: 'Pro', price: 298 },
]

const pricing = () =>
  page('/pricing', {
    sections: [
      section('# Priced by the tier your academy runs on.', { stableId: 'plans' }),
      section('## Compare\n\n```yaml:comparison\nrows:\n  - label: From {price}\n```', { stableId: 'compare' }),
      section(null, { stableId: 'cards' }),
    ],
  })

describe('renderPageMarkdown with the records its sections showed', () => {
  test('⭐ after a section, each value it showed: named in a comment, as JSON, a price among them', () => {
    const md = renderPageMarkdown(pricing(), { sections: [{ id: 'section-plans', data: { tiers: TIERS } }] })
    expect(md).toBe(
      [
        '# Priced by the tier your academy runs on.',
        '<!-- tiers -->',
        '```json\n' + JSON.stringify(TIERS, null, 2) + '\n```',
        '## Compare\n\n```yaml:comparison\nrows:\n  - label: From {price}\n```',
      ].join(BLOCK_SEPARATOR),
    )
    expect(md).toContain('"price": 148')
  })

  test('a value the page already showed under the same name is named again, and not repeated', () => {
    const md = renderPageMarkdown(pricing(), {
      sections: [
        { id: 'section-plans', data: { tiers: TIERS } },
        { id: 'section-compare', data: { tiers: TIERS } },
      ],
    })
    expect(md.match(/"price": 148/g)).toHaveLength(1)
    expect(md).toContain('```\n\n<!-- tiers: as above -->')
    // CONTROL: under the same name with other records, it is written again.
    const other = renderPageMarkdown(pricing(), {
      sections: [
        { id: 'section-plans', data: { tiers: TIERS } },
        { id: 'section-compare', data: { tiers: [TIERS[1]] } },
      ],
    })
    expect(other.match(/"price": 298/g)).toHaveLength(2)
    expect(other).not.toContain('as above')
  })

  test('a section with no markdown of its own still gets its records', () => {
    const md = renderPageMarkdown(pricing(), { sections: [{ id: 'section-cards', data: { tiers: TIERS } }] })
    expect(md.endsWith('<!-- tiers -->\n\n```json\n' + JSON.stringify(TIERS, null, 2) + '\n```')).toBe(true)
  })

  test('one record is written as a record is: its whole documents lifted out as markdown, named under it', () => {
    const bio = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ada wrote the first program.' }] }] }
    const p = page('/team', { sections: [section('# Team', { stableId: 'team' })] })
    const md = renderPageMarkdown(p, { sections: [{ id: 'section-team', data: { author: { $name: 'ada', name: 'Ada', bio } } }] })
    expect(md).toBe(
      [
        '# Team',
        '<!-- author -->',
        '```json\n' + JSON.stringify({ $name: 'ada', name: 'Ada' }, null, 2) + '\n```',
        '<!-- author.bio -->',
        'Ada wrote the first program.',
      ].join(BLOCK_SEPARATOR),
    )
  })

  test('a child section\'s records follow its own markdown, and leave with it when children are left out', () => {
    const p = page('/x', {
      sections: [section('# Parent', { stableId: 'parent', subsections: [section('## Child', { stableId: 'child' })] })],
    })
    const sections = [{ id: 'section-child', data: { tiers: TIERS } }]
    expect(renderPageMarkdown(p, { sections })).toBe(
      ['# Parent', '## Child', '<!-- tiers -->', '```json\n' + JSON.stringify(TIERS, null, 2) + '\n```'].join(BLOCK_SEPARATOR),
    )
    expect(renderPageMarkdown(p, { sections, includeChildren: false })).toBe('# Parent')
  })

  test('a hidden section takes its records with it', () => {
    const p = page('/x', { sections: [section('# Shown', { stableId: 'shown' }), section('# Draft', { stableId: 'draft', hidden: true })] })
    expect(renderPageMarkdown(p, { sections: [{ id: 'section-draft', data: { tiers: TIERS } }] })).toBe('# Shown')
  })

  test('records for a section the page has not, and entries of any other shape, are left out', () => {
    const md = renderPageMarkdown(pricing(), {
      sections: [{ id: 'section-elsewhere', data: { tiers: TIERS } }, null, { id: 'section-plans', data: [1] }, { data: {} }],
    })
    expect(md).not.toContain('<!--')
  })

  test('a record page: its sections\' records beside them, then its record as before', () => {
    const p = page('/blog/:slug', { isDynamic: true, sections: [section('# Post', { stableId: 'post' })] })
    const record = { $name: 'a', title: 'A' }
    const md = renderPageMarkdown(p, { record, sections: [{ id: 'section-post', data: { related: [{ $name: 'b', title: 'B' }] } }] })
    expect(md).toBe(
      [
        '# Post',
        '<!-- related -->',
        '```json\n' + JSON.stringify([{ $name: 'b', title: 'B' }], null, 2) + '\n```',
        '```json\n' + JSON.stringify(record, null, 2) + '\n```',
      ].join(BLOCK_SEPARATOR),
    )
  })

  test('a name cannot close its comment', () => {
    const md = renderPageMarkdown(pricing(), { sections: [{ id: 'section-plans', data: { 'a-->b': [1] } }] })
    expect(md).toContain('<!-- a->b -->')
  })

  test('CONTROL — with no sections, or none showing records, the page reads exactly as before', () => {
    const before = renderPageMarkdown(pricing())
    expect(renderPageMarkdown(pricing(), { sections: [] })).toBe(before)
    expect(renderPageMarkdown(pricing(), { sections: [{ id: 'section-nowhere', data: { tiers: TIERS } }] })).toBe(before)
    // …and the corpus's blocks still join into it: the corpus carries no records.
    expect(collectPageBlocks(pricing()).map((b) => b.markdown).join(BLOCK_SEPARATOR)).toBe(before)
  })
})
