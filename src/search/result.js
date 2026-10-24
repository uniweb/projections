/**
 * The search result contract.
 *
 * Every provider returns objects of this shape. The point is that a foundation's
 * search UI is written once and works against any provider — the same reason
 * `prepare-props` guarantees a content shape so components need no null checks.
 * An entry of the index becomes one with `searchResult` (`./engine.js`), wherever
 * it was ranked.
 *
 * Two tiers, and the distinction is load-bearing:
 *
 * - **Guaranteed** — `id`, `type`, `route`, `href`, `title`, `pageTitle`,
 *   `excerpt`, `snippetHtml`. Every provider fills these. A component may
 *   render them unconditionally.
 * - **Provider-optional** — everything else. Present when the provider can
 *   supply it, `null` when it cannot. A component that renders one must
 *   tolerate `null`, because whether it arrives is a *deployment* fact, not a
 *   content fact: a third-party search service may send none of them.
 *
 * `snippetHtml` is HTML containing `<mark>` elements. Render it as HTML, never
 * as text: `@uniweb/kit`'s `SafeHtml` does.
 *
 * ⛔ Imports nothing, so a client that only shapes a server's answer loads no engine.
 */

/**
 * A result with every optional field nulled and every guaranteed field at its
 * empty value. Spread this first so a provider filling a subset still returns
 * the full shape, and adding a field later cannot silently produce `undefined`
 * at one provider and a value at another.
 *
 * @returns {Object}
 */
export function emptyResult() {
  return {
    // ── Guaranteed ──────────────────────────────────────────────
    id: '',
    type: '',
    route: '',
    href: '',
    title: '',
    pageTitle: '',
    excerpt: '',
    snippetHtml: '',

    // ── Provider-optional ───────────────────────────────────────
    // Deep-linking within a page.
    sectionId: null,
    anchor: null,
    // Extra display material.
    description: null,
    component: null,
    // Plain-text twin of snippetHtml, for non-HTML surfaces.
    snippetText: null,
    // Match ranges in the entry's text, when the provider knows where its terms landed.
    matches: null,
    // Provenance, when the hit is a record rather than a page: the group it came from, and
    // its display fields.
    group: null,
    item: null
  }
}
