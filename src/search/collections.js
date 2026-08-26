/**
 * Generate search index for a file-based collection.
 *
 * Collection cascade files (`data/{name}.json`) contain all non-deferred fields.
 * If `search.fetchDetail: true` is set, the caller is responsible for merging
 * per-record detail files into each item before calling this function.
 */

/**
 * Compose a record's route the way the build does, for the sources that have
 * not already done it.
 *
 * `collections[name].route` is authored in `site.yml` (see the blog and
 * international templates). When it is set, the build's collection processor
 * already stamps `item.route` on every record — so the route below is a
 * *fallback* for records that arrived without one (an API-backed collection a
 * host assembled itself), never a second opinion about records that have one.
 *
 * The trailing-slash strip matches `collectItems` in
 * `@uniweb/build`'s `site/collection-processor.js`. Without it a `route:
 * /blog/` authored with a slash yields `/blog//my-post` here and
 * `/blog/my-post` there — two answers to one question, on a value nobody
 * checks until a visitor clicks it.
 */
function composeRoute(configRoute, slug) {
  if (typeof configRoute !== 'string' || configRoute === '') return undefined
  return `${configRoute.replace(/\/$/, '')}/${slug}`
}

/**
 * @param {string} name - Collection name (e.g. "articles")
 * @param {Object} config - Collection config from site.yml (config.collections[name])
 * @param {Object[]|Object} collectionData - Parsed cascade JSON (`data/{name}.json`),
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

export function generateCollectionIndex(name, config, collectionData, locale) {
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
  const items = Array.isArray(collectionData)
    ? collectionData
    : collectionData?.items || []

  const entries = items.map(item => {
    const fields = declaredFields ?? searchableKeys(item)
    const content = fields.map(f => item[f] || '').filter(Boolean).join(' ')
    const slug = item.slug || item.id || String(item.title || '').toLowerCase().replace(/\s+/g, '-')
    // The record's own route wins: the build already resolved it against the
    // same config, so recomputing here could only disagree. `route` is omitted
    // entirely when neither source can supply one — a missing key is detectable
    // by a consumer, where the string "undefined/my-post" is a link that ranks
    // correctly, looks plausible, and 404s on click.
    const route = item.route || composeRoute(config.route, slug)
    return {
      id: `collection:${name}:${slug}`,
      type: 'collection',
      collection: name,
      ...(route ? { route } : {}),
      title: item.title || item.name || slug,
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
    type: 'collection',
    collection: name,
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
