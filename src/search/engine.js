/**
 * The search engine — an inverted index over search entries, and BM25F ranking.
 *
 * ## What this is, and what it is not
 *
 * `generateSearchIndex` produces the **entries**: a site's searchable content,
 * one record per page or record, emitted at build time. **This module indexes
 * and ranks them.** Two jobs, one artifact between them, and the entries are the
 * seam.
 *
 * ⭐ **It exists so that one site ranks the same wherever it is served.** The
 * entries were already shared; the ranking was not, so a lesson learned about
 * ranking this corpus landed in one consumer and could not reach another, and
 * the same query over the same content could come back in a different order
 * depending on who answered it. A reader experiences that as the product being
 * inconsistent, not as two implementations.
 *
 * ⚖️ **It is a default, not a monopoly.** A site may point its search at a
 * third-party service, and a host may answer search itself; that pluggability is
 * deliberate and this does not touch it.
 *
 * ## ⛔ THE CONSTRAINT THAT SHAPED THE FORMAT: PARSE COST
 *
 * The structure is built once per corpus and then **serialized and re-parsed** by
 * whoever caches it. **A fat inverted index can cost more to parse than the
 * linear scan it replaces**, which would make it a regression at exactly the
 * scale it exists to fix.
 *
 * ⇒ **Everything but the term dictionary is a flat array of integers.** Postings
 * are `[doc, tfTitle, tfBody, doc, tfTitle, tfBody, …]` — no objects, no key
 * names repeated per posting. A `{doc,tfT,tfB}` object form measured **~4× the
 * bytes** for the same information, all of it key names. ⛔ Do not "tidy" the
 * postings into objects; the flatness is the feature.
 *
 * ## What a global product needs that an English one does not
 *
 * ⭐ **Diacritic folding.** `café` and `cafe` must be one term, or French,
 * Spanish and Portuguese sites silently under-match. NFD, then drop combining
 * marks.
 *
 * ⭐ **Bigrams for scripts written without spaces.** Chinese and Japanese do not
 * separate words, so a whitespace tokenizer yields ONE enormous token per run and
 * the index is useless. Bigrams are the standard cheap answer and need no
 * dictionary.
 *
 * ⛔ **NO STOPWORD LIST, deliberately.** A hardcoded English list is wrong for
 * every other language. **IDF does the job a stopword list was invented to fake**
 * — a term in every document earns an IDF at or near zero and stops affecting the
 * ranking on its own.
 *
 * ⛔ **NO STEMMING.** Each language needs its own stemmer, so it is N
 * dependencies and N failure modes rather than one; and a wrong stemmer **merges
 * terms that differ and splits terms that do not, invisibly** — no error, no test
 * failure, just quietly worse results. Reopenable on evidence, per locale, one
 * language at a time: an index is built per locale, so the language is known.
 *
 * ## Provenance
 *
 * The index, BM25F scoring, folding, bigrams, prefix completion and the bounded
 * top-k were written for a server-side search lane and contributed here in full
 * on 2026-09-06, so that both lanes rank identically. The fuzzy fallback (§
 * `fuzzyTerms`) is this package's, and it is the one thing the contributed engine
 * did not have.
 *
 * ⭐ Zero dependencies and no platform APIs — no `node:*`, no DOM, no filesystem
 * — so it runs in a browser, in a build, and in a server isolate alike.
 * `tests/environment.test.js` walks the import graph and fails if that stops
 * being true.
 */

// ── BM25F parameters ────────────────────────────────────────────────────────
const K1 = 1.2 // term-frequency saturation
const B_TITLE = 0.5 // titles are short; normalize them gently
const B_BODY = 0.75 // the usual BM25 default for prose
const W_TITLE = 3.0 // a title hit is worth about three body hits
const W_BODY = 1.0
const PHRASE_BOOST = 1.35 // multiplicative
const PHRASE_WINDOW = 200 // how deep the phrase check goes — see the note at its use
const DEFAULT_WEIGHT = 0.6 // an entry that declares none

/**
 * Scripts written WITHOUT SPACES between words, which a whitespace tokenizer
 * turns into one useless token per run. These get bigrammed instead.
 *
 * ⛔ **HANGUL IS DELIBERATELY ABSENT.** Korean **is** space delimited —
 * bigramming it is wrong on its own terms, and combined with NFD decomposition it
 * produces jamo-pair tokens rather than words. *Two bugs that look like one,
 * because the output is garbage either way.*
 *
 * ⭐ Thai, Lao, Khmer and Myanmar are here for the reason Han is: no spaces, so
 * without bigrams a whole sentence is a single term and only an exact full-phrase
 * query can find it.
 */
const NO_SPACE_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u
const WORD = /[\p{L}\p{N}][\p{L}\p{N}_'’-]*/gu

/**
 * Fold to a comparable form: lowercase, and strip combining marks.
 *
 * ⭐ NFD then drop `\p{M}` rather than a hand-written character map — a map covers
 * the accents its author happened to think of, which is a guarantee about the
 * author rather than about the text.
 *
 * Exported because a caller that highlights a match must fold the same way, or it
 * highlights the wrong span.
 *
 * @param {*} text
 * @returns {string}
 */
export function fold(text) {
  return String(text == null ? '' : text)
    // NFKC first: full-width Latin → ASCII, half-width katakana → katakana,
    // ligatures → letters. ⛔ Without it `ＵＮＩＷＥＢ` — routine on Japanese sites —
    // never matches `uniweb`, and `ﬁle` never matches `file`.
    .normalize('NFKC')
    // Decompose so combining marks can be dropped: `café` → `cafe`.
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    // ⛔⛔ RECOMPOSE, AND THIS LINE IS LOAD-BEARING FOR KOREAN. NFD decomposes each
    // Hangul syllable into jamo, which are LETTERS, not marks — so the strip above
    // leaves them and `한국어` tokenizes as jamo pairs. **Korean search returns
    // garbage without this.** NFC puts the syllables back.
    .normalize('NFC')
    .toLowerCase()
}

/**
 * Text → terms.
 *
 * ⛔ A run in a no-space script becomes BIGRAMS, not one token. `東京都` yields
 * `東京`, `京都` — so a query for either matches, which whitespace tokenization
 * cannot do at all. A single-character run still yields that character, or it
 * would be unfindable.
 *
 * @param {*} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const folded = fold(text)
  if (!folded) return []
  const out = []
  for (const m of folded.matchAll(WORD)) {
    const tok = m[0]
    if (!NO_SPACE_SCRIPT.test(tok)) {
      if (tok.length >= 2 || /\p{N}/u.test(tok)) out.push(tok)
      continue
    }
    // Mixed runs are possible (`iPhone用`), so split into CJK / non-CJK spans.
    let span = ''
    const flush = () => {
      if (!span) return
      if (NO_SPACE_SCRIPT.test(span[0])) {
        if (span.length === 1) out.push(span)
        else for (let i = 0; i < span.length - 1; i++) out.push(span.slice(i, i + 2))
      } else if (span.length >= 2 || /\p{N}/u.test(span)) out.push(span)
      span = ''
    }
    let cjkSpan = null
    for (const ch of tok) {
      const isC = NO_SPACE_SCRIPT.test(ch)
      if (cjkSpan === null) cjkSpan = isC
      if (isC !== cjkSpan) { flush(); cjkSpan = isC }
      span += ch
    }
    flush()
  }
  return out
}

/**
 * Build the inverted structure over an entry array.
 *
 * ⭐ PURE, and the entry array is the only input — so the same entries always
 * yield the same structure, which is what lets a caller cache it under a content
 * hash and reuse it across queries.
 *
 * @param {Array<{title?: string, content?: string, weight?: number}>} entries
 * @returns {{v:number, terms:string[], df:number[], post:number[][],
 *            lenT:number[], lenB:number[], avgT:number, avgB:number, n:number}}
 */
export function buildSearchStructure(entries) {
  const docs = Array.isArray(entries) ? entries : []
  const n = docs.length
  const termIds = new Map() // term -> id
  const terms = []
  const postings = [] // id -> Map(doc -> [tfT, tfB])
  const lenT = new Array(n).fill(0)
  const lenB = new Array(n).fill(0)

  const idOf = (t) => {
    let id = termIds.get(t)
    if (id === undefined) {
      id = terms.length
      termIds.set(t, id)
      terms.push(t)
      postings.push(new Map())
    }
    return id
  }

  for (let d = 0; d < n; d++) {
    const e = docs[d] || {}
    const tTerms = tokenize(e.title)
    // `content` already carries the searchable body the projection selected.
    const bTerms = tokenize(e.content)
    lenT[d] = tTerms.length
    lenB[d] = bTerms.length

    for (const t of tTerms) {
      const p = postings[idOf(t)]
      const cur = p.get(d)
      if (cur) cur[0]++
      else p.set(d, [1, 0])
    }
    for (const t of bTerms) {
      const p = postings[idOf(t)]
      const cur = p.get(d)
      if (cur) cur[1]++
      else p.set(d, [0, 1])
    }
  }

  // ⭐ SORT THE DICTIONARY. This is what makes `terms` a term DICTIONARY rather
  // than a list: a sorted array supports binary search, so every term sharing a
  // prefix is a contiguous range and prefix expansion costs a lookup plus a short
  // scan. An unsorted array would force a full pass over the vocabulary per
  // keystroke.
  const order = terms.map((t, i) => i).sort((a, b) => (terms[a] < terms[b] ? -1 : terms[a] > terms[b] ? 1 : 0))

  // ⛔ FLATTEN TO INTEGERS, in the new order. See the parse-cost note in the
  // header — this is the difference between a structure that is cheaper than the
  // scan and one that is not.
  const post = order.map((oldId) => {
    const flat = []
    for (const [d, tf] of postings[oldId]) flat.push(d, tf[0], tf[1])
    return flat
  })
  const df = order.map((oldId) => postings[oldId].size)
  const sortedTerms = order.map((oldId) => terms[oldId])

  const sum = (a) => a.reduce((x, y) => x + y, 0)
  return {
    v: 1,
    terms: sortedTerms,
    df,
    post,
    lenT,
    lenB,
    avgT: n ? sum(lenT) / n : 0,
    avgB: n ? sum(lenB) / n : 0,
    n,
  }
}

/**
 * ⛔ THE TERM→ID MAP LIVES IN A WeakMap, NOT ON THE STRUCTURE.
 *
 * Written once as `structure._ids || (structure._ids = new Map(...))`. The
 * structure is **serialized** by callers that cache it — and `JSON.stringify`
 * turns a `Map` into `{}`, which is TRUTHY, so a later reader parsing that cached
 * copy short-circuits to the empty object and fails with
 * `termIds.get is not a function`.
 *
 * ⚠️ **It was latent rather than live, for a reason nobody should have to rely
 * on**: the caller serialized eagerly, before any query had set `_ids`. Wrap that
 * in an async closure — the most natural refactor there is — and it goes live, as
 * a search outage hours later, on a cache entry poisoned by a different request.
 *
 * ⇒ *Do not mutate an object you serialize.* The WeakMap costs nothing and
 * removes the invariant entirely rather than documenting it.
 */
const IDS = new WeakMap()
function idsFor(structure) {
  let m = IDS.get(structure)
  if (!m) {
    m = new Map(structure.terms.map((t, i) => [t, i]))
    IDS.set(structure, m)
  }
  return m
}

const PREFIX_MIN = 2 // below this, a prefix matches most of the vocabulary
const PREFIX_CAP = 24 // bound the fan-out of one keystroke
const PREFIX_PENALTY = 0.5 // a completion is a guess; an exact term outranks it

/**
 * Term ids whose term starts with `prefix`, by binary search on the sorted
 * dictionary.
 *
 * ⭐ **This is search-as-you-type.** A substring engine gives prefix matching for
 * free and badly — `includes` matches mid-word too, so `art` hits `smart`. Token
 * matching alone would LOSE the useful half of that behaviour, which a visitor
 * notices immediately: typing `zebr` would find nothing until the final `a`.
 *
 * ⛔ **Capped, and the cap keeps the COMMONEST completions.** A two-letter prefix
 * can match thousands of terms; scoring all of them would make an early keystroke
 * the most expensive query of the session. Highest `df` first is what autocomplete
 * wants — the completion a visitor is most likely reaching for.
 *
 * @param {object} structure
 * @param {string} prefix
 * @param {number} [cap]
 * @returns {number[]} term ids
 */
export function prefixTerms(structure, prefix, cap = PREFIX_CAP) {
  const terms = structure.terms
  if (!prefix || prefix.length < PREFIX_MIN) return []
  let lo = 0
  let hi = terms.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (terms[mid] < prefix) lo = mid + 1
    else hi = mid
  }
  const hits = []
  for (let i = lo; i < terms.length && terms[i].startsWith(prefix); i++) hits.push(i)
  if (hits.length <= cap) return hits
  return hits.sort((a, b) => structure.df[b] - structure.df[a]).slice(0, cap)
}

// ── The fuzzy fallback — this package's addition ────────────────────────────

const FUZZY_MIN = 4 // below this, one edit is most of the word
const FUZZY_SCAN = 400 // terms examined per query term; a bound, not a target
const FUZZY_CAP = 8 // corrections kept, commonest first

/**
 * ⭐ **STRICTLY BELOW LITERAL, AND THAT IS THE WHOLE DESIGN.** This runs **only
 * when the literal pass scored nothing at all** — so it can never reorder a
 * result set that has a real match in it, and every property of the ranking above
 * is untouched whenever anything matched.
 *
 * ⛔ Why not a scoring tier mixed in with the rest: a fuzzy score that competes
 * with an exact one is how a near-miss outranks a page that actually contains the
 * word. That failure was measured on the engine this replaces — a query returned
 * 68 hits of which 4 contained the term, and all four ranked below the tenth
 * result. **Fuzzy is the right FALLBACK and the wrong TIER.**
 *
 * The scan is bounded two ways: only terms sharing the first character are
 * considered (a first-character typo is the rare case, and covering it would cost
 * a pass over the whole vocabulary), and at most `FUZZY_SCAN` of them.
 *
 * @param {object} structure
 * @param {string} term - a folded query term
 * @returns {number[]} term ids within edit distance 1
 */
export function fuzzyTerms(structure, term) {
  if (!term || term.length < FUZZY_MIN) return []
  const terms = structure.terms
  const head = term[0]
  // Binary search to the first term sharing the leading character.
  let lo = 0
  let hi = terms.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (terms[mid] < head) lo = mid + 1
    else hi = mid
  }
  const hits = []
  let scanned = 0
  for (let i = lo; i < terms.length && terms[i][0] === head && scanned < FUZZY_SCAN; i++, scanned++) {
    const t = terms[i]
    // Length differs by more than one edit — cheap reject before the real check.
    if (Math.abs(t.length - term.length) > 1) continue
    if (t !== term && withinOneEdit(term, t)) hits.push(i)
  }
  if (hits.length <= FUZZY_CAP) return hits
  return hits.sort((a, b) => structure.df[b] - structure.df[a]).slice(0, FUZZY_CAP)
}

/**
 * Is `b` reachable from `a` by at most one insertion, deletion or substitution?
 *
 * A bounded check rather than a full edit-distance matrix: it walks each string
 * once and allows a single divergence, which is all that is needed and is O(len)
 * rather than O(len²).
 */
function withinOneEdit(a, b) {
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  let i = 0
  let j = 0
  let edited = false
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (edited) return false
    edited = true
    if (la === lb) { i++; j++ }        // substitution
    else if (la > lb) i++              // deletion from a
    else j++                           // insertion into a
  }
  // Whatever is left over is at most the one remaining edit.
  return (la - i) + (lb - j) + (edited ? 1 : 0) <= 1
}

// ── Selection ───────────────────────────────────────────────────────────────

/** Best-first, with a deterministic tiebreak — ties by score fall back to doc order. */
const better = (a, b) => b.score - a.score || a.doc - b.doc

/**
 * The `k` best, sorted. O(n log k) with a bounded min-heap instead of O(n log n).
 *
 * ⛔ **THE TIEBREAK IS PART OF THE COMPARISON, not just the final sort.** A heap
 * ordering on score alone would keep an arbitrary member of a tied group at the
 * cutoff, so two identical corpora could return different results — the kind of
 * nondeterminism that looks like a caching bug for a week.
 */
function selectTop(items, k) {
  if (k >= items.length) return items.sort(better)
  const heap = [] // min-heap: heap[0] is the WORST kept so far
  const worse = (a, b) => better(b, a) < 0 // a is worse than b
  const up = (i) => {
    while (i > 0) {
      const p = (i - 1) >> 1
      // ⛔ CHILD vs PARENT, in that order. Reversed, this builds a MAX-heap: the
      // root holds the BEST kept, so every later candidate is compared against
      // the wrong end and the selection silently keeps the wrong members. Caught
      // by a three-document fixture where top-2 returned the 1st and 3rd.
      if (!worse(heap[i], heap[p])) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const down = () => {
    let i = 0
    for (;;) {
      const l = 2 * i + 1
      const r = l + 1
      let m = i
      if (l < heap.length && worse(heap[l], heap[m])) m = l
      if (r < heap.length && worse(heap[r], heap[m])) m = r
      if (m === i) break
      ;[heap[m], heap[i]] = [heap[i], heap[m]]
      i = m
    }
  }
  for (const x of items) {
    if (heap.length < k) {
      heap.push(x)
      up(heap.length - 1)
    } else if (better(x, heap[0]) < 0) {
      heap[0] = x
      down()
    }
  }
  return heap.sort(better)
}

/**
 * Score a query against a built structure.
 *
 * ⭐ **ONLY DOCUMENTS CONTAINING A QUERY TERM ARE TOUCHED.** That is the whole
 * point of inverting: cost is the sum of the matched terms' posting lists, not the
 * corpus size. A query for a rare word on a 50,000-entry site reads a handful of
 * postings.
 *
 * ⛔ **A term absent from the dictionary contributes NOTHING and does not fail.**
 * A two-word query where one word is unknown still ranks on the other, which is
 * what a visitor expects.
 *
 * @param {object} structure - from `buildSearchStructure`
 * @param {string} query
 * @param {Array} entries - the same array the structure was built from
 * @param {object} [opts]
 * @param {number} [opts.limit] - keep only the best N (0 = all)
 * @param {boolean} [opts.prefix=true] - complete the last term as it is typed
 * @param {boolean} [opts.fuzzy=true] - fall back to near-misses when nothing matched
 * @returns {{hits: Array<{doc:number, score:number, fuzzy?:boolean}>, total:number}}
 */
export function rankSearchEntries(structure, query, entries, opts = {}) {
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 0
  if (!structure || structure.v !== 1 || !structure.n) return { hits: [], total: 0 }
  const qTerms = tokenize(query)
  if (!qTerms.length) return { hits: [], total: 0 }

  const termIds = idsFor(structure)
  const { df, post, lenT, lenB, avgT, avgB, n } = structure

  // ⭐ ONLY THE LAST TOKEN IS EXPANDED — it is the one that may still be being
  // typed. Expanding earlier tokens would silently widen a query the visitor has
  // already finished, which is a different and worse behaviour than completing the
  // current word.
  const wantPrefix = opts.prefix !== false && !/[\s]$/.test(String(query || ''))
  const last = qTerms[qTerms.length - 1]
  const weights = new Map() // term id -> multiplier
  for (const t of new Set(qTerms)) {
    const id = termIds.get(t)
    if (id !== undefined) weights.set(id, 1)
  }
  // ⛔ EXPAND EVEN WHEN THE LAST TOKEN IS AN EXACT TERM. Gating this on
  // `!termIds.has(last)` makes recall inconsistent in a way a visitor hits
  // immediately: `tes` finds `testing`, and then typing the final `t` LOSES it,
  // because `test` is itself a term. ⭐ *An exact match is not evidence that the
  // visitor wanted only that word.* The exact id keeps weight 1 and completions
  // stay at the penalty, so exactness still ranks first.
  if (wantPrefix) {
    for (const id of prefixTerms(structure, last)) {
      if (!weights.has(id)) weights.set(id, PREFIX_PENALTY)
    }
  }

  let scores = score(weights)
  let fuzzy = false

  // The fallback, and it runs only on a total miss — see `fuzzyTerms`.
  if (!scores.size && opts.fuzzy !== false) {
    const corrections = new Map()
    for (const t of new Set(qTerms)) {
      for (const id of fuzzyTerms(structure, t)) if (!corrections.has(id)) corrections.set(id, 1)
    }
    if (corrections.size) {
      scores = score(corrections)
      fuzzy = scores.size > 0
    }
  }
  if (!scores.size) return { hits: [], total: 0 }

  // Weight is a property read, so every candidate can afford it.
  const out = []
  for (const [d, base] of scores) {
    const e = (entries && entries[d]) || {}
    const w = typeof e.weight === 'number' ? e.weight : DEFAULT_WEIGHT
    out.push(fuzzy ? { doc: d, score: base * w, fuzzy: true } : { doc: d, score: base * w })
  }
  const total = out.length

  // ⭐ SELECT, DO NOT SORT. Profiled at 50,000 entries with every document
  // matching: posting traversal 2.4 ms, building these objects 1.8 ms, and the
  // **full sort 13.5 ms** — two thirds of the query, thrown away one frame later
  // when the caller slices to 20. A bounded selection does the same job in 0.7 ms.
  //
  // ⛔ The window must cover the PHRASE pass too, or a boost could promote
  // something from outside it and be invisible. `total` is the count BEFORE
  // truncation, so a caller can still say "showing 10 of 4,312".
  const want = Math.max(limit || total, qTerms.length > 1 ? PHRASE_WINDOW : 0) || total
  const head = selectTop(out, Math.min(want, total))

  // ⛔⛔ THE PHRASE BOOST IS BOUNDED TO THE TOP OF THE RANKING, and the comment
  // here once claimed it was free.
  //
  // It read *"applied to CANDIDATES ONLY — a bounded set"*. **The candidate set is
  // not bounded: for a common term it IS the corpus.** Measured at 50,000 entries
  // — one word 14 ms, two words 61 ms, and 50,000 candidates — so re-folding every
  // candidate's title and body gave back exactly the work inverting had saved.
  // ⭐ *A plausible claim about one's own code, written as a virtue, never
  // measured.*
  //
  // ⚖️ **The trade, stated rather than hidden:** a document below the window
  // cannot be promoted by a phrase match. A 1.35× boost can only move something
  // already near the top into it, so the bound costs ranking quality only where
  // the score distribution is nearly flat — and it is what keeps a two-word query
  // from costing four times a one-word query.
  if (qTerms.length > 1) {
    const phrase = fold(query)
    const window = Math.min(head.length, PHRASE_WINDOW)
    let boosted = false
    for (let i = 0; i < window; i++) {
      const e = (entries && entries[head[i].doc]) || {}
      if (`${fold(e.title)} ${fold(e.content)}`.includes(phrase)) {
        head[i].score *= PHRASE_BOOST
        boosted = true
      }
    }
    if (boosted) head.sort(better)
  }
  return { hits: limit ? head.slice(0, limit) : head, total }

  /** BM25F over a term-id → multiplier map. */
  function score(weighted) {
    const acc = new Map()
    for (const [id, mult] of weighted) {
      const docFreq = df[id]
      // Lucene-style IDF: always positive, and a term in every document lands
      // near zero rather than negative — which is what makes a stopword list
      // unnecessary.
      const idf = Math.log(1 + (n - docFreq + 0.5) / (docFreq + 0.5))
      const flat = post[id]
      for (let i = 0; i < flat.length; i += 3) {
        const d = flat[i]
        const tfT = flat[i + 1]
        const tfB = flat[i + 2]
        const normT = avgT ? tfT / (1 - B_TITLE + (B_TITLE * lenT[d]) / avgT) : 0
        const normB = avgB ? tfB / (1 - B_BODY + (B_BODY * lenB[d]) / avgB) : 0
        const tf = W_TITLE * normT + W_BODY * normB
        if (tf <= 0) continue
        acc.set(d, (acc.get(d) || 0) + mult * idf * ((tf * (K1 + 1)) / (tf + K1)))
      }
    }
    return acc
  }
}
