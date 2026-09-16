#!/usr/bin/env node
// Builds a REAL Nuxt site against this module, on each Nuxt major we claim, and
// reads the tag out of the emitted HTML.
//
// 🔴 Why this exists, and why the unit tests are not enough. Four Pulse install
// surfaces have now shipped four different byte-strings for one intent:
//
//   Drupal      'defer' => TRUE        ->  <script defer …>
//   Joomla      'defer' => true        ->  <script … defer …>  + a ?mediaVersion
//                                          cache-buster it appended to our CDN url
//   Docusaurus  {defer: true}          ->  <script … defer="defer" …>  (its minifier)
//   TYPO3       'defer' => 'defer'     ->  <script defer="defer" …>    (implodeAttributes
//                                          has no bare-attribute path)
//
// Every one of those is valid HTML and none would ever have been reported. Two
// were real defects found only by rendering. So this harness asserts the RAW
// BYTES of the tag, never a parsed representation of it — a DOM query would
// report `defer` and `defer="defer"` identically, which is precisely the bug
// class it has to catch.
//
// It then loads the built page in a real browser, because a server-rendered
// head entry is also re-applied by Unhead on hydration, and a second insertion
// would double every pageview.
//
//   node scripts/verify-build.mjs              # every version in VERSIONS
//   node scripts/verify-build.mjs 3.21.11      # one version
//   node scripts/verify-build.mjs --keep       # leave the work tree for poking at
import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "node:http"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const WORK = join(ROOT, "scripts/.work")

// The majors this package claims in `peerDependencies` and in dist/module.json.
// Widening that claim means adding a version here and seeing it go green, not
// editing a semver string.
const VERSIONS = ["3.21.11", "4.5.2"]

const SCRIPT_URL = "https://js.ciphera.net/script.js"
const COMPANION_URL = "https://js.ciphera.net/script.interactions.js"

const args = process.argv.slice(2)
const keep = args.includes("--keep")
const versions = args.filter((a) => !a.startsWith("--"))
const targets = versions.length ? versions : VERSIONS

let failures = 0
let assertions = 0

function check(ok, label, detail) {
  assertions++
  if (ok) {
    console.log(`    ✓ ${label}`)
  } else {
    failures++
    console.log(`    ✗ ${label}`)
    if (detail !== undefined) console.log(`      ${detail}`)
  }
}

function run(cmd, cmdArgs, cwd) {
  return execFileSync(cmd, cmdArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

/** Every `<script …>` open tag in the document, verbatim. Deliberately a regex
 *  over the raw file: the point is the bytes. */
function scriptTags(html) {
  return [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
}

function ourTags(html) {
  return scriptTags(html).filter((t) => t.includes("js.ciphera.net"))
}

// ---------------------------------------------------------------- the fixtures

const FIXTURES = [
  {
    name: "configured",
    config: `pulse: { domain: "example.com", companion: { copy: false }, trackScroll: false }`,
    assert(html) {
      const tags = ourTags(html)
      check(tags.length === 2, "two Pulse tags: the core script and the companion", JSON.stringify(tags))
      const [core = "", companion = ""] = tags

      check(core.includes(`src="${SCRIPT_URL}"`), "core src is the tracker", core)
      check(companion.includes(`src="${COMPANION_URL}"`), "companion src is the interactions script", companion)
      check(tags.indexOf(core) < tags.indexOf(companion), "the core script comes FIRST")

      // The byte-string assertion. ` defer ` or ` defer>` — bare, never
      // `defer="defer"` and never `defer="true"`.
      check(/\sdefer(\s|>)/.test(core), "core carries a BARE `defer` (not defer=\"defer\")", core)
      check(/\sdefer(\s|>)/.test(companion), "companion carries a BARE `defer`", companion)

      check(core.includes(`data-domain="example.com"`), "core carries data-domain", core)
      check(!companion.includes("data-domain"), "companion carries NO data-domain — it reads window.pulse", companion)

      // 🔴 The inversion this whole module guards against. Unhead renders a
      // `data-*` prop of `false` as data-x="false" — an attribute that is
      // PRESENT — and the tracker reads these with hasAttribute(). A present
      // `data-no-scroll` means scroll tracking is OFF.
      check(
        core.includes(`data-no-scroll=""`),
        "trackScroll:false emits data-no-scroll=\"\" (present, empty)",
        core,
      )
      check(
        !/data-no-(outbound|downloads)/.test(core),
        "outbound and downloads stay ON, so their flags are ABSENT — not =\"false\"",
        core,
      )
      check(companion.includes(`data-no-copy=""`), "companion copy:false emits data-no-copy=\"\"", companion)
      check(
        !/data-no-(clicks|forms)/.test(companion),
        "companion clicks and forms stay ON, so their flags are ABSENT",
        companion,
      )

      // Joomla appended `?mediaVersion=…` to this exact URL. A query on a
      // third-party CDN asset is a cache miss on every site that installs us.
      check(!/js\.ciphera\.net\/[^"']*\?/.test(html), "no cache-busting query on either CDN url")

      check(!core.includes("data-api"), "no data-api when no proxy origin is configured", core)
    },
  },
  {
    name: "auto-detect",
    config: `pulse: { apiUrl: "https://proxy.example.com/" }`,
    assert(html) {
      const tags = ourTags(html)
      check(tags.length === 1, "one Pulse tag: no companion unless asked for", JSON.stringify(tags))
      const [core = ""] = tags
      // An empty `data-domain=""` would be read by the tracker as a domain of
      // "", not as absence. Absent is the only correct rendering.
      check(!core.includes("data-domain"), "NO data-domain attribute at all when auto-detecting", core)
      check(core.includes(`data-api="https://proxy.example.com"`), "apiUrl loses its trailing slash", core)
    },
  },
]

// ------------------------------------------------------------------- the build

function buildFixture(dir, nuxtVersion, tarball, fixture) {
  mkdirSync(join(dir, "app/pages"), { recursive: true })
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: `pulse-nuxt-fixture-${fixture.name}`, private: true, type: "module" }, null, 2),
  )
  writeFileSync(
    join(dir, "nuxt.config.ts"),
    `export default defineNuxtConfig({\n` +
      `  compatibilityDate: "2026-01-01",\n` +
      `  modules: ["@ciphera-net/pulse-nuxt"],\n` +
      `  ${fixture.config},\n` +
      `})\n`,
  )
  writeFileSync(join(dir, "app/pages/index.vue"), `<template><main><h1>fixture</h1></main></template>\n`)
  // Nuxt 3 looks for pages/ at the root, Nuxt 4 under app/. Writing both means
  // one fixture works on either without a version branch.
  mkdirSync(join(dir, "pages"), { recursive: true })
  writeFileSync(join(dir, "pages/index.vue"), `<template><main><h1>fixture</h1></main></template>\n`)

  run("npm", ["install", "--no-audit", "--no-fund", `nuxt@${nuxtVersion}`, tarball], dir)
  run("npx", ["nuxt", "build", "--preset", "static"], dir)
  return readFileSync(join(dir, ".output/public/index.html"), "utf8")
}

// -------------------------------------------------------------- the hydration

/** Serve `.output/public`, load `/` in Chromium, and count what is in the DOM
 *  and on the wire AFTER hydration. A head entry rendered by the server is also
 *  applied by Unhead on the client; a second insertion would double every
 *  pageview, and nothing in the emitted HTML can tell you whether it happens. */
async function hydrationCheck(dir) {
  let chromium
  try {
    ;({ chromium } = await import("playwright-core"))
  } catch {
    console.log("    ⚠ playwright-core not installed — SKIPPING the hydration check")
    return
  }

  const root = join(dir, ".output/public")
  const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" }
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0])
    if (p.endsWith("/")) p += "index.html"
    const file = join(root, p)
    if (!existsSync(file) || !file.startsWith(root)) {
      res.writeHead(404).end("not found")
      return
    }
    const ext = p.slice(p.lastIndexOf("."))
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" })
    res.end(readFileSync(file))
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const { port } = server.address()

  let browser
  try {
    browser = await chromium.launch()
    const page = await browser.newPage()
    const hits = []
    page.on("request", (r) => {
      if (r.url().includes("js.ciphera.net")) hits.push(r.url())
    })
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" })
    await page.waitForTimeout(1200)

    const tags = await page.$$eval('script[src*="js.ciphera.net"]', (els) =>
      els.map((e) => ({ src: e.src, defer: e.defer, async: e.async, domain: e.getAttribute("data-domain") })),
    )
    check(tags.length === 2, "after hydration the DOM still holds exactly two tags", JSON.stringify(tags))
    check(hits.length === 2, "exactly two requests to js.ciphera.net — no duplicate load", JSON.stringify(hits))
    check(
      tags.every((t) => t.defer === true && t.async === false),
      "both tags are deferred and ordered in the live DOM",
      JSON.stringify(tags),
    )
  } finally {
    if (browser) await browser.close()
    server.close()
  }
}

// -------------------------------------------------------------------- the run

console.log("packing the module…")
rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })
run("npm", ["pack", "--pack-destination", WORK], ROOT)
const tarballName = readdirSync(WORK).find((f) => f.endsWith(".tgz"))
if (!tarballName) throw new Error("npm pack produced no tarball")
const tarball = join(WORK, tarballName)
console.log(`packed ${tarballName}\n`)

for (const version of targets) {
  console.log(`nuxt@${version}`)
  for (const fixture of FIXTURES) {
    console.log(`  fixture: ${fixture.name}`)
    const dir = join(WORK, `nuxt-${version}-${fixture.name}`)
    let html
    try {
      html = buildFixture(dir, version, tarball, fixture)
    } catch (err) {
      failures++
      console.log(`    ✗ build failed: ${err.message?.split("\n").slice(0, 6).join("\n      ")}`)
      continue
    }
    fixture.assert(html)
    if (fixture.name === "configured") await hydrationCheck(dir)
  }
  console.log("")
}

if (!keep) rmSync(WORK, { recursive: true, force: true })

console.log(`${assertions - failures}/${assertions} assertions passed across ${targets.length} Nuxt version(s)`)
if (failures) {
  console.log(`REFUSING: ${failures} assertion(s) failed`)
  process.exit(1)
}
