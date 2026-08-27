# @uniweb/projections

Artifacts derived from a Uniweb site's **content alone** — no foundation, no
runtime, nothing rendered.

A Uniweb site is content; a foundation is code; the runtime orchestrates them.
Producing HTML needs all three. The artifacts in this package need only the
first, which is what makes them identical in every context — browser SPA,
prerender, edge SSR, desktop, `unipress` — and stable when the foundation or
the runtime changes.

```bash
npm install @uniweb/projections
```

> **Most projects never import this directly.** `uniweb build` and `uniweb dev`
> emit these artifacts for you. Reach for the package when you are building a
> tool that consumes a site's content outside the normal build — a custom
> publisher, an analysis pass, an alternate host.

## What it produces

| Artifact | For | Built from |
|---|---|---|
| `llms.txt` | agents — discovery | the page graph + each page's first paragraph |
| `/{route}.md` | agents — retrieval | `section.content` via `@uniweb/content-writer` |
| search index | site search | the same page graph |

### The index

Follows the [`llms.txt`](https://llmstxt.org) convention — an H1 title, a
blockquote summary, and `##` groups of annotated links:

```markdown
# Uniweb

> Component content architecture — a framework where content authors and
> component developers can't break each other's work.

## Getting Started

- [Quickstart](https://example.com/docs/getting-started/quickstart.md): Create your first Uniweb site in 5 minutes.

## Authoring

- [Working with Collections](https://example.com/docs/authoring/collections.md): Collections let you manage repeating content — blog posts, team members, products — as a set of files.
```

Two properties are what make this worth having over a sitemap:

- **Links point at the `.md` projection**, not the HTML page, so following an
  entry is one hop rather than fetch-then-strip.
- **Descriptions never require an author to have written anything.** The chain
  is `page.yml::description` → `seo.ogDescription` → the first paragraph of the
  first section that has prose, as clean plain text. Grouping is taken from the
  page graph: content-less container folders become the `##` headings.

### The per-page markdown

Section bodies in page order, serialized from the stored ProseMirror document.
No frontmatter, no section `type`, no params — `type` names which component
renders a section, which is a *rendering* assignment and foundation-specific.
Emitting it would break the property this package exists for: the output is a
projection of the **site**, identical under a swapped foundation.

The output carries Uniweb dialect (`![](lu-house)` icons,
`![desc](@Component){params}` insets). That is what the author wrote, and it is
more informative to an agent working on a Uniweb site than a lossy translation
to plain CommonMark would be.

## Configuration

Sites configure this under `agents:` in `site.yml`. Free, and on by default:

```yaml
agents:
  index: true          # emit llms.txt              (default true)
  markdown: true       # emit per-page .md          (default true)
  exclude: [/internal] # additional route exclusions
```

`agents: false` turns the whole capability off in one word.

Pages are excluded when they set `seo.noindex` or `hidden`, when a route
segment starts with `_`, when the route is a dynamic template (`/blog/:slug`),
or when an `exclude` prefix covers them. `noindex`/`hidden` on a *content-less
container* hides its whole branch, since a container is pure structure and
suppressing only the heading would orphan its children.

These exclusions are load-bearing rather than tidy-up. An index is *more*
revealing than a sitemap because it describes pages rather than listing them:
an unlinked page becomes discoverable **and** summarized. Weakening them turns
the on-by-default into a leak.

## Usage

```js
import { renderSiteIndex, renderPageMarkdown } from '@uniweb/projections'

const index = renderSiteIndex(siteContent, { baseUrl: 'https://example.com' })
const markdown = renderPageMarkdown(siteContent.pages[0])
```

### API

**Rendering**

| Export | Signature |
|---|---|
| `renderSiteIndex` | `(siteContent, options?) → string` |
| `renderPageMarkdown` | `(page, { includeChildren = true }?) → string` |
| `resolvePageDescription` | `(page, { maxChars = 200 }?) → string` |

`renderSiteIndex` options: `baseUrl`, `basePath`, `locale`, `defaultLocale`,
`exclude`, `title`, `description`, `rootGroupTitle`, `maxDescriptionChars`.
Links are absolute when `baseUrl` is known and root-relative otherwise — a
root-relative link still resolves for an agent that arrived via the index.

**Page graph** — `selectIndexablePages`, `groupPagesForIndex`, `buildPageUrl`,
`applyRouteTranslation`, `isContainer`, `isDynamicTemplate`.

**Config and filenames** — `resolveAgentsConfig`, `pageMarkdownFilename`,
`INDEX_FILENAME`.

The internal vocabulary is *projections*. `llms.txt` is one emitter's filename —
a third-party convention that may not survive — so it appears exactly once, in
`config.js`, at the edge. A change of convention costs a constant.

**Search** — also available from the `@uniweb/projections/search` subpath:
`generateSearchIndex`, `extractSearchContent`, `generateRecordSearchIndex`,
`mergeSearchIndexes`, `isSearchEnabled`, `getSearchConfig`, `getSearchIndexFilename`.

> **Renamed in 0.5.0** — `generateCollectionIndex` is now `generateRecordSearchIndex`, and a
> search entry carries `type: 'record'` / `group` / `id: "record:<group>:<slug>"` where it
> carried `type: 'collection'` / `collection` / `id: "collection:…"`. *"Collection" is a
> build-side concept — a named set compiled to one file — and this function is called with
> records that may never have been one.*

```js
import { generateSearchIndex, isSearchEnabled } from '@uniweb/projections/search'

if (isSearchEnabled(siteContent)) {
  const index = generateSearchIndex(siteContent, { locale: 'en' })
}
```

Search extraction lives here rather than in `@uniweb/build` so that one
implementation serves every publisher. `@uniweb/build` re-exports this module,
so existing call sites are unchanged.

## Localization

The default locale's artifacts sit at the output root; other locales go under
`/{locale}/`, mirroring the search index's established pattern. Pass `locale`
and `defaultLocale` to `renderSiteIndex` and it builds locale-correct URLs,
including translated route segments from `config.i18n.routeTranslations` — the
same rule the sitemap uses, so the two can never disagree about where a
localized page lives.

## Environment contract

**Runs anywhere JS runs.** No `node:*`, no bundler, no DOM, no filesystem —
enforced by `tests/environment.test.js`, which walks the real import graph.

This is the package's reason to exist rather than a nicety. A Uniweb project is
dual-published: the CLI and the app are both JavaScript clients of one backend,
and either may be the publisher. An artifact derived from site content has to
come out identical whichever side published, or a deployed site's artifacts
oscillate — and an index that exists after one publish and vanishes after
another is worse than none, because agents are told to rely on it. One
implementation, imported by both publishers; the backend stores and serves
opaque bytes and generates nothing.

The same contract is why `search/generate.js` imports the leaf subpath
`@uniweb/core/locale-config` rather than the bare `@uniweb/core` entry, whose
package root pulls in heavier dependencies. The environment test forbids the
bare entry, so the trap cannot be re-entered.

## Development

```bash
pnpm test    # vitest
```

## License

Apache-2.0
