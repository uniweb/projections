/**
 * The discovery projection.
 *
 * The exclusion cases carry the most weight: projections are on by default,
 * and an index is more revealing than a sitemap because it *describes* pages.
 * A weakened exclusion here is a leak, not a cosmetic slip.
 */

import { localeOfPath } from '@uniweb/core/resolve-route'
import { renderSiteIndex } from '../src/site-index.js'
import { markdownPathOf, resolveMarkdownRequest } from '../src/markdown-request.js'
import { page, container, section, site } from './helpers.js'

describe('renderSiteIndex — shape', () => {
  test('emits title, blockquote summary, and annotated links', () => {
    const content = site(
      [page('/quickstart', { title: 'Quickstart', sections: [section('# Quickstart\n\nCreate your first Uniweb site in 5 minutes.')] })],
      { title: 'Uniweb', description: 'Component content architecture.' }
    )

    expect(renderSiteIndex(content)).toBe(
      [
        '# Uniweb',
        '',
        '> Component content architecture.',
        '',
        '## Pages',
        '',
        '- [Quickstart](/quickstart.md): Create your first Uniweb site in 5 minutes.',
        '',
      ].join('\n')
    )
  })

  test('falls back to config.name when no title is set', () => {
    expect(renderSiteIndex(site([]))).toContain('# Test Site')
  })

  test('omits the blockquote when the site has no description', () => {
    expect(renderSiteIndex(site([]))).not.toContain('>')
  })

  test('an entry with no resolvable description omits the colon', () => {
    const content = site([page('/contact', { title: 'Contact' })])
    expect(renderSiteIndex(content)).toContain('- [Contact](/contact.md)\n')
  })
})

describe('renderSiteIndex — grouping', () => {
  const content = site([
    page('/', { title: 'Home' }),
    container('/docs', 'Docs'),
    container('/docs/authoring', 'Authoring'),
    page('/docs/authoring/collections', { title: 'Collections', description: 'Manage repeating content.' }),
    page('/docs/authoring/theming', { title: 'Theming', description: 'Colors and fonts.' }),
    container('/docs/development', 'Development'),
    page('/docs/development/schemas', { title: 'Schemas', description: 'Declare data shapes.' }),
  ])

  test('content-less containers become headings, descendants become entries', () => {
    const output = renderSiteIndex(content)
    expect(output).toContain('## Authoring')
    expect(output).toContain('- [Collections](/docs/authoring/collections.md): Manage repeating content.')
    expect(output).toContain('## Development')
    expect(output).toContain('- [Schemas](/docs/development/schemas.md): Declare data shapes.')
  })

  test('a container is never itself an entry — it has no body to project', () => {
    expect(renderSiteIndex(content)).not.toContain('(/docs/authoring.md)')
  })

  test('pages under no container lead, under a generic heading', () => {
    const output = renderSiteIndex(content)
    expect(output.indexOf('## Pages')).toBeLessThan(output.indexOf('## Authoring'))
    expect(output).toContain('- [Home](/index.md)')
  })

  test('groups by NEAREST container, not the outermost', () => {
    const output = renderSiteIndex(content)
    // Collections sits under both /docs and /docs/authoring.
    const authoringIndex = output.indexOf('## Authoring')
    const collectionsIndex = output.indexOf('[Collections]')
    expect(collectionsIndex).toBeGreaterThan(authoringIndex)
    expect(output.indexOf('## Development')).toBeGreaterThan(collectionsIndex)
  })

  test('an empty group emits no heading', () => {
    const sparse = site([container('/empty', 'Empty'), page('/real', { title: 'Real' })])
    expect(renderSiteIndex(sparse)).not.toContain('## Empty')
  })
})

describe('renderSiteIndex — exclusions', () => {
  const excluded = (pages, options) => renderSiteIndex(site(pages), options)

  test('seo.noindex pages are excluded', () => {
    const output = excluded([page('/secret', { title: 'Secret', seo: { noindex: true } })])
    expect(output).not.toContain('Secret')
  })

  test('hidden pages are excluded', () => {
    const output = excluded([page('/draft', { title: 'Draft', hidden: true })])
    expect(output).not.toContain('Draft')
  })

  test('dynamic route templates are excluded — they are not pages', () => {
    const output = excluded([
      page('/blog/:slug', { title: 'Article', isDynamic: true }),
      page('/blog', { title: 'Blog' }),
    ])
    expect(output).not.toContain('/blog/:slug')
    expect(output).not.toContain('Article')
    expect(output).toContain('[Blog]')
  })

  test('a route containing :param is excluded even without the isDynamic flag', () => {
    expect(excluded([page('/blog/:id', { title: 'Article' })])).not.toContain('Article')
  })

  test('_-prefixed draft segments are excluded', () => {
    expect(excluded([page('/_scratch/notes', { title: 'Notes' })])).not.toContain('Notes')
  })

  test('agents.exclude cascades over a whole branch', () => {
    const output = excluded(
      [page('/internal/runbook', { title: 'Runbook' }), page('/public', { title: 'Public' })],
      { exclude: ['/internal'] }
    )
    expect(output).not.toContain('Runbook')
    expect(output).toContain('Public')
  })

  test('exclude tolerates a missing leading slash and a trailing one', () => {
    const output = excluded([page('/internal/x', { title: 'Runbook' })], { exclude: ['internal/'] })
    expect(output).not.toContain('Runbook')
  })

  test('noindex on a CONTAINER hides the whole branch, not just the heading', () => {
    const pages = [
      { ...container('/private', 'Private'), seo: { noindex: true } },
      page('/private/page', { title: 'Buried' }),
    ]
    const output = renderSiteIndex(site(pages))
    expect(output).not.toContain('Private')
    // The real risk: the child surviving into the ungrouped list.
    expect(output).not.toContain('Buried')
  })

  test('noindex on a page with content stays per-page', () => {
    const pages = [
      page('/guide', { title: 'Guide', seo: { noindex: true } }),
      page('/guide/step', { title: 'Step One' }),
    ]
    const output = renderSiteIndex(site(pages))
    expect(output).not.toContain('[Guide]')
    expect(output).toContain('Step One')
  })
})

describe('renderSiteIndex — link targets', () => {
  const pages = [page('/docs/collections', { title: 'Collections' })]

  test('root-relative when the site states no address', () => {
    expect(renderSiteIndex(site(pages))).toContain('(/docs/collections.md)')
  })

  test('⭐ absolute on the address the site states (`config.url`), base path included', () => {
    const content = site(pages, { url: 'https://octocat.github.io/handbook/' })
    expect(renderSiteIndex(content)).toContain('(https://octocat.github.io/handbook/docs/collections.md)')
    expect(renderSiteIndex(site(pages), { address: 'https://www.uniweb.io' }))
      .toContain('(https://www.uniweb.io/docs/collections.md)')
  })

  test('⛔ an authored seo.baseUrl is not the address — it named a static host, maybe not this one', () => {
    const content = site(pages, { seo: { baseUrl: 'https://octocat.github.io' } })
    expect(renderSiteIndex(content)).toContain('(/docs/collections.md)')
  })

  test('a subdirectory deploy prefixes basePath — the base the site states by default', () => {
    expect(renderSiteIndex(site(pages), { basePath: '/docs/' })).toContain('(/docs/docs/collections.md)')
    expect(renderSiteIndex(site(pages, { base: '/docs/' }))).toContain('(/docs/docs/collections.md)')
  })

  test('a host’s origin option is still read, with the base, until it passes `address`', () => {
    expect(renderSiteIndex(site(pages), { baseUrl: 'https://www.uniweb.io/', basePath: '/docs/' }))
      .toContain('(https://www.uniweb.io/docs/docs/collections.md)')
  })

  test('the site root links to index.md', () => {
    expect(renderSiteIndex(site([page('/', { title: 'Home' })]))).toContain('(/index.md)')
  })
})

describe('renderSiteIndex — localization', () => {
  const pages = [page('/about', { title: 'About' })]

  test('the default locale keeps root paths', () => {
    const output = renderSiteIndex(site(pages), { locale: 'en', defaultLocale: 'en' })
    expect(output).toContain('(/about.md)')
  })

  test('a non-default locale is prefixed', () => {
    const output = renderSiteIndex(site(pages), { locale: 'es', defaultLocale: 'en' })
    expect(output).toContain('(/es/about.md)')
  })

  test('localized route segments are applied, matching the sitemap', () => {
    const content = site(pages, { i18n: { routeTranslations: { es: { '/about': '/acerca' } } } })
    const output = renderSiteIndex(content, { locale: 'es', defaultLocale: 'en' })
    expect(output).toContain('(/es/acerca.md)')
  })

  test('a page below translated pages takes its nearest translated ancestor\'s segments', () => {
    // ⛔ Until 2026-10-01 the first entry in page order won: `/docs/intro/step` → `/documentos/intro/step`.
    const nested = [page('/docs', { title: 'Docs' }), page('/docs/intro', { title: 'Intro' }), page('/docs/intro/step', { title: 'Step' })]
    const content = site(nested, { i18n: { routeTranslations: { es: { '/docs': '/documentos', '/docs/intro': '/documentos/introduccion' } } } })
    const output = renderSiteIndex(content, { locale: 'es', defaultLocale: 'en' })
    expect(output).toContain('(/es/documentos/introduccion/step.md)')
  })
})

describe('renderSiteIndex — each link is the page in the content’s language', () => {
  const translations = { fr: { '/events': '/evenements' } }
  /** French content as a host serves it: the site's languages stated, French active. */
  const french = (pages, config = {}) =>
    site(pages, {
      defaultLanguage: 'en',
      languages: ['en', 'fr'],
      activeLocale: 'fr',
      url: 'https://example.com/',
      i18n: { routeTranslations: translations },
      ...config,
    })
  const links = (md) => [...md.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1])

  test('⭐ the content alone is enough — prefixed and translated, on a payload of either route form', () => {
    // ⛔ Until 2026-10-27 this was `/index.md` and `/evenements.md` (or `/events.md`) unless the
    // caller also passed `defaultLocale`.
    const canonical = french([page('/', { title: 'Accueil' }), page('/events', { title: 'Événements' })])
    const own = french([page('/', { title: 'Accueil' }), page('/evenements', { title: 'Événements' })])
    for (const content of [canonical, own]) {
      expect(links(renderSiteIndex(content))).toEqual(['https://example.com/fr/index.md', 'https://example.com/fr/evenements.md'])
    }
  })

  test('⭐ a host answering a link picks this language by its path, and finds the page listed', () => {
    const content = french([page('/', { title: 'Accueil' }), page('/events', { title: 'Événements' })])
    for (const link of links(renderSiteIndex(content))) {
      const path = new URL(link).pathname
      expect(localeOfPath(path, content.config).locale, link).toBe('fr')
      expect(resolveMarkdownRequest(content, path)?.kind, link).toBe('page')
    }
  })

  test('a language on a domain of its own is linked there', () => {
    const content = french([page('/events', { title: 'Événements' })], { domainLocales: { 'fr.example.com': 'fr' } })
    expect(links(renderSiteIndex(content))).toEqual(['https://fr.example.com/evenements.md'])
  })

  test('with the address unknown, root-relative under the base, as the host serving it shows the page', () => {
    const content = french([page('/events', { title: 'Événements' })], { url: undefined, base: '/docs/' })
    expect(links(renderSiteIndex(content))).toEqual(['/docs/fr/evenements.md'])
    const unprefixed = { ...content, config: { ...content.config, domainLocale: 'fr' } }
    expect(links(renderSiteIndex(unprefixed))).toEqual(['/docs/evenements.md'])
  })

  test('told the language, as a host holding each language’s content apart tells it', () => {
    const content = french([page('/events', { title: 'Événements' })], { activeLocale: undefined })
    expect(links(renderSiteIndex(content, { locale: 'fr' }))).toEqual(['https://example.com/fr/evenements.md'])
    expect(links(renderSiteIndex(content))).toEqual(['https://example.com/events.md'])
  })
})

describe('markdownPathOf — a page path’s markdown', () => {
  test('the locale’s prefix, then the rest as a filename — the inverse of a `.md` request', () => {
    const config = { defaultLanguage: 'en', languages: ['en', 'fr'] }
    expect(markdownPathOf('/', config)).toBe('/index.md')
    expect(markdownPathOf('/blog/x', config)).toBe('/blog/x.md')
    expect(markdownPathOf('/fr/', config)).toBe('/fr/index.md')
    // ⛔ the inline rule this replaced cut the prefix by length, which gives `/f` for `/fr`
    expect(markdownPathOf('/fr', config)).toBe('/fr/index.md')
    expect(markdownPathOf('/fr/blogue', config)).toBe('/fr/blogue.md')
  })
})

describe('renderSiteIndex — descriptions are plain text', () => {
  test('a paragraph with a link, bold, and an entity yields clean text', () => {
    const content = site([
      page('/data', {
        title: 'Data',
        sections: [section('# Data\n\nRead **the [cascade](/c)** at `/data/<name>.json` now.')],
      }),
    ])
    const output = renderSiteIndex(content)
    expect(output).toContain(': Read the cascade at /data/<name>.json now.')
    expect(output).not.toContain('&lt;')
    expect(output).not.toContain('<strong>')
    expect(output).not.toContain('<a href')
  })

  test('the H1 is never used as the description', () => {
    const content = site([
      page('/x', { title: 'X', sections: [section('# A Heading\n\nThe real summary.')] }),
    ])
    expect(renderSiteIndex(content)).toContain(': The real summary.')
  })

  test('a description never spans lines — it would break the list item', () => {
    const content = site([
      page('/x', { title: 'X', sections: [section('# T\n\nFirst line\nsecond line.')] }),
    ])
    const entryLines = renderSiteIndex(content).split('\n').filter(l => l.startsWith('- ['))
    expect(entryLines).toHaveLength(1)
    expect(entryLines[0]).toContain('First line second line.')
  })
})
