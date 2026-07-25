# @uniweb/projections

Artifacts derived from a Uniweb site's **content alone** — no foundation, no
runtime, nothing rendered.

A Uniweb site is content; a foundation is code; the runtime orchestrates them.
Producing HTML needs all three. The artifacts in this package need only the
first, which is what makes them identical in every context — browser SPA,
prerender, edge SSR, desktop, `unipress` — and stable when the foundation or
the runtime changes.

## What it produces

| Artifact | For | Built from |
|---|---|---|
| `llms.txt` | agents — discovery | the page graph + each page's first paragraph |
| `/{route}.md` | agents — retrieval | `section.content` via `@uniweb/content-writer` |
| search index | site search | the same page graph |

## Usage

```js
import { renderSiteIndex, renderPageMarkdown } from '@uniweb/projections'

const index = renderSiteIndex(siteContent, { baseUrl: 'https://example.com' })
const markdown = renderPageMarkdown(siteContent.pages[0])
```

Sites configure it under `agents:` in `site.yml`. Free, and on by default:

```yaml
agents:
  index: true          # emit llms.txt              (default true)
  markdown: true       # emit per-page .md          (default true)
  exclude: [/internal] # additional route exclusions
```

Pages are excluded when they set `seo.noindex` or `hidden`, when a route
segment starts with `_`, when the route is a dynamic template (`/blog/:slug`),
or when an `exclude` prefix covers them. `noindex`/`hidden` on a *content-less
container* hides its whole branch, since a container is pure structure and
suppressing only the heading would orphan its children.

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

## License

GPL-3.0-or-later
