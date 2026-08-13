/**
 * `knowledge:` pages are source material for a service the site runs for its
 * visitors — prose written for that service to reason with, not for a person
 * to read. They are never rendered, so nothing describing the PUBLIC site may
 * name them: not the agent index, not the per-page markdown, not the search
 * index. They enter exactly one projection, the corpus.
 *
 * ⚠️ Not a confidentiality boundary. [Diego, 2026-08-13] "It is not the case
 * that it's private in the sense of sensitive" — the service quotes this
 * material back to whoever prompts it, by design. What these tests protect is
 * that prose addressed to the assistant does not turn up in a file describing
 * what visitors read. Before the fix, all three public projections carried a
 * knowledge page's route, title and body.
 */

import { describe, it, expect } from 'vitest'
import { renderSiteIndex } from '../src/site-index.js'
import { selectIndexablePages } from '../src/pages.js'
import { selectCorpusPages, buildCorpus } from '../src/corpus.js'
import { generateSearchIndex, extractSearchContent } from '../src/search/index.js'
import { page, container, section, site } from './helpers.js'

const routesOf = pages => pages.map(p => p.route)
const routesIn = index => [...new Set(index.entries.map(e => e.route))]

/** A site with one public page and a knowledge branch written for the assistant. */
function siteWithKnowledge(extra = []) {
  return site([
    page('/about', { title: 'About Us', sections: [section('We make public things.')] }),
    page('/kb', {
      title: 'Agent Knowledge',
      knowledge: true,
      sections: [section('How to answer questions.')],
    }),
    page('/kb/pricing', {
      title: 'How To Answer Pricing Questions',
      sections: [section('Lead with total cost of ownership; the marker word is zebranaut.')],
    }),
    ...extra,
  ])
}

describe('the search index is visitor-facing, so knowledge pages stay out', () => {
  it('omits a knowledge page and everything beneath it', () => {
    const index = generateSearchIndex(siteWithKnowledge(), { locale: 'en' })

    expect(routesIn(index)).toEqual(['/about'])
  })

  it('carries neither the title nor the body of an assistant-addressed page', () => {
    const index = generateSearchIndex(siteWithKnowledge(), { locale: 'en' })
    const serialized = JSON.stringify(index)

    expect(serialized).not.toContain('zebranaut')
    expect(serialized).not.toContain('How To Answer Pricing Questions')
    // Control: the public page IS there, so the assertions above are measuring
    // selection rather than an extractor that silently produced nothing.
    expect(serialized).toContain('We make public things.')
  })

  it('honours the cascade when the marker sits on a container', () => {
    const content = site([
      page('/', { title: 'Home', sections: [section('Public.')] }),
      container('/kb', 'Agent Knowledge'),
      page('/kb/auth', { title: 'Auth', sections: [section('Secret token flow.')] }),
    ])
    content.pages[1].knowledge = true

    const index = generateSearchIndex(content, { locale: 'en' })

    expect(routesIn(index)).toEqual(['/'])
  })

  it('does NOT let /kb claim /kbase', () => {
    const content = siteWithKnowledge([
      page('/kbase', { title: 'Knowledge Base Blog', sections: [section('Public posts.')] }),
    ])

    expect(routesIn(generateSearchIndex(content, { locale: 'en' }))).toEqual(['/about', '/kbase'])
  })
})

describe('adopting the shared selector closes the rest of the gap too', () => {
  const content = site([
    page('/', { title: 'Home', sections: [section('Public.')] }),
    page('/hidden', { title: 'Hidden', hidden: true, sections: [section('Off the nav.')] }),
    page('/_draft', { title: 'Draft', sections: [section('Not finished.')] }),
    page('/blog/:slug', {
      title: 'Post',
      isDynamic: true,
      sections: [section('A template, not a page.')],
    }),
    container('/group', 'A Group'),
  ])

  it.each([
    ['a hidden page', '/hidden'],
    ['an underscore draft', '/_draft'],
    ['a dynamic route template', '/blog/:slug'],
    ['a content-less container', '/group'],
  ])('omits %s', (_label, route) => {
    expect(routesIn(generateSearchIndex(content, { locale: 'en' }))).not.toContain(route)
  })

  it('still indexes the ordinary page', () => {
    expect(routesIn(generateSearchIndex(content, { locale: 'en' }))).toEqual(['/'])
  })

  it('excludes a whole branch, not one page, and by segment', () => {
    const content = site([
      page('/', { title: 'Home', sections: [section('Public.')] }),
      page('/internal', { title: 'Internal', sections: [section('Staff only.')] }),
      page('/internal/pay', { title: 'Pay', sections: [section('Bands.')] }),
      page('/internally-facing', { title: 'Public', sections: [section('Fine.')] }),
    ])

    const entries = extractSearchContent(content, { excludeRoutes: ['/internal'] })

    expect([...new Set(entries.map(e => e.route))]).toEqual(['/', '/internally-facing'])
  })
})

describe('the public agent projections stay out too', () => {
  it('llms.txt names no knowledge page', () => {
    const index = renderSiteIndex(siteWithKnowledge(), { baseUrl: 'https://example.com' })

    expect(index).toContain('/about.md')
    expect(index).not.toContain('/kb')
    expect(index).not.toContain('zebranaut')
  })

  it('the per-page markdown selection omits them', () => {
    expect(routesOf(selectIndexablePages(siteWithKnowledge().pages))).toEqual(['/about'])
  })
})

describe('⭐ the agent corpus is unchanged — knowledge pages still reach the assistant', () => {
  it('selectCorpusPages still admits the whole knowledge branch', () => {
    expect(routesOf(selectCorpusPages(siteWithKnowledge().pages, { knowledge: true }))).toEqual([
      '/about',
      '/kb',
      '/kb/pricing',
    ])
  })

  it('and admits one that is hidden or noindex, which the public half never would', () => {
    const pages = [
      page('/', { sections: [section('Public.')] }),
      page('/kb', { knowledge: true, hidden: true, sections: [section('Agent only.')] }),
      page('/kb/deep', { seo: { noindex: true }, sections: [section('Also agent only.')] }),
    ]

    expect(routesOf(selectCorpusPages(pages, { knowledge: true }))).toEqual(['/', '/kb', '/kb/deep'])
    // The control for the pair above: the public selection rejects all three
    // signals, so the corpus is admitting them on the knowledge rule alone.
    expect(routesOf(selectIndexablePages(pages))).toEqual(['/'])
  })

  it('buildCorpus still carries the body the search index must not', () => {
    const corpus = buildCorpus(siteWithKnowledge(), { knowledge: true })
    const pricing = corpus.find(p => p.route === '/kb/pricing')

    expect(pricing.knowledge).toBe(true)
    expect(pricing.markdown).toContain('zebranaut')
  })

  it('`agents.exclude` and drafts still outrank a conflicting knowledge flag', () => {
    const pages = [
      page('/', { sections: [section('Public.')] }),
      page('/kb', { knowledge: true, sections: [section('Agent only.')] }),
      page('/kb/_wip', { sections: [section('Draft.')] }),
    ]

    expect(routesOf(selectCorpusPages(pages, { exclude: ['/kb'], knowledge: true }))).toEqual(['/'])
    expect(routesOf(selectCorpusPages(pages, { knowledge: true }))).toEqual(['/', '/kb'])
  })
})

describe('⛔ fail-closed: the agent tier has to ASK, passing nothing gets the public one', () => {
  it('selectCorpusPages defaults to the public selection', () => {
    const pages = siteWithKnowledge().pages

    expect(routesOf(selectCorpusPages(pages))).toEqual(['/about'])
    expect(routesOf(selectCorpusPages(pages))).toEqual(routesOf(selectIndexablePages(pages)))
  })

  it('buildCorpus defaults to the public selection and leaks no agent-only body', () => {
    const corpus = buildCorpus(siteWithKnowledge())

    expect(corpus.map(p => p.route)).toEqual(['/about'])
    expect(JSON.stringify(corpus)).not.toContain('zebranaut')
    // Control: the public page's body IS there, so the absence above is
    // selection and not an empty corpus.
    expect(JSON.stringify(corpus)).toContain('We make public things.')
  })

  it('every page in a defaulted corpus reports knowledge:false', () => {
    // Not cosmetic — a consumer may suppress citations for agent-only pages.
    // On the public tier there are none, and the flag must say so rather than
    // carry a value from a partition that was never consulted.
    expect(buildCorpus(siteWithKnowledge()).every(p => p.knowledge === false)).toBe(true)
  })

  it('an explicit `knowledge: false` reads the same as passing nothing', () => {
    const pages = siteWithKnowledge().pages

    expect(routesOf(selectCorpusPages(pages, { knowledge: false }))).toEqual(
      routesOf(selectCorpusPages(pages))
    )
  })
})
