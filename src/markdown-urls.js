/**
 * @fileoverview Where each page's markdown is, for the page's own head to say.
 *
 * ⭐ A page links its markdown with `<link rel="alternate" type="text/markdown">`, so an agent that
 * lands on the HTML finds the document without guessing its address or asking with `Accept`. The
 * address is the one the site index gives the page (`renderSiteIndex`), for the pages a markdown
 * file is written for (`agentFiles` in `@uniweb/build`): `agents:` leaves markdown on, and the page
 * is one the index lists (`selectIndexablePages`). A host that serves a site's markdown answers
 * the same links.
 *
 * A module and a subpath of its own (`@uniweb/projections/markdown-urls`) because the runtime
 * imports it to write every page's head, in the browser too: it carries the page-graph rules and
 * none of the renderers, so nothing here reaches `@uniweb/content-writer`.
 *
 * ⚠️ A page whose sections hold no text gets no file (`renderPageMarkdown` is empty), which this
 * cannot know without rendering the page, so it still names one, as the index does.
 */

import { resolveDefaultLocale } from '@uniweb/core/locale-config'
import { resolveAgentsConfig } from './config.js'
import { selectIndexablePages, buildPageUrl } from './pages.js'

/**
 * The address of each page's markdown, by route, for the pages that have one.
 *
 * @param {Object} siteContent - one locale's site content (`{ pages, config }`), as the build
 *   collects it or a host serves it
 * @returns {Map<string, string>} a page's route → its markdown's URL: absolute on the site's
 *   address when the content states one (`config.url`), root-relative under its base otherwise
 */
export function pageMarkdownUrls(siteContent) {
  const config = siteContent?.config || {}
  const urls = new Map()
  const agents = resolveAgentsConfig(config)
  if (!agents.markdown) return urls

  // The locale the build writes this content's files under (`languageOf` in @uniweb/build), and
  // the link options the index is rendered with for it.
  const defaultLocale = resolveDefaultLocale(config)
  const options = {
    address: config.url || null,
    basePath: config.base || '',
    locale: config.activeLocale || defaultLocale,
    defaultLocale,
    routeTranslations: config.i18n?.routeTranslations,
  }
  for (const page of selectIndexablePages(siteContent?.pages || [], { exclude: agents.exclude })) {
    urls.set(page.route, buildPageUrl(page.route, options))
  }
  return urls
}
