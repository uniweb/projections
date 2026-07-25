/**
 * The discovery projection.
 *
 * The exclusion cases carry the most weight: projections are on by default,
 * and an index is more revealing than a sitemap because it *describes* pages.
 * A weakened exclusion here is a leak, not a cosmetic slip.
 */

import { renderSiteIndex } from '../src/site-index.js'
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

  test('root-relative when no baseUrl is known', () => {
    expect(renderSiteIndex(site(pages))).toContain('(/docs/collections.md)')
  })

  test('absolute when seo.baseUrl is set', () => {
    const content = site(pages, { seo: { baseUrl: 'https://www.uniweb.io' } })
    expect(renderSiteIndex(content)).toContain('(https://www.uniweb.io/docs/collections.md)')
  })

  test('a trailing slash on baseUrl does not double up', () => {
    const content = site(pages, { seo: { baseUrl: 'https://www.uniweb.io/' } })
    expect(renderSiteIndex(content)).toContain('(https://www.uniweb.io/docs/collections.md)')
  })

  test('a subdirectory deploy prefixes basePath', () => {
    expect(renderSiteIndex(site(pages), { basePath: '/docs/' })).toContain('(/docs/docs/collections.md)')
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
