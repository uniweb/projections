/**
 * ⭐ `resolvePageMarkdown` — whether a request names a public markdown document, and for which page:
 * `resolveMarkdownRequest`'s answer held to the rule a static build writes its page markdown by
 * (`markdownPageRule`), so a host picks nothing itself.
 *
 * Asked for by a host, 2026-11-09, which chained `resolveMarkdownRequest`, then dropped agent-only
 * pages (`partitionKnowledgePages`), then checked `selectIndexablePages` on pages that are not a
 * record's, to answer the same question.
 */
import { describe, it, expect } from 'vitest'
import { resolvePageMarkdown, markdownPageRule, selectIndexablePages } from '../src/index.js'

const pages = [
  { route: '/', title: 'Home', sections: [{}] },
  { route: '/blog', title: 'Blog', sections: [{}] },
  { route: '/blog/:slug', title: 'Post', isDynamic: true, sections: [{}] },
  { route: '/docs', title: 'Docs', hasContent: false },
  { route: '/docs/intro', title: 'Intro', sections: [{}] },
  { route: '/kb', title: 'KB', knowledge: true, sections: [{}] },
  { route: '/kb/auth', title: 'Auth', sections: [{}] },
  { route: '/kb/notes/:slug', title: 'Note', isDynamic: true, sections: [{}] },
  { route: '/quiet', title: 'Quiet', seo: { noindex: true }, sections: [{}] },
  { route: '/draft', title: 'Draft', hidden: true, sections: [{}] },
  { route: '/internal', title: 'Internal', sections: [{}] },
  { route: '/internal/pay', title: 'Pay', sections: [{}] },
  { route: '/closed', title: 'Closed', hasContent: false, seo: { noindex: true } },
  { route: '/closed/page', title: 'In closed', sections: [{}] },
]
const site = (agents) => ({ pages, config: { defaultLanguage: 'en', ...(agents === undefined ? {} : { agents }) } })

describe('resolvePageMarkdown', () => {
  it('⭐ a page with a public markdown document is its page', () => {
    expect(resolvePageMarkdown(site(), '/blog.md')).toMatchObject({ kind: 'page', route: '/blog' })
    expect(resolvePageMarkdown(site(), '/docs/intro.md')).toMatchObject({ kind: 'page', route: '/docs/intro' })
    expect(resolvePageMarkdown(site(), '/blog.md').record).toBeUndefined()
  })

  it('⭐ a record\'s page is its parametric page, at the record\'s URL, marked `record`', () => {
    expect(resolvePageMarkdown(site(), '/blog/hello.md')).toMatchObject({
      kind: 'page',
      route: '/blog/hello',
      template: '/blog/:slug',
      record: true,
      page: { route: '/blog/:slug' },
    })
  })

  it('agent-only pages have none, a record of one included', () => {
    for (const path of ['/kb.md', '/kb/auth.md', '/kb/notes/x.md']) {
      expect(resolvePageMarkdown(site(), path), path).toEqual({ kind: 'notFound', status: 404, page: null })
    }
  })

  it('nor do noindex and hidden pages, an excluded branch, or a closed folder\'s pages', () => {
    const excluding = site({ exclude: ['/internal'] })
    for (const path of ['/quiet.md', '/draft.md', '/internal.md', '/internal/pay.md', '/closed/page.md']) {
      expect(resolvePageMarkdown(excluding, path), path).toMatchObject({ kind: 'notFound' })
    }
    // CONTROL: the excluded branch has them when nothing excludes it.
    expect(resolvePageMarkdown(site(), '/internal/pay.md')).toMatchObject({ kind: 'page' })
  })

  it('a site that turns page markdown off has none at all', () => {
    expect(resolvePageMarkdown(site({ markdown: false }), '/blog.md')).toMatchObject({ kind: 'notFound' })
    expect(resolvePageMarkdown(site(false), '/blog/hello.md')).toMatchObject({ kind: 'notFound' })
  })

  it('a redirect and a path that is no .md pass as resolveMarkdownRequest gives them', () => {
    expect(resolvePageMarkdown(site(), '/docs.md')).toMatchObject({ kind: 'redirect', location: '/docs/intro.md' })
    expect(resolvePageMarkdown(site(), '/blog')).toBe(null)
  })

  it('⭐ CONTROL — the rule is the static build\'s: the pages it holds are selectIndexablePages\'', () => {
    const exclude = ['/internal']
    const rule = markdownPageRule(site({ exclude }))
    expect(pages.filter(rule.page)).toEqual(selectIndexablePages(pages, { exclude }))
  })
})
