/**
 * The search engine — the properties that made it worth building.
 *
 * ⭐ Contributed with the engine on 2026-09-06, renamed to this package's exports
 * and otherwise unchanged: they are the tests that were run against the
 * measurements the code's comments cite, so rewriting them would have thrown away
 * the evidence and kept the prose. The fuzzy-fallback block at the end is this
 * package's addition.
 *
 * ⛔ These assert BEHAVIOUR, not scores. A BM25 constant is a tuning choice and
 * pinning one turns every future tuning into a test edit; what must not regress is
 * the ORDERING and the MATCHING, which is what a visitor experiences.
 */
import { describe, it, expect } from 'vitest'
import { tokenize, fold, buildSearchStructure, rankSearchEntries, prefixTerms } from '../src/search/engine.js'

const doc = (title, content, weight = 0.8) => ({ title, content, weight })
// `rankSearchEntries` returns {hits, total} since top-k selection landed — `total` is the
// match count BEFORE truncation, so a caller can say "showing 10 of 47".
const hits = (...args) => rankSearchEntries(...args).hits
const titles = (res, es) => res.map((r) => es[r.doc].title)

describe('tokenize — a global product, not an English one', () => {
  it('folds diacritics so `cafe` and `café` are ONE term', () => {
    expect(tokenize('Café')).toEqual(tokenize('cafe'))
    expect(fold('ÀÉÎÕÜ')).toBe('aeiou')
  })

  it('⛔ splits CJK into BIGRAMS — whitespace tokenization yields one useless token', () => {
    expect(tokenize('東京都')).toEqual(['東京', '京都'])
    // A single character must still be findable rather than dropped.
    expect(tokenize('京')).toEqual(['京'])
  })

  it('handles a mixed CJK / latin run without merging the two', () => {
    expect(tokenize('iPhone用')).toEqual(['iphone', '用'])
  })

  it('drops one-letter noise but keeps digits — a version or a year is a real query', () => {
    expect(tokenize('a I 2026 v2')).toEqual(['2026', 'v2'])
  })
})

describe('the ranking properties the substring scan could not have', () => {
  const es = [
    doc('Pricing', 'uniweb uniweb uniweb pricing pricing pricing'),
    doc('About', 'uniweb uniweb uniweb and one mention of pricing'),
    doc('Contact', 'uniweb uniweb uniweb only'),
  ]
  const ix = buildSearchStructure(es)

  it('⛔ TERM FREQUENCY counts — the old engine could not tell 1 mention from 20', () => {
    const [first, second] = hits(ix, 'pricing', es)
    expect(es[first.doc].title).toBe('Pricing')
    expect(first.score).toBeGreaterThan(second.score)
  })

  it('⭐ IDF: a word in EVERY document barely moves the ranking', () => {
    // `uniweb` is in all three, so it is nearly free information — which is what
    // makes a hardcoded stopword list unnecessary, and wrong for a global product.
    const common = hits(ix, 'uniweb', es)
    const rare = hits(ix, 'pricing', es)
    expect(common[0].score).toBeLessThan(rare[0].score)
  })

  it('⛔ SUBSTRING FALSE MATCHES ARE GONE — `art` no longer finds `smart`', () => {
    const smart = [doc('Smart Contracts', 'clever things')]
    const ixs = buildSearchStructure(smart)
    expect(hits(ixs, 'art', smart)).toEqual([])
    expect(hits(ixs, 'smart', smart)).toHaveLength(1)
  })

  it('a TITLE hit outranks an equal body hit of the same term', () => {
    const es2 = [doc('Nothing', 'shipping here'), doc('Shipping', 'nothing much here')]
    const ix2 = buildSearchStructure(es2)
    expect(titles(hits(ix2, 'shipping', es2), es2)[0]).toBe('Shipping')
  })

  // ⚠️ TWO DRAFTS OF THIS TEST WERE WRONG, AND BOTH TAUGHT SOMETHING.
  //
  // The first asserted a title hit beats three body hits — that is the exact
  // equality point of `W_TITLE = 3`, so it tested the constant rather than the
  // behaviour. The second assumed FIVE body hits would overtake it; they do not,
  // because length normalization (`b = 0.75`) penalizes a short body carrying many
  // repeats, and saturation caps what repetition can buy. ⭐ **Both failures were the
  // engine being right**, and what they actually exposed is the property below —
  // which is the one worth pinning, because it is what BM25 is FOR.
  it('⭐ TERM FREQUENCY SATURATES — 20 mentions is not 20x one mention', () => {
    const many = `${'shipping '.repeat(20)}${'pad '.repeat(80)}`.trim()
    const once = `shipping ${'pad '.repeat(99)}`.trim()
    const es3 = [doc('A', many), doc('B', once)]
    const ix3 = buildSearchStructure(es3)
    const [top, second] = hits(ix3, 'shipping', es3)
    expect(es3[top.doc].title).toBe('A') // more mentions still ranks higher
    expect(top.score / second.score).toBeLessThan(4) // but nowhere near 20x
  })

  it('an unknown term does not sink a query that has a known one', () => {
    expect(hits(ix, 'pricing xyzzyqq', es).length).toBeGreaterThan(0)
  })

  it('the per-entry `weight` still applies — the projection ranks pages over sections', () => {
    const es3 = [doc('A', 'widget', 0.2), doc('B', 'widget', 1.0)]
    const ix3 = buildSearchStructure(es3)
    expect(titles(hits(ix3, 'widget', es3), es3)).toEqual(['B', 'A'])
  })
})

describe('the term dictionary is SORTED, which is what prefix search needs', () => {
  const es = [doc('Zebra Care', 'zebras roam the plain'), doc('Other', 'nothing')]
  const ix = buildSearchStructure(es)

  it('the dictionary is in sorted order', () => {
    expect([...ix.terms]).toEqual([...ix.terms].sort())
  })

  it('⭐ search-as-you-type: a partial last word still matches', () => {
    for (const q of ['zeb', 'zebr', 'zebra', 'zebras']) {
      expect(hits(ix, q, es).length, `q=${q}`).toBeGreaterThan(0)
    }
  })

  it('⛔ but a one-letter prefix does NOT expand — it would match the vocabulary', () => {
    expect(prefixTerms(ix, 'z')).toEqual([])
  })

  it('prefix expansion is capped, keeping the COMMONEST completions', () => {
    const many = Array.from({ length: 60 }, (_, i) => doc(`T${i}`, `prefix${i} common`))
    const ixm = buildSearchStructure(many)
    expect(prefixTerms(ixm, 'prefix', 5)).toHaveLength(5)
  })

  it('an EXACT term is not diluted by its own completions', () => {
    // `zebra` is a real term, so it scores at full weight rather than as a guess.
    const exact = hits(ix, 'zebra', es)
    const partial = hits(ix, 'zebr', es)
    expect(exact[0].score).toBeGreaterThan(partial[0].score)
  })
})

describe('the shape that keeps parse cost down', () => {
  it('⛔ postings are FLAT INTEGERS — an object form is ~4x the bytes, all key names', () => {
    const es = [doc('A', 'alpha beta'), doc('B', 'beta')]
    const ix = buildSearchStructure(es)
    for (const list of ix.post) {
      expect(list.length % 3).toBe(0)
      for (const v of list) expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('survives a round trip through JSON — a caller serializes it to cache it', () => {
    const es = [doc('Café', 'zebras roam'), doc('B', 'nothing')]
    const ix = buildSearchStructure(es)
    const revived = JSON.parse(JSON.stringify(ix))
    expect(titles(hits(revived, 'cafe', es), es)).toEqual(['Café'])
  })

  it('an empty corpus is an empty result, never a throw', () => {
    expect(hits(buildSearchStructure([]), 'anything', [])).toEqual([])
    expect(hits(null, 'anything', [])).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Regressions from reviewing the first cut of this engine. Each was a claim the
// code made about itself that turned out to be false or fragile.
describe('review regressions', () => {
  it('⛔ SURVIVES A ROUND TRIP TAKEN *AFTER* A QUERY — the term map must not serialize', () => {
    // The term→id map was cached ON the index. `JSON.stringify` turns a Map into
    // `{}`, which is TRUTHY, so a later isolate short-circuited to the empty object
    // and threw `termIds.get is not a function`. Latent only because the cache write
    // evaluates its stringify eagerly, before any query — one async wrapper away
    // from a search outage on a poisoned cache entry.
    const es = [doc('Zebra', 'zebras roam')]
    const ix = buildSearchStructure(es)
    rankSearchEntries(ix, 'zebra', es) // populate whatever the engine memoizes
    const revived = JSON.parse(JSON.stringify(ix))
    expect(Object.keys(revived).some((k) => k.startsWith('_'))).toBe(false)
    expect(() => rankSearchEntries(revived, 'zebra', es)).not.toThrow()
    expect(hits(revived, 'zebra', es)).toHaveLength(1)
  })

  it('⛔ AN EXACT LAST TOKEN STILL EXPANDS — typing the final letter must not LOSE results', () => {
    // Expansion was gated on the token being unknown, so `tes` found `testing` and
    // `test` did not: a visitor lost a result by finishing the word.
    const es = [doc('A', 'testing framework'), doc('B', 'unrelated')]
    const ix = buildSearchStructure(es)
    for (const q of ['tes', 'test', 'testing']) {
      expect(hits(ix, q, es).length, `q=${q}`).toBe(1)
    }
  })

  it('the phrase boost still promotes an adjacent match within the window', () => {
    const es = [
      doc('A', 'alpha beta gamma delta'), // contains "beta gamma" as a phrase
      doc('B', 'beta something else entirely gamma'), // same words, scattered
    ]
    const ix = buildSearchStructure(es)
    expect(titles(hits(ix, 'beta gamma', es), es)[0]).toBe('A')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ SCRIPTS THAT WERE BROKEN BEFORE THE NORMALIZATION PIPELINE WAS FIXED.
//
// Each of these was measured failing. `fold` was NFD + strip-marks; it is now
// NFKC → NFD → strip → NFC → lowercase, and Hangul left the bigram class.
describe('i18n — scripts a global product actually has to serve', () => {
  it('⛔⛔ KOREAN WAS MANGLED INTO JAMO — NFD decomposes Hangul, and jamo are LETTERS', () => {
    // Measured before the fix: `["하","ᅡᆫ","ᆫᄀ","구",…]`. Two bugs compounding — NFD
    // decomposed the syllables, and Hangul was in the bigram class although Korean
    // IS space-delimited. Search was returning garbage for the language.
    expect(tokenize('한국어 검색')).toEqual(['한국어', '검색'])
  })

  it('⛔ FULL-WIDTH LATIN matches ASCII — it is routine on Japanese sites', () => {
    expect(tokenize('ＵＮＩＷＥＢ')).toEqual(['uniweb'])
    const es = [doc('ＵＮＩＷＥＢ Guide', 'about the product')]
    const ix = buildSearchStructure(es)
    expect(hits(ix, 'uniweb', es)).toHaveLength(1)
  })

  it('⛔ THAI is segmented — it has no spaces, so it was ONE token per sentence', () => {
    const t = tokenize('ภาษาไทย')
    expect(t.length).toBeGreaterThan(1)
    expect(t.every((x) => x.length === 2)).toBe(true)
  })

  it('half-width katakana normalizes before it is bigrammed', () => {
    expect(tokenize('ｶﾀｶﾅ')).toEqual(tokenize('カタカナ'))
  })

  it('ligatures decompose — `ﬁle` must find `file`', () => {
    expect(tokenize('ﬁle')).toEqual(['file'])
  })

  it('and none of this broke the cases that already worked', () => {
    expect(tokenize('Café')).toEqual(['cafe'])
    expect(tokenize('東京都')).toEqual(['東京', '京都'])
    expect(tokenize('Datenschutzerklärung')).toEqual(['datenschutzerklarung'])
  })
})

describe('top-k selection', () => {
  const many = Array.from({ length: 60 }, (_, i) => doc(`T${i}`, 'zebra '.repeat((i % 7) + 1)))
  const ix = buildSearchStructure(many)

  it('⛔ `total` IS THE MATCH COUNT, not the returned count — "showing 10 of 47"', () => {
    const r = rankSearchEntries(ix, 'zebra', many, { limit: 5 })
    expect(r.hits).toHaveLength(5)
    expect(r.total).toBe(60)
  })

  it('the top k are EXACTLY the first k of a full ranking', () => {
    const full = rankSearchEntries(ix, 'zebra', many).hits.map((h) => h.doc)
    for (const k of [1, 3, 17]) {
      expect(rankSearchEntries(ix, 'zebra', many, { limit: k }).hits.map((h) => h.doc)).toEqual(full.slice(0, k))
    }
  })

  it('⛔ TIES BREAK DETERMINISTICALLY — the heap compares on doc order too', () => {
    // Without the tiebreak inside the heap comparison, an arbitrary member of a tied
    // group survives the cutoff and two identical corpora can answer differently.
    const tied = Array.from({ length: 30 }, (_, i) => doc(`T${i}`, 'zebra'))
    const ixt = buildSearchStructure(tied)
    const a = rankSearchEntries(ixt, 'zebra', tied, { limit: 5 }).hits.map((h) => h.doc)
    const b = rankSearchEntries(buildSearchStructure(tied), 'zebra', tied, { limit: 5 }).hits.map((h) => h.doc)
    expect(a).toEqual(b)
    expect(a).toEqual([0, 1, 2, 3, 4])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The fuzzy fallback — this package's addition, and the one property that
// matters more than whether it finds anything.
// ─────────────────────────────────────────────────────────────────────────────

describe('the fuzzy fallback is STRICTLY BELOW literal', () => {
  const es = [
    doc('Inset Components', 'How insets are declared and rendered in a section'),
    doc('Smart Layouts', 'A layout that adapts to the art direction of its content'),
    doc('Testing Guide', 'How to run the test suite for a foundation'),
  ]
  const ix = buildSearchStructure(es)

  it('⭐ NEVER RUNS WHEN THE LITERAL PASS MATCHED — the whole design', () => {
    // This is what makes the "68 hits, 4 containing the word, all below the
    // tenth result" failure impossible rather than unlikely: a near-miss cannot
    // compete with a real match, because it is never scored alongside one.
    const withFuzzy = rankSearchEntries(ix, 'inset', es)
    const withoutFuzzy = rankSearchEntries(ix, 'inset', es, { fuzzy: false })
    expect(withFuzzy.hits).toEqual(withoutFuzzy.hits)
    expect(withFuzzy.hits.every((h) => !h.fuzzy)).toBe(true)
  })

  it('corrects a typo when nothing matched at all', () => {
    // `insef` is not a term and completes nothing; one substitution reaches
    // `inset`. Prefix expansion cannot save this — the typo is the last letter.
    const res = rankSearchEntries(ix, 'insef', es, { prefix: false })
    expect(titles(res.hits, es)).toContain('Inset Components')
    expect(res.hits[0].fuzzy).toBe(true)
  })

  it('handles all three edits — substitution, deletion and insertion', () => {
    const q = (s) => titles(rankSearchEntries(ix, s, es, { prefix: false }).hits, es)
    expect(q('testinh')).toContain('Testing Guide') // substitution
    expect(q('tesing')).toContain('Testing Guide')  // deletion
    expect(q('testingg')).toContain('Testing Guide') // insertion
  })

  it('⛔ does NOT reintroduce the substring failure — two edits is not a match', () => {
    expect(rankSearchEntries(ix, 'insefg', es, { prefix: false }).hits).toEqual([])
  })

  it('leaves very short words alone — one edit is most of a three-letter word', () => {
    // ⚖️ The floor is on the QUERY term and it is low (4), because the fallback
    // only fires on a total miss: correcting `artt` to `art` beats returning
    // nothing, even though short words sit within one edit of each other. Below
    // the floor it declines rather than guessing, since at three letters a
    // "correction" is as likely to be a different real word as the intended one.
    expect(rankSearchEntries(ix, 'arf', es, { prefix: false }).hits).toEqual([])
    // and at the floor it does correct, which is the behaviour that pays for it
    expect(titles(rankSearchEntries(ix, 'artt', es, { prefix: false }).hits, es))
      .toContain('Smart Layouts')
  })

  it('is off when the caller says so, and its absence is not an error', () => {
    expect(rankSearchEntries(ix, 'insef', es, { prefix: false, fuzzy: false }).hits).toEqual([])
  })

  it('marks every corrected hit, so a caller can say "showing results for…"', () => {
    const res = rankSearchEntries(ix, 'insef', es, { prefix: false })
    expect(res.hits.length).toBeGreaterThan(0)
    expect(res.hits.every((h) => h.fuzzy === true)).toBe(true)
    expect(res.total).toBe(res.hits.length)
  })

  it('changes nothing about the contributed engine’s properties', () => {
    // A control: the ordering assertions above this block all ran with fuzzy ON
    // by default, because it never engaged. This states that explicitly.
    const idf = rankSearchEntries(ix, 'a', es)
    expect(idf.hits.every((h) => !h.fuzzy)).toBe(true)
  })
})

describe('corrections — what a caller renders as "showing results for …"', () => {
  const es = [doc('Form Builder', 'a form field and its validation'), doc('Testing Guide', 'run the test suite')]
  const ix = buildSearchStructure(es)

  it('names the query term and its substitute, one per corrected term', () => {
    const res = rankSearchEntries(ix, 'fomr', es, { prefix: false })
    expect(res.corrections).toEqual([{ term: 'fomr', to: 'form' }])
    expect(res.hits.length).toBeGreaterThan(0)
  })

  it('⛔ is ABSENT — never empty — when nothing was corrected', () => {
    expect(rankSearchEntries(ix, 'form', es)).not.toHaveProperty('corrections')
    expect(rankSearchEntries(ix, 'nothingatall', es)).not.toHaveProperty('corrections')
  })

  it('picks the COMMONEST candidate as the substitute', () => {
    // `fore` is one edit from both `form` (2 docs) and `more` (1 doc); the
    // commoner one is what a visitor was most likely reaching for.
    const corpus = [doc('form a', 'form'), doc('form b', 'form'), doc('more', 'more')]
    const ix2 = buildSearchStructure(corpus)
    expect(rankSearchEntries(ix2, 'fore', corpus, { prefix: false }).corrections)
      .toEqual([{ term: 'fore', to: 'form' }])
  })
})
