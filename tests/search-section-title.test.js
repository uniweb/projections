/**
 * The title a search result shows for a section: its title heading, never its label line.
 *
 * A `#>` label line (the pretitle, "Getting started" above "# Installation") is a level-1
 * heading carrying `role: "pretitle"`, and it comes first. The extractor took the first
 * level-1 heading as the title, so every section with a label was found under its label:
 * a docs site's search listed "Guides", "Guides", "Guides" for three different pages.
 */

import { describe, it, expect } from 'vitest'
import { extractSearchContent } from '../src/search/extract.js'

const text = (t) => [{ type: 'text', text: t }]
const heading = (level, t, attrs = {}) => ({ type: 'heading', attrs: { level, ...attrs }, content: text(t) })

const sectionEntry = (content) =>
  extractSearchContent({
    pages: [{ route: '/docs/install', title: 'Installation', sections: [{ id: '1', stableId: 'content', type: 'DocSection', content }] }],
  }).find((e) => e.type === 'section')

describe('a section\'s search title', () => {
  it('is its title, not the label line above it', () => {
    const entry = sectionEntry({
      type: 'doc',
      content: [heading(1, 'Getting started', { role: 'pretitle' }), heading(1, 'Installation'), { type: 'paragraph', content: text('Add the client.') }],
    })
    expect(entry.title).toBe('Installation')
  })

  it('keeps the label\'s words searchable', () => {
    const entry = sectionEntry({
      type: 'doc',
      content: [heading(1, 'Getting started', { role: 'pretitle' }), heading(1, 'Installation')],
    })
    expect(entry.content).toContain('Getting started')
  })

  it('a section with only a label line has no title of its own', () => {
    const entry = sectionEntry({
      type: 'doc',
      content: [heading(1, 'New', { role: 'pretitle' }), { type: 'paragraph', content: text('Fresh.') }],
    })
    expect(entry.title).not.toBe('New')
  })
})
