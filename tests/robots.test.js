/**
 * `robots.txt` (`src/robots.js`) — a site's rules for crawlers, from its content alone, so a static
 * build and a host serving the site from its content publish the same file.
 *
 * Content Signals sit on a different axis from `Disallow:`. That governs
 * *fetching*; this governs *use after fetching* — search results, inference-time
 * retrieval, model training. So the two never substitute for each other, and a
 * site can allow crawling while declining training.
 *
 * The load-bearing case is the absent one: an undeclared signal must emit
 * nothing. Emitting a default in either direction would assert a preference the
 * site owner never stated, and "unstated" is not "no".
 */

import { formatContentSignals, renderRobotsTxt } from '../src/robots.js'
import { renderRobotsTxt as exported } from '../src/index.js'
import { site } from './helpers.js'

const ADDRESS = 'https://example.com/'

/** A site's content with these robots rules, at this address and base. */
const content = (robots, config = {}) => site([], { url: ADDRESS, seo: robots === undefined ? {} : { robots }, ...config })

describe('formatContentSignals', () => {
  test('emits nothing when undeclared — silence is not consent, nor refusal', () => {
    expect(formatContentSignals(null)).toBe('')
    expect(formatContentSignals(undefined)).toBe('')
    expect(formatContentSignals({})).toBe('')
  })

  test('booleans become yes/no', () => {
    expect(formatContentSignals({ search: true, 'ai-input': true, 'ai-train': false })).toBe(
      'Content-Signal: search=yes, ai-input=yes, ai-train=no'
    )
  })

  test('the string forms are accepted too, since YAML invites them', () => {
    expect(formatContentSignals({ search: 'yes', 'ai-train': 'no' })).toBe(
      'Content-Signal: search=yes, ai-train=no'
    )
  })

  test('order is canonical, not authoring order — the output must be deterministic', () => {
    const a = formatContentSignals({ 'ai-train': false, search: true, 'ai-input': true })
    const b = formatContentSignals({ search: true, 'ai-input': true, 'ai-train': false })
    expect(a).toBe(b)
    expect(a).toBe('Content-Signal: search=yes, ai-input=yes, ai-train=no')
  })

  test('a partial declaration emits only what was declared', () => {
    expect(formatContentSignals({ 'ai-train': false })).toBe('Content-Signal: ai-train=no')
  })

  test('unknown keys are dropped, not forwarded', () => {
    // The vocabulary is a closed set. Forwarding an invented signal would
    // produce a directive no crawler honors while reading as though it did.
    expect(formatContentSignals({ 'ai-summarize': true })).toBe('')
    expect(formatContentSignals({ search: true, 'ai-summarize': true })).toBe(
      'Content-Signal: search=yes'
    )
  })

  test('a non-boolean value is skipped rather than coerced', () => {
    // `search: maybe` is an authoring mistake; guessing at it would encode the
    // guess into a published policy file.
    expect(formatContentSignals({ search: 'maybe', 'ai-train': false })).toBe(
      'Content-Signal: ai-train=no'
    )
  })
})

describe('renderRobotsTxt — what the file says', () => {
  test('is the package export', () => {
    expect(exported).toBe(renderRobotsTxt)
  })

  test('the directive sits inside the User-agent group, above the rules', () => {
    const out = renderRobotsTxt(content({ contentSignals: { search: true, 'ai-train': false }, disallow: ['/internal'] }), { sitemap: true })

    const lines = out.split('\n')
    expect(lines[0]).toBe('User-agent: *')
    expect(lines[1]).toBe('Content-Signal: search=yes, ai-train=no')
    expect(lines[2]).toBe('Disallow: /internal')
  })

  test('an undeclared signal block leaves the file byte-identical', () => {
    const withOut = renderRobotsTxt(content({ disallow: ['/internal'] }), { sitemap: true })
    const withNull = renderRobotsTxt(content({ disallow: ['/internal'], contentSignals: null }), { sitemap: true })
    expect(withNull).toBe(withOut)
    expect(withOut).toBe('User-agent: *\nDisallow: /internal\n\nSitemap: https://example.com/sitemap.xml\n')
  })

  test('signals coexist with allow, crawl-delay and further sitemaps', () => {
    const out = renderRobotsTxt(
      content({
        contentSignals: { 'ai-input': true },
        allow: ['/public'],
        crawlDelay: 2,
        additionalSitemaps: ['https://example.com/news-sitemap.xml'],
      }),
      { sitemap: true }
    )

    expect(out).toBe(
      'User-agent: *\nContent-Signal: ai-input=yes\nAllow: /public\nCrawl-delay: 2\n\n' +
        'Sitemap: https://example.com/sitemap.xml\nSitemap: https://example.com/news-sitemap.xml\n'
    )
  })

  test('a site with a sitemap and no rules names its sitemap', () => {
    expect(renderRobotsTxt(content(undefined), { sitemap: true })).toBe('User-agent: *\n\nSitemap: https://example.com/sitemap.xml\n')
  })

  test('the sitemap is named on the address the content states, never a guessed one', () => {
    const out = renderRobotsTxt(content(undefined, { url: 'https://www.example.org' }), { sitemap: true })
    expect(out).toContain('Sitemap: https://www.example.org/sitemap.xml\n')
  })
})

describe('renderRobotsTxt — when there is none', () => {
  test('rules, and no address: the rules alone — a Sitemap line must be absolute', () => {
    expect(renderRobotsTxt(content({ disallow: ['/private'] }, { url: undefined }), { sitemap: true })).toBe('User-agent: *\nDisallow: /private\n')
  })

  test('no rules and no sitemap: none — a missing file already means no restrictions', () => {
    expect(renderRobotsTxt(content(undefined))).toBeNull()
    expect(renderRobotsTxt(content({ disallow: [], contentSignals: { search: 'maybe' } }))).toBeNull()
    expect(renderRobotsTxt(content(undefined, { url: undefined }), { sitemap: true })).toBeNull()
    expect(renderRobotsTxt({})).toBeNull()
    expect(renderRobotsTxt(undefined)).toBeNull()
  })

  test('a site served under a base path has none: a crawler reads robots.txt only at a host root', () => {
    const rules = { disallow: ['/private'] }
    expect(renderRobotsTxt(content(rules, { url: 'https://octocat.github.io/handbook/' }), { sitemap: true })).toBeNull()
    expect(renderRobotsTxt(content(rules, { url: undefined, base: '/handbook/' }))).toBeNull()
    // at the root, either way the content says so
    expect(renderRobotsTxt(content(rules, { url: undefined, base: '/' }))).toBe('User-agent: *\nDisallow: /private\n')
    expect(renderRobotsTxt(content(rules, { url: undefined, base: '' }))).toBe('User-agent: *\nDisallow: /private\n')
  })

  test('the address the host states decides, over a base it does not', () => {
    // A host states its own address; the base a build was configured with says nothing about it.
    expect(renderRobotsTxt(content({ disallow: ['/x'] }, { base: '/handbook/' }))).toBe('User-agent: *\nDisallow: /x\n')
  })
})

describe('renderRobotsTxt — deterministic', () => {
  test('one input, one output, and the input is left as it was', () => {
    const input = content({ contentSignals: { 'ai-train': false }, disallow: ['/a', '/b'] })
    const before = structuredClone(input)
    expect(renderRobotsTxt(input, { sitemap: true })).toBe(renderRobotsTxt(structuredClone(input), { sitemap: true }))
    expect(input).toEqual(before)
  })
})
