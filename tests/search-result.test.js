import { describe, it, expect } from 'vitest'
import {
  buildSearchStructure,
  rankSearchEntries,
  matchRanges,
  searchResult,
  emptyResult,
} from '../src/search/index.js'

/**
 * The result a hit becomes, and where its snippet marks. The marks are the terms the ranking
 * scored with, found by the engine's own fold and tokenizer, never a lowercase `indexOf`.
 */
const shown = (entries, query) => {
  const ranked = rankSearchEntries(buildSearchStructure(entries), query, entries)
  return ranked.hits.map((h) => searchResult(entries[h.doc], { terms: ranked.terms }))
}

describe('the snippet marks what the ranking matched', () => {
  it('marks "café" for the query cafe, the hit the ranking returns (measured 2026-10-23)', () => {
    const entries = [{ id: 'page:/menu', type: 'page', route: '/menu', title: 'Menu', content: 'Le café est ouvert tous les jours.' }]
    const ranked = rankSearchEntries(buildSearchStructure(entries), 'cafe', entries)
    expect(ranked.hits).toHaveLength(1)
    expect(ranked.hits[0].fuzzy).toBeUndefined()
    const [result] = ranked.hits.map((h) => searchResult(entries[h.doc], { terms: ranked.terms }))
    expect(result.snippetHtml).toBe('Le <mark>café</mark> est ouvert tous les jours.')
    expect(result.matches).toEqual([{ key: 'content', indices: [[3, 6]] }])
  })

  it('marks the completion of the word being typed, and a correction', () => {
    const entries = [{ id: 'a', content: 'Testing the engine on a form.' }]
    expect(shown(entries, 'tes')[0].snippetHtml).toBe('<mark>Testing</mark> the engine on a form.')
    // `fomr` matches nothing literally, so the fallback scores `form`, and the snippet marks it.
    expect(shown(entries, 'fomr')[0].snippetHtml).toBe('Testing the engine on a <mark>form</mark>.')
  })

  it('marks a bigram on its two characters, and joins bigrams that overlap', () => {
    const entries = [{ id: 'a', content: '東京都に住む' }]
    expect(shown(entries, '京都')[0].snippetHtml).toBe('東<mark>京都</mark>に住む')
    expect(shown(entries, '東京都')[0].snippetHtml).toBe('<mark>東京都</mark>に住む')
  })

  it('traces a fold that changes lengths back to the characters written', () => {
    expect(matchRanges('Ｕｎｉｗｅｂ rocks', ['uniweb'])).toEqual([[0, 5]])
    expect(matchRanges('a ﬁle here', ['file'])).toEqual([[2, 4]])
    // `e` + COMBINING ACUTE: the mark rides with its letter, so the range covers both.
    expect(matchRanges('café au lait', ['cafe'])).toEqual([[0, 4]])
    // A Greek final sigma folds by its context, as the ranking folded it.
    expect(matchRanges('ΟΔΟΣ ΚΑΙ', ['οδος'])).toEqual([[0, 3]])
  })

  it('marks nothing, rather than the wrong characters, where a fold composes across characters', () => {
    // Conjoining jamo compose into one syllable only when folded together.
    expect(matchRanges('가 cafe', ['cafe'])).toEqual([])
  })

  it('escapes the text it marks', () => {
    const entries = [{ id: 'a', content: 'Use <script> & "quotes" with care' }]
    expect(shown(entries, 'quotes')[0].snippetHtml).toBe('Use &lt;script&gt; &amp; &quot;<mark>quotes</mark>&quot; with care')
  })
})

describe('rankSearchEntries says which terms it scored with', () => {
  const entries = [{ content: 'test testing tester' }, { content: 'a form' }]
  const structure = buildSearchStructure(entries)

  it('the query own terms and the completions of the last one', () => {
    expect(rankSearchEntries(structure, 'test', entries).terms.sort()).toEqual(['test', 'tester', 'testing'])
    // A finished word is not completed.
    expect(rankSearchEntries(structure, 'test ', entries).terms).toEqual(['test'])
  })

  it('the corrections, when the fallback answered, and nothing when nothing matched', () => {
    expect(rankSearchEntries(structure, 'fomr', entries).terms).toEqual(['form'])
    expect(rankSearchEntries(structure, 'zebra', entries)).not.toHaveProperty('terms')
  })
})

describe('searchResult — the one shape', () => {
  it('fills every field of the contract, guaranteed ones as strings', () => {
    const result = searchResult({ id: 'x' })
    expect(Object.keys(result).sort()).toEqual(Object.keys(emptyResult()).sort())
    for (const key of ['id', 'type', 'route', 'href', 'title', 'pageTitle', 'excerpt', 'snippetHtml']) {
      expect(typeof result[key], key).toBe('string')
    }
  })

  it('links a section by its anchor, and carries a record its group and display fields', () => {
    const section = searchResult({ id: 's', type: 'section', route: '/docs', anchor: 'setup', sectionId: '2', content: 'Setup' })
    expect(section).toMatchObject({ href: '/docs#setup', anchor: 'setup', sectionId: '2' })
    const record = searchResult({ id: 'record:posts:a', type: 'record', group: 'posts', route: '/blog/a', content: 'A', item: { title: 'A' } })
    expect(record).toMatchObject({ href: '/blog/a', group: 'posts', item: { title: 'A' } })
  })

  it('without terms, the snippet is the text from its start', () => {
    const result = searchResult({ id: 'a', content: 'Plain text.' })
    expect(result).toMatchObject({ snippetHtml: 'Plain text.', snippetText: 'Plain text.', matches: null })
  })
})

describe("searchResult — a page's own excerpt and page title", () => {
  it("a page's excerpt is its description, and the page a hit is on is itself", () => {
    const result = searchResult({ id: 'page:/about', type: 'page', route: '/about', title: 'About', description: 'Who we are.', content: 'About Who we are.' })
    expect(result).toMatchObject({ pageTitle: 'About', excerpt: 'Who we are.' })
  })

  it("keeps a section's own", () => {
    const result = searchResult({ id: 's', type: 'section', route: '/about', title: 'Team', pageTitle: 'About', excerpt: 'Six people.', content: 'Six people.' })
    expect(result).toMatchObject({ pageTitle: 'About', excerpt: 'Six people.' })
  })
})
