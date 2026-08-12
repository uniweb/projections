import { describe, it, expect } from 'vitest'
import { renderPageMarkdown } from '../src/markdown.js'
import {
  buildCorpus,
  buildCorpusManifest,
  selectCorpusPages,
  partitionKnowledgePages,
} from '../src/corpus.js'
import { page, container, section, site } from './helpers.js'

const routesOf = pages => pages.map(p => p.route)

describe('partitionKnowledgePages', () => {
  it('cascades by route prefix', () => {
    const pages = [page('/'), page('/kb', { knowledge: true }), page('/kb/auth')]
    const { knowledgePages, renderedPages } = partitionKnowledgePages(pages)

    expect(routesOf(knowledgePages)).toEqual(['/kb', '/kb/auth'])
    expect(routesOf(renderedPages)).toEqual(['/'])
  })

  it('does NOT let /kb claim /kbase', () => {
    const pages = [page('/kb', { knowledge: true }), page('/kbase')]
    const { knowledgePages } = partitionKnowledgePages(pages)

    expect(routesOf(knowledgePages)).toEqual(['/kb'])
  })

  it('a knowledge root at / claims every descendant but not itself twice', () => {
    const pages = [page('/', { knowledge: true }), page('/a'), page('/a/b')]
    const { knowledgePages, renderedPages } = partitionKnowledgePages(pages)

    expect(routesOf(knowledgePages)).toEqual(['/', '/a', '/a/b'])
    expect(renderedPages).toEqual([])
  })

  it('tolerates a non-array', () => {
    expect(partitionKnowledgePages(undefined)).toEqual({ knowledgePages: [], renderedPages: [] })
  })
})

describe('selectCorpusPages — what the agent may see', () => {
  it('⛔ excludes a noindex page: the corpus is NOT the site\'s full content', () => {
    const pages = [page('/'), page('/private', { seo: { noindex: true } })]

    expect(routesOf(selectCorpusPages(pages))).toEqual(['/'])
  })

  it('⛔ excludes a hidden page for the same reason', () => {
    const pages = [page('/'), page('/draft', { hidden: true })]

    expect(routesOf(selectCorpusPages(pages))).toEqual(['/'])
  })

  it('adds knowledge pages on top of the public selection', () => {
    const pages = [page('/'), page('/kb', { knowledge: true, hidden: true })]

    expect(routesOf(selectCorpusPages(pages))).toEqual(['/', '/kb'])
  })

  it('a knowledge page overrides hidden AND noindex — otherwise knowledge: does nothing', () => {
    const pages = [page('/kb', { knowledge: true, hidden: true, seo: { noindex: true } })]

    expect(routesOf(selectCorpusPages(pages))).toEqual(['/kb'])
  })

  it('⛔ FAILS CLOSED: agents.exclude outranks a conflicting knowledge: true', () => {
    const pages = [page('/'), page('/internal/notes', { knowledge: true })]

    expect(routesOf(selectCorpusPages(pages, { exclude: ['/internal'] }))).toEqual(['/'])
  })

  it('⛔ FAILS CLOSED: a _-prefixed route stays out even when marked knowledge', () => {
    const pages = [page('/'), page('/_scratch', { knowledge: true })]

    expect(routesOf(selectCorpusPages(pages))).toEqual(['/'])
  })

  it('excludes containers and dynamic templates — shape, not policy', () => {
    const pages = [
      page('/'),
      container('/docs', 'Docs'),
      page('/blog/:slug', { isDynamic: true, knowledge: true }),
    ]

    expect(routesOf(selectCorpusPages(pages))).toEqual(['/'])
  })

  it('returns build order and never duplicates a page selected by both routes', () => {
    const pages = [page('/a'), page('/b', { knowledge: true }), page('/c')]

    expect(routesOf(selectCorpusPages(pages))).toEqual(['/a', '/b', '/c'])
  })
})

describe('buildCorpus', () => {
  const docs = () =>
    site([
      page('/auth', {
        title: 'Authentication',
        description: 'How to authenticate.',
        sections: [
          section('# Tokens\n\nPost to `/auth/token` to get one.', { id: 1 }),
          section('# Errors\n\nA 429 means slow down.', { id: 2 }),
        ],
      }),
    ])

  it('a page is ONE markdown string, byte-identical to renderPageMarkdown', () => {
    const content = docs()
    const [built] = buildCorpus(content)

    expect(built.markdown).toBe(renderPageMarkdown(content.pages[0]))
  })

  it('segment line ranges index into that exact string', () => {
    const [built] = buildCorpus(docs())
    const lines = built.markdown.split('\n')

    for (const segment of built.segments) {
      const slice = lines.slice(segment.startLine - 1, segment.endLine).join('\n')
      expect(slice).toBe(segment.markdown)
    }
  })

  it('lineCount is the real number of lines in the page markdown', () => {
    const [built] = buildCorpus(docs())

    expect(built.lineCount).toBe(built.markdown.split('\n').length)
  })

  it('the second segment starts after the blank separator line, not on it', () => {
    const [built] = buildCorpus(docs())
    const [first, second] = built.segments
    const lines = built.markdown.split('\n')

    expect(second.startLine).toBe(first.endLine + 2)
    expect(lines[first.endLine]).toBe('') // the separator, 0-based == endLine
    expect(lines[second.startLine - 1]).not.toBe('')
  })

  it('carries the section anchor, so a hit can be cited as route#anchor', () => {
    const [built] = buildCorpus(docs())

    expect(built.segments).toHaveLength(2)
    for (const segment of built.segments) {
      expect(segment.anchor).toBeTruthy()
      expect(typeof segment.anchor).toBe('string')
    }
    expect(built.segments[0].anchor).not.toBe(built.segments[1].anchor)
  })

  it('reads the leading heading as the segment title', () => {
    const [built] = buildCorpus(docs())

    expect(built.segments.map(s => s.title)).toEqual(['Tokens', 'Errors'])
  })

  it('leaves the segment title empty when a block opens with prose', () => {
    const content = site([
      page('/p', { sections: [section('Just a paragraph, no heading.', { id: 1 })] }),
    ])
    const [built] = buildCorpus(content)

    expect(built.segments[0].title).toBe('')
  })

  it('does not mistake a # inside a fenced block for a heading', () => {
    const content = site([
      page('/p', { sections: [section('```sh\n# not a heading\n```', { id: 1 })] }),
    ])
    const [built] = buildCorpus(content)

    expect(built.segments[0].title).toBe('')
  })

  it('drops a page whose sections project to nothing', () => {
    const content = site([
      page('/empty', { sections: [section(null, { id: 1 })] }),
      page('/real', { sections: [section('# Real\n\nBody.', { id: 2 })] }),
    ])

    expect(buildCorpus(content).map(p => p.route)).toEqual(['/real'])
  })

  it('marks agent-only pages so a citation can be suppressed', () => {
    const content = site([
      page('/', { sections: [section('# Home', { id: 1 })] }),
      page('/kb', { knowledge: true, hidden: true, sections: [section('# KB', { id: 2 })] }),
    ])
    const corpus = buildCorpus(content)

    expect(corpus.find(p => p.route === '/').knowledge).toBe(false)
    expect(corpus.find(p => p.route === '/kb').knowledge).toBe(true)
  })

  it('reads agents.exclude from site config when no override is passed', () => {
    const content = site(
      [
        page('/', { sections: [section('# Home', { id: 1 })] }),
        page('/internal', { sections: [section('# Internal', { id: 2 })] }),
      ],
      { agents: { exclude: ['/internal'] } }
    )

    expect(buildCorpus(content).map(p => p.route)).toEqual(['/'])
  })

  it('tolerates an empty payload', () => {
    expect(buildCorpus(undefined)).toEqual([])
    expect(buildCorpus({ pages: [] })).toEqual([])
  })
})

describe('buildCorpusManifest', () => {
  it('carries shape and cost, but no body text', () => {
    const content = site([
      page('/auth', {
        title: 'Authentication',
        description: 'How to authenticate.',
        sections: [section('# Tokens\n\nPost to `/auth/token`.', { id: 1 })],
      }),
    ])
    const manifest = buildCorpusManifest(buildCorpus(content))

    expect(manifest).toEqual([
      {
        route: '/auth',
        title: 'Authentication',
        description: 'How to authenticate.',
        knowledge: false,
        lines: expect.any(Number),
        sections: [{ anchor: expect.any(String), title: 'Tokens', startLine: 1 }],
      },
    ])
    expect(JSON.stringify(manifest)).not.toContain('Post to')
  })

  it('tolerates an empty corpus', () => {
    expect(buildCorpusManifest()).toEqual([])
  })
})
