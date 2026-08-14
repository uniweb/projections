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
export function generateCollectionIndex(name, config, collectionData, locale) {
  const fields = config.search?.fields || ['title']
  const weight = config.search?.weight ?? 0.7
  const items = Array.isArray(collectionData)
    ? collectionData
    : collectionData?.items || []

  const entries = items.map(item => {
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

function pickDisplayFields(item) {
  const { slug, title, name, date, image, author, excerpt, role } = item
  return Object.fromEntries(
    Object.entries({ slug, title, name, date, image, author, excerpt, role })
      .filter(([, v]) => v != null)
  )
}
