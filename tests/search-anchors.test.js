/**
 * Search-index anchors — the destination each result sends the reader to.
 *
 * The extractor had no behavioural coverage at all, which is how two separate
 * defects reached production unnoticed. Both produced a fragment that existed
 * nowhere in the page, and a missing fragment raises no error: the browser
 * loads the page and does not scroll, and does nothing whatsoever when the
 * target is the page the reader is already on.
 *
 *   1. It emitted `Section${positionalId}` while the renderers wrote
 *      `section-${stableId}` — a format AND an identity mismatch.
 *   2. It gave nested sections their own anchor, but `<ChildBlocks>` renders
 *      children bare by default (no wrapper, so no id), and whether a
 *      foundation opted into `wrapAs` is a runtime fact this build-time pass
 *      cannot see.
 *
 * These assertions are deliberately about the exact emitted string, because
 * that is the only thing that can catch this class.
 */

import { describe, it, expect } from 'vitest'
import { extractSearchContent } from '../src/search/extract.js'

/** Minimal ProseMirror doc carrying one paragraph, so a section is indexable. */
const doc = (text) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

const site = (sections) => ({
  pages: [{ route: '/how-it-works', title: 'How It Works', sections }],
})

const sectionsOf = (siteContent) =>
  extractSearchContent(siteContent).filter((e) => e.type === 'section')

describe('a top-level section is its own destination', () => {
  it('uses the id the renderer writes, from stableId', () => {
    const [entry] = sectionsOf(site([
      { id: '2', stableId: 'insight', type: 'Split', content: doc('alpha') },
    ]))
    expect(entry.anchor).toBe('section-insight')
  })

  it('falls back to the positional id when there is no stable one', () => {
    const [entry] = sectionsOf(site([{ id: '2', type: 'Split', content: doc('alpha') }]))
    expect(entry.anchor).toBe('section-2')
  })

  it('never emits the retired Section<n> form', () => {
    // The original defect, pinned so it cannot come back quietly.
    const entries = sectionsOf(site([
      { id: '2', stableId: 'insight', type: 'Split', content: doc('alpha') },
    ]))
    for (const e of entries) expect(e.anchor).not.toMatch(/^Section\d/)
  })
})

describe('a nested section inherits its nearest rendered ancestor', () => {
  it('points at the parent, not at an id that was never rendered', () => {
    const entries = sectionsOf(site([
      {
        id: '2',
        stableId: 'insight',
        type: 'Split',
        content: doc('alpha'),
        subsections: [
          { id: '2.1', stableId: 'insight-figure', type: 'Figure', content: doc('beta') },
        ],
      },
    ]))

    const child = entries.find((e) => e.sectionId === '2.1')
    expect(child.anchor).toBe('section-insight')
    // Its own identity is still recorded — only the destination is inherited.
    expect(child.sectionId).toBe('2.1')
  })

  it('carries the top-level anchor all the way down, not one level', () => {
    // A grandchild is no more rendered than its parent. Inheriting a single
    // level would hand it `section-insight-figure`, which does not exist.
    const entries = sectionsOf(site([
      {
        id: '2',
        stableId: 'insight',
        type: 'Split',
        content: doc('alpha'),
        subsections: [
          {
            id: '2.1',
            stableId: 'insight-figure',
            type: 'Figure',
            content: doc('beta'),
            subsections: [
              { id: '2.1.1', stableId: 'figure-note', type: 'Note', content: doc('gamma') },
            ],
          },
        ],
      },
    ]))

    const anchors = entries.map((e) => e.anchor)
    expect(new Set(anchors)).toEqual(new Set(['section-insight']))
    expect(entries.map((e) => e.sectionId).sort()).toEqual(['2', '2.1', '2.1.1'])
  })

  it('keeps sibling top-level sections independent', () => {
    // Inheritance must not leak sideways: the second top-level section is
    // rendered in its own right and is its own destination.
    const entries = sectionsOf(site([
      {
        id: '2',
        stableId: 'insight',
        type: 'Split',
        content: doc('alpha'),
        subsections: [{ id: '2.1', stableId: 'insight-figure', type: 'Figure', content: doc('beta') }],
      },
      { id: '3', stableId: 'boundary', type: 'Split', content: doc('delta') },
    ]))

    expect(entries.find((e) => e.sectionId === '2.1').anchor).toBe('section-insight')
    expect(entries.find((e) => e.sectionId === '3').anchor).toBe('section-boundary')
  })
})

describe('the href a consumer composes from an entry', () => {
  it('resolves to route + a fragment that names a rendered element', () => {
    const entries = sectionsOf(site([
      {
        id: '2',
        stableId: 'insight',
        type: 'Split',
        content: doc('alpha'),
        subsections: [{ id: '2.1', stableId: 'insight-figure', type: 'Figure', content: doc('beta') }],
      },
    ]))

    // Mirrors index-provider's href construction.
    const hrefs = entries.map((e) => (e.anchor ? `${e.route}#${e.anchor}` : e.route))
    for (const href of hrefs) expect(href).toBe('/how-it-works#section-insight')
  })
})
