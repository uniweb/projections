/**
 * A draft section — `hidden: true` in its frontmatter — is not published content, so no
 * projection describes it, whichever payload carries it: the same rule as a hidden page.
 * A published static build already leaves it out; a dev payload keeps it for preview, and
 * another host's payload may too. Its child sections go with it.
 */

import { renderPageMarkdown } from '../src/markdown.js'
import { resolvePageDescription } from '../src/description.js'
import { extractSearchContent } from '../src/search/extract.js'
import { page, section, site } from './helpers.js'

const withDraft = () =>
  page('/about', {
    sections: [
      section('# Draft heading\n\nNot ready yet.', { hidden: true }),
      section('# About us\n\nWe build things.', {
        subsections: [section('## Hiring\n\nSoon.', { hidden: true }), section('## Team\n\nSix people.')],
      }),
    ],
  })

describe('a hidden section', () => {
  test('is left out of the page markdown, and so is a hidden child', () => {
    const markdown = renderPageMarkdown(withDraft())
    expect(markdown).toContain('We build things.')
    expect(markdown).toContain('Six people.')
    expect(markdown).not.toContain('Not ready yet.')
    expect(markdown).not.toContain('Soon.')
  })

  test('does not describe the page', () => {
    expect(resolvePageDescription(withDraft())).toMatch(/^We build things/)
  })

  test('is not indexed for search, nor is a hidden child', () => {
    const index = JSON.stringify(extractSearchContent(site([withDraft()])))
    expect(index).toContain('Six people.')
    expect(index).not.toContain('Not ready yet.')
    expect(index).not.toContain('Soon.')
  })
})
