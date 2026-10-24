import { describe, it, expect } from 'vitest'
import { resolveAgentsConfig, acceptsOrigin } from '../src/index.js'

/**
 * `agents.expectedOrigins`, read by one rule for every host that enforces it, and the documented
 * decision (`docs/reference/site-configuration.md` § Expected origins).
 */
const declared = (value) => resolveAgentsConfig({ agents: { expectedOrigins: value } }).expectedOrigins

describe('resolveAgentsConfig reads expectedOrigins', () => {
  it('as origins, the way a browser spells its Origin header', () => {
    expect(declared(['https://App.Example.com/', 'https://partner.example.org/chat?x=1', 'http://localhost:5173']))
      .toEqual(['https://app.example.com', 'https://partner.example.org', 'http://localhost:5173'])
    // One entry, written without a list.
    expect(declared('https://app.example.com')).toEqual(['https://app.example.com'])
  })

  it('drops what names no http(s) origin, and keeps a repeated one once', () => {
    expect(declared(['app.example.com', 'ftp://files.example.com', 'null', 42, '', 'https://a.test', 'https://a.test/'])).toEqual(['https://a.test'])
  })

  it('is null when nothing is declared, and an empty list when the declaration names none', () => {
    expect(resolveAgentsConfig({}).expectedOrigins).toBeNull()
    expect(resolveAgentsConfig({ agents: { index: false } }).expectedOrigins).toBeNull()
    expect(resolveAgentsConfig({ agents: false }).expectedOrigins).toBeNull()
    expect(declared([])).toEqual([])
    expect(declared(['not a url'])).toEqual([])
  })
})

describe('acceptsOrigin — the documented decision', () => {
  const expected = declared(['https://app.example.com'])
  const siteOrigins = ['https://site.example.net', 'https://www.example.com']

  it('accepts every request when nothing is declared', () => {
    expect(acceptsOrigin(null, 'https://evil.test', { siteOrigins })).toBe(true)
  })

  it('accepts a request with no Origin, which is how a server calls', () => {
    expect(acceptsOrigin(expected, undefined, { siteOrigins })).toBe(true)
    expect(acceptsOrigin(expected, '', { siteOrigins })).toBe(true)
  })

  it("accepts the site's own origins and the declared ones, compared as origins", () => {
    expect(acceptsOrigin(expected, 'https://www.example.com', { siteOrigins })).toBe(true)
    expect(acceptsOrigin(expected, 'https://app.example.com', { siteOrigins })).toBe(true)
    expect(acceptsOrigin(expected, 'https://APP.example.com', { siteOrigins })).toBe(true)
  })

  it('declines any other origin, a near one, and the null origin', () => {
    expect(acceptsOrigin(expected, 'https://evil.test', { siteOrigins })).toBe(false)
    expect(acceptsOrigin(expected, 'http://app.example.com', { siteOrigins })).toBe(false)
    expect(acceptsOrigin(expected, 'https://app.example.com.evil.test', { siteOrigins })).toBe(false)
    expect(acceptsOrigin(expected, 'null', { siteOrigins })).toBe(false)
    // A declaration that names no origin accepts the site's own only.
    expect(acceptsOrigin([], 'https://app.example.com', { siteOrigins })).toBe(false)
    expect(acceptsOrigin([], 'https://www.example.com', { siteOrigins })).toBe(true)
  })
})
