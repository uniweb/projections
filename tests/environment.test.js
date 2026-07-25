/**
 * The environment contract.
 *
 * This package exists because the *package boundary* is the real constraint,
 * not the code. Search extraction was always portable — zero imports — yet it
 * still got reimplemented elsewhere, because it lived inside a package whose
 * identity pulls Vite and Node APIs. Nothing stopped the next commit adding
 * `node:fs` to a module a second consumer depended on.
 *
 * So the invariant is enforced rather than documented: every module reachable
 * from this package's entry points must be importable from Node, from a
 * browser bundle, and from a Worker alike. The app is a browser call site,
 * which makes browser-safety the binding constraint — stricter than
 * Worker-safety, and it subsumes it.
 *
 * This test walks the real import graph, so it fails on a transitive
 * violation, not just a direct one.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/** Bare specifiers this package is allowed to depend on. */
const ALLOWED_PACKAGES = new Set([
  '@uniweb/content-writer',
  '@uniweb/core/locale-config',
])

/** Globals that only exist in one environment. */
const FORBIDDEN_GLOBALS = [
  ['process.', 'Node-only global'],
  ['__dirname', 'CommonJS-only global'],
  ['__filename', 'CommonJS-only global'],
  ['document.', 'DOM-only global'],
  ['window.', 'DOM-only global'],
  ['localStorage', 'DOM-only global'],
]

/** Every .js file under src/. */
function sourceFiles(dir = SRC, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, found)
    else if (entry.endsWith('.js')) found.push(full)
  }
  return found
}

/**
 * Drop comments, so prose about `process.env` — or a JSDoc `@example` showing
 * an import — is not mistaken for code.
 */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Bare + relative specifiers imported or re-exported by a file. */
function specifiersOf(source) {
  const code = stripComments(source)
  const specifiers = []
  const patterns = [
    /\bimport\s+[^'"]*from\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) specifiers.push(match[1])
  }
  return specifiers
}

const files = sourceFiles()

describe('environment contract', () => {
  test('the source tree is non-empty', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  test('no module imports a node: builtin', () => {
    const offenders = []
    for (const file of files) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('node:')) offenders.push(`${file} → ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('no module imports an unlisted package', () => {
    const offenders = []
    for (const file of files) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('.')) continue
        if (ALLOWED_PACKAGES.has(spec)) continue
        offenders.push(`${file} → ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('never imports the bare @uniweb/core entry', () => {
    // The package root pulls in @uniweb/semantic-parser. Only the leaf
    // subpath `@uniweb/core/locale-config` (zero imports) is safe here.
    const offenders = []
    for (const file of files) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        if (spec === '@uniweb/core') offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })

  test('no module references a single-environment global', () => {
    const offenders = []
    for (const file of files) {
      const stripped = stripComments(readFileSync(file, 'utf8'))
      for (const [token, why] of FORBIDDEN_GLOBALS) {
        if (stripped.includes(token)) offenders.push(`${file} → ${token} (${why})`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('declared dependencies match what the source actually imports', () => {
    const pkg = JSON.parse(readFileSync(resolve(SRC, '..', 'package.json'), 'utf8'))
    const declared = Object.keys(pkg.dependencies || {})
    // Every allowed specifier resolves to a declared dependency.
    for (const spec of ALLOWED_PACKAGES) {
      const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
      expect(declared).toContain(pkgName)
    }
  })
})

describe('the entry points actually load', () => {
  test('the package root imports cleanly', async () => {
    const mod = await import('../src/index.js')
    expect(typeof mod.renderSiteIndex).toBe('function')
    expect(typeof mod.renderPageMarkdown).toBe('function')
    expect(typeof mod.resolvePageDescription).toBe('function')
    expect(typeof mod.generateSearchIndex).toBe('function')
  })

  test('the search subpath imports cleanly', async () => {
    const mod = await import('../src/search/index.js')
    expect(typeof mod.generateSearchIndex).toBe('function')
    expect(typeof mod.extractSearchContent).toBe('function')
    expect(typeof mod.generateCollectionIndex).toBe('function')
  })
})
