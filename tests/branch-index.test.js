/**
 * Per-branch indexes (`/docs/llms.txt`).
 *
 * The property that governs the whole feature: a branch index is **additive**.
 * The root index keeps enumerating every page, because Phase 1's exit criterion
 * is that a cold agent reaches a leaf in two hops (`/llms.txt` → the `.md`), and
 * routing it through a branch index would make that three. Most of these tests
 * exist to keep that true.
 */

import { renderSiteIndex } from '../src/site-index.js'
import { selectIndexBranches } from '../src/pages.js'
import { branchIndexFilename, resolveAgentsConfig, DEFAULT_BRANCH_MIN_PAGES } from '../src/config.js'
import { page, container, section, site } from './helpers.js'

/** A site with a `/docs` branch of `n` pages plus two pages outside it. */
function siteWithDocs(n, extra = []) {
  const docs = Array.from({ length: n }, (_, i) =>
    page(`/docs/p${i + 1}`, {
      title: `Doc ${i + 1}`,
      sections: [section(`# Doc ${i + 1}\n\nBody of doc ${i + 1}.`)],
    })
  )
  return site([
    page('/', { title: 'Home', sections: [section('# Home\n\nWelcome.')] }),
    page('/about', { title: 'About', sections: [section('# About\n\nAbout us.')] }),
    container('/docs', 'Docs'),
    ...docs,
    ...extra,
  ])
}

describe('selectIndexBranches — which branches earn an index', () => {
  test('a branch at or above the threshold qualifies', () => {
    const branches = selectIndexBranches(siteWithDocs(DEFAULT_BRANCH_MIN_PAGES).pages, {
      minPages: DEFAULT_BRANCH_MIN_PAGES,
    })
    expect(branches).toEqual([
      { route: '/docs', title: 'Docs', count: DEFAULT_BRANCH_MIN_PAGES },
    ])
  })

  test('a branch below the threshold does not — it rides the root index alone', () => {
    const branches = selectIndexBranches(siteWithDocs(DEFAULT_BRANCH_MIN_PAGES - 1).pages, {
      minPages: DEFAULT_BRANCH_MIN_PAGES,
    })
    expect(branches).toEqual([])
  })

  test('only top-level containers, never nested ones', () => {
    // `/docs/authoring` is already covered by both `/llms.txt` and
    // `/docs/llms.txt`; a third file at every depth adds no reachability.
    const nested = Array.from({ length: 6 }, (_, i) =>
      page(`/docs/authoring/n${i}`, { title: `N${i}`, sections: [section(`# N${i}\n\nBody.`)] })
    )
    const content = siteWithDocs(6, [container('/docs/authoring', 'Authoring'), ...nested])

    const routes = selectIndexBranches(content.pages, { minPages: 5 }).map(b => b.route)
    expect(routes).toEqual(['/docs'])
  })

  test('excluded branches never qualify', () => {
    const content = siteWithDocs(8)
    expect(selectIndexBranches(content.pages, { exclude: ['/docs'], minPages: 5 })).toEqual([])
  })

  test('a noindex container excludes its whole branch', () => {
    const content = siteWithDocs(8)
    const docs = content.pages.find(p => p.route === '/docs')
    docs.seo.noindex = true
    expect(selectIndexBranches(content.pages, { minPages: 5 })).toEqual([])
  })

  test('the count is of indexable pages, so hidden ones do not push a branch over', () => {
    const content = siteWithDocs(5)
    content.pages.find(p => p.route === '/docs/p5').hidden = true
    expect(selectIndexBranches(content.pages, { minPages: 5 })).toEqual([])
  })
})

describe('renderSiteIndex — branch scoping', () => {
  test('a branch index lists only that branch, titled by its container', () => {
    const content = siteWithDocs(5)
    const out = renderSiteIndex(content, { branch: '/docs' })

    expect(out.startsWith('# Docs\n')).toBe(true)
    expect(out).toContain('- [Doc 1](/docs/p1.md)')
    expect(out).not.toContain('/about.md')
    expect(out).not.toContain('[Home]')
  })

  test('the branch container is not also a group heading inside its own index', () => {
    // Its title is already the H1; repeating it as `## Docs` would be noise.
    const out = renderSiteIndex(siteWithDocs(5), { branch: '/docs' })
    expect(out).not.toContain('## Docs')
  })

  test('a sub-container inside the branch still groups', () => {
    const nested = [
      container('/docs/authoring', 'Authoring'),
      page('/docs/authoring/a', { title: 'A', sections: [section('# A\n\nBody.')] }),
    ]
    const out = renderSiteIndex(siteWithDocs(5, nested), { branch: '/docs' })
    expect(out).toContain('## Authoring')
    expect(out).toContain('- [A](/docs/authoring/a.md)')
  })

  test('THE INVARIANT: the root index still enumerates the branch', () => {
    // If this ever fails, the two-hop criterion is broken — an agent landing on
    // `/llms.txt` would have to discover `/docs/llms.txt` and fetch again.
    const root = renderSiteIndex(siteWithDocs(8))
    for (let i = 1; i <= 8; i++) expect(root).toContain(`/docs/p${i}.md`)
  })

  test('branch scoping changes nothing about a site with no branches', () => {
    const content = siteWithDocs(2)
    expect(renderSiteIndex(content, { branch: null })).toBe(renderSiteIndex(content))
  })
})

describe('branchIndexFilename', () => {
  test('sits at the root of what it indexes', () => {
    expect(branchIndexFilename('/docs')).toBe('docs/llms.txt')
    expect(branchIndexFilename('/a/b')).toBe('a/b/llms.txt')
  })

  test('an empty route is the site index', () => {
    expect(branchIndexFilename('/')).toBe('llms.txt')
    expect(branchIndexFilename('')).toBe('llms.txt')
  })
})

describe('resolveAgentsConfig — branch options', () => {
  test('on by default, gated on size', () => {
    const cfg = resolveAgentsConfig({})
    expect(cfg.branchIndexes).toBe(true)
    expect(cfg.branchMinPages).toBe(DEFAULT_BRANCH_MIN_PAGES)
  })

  test('opt out without disabling the rest', () => {
    const cfg = resolveAgentsConfig({ agents: { branchIndexes: false } })
    expect(cfg.branchIndexes).toBe(false)
    expect(cfg.index).toBe(true)
    expect(cfg.markdown).toBe(true)
  })

  test('a custom threshold is honored; a non-integer falls back', () => {
    expect(resolveAgentsConfig({ agents: { branchMinPages: 20 } }).branchMinPages).toBe(20)
    expect(resolveAgentsConfig({ agents: { branchMinPages: 'lots' } }).branchMinPages).toBe(
      DEFAULT_BRANCH_MIN_PAGES
    )
  })

  test('`agents: false` turns branch indexes off with everything else', () => {
    expect(resolveAgentsConfig({ agents: false }).branchIndexes).toBe(false)
  })
})
