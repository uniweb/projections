/**
 * The search extractor's reach — which containers its walk can actually see.
 *
 * Companion to search-anchors.test.js, which covers where a result POINTS. This
 * covers what gets INDEXED at all.
 */

import { extractSearchContent } from '../src/search/extract.js'

// ─── containers the flat walk could not see ──────────────────────────────────
//
// Until 2026-08-27 the walk was FLAT over `doc.content`, so anything one level
// down was invisible. Measured on a doc that looked perfectly indexed: a
// blockquote's prose and EVERY table cell were lost outright.
describe('nested containers and image alt', () => {
  const t = (s) => ({ type: 'text', text: s })
  const p = (s) => ({ type: 'paragraph', content: [t(s)] })
  const index = (nodes) =>
    JSON.stringify(
      extractSearchContent(
        { pages: [{ route: '/', title: 'T', sections: [{ id: 's', content: { type: 'doc', content: nodes } }] }] },
        {}
      )
    )

  it('indexes prose inside a blockquote', () => {
    expect(index([{ type: 'blockquote', content: [p('QUOTED prose')] }])).toContain('QUOTED prose')
  })

  it('indexes every table cell', () => {
    const table = {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [p('CELL one')] },
            { type: 'tableCell', content: [p('CELL two')] }
          ]
        }
      ]
    }
    const out = index([table])
    expect(out).toContain('CELL one')
    expect(out).toContain('CELL two')
  })

  it("indexes an image's alt — the only words an image contributes", () => {
    expect(index([{ type: 'image', attrs: { alt: 'ALT description', src: '/x.png' } }])).toContain(
      'ALT description'
    )
  })

  it('⛔ CONTROL — code and math stay OUT', () => {
    // The allowlist is the point: a blind recursion would pull these in, inflating
    // the index with tokens nobody searches for. Without this control the suite
    // cannot tell "descends into prose containers" from "descends into everything".
    const out = index([
      { type: 'codeBlock', content: [t('const CODE = 1')] },
      { type: 'math_display', content: [t('E=mc^2')] }
    ])
    expect(out).not.toContain('const CODE')
    expect(out).not.toContain('E=mc')
  })
})
