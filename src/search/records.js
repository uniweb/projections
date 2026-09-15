/**
 * Generate search index for a file-based collection.
 *
 * Collection cascade files (`data/{name}.json`) contain all non-deferred fields.
 * If `search.fetchDetail: true` is set, the caller is responsible for merging
 * per-record detail files into each item before calling this function.
 */

import { fillRoutePattern, recordHandle, recordTitle } from '@uniweb/core/route-match'

/**
 * A record's URL, for the search entry.
 *
 * ⭐ **With `config.pattern`** — the route pattern of the page that shows one record of the
 * query, as `recordRoutes` returns it — the URL is that pattern FILLED from the record
 * (`fillRoutePattern`): the one encoder the runtime fills a rendered record's `$route`
 * with, so a search result and a card link to the same address, a `[...path]` page's
 * placement included. A record that cannot fill it gets no route.
 *
 * ⚠️ **Without it**, the older composition stands: the record's own `route`, else
 * `{config.route}/{handle}`, the handle being `$name` on a live record and `slug` on a
 * file-lane one (`recordHandle`). That was right while the build baked a `route` into
 * compiled records from `route:` on a query; since 2026-09-14 `route:` is retired, the
 * build bakes nothing, and a record's `route` is the author's own field — so a caller
 * should pass `pattern`. `{route}/{handle}` is wrong for a `[...path]` page, which is why
 * `pattern` exists.
 *
 * The trailing-slash strip keeps `route: /blog/` from yielding `/blog//my-post`.
 */
function recordRoute(config, item, slug) {
  if (typeof config?.pattern === 'string' && config.pattern) {
    return fillRoutePattern(config.pattern, item) ?? undefined
  }
  if (item.route) return item.route
  if (typeof config?.route !== 'string' || config.route === '') return undefined
  return `${config.route.replace(/\/$/, '')}/${slug}`
}

/**
 * @param {string} name - Collection name (e.g. "articles")
 * @param {Object} config - Query config from the site payload (config.queries[name])
 * @param {Object[]|Object} recordData - Parsed cascade JSON (`data/{name}.json`),
 *   which the build writes as a bare array. The `{ items: [...] }` envelope is
 *   accepted too, since a host fetching the collection from a backend may carry one.
 * @param {string} locale - Locale code (e.g. "en")
 * @returns {Object} Collection search index
 */
/**
 * Keys whose meaning we know because WE or the backend put them there —
 * identity, addressing, and derived asset URLs. Everything else belongs to the
 * author and this package has no business interpreting it.
 *
 * ⛔ This is the ONLY list here that names field names, and it deliberately
 * names OUR OWN keys rather than guessing at anyone's schema. Do not add a
 * field because it "looks like" metadata.
 */
const WIRING_KEYS = new Set(['$uuid', 'slug', 'id', 'route', 'image'])

/** A value a card can render — anything else is structure we cannot interpret. */
const isPrimitive = (v) =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

/**
 * Cap for a value carried in `item`, the per-result display payload.
 *
 * A card renders a label, not a body — and the body is already represented by
 * the entry's own `content`/`excerpt`. Without a cap, a collection of long
 * records carries its full text TWICE in an index the browser downloads whole.
 *
 * ⭐ Note what this is: a claim about SIZE, which we can make. Not a claim
 * about MEANING, which we cannot.
 */
const DISPLAY_VALUE_MAX = 200

/**
 * Search-index entries for one named group of records.
 *
 * ⛔ RENAMED from `generateRecordIndex` — 2026-08-27, and the old name was
 * wrong in two ways that mattered.
 *
 * 1. **"Collection" is FRAMEWORK'S build concept** — a named set our build
 *    compiles to one file. The live lane has no such thing: a host calls this
 *    with records it fetched from a folder, so the name put our build
 *    vocabulary into a function whose main caller is a host. `record` is true on
 *    both lanes and is what the argument actually holds.
 * 2. **It never said `search`** — every sibling here does (`generateSearchIndex`,
 *    `mergeSearchIndexes`, `extractSearchContent`), and "collection index" reads
 *    as an index OF collections or a collection's own listing. It is neither: it
 *    is a search index derived FROM records.
 *
 * ✅ The RESULT was renamed to match, 2026-08-27 — `type: 'record'`, `group: name`,
 * `id: "record:<group>:<slug>"`. That was a real data break against two live
 * consumers (kit's endpoint search provider and hosting's search), taken
 * deliberately rather than left to rot: doing it while the shape was already
 * being discussed cost one coordinated change; leaving it would have made the
 * entry the last place `collection` survived as a lane-crossing word.
 */
export function generateRecordSearchIndex(name, config, recordData, locale) {
  // ⛔ NO DEFAULT FIELD LIST. This was `|| ['title']` — a claim about someone
  // else's schema, and wrong for any collection without a `title` (a `people`
  // collection has `name`, a `products` one has `label`). The failure was
  // silent in the worst way: the record still entered the index with `content`
  // empty, so it was present, countable, and matched nothing.
  //
  // ⇒ With no authored `search.fields`, index every non-empty STRING the author
  // wrote, minus our own wiring keys. That is not a schema claim; it is the
  // refusal of one. An authored list still wins — an author who names fields
  // has told us something we could not otherwise know.
  const declaredFields = Array.isArray(config.search?.fields) ? config.search.fields : null
  const weight = config.search?.weight ?? 0.7
  const items = Array.isArray(recordData)
    ? recordData
    : recordData?.items || []

  const entries = items.map(item => {
    const fields = declaredFields ?? searchableKeys(item)
    const content = fields.map(f => item[f] || '').filter(Boolean).join(' ')
    // ⭐ The record's HANDLE — `$name` on a live record, `slug` on a file-lane one
    // (`recordHandle`). ⛔ Until 2026-09-14 this read `slug` alone, so every record that
    // arrived with `$name` and no `slug` got ONE id, `record:<group>:`, and — with no
    // `pattern` — one route, `{route}/`: an entry per record, all opening the list.
    const slug = recordHandle(item) || item.id || String(item.title || '').toLowerCase().replace(/\s+/g, '-')
    // `route` is omitted entirely when nothing can supply one — a missing key is
    // detectable by a consumer, where the string "undefined/my-post" is a link that
    // ranks correctly, looks plausible, and 404s on click.
    const route = recordRoute(config, item, slug)
    return {
      // ⛔ RENAMED 2026-08-27 — `collection` is FRAMEWORK'S build concept (a named
      // set our build compiles to one file) and the live lane has no such thing:
      // a host calls this with records fetched from a folder. Same category error
      // the function name carried until it became `generateRecordSearchIndex`.
      //
      // ⭐ `record` is symmetric with the page entry's `type: 'page'` / `id:
      // "page:<route>"`, and true on both lanes. `group` names what a result UI
      // actually does with it — label or group results by the set they came from —
      // without borrowing either lane's word for that set.
      id: `record:${name}:${slug}`,
      type: 'record',
      group: name,
      ...(route ? { route } : {}),
      // The rule the record's own page is titled by (`recordTitle`: `title`, `name`, the
      // handle), so a result and the page it opens are called the same thing.
      title: recordTitle(item) || slug,
      content,
      excerpt: content.length > 160
        ? content.slice(0, 160).trim() + '…'
        : content,
      weight,
      item: pickDisplayFields(item),
    }
  })

  // No `generated` timestamp — see the note in `generate.js`. A clock defeats
  // content-addressing and byte-parity between publishers.
  return {
    type: 'record',
    group: name,
    locale,
    entries,
  }
}

/**
 * Every non-empty string the author wrote, minus our own wiring keys — the
 * default searchable surface when a collection declares no `search.fields`.
 */
function searchableKeys(item) {
  if (!item || typeof item !== 'object') return []
  return Object.keys(item).filter(
    (k) => !WIRING_KEYS.has(k) && typeof item[k] === 'string' && item[k].trim() !== '',
  )
}

/**
 * The per-result display payload — what a foundation's result card renders.
 *
 * ⛔ THIS USED TO PROJECT RECORDS ONTO A BLOG SHAPE. It destructured
 * `{ slug, title, name, date, image, author, excerpt, role }` and dropped
 * everything else, so a `products` collection lost `price`, a `people` one lost
 * `department`, a `courses` one lost `credits` — fields the author defined and
 * we had no standing to discard. **[Diego, 2026-08-25]** — *"anyone can design
 * their own data schema… you can't claim to know the structure of it. you just
 * overfit to a fictitious blog example."*
 *
 * ⇒ Now: keep everything the author wrote, minus our own wiring keys, minus
 * values a card cannot render, and minus long strings the entry's own
 * `content`/`excerpt` already represent.
 *
 * ### The three options, recorded so this can be revisited without re-deriving
 *
 *   1. **Pass the record whole.** Maximally honest, no judgement at all — and
 *      it carries every record's full text a SECOND time in an index the
 *      browser downloads in one piece. Rejected on SIZE, not on principle.
 *   2. **This one.** Drop wiring keys (ours), non-primitives (a card cannot
 *      render an object without knowing the schema, and it is where the bulk
 *      lives — a ProseMirror body is an object), and strings over
 *      `DISPLAY_VALUE_MAX` (already represented by `content`/`excerpt`).
 *      ⭐ Every exclusion is a claim about SIZE or about OUR OWN keys; none is
 *      a claim about what an author's field means.
 *   3. **Let the caller name the display fields**, as `search.fields` does for
 *      the searchable surface. Most precise, and it needs an authoring surface
 *      plus a wire key to carry it — neither exists, and `collections`
 *      declarations do not reach a hosted site at all.
 *
 * ⇒ **If the size constraint ever stops mattering** — a host that serves the
 * index in chunks, say — **option 1 is strictly more honest and should be
 * taken.** That is the trigger to revisit, not a vague "reconsider someday".
 */
function pickDisplayFields(item) {
  if (!item || typeof item !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(item)) {
    if (WIRING_KEYS.has(k)) continue
    if (v == null || !isPrimitive(v)) continue
    if (typeof v === 'string' && v.length > DISPLAY_VALUE_MAX) continue
    out[k] = v
  }
  return out
}
