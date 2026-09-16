#!/usr/bin/env node
// One command that reports the state of everything still open for this package.
//
//     node scripts/check-listings.mjs
//
// Needs `gh` authenticated. `NODE_AUTH_TOKEN` is optional and only used for the
// GitHub Packages row.
//
// 🔴 Every probe here that can report a POSITIVE carries its own CONTROL, run
// on every invocation. This estate has been burned three times in one day by
// checks that had never been shown able to say yes — a JED Checker that
// returned all-green on a package with its licence tag deleted, a pipeline
// badge green with a red job, and an npm-packument probe for the Nuxt Scripts
// registry that could never have said yes because the packument carries no
// registry-entry names at all. A check whose negative you cannot distinguish
// from a broken check is not a check.
import { execFileSync } from "node:child_process"

const PKG = "@ciphera-net/pulse-nuxt"
const REPO = "ciphera-net/pulse-nuxt"
const ENTRY = "pulse-analytics"

// Fill these in as they are opened; null means "not submitted yet".
const PRS = [
  { label: "nuxt/modules PR", repo: "nuxt/modules", number: 1618 },
  { label: "ansidev/awesome-nuxt PR", repo: "ansidev/awesome-nuxt", number: 403 },
]

// The @nuxt/scripts registry entry — a DIFFERENT surface from this package,
// tracked here because it is the other way a Nuxt user reaches Pulse.
const SCRIPTS_MERGE_SHA = "9ee23c39e69f"

const gh = (path, jq) => {
  try {
    return execFileSync("gh", jq ? ["api", path, "-q", jq] : ["api", path], { encoding: "utf8" }).trim()
  } catch {
    return null
  }
}
const get = async (url, headers = {}) => {
  const res = await fetch(url, { headers, redirect: "follow" })
  return { status: res.status, body: res.status === 200 ? await res.text() : null }
}

const rows = []
const row = (surface, state, note = "") => rows.push({ surface, state, note })

// ---------------------------------------------------------------- 1. npmjs
{
  const { status, body } = await get(`https://registry.npmjs.org/${PKG.replace("/", "%2f")}`)
  if (status === 200) {
    const j = JSON.parse(body)
    const latest = j["dist-tags"].latest
    const mj = await get(`https://unpkg.com/${PKG}@${latest}/dist/module.json`)
    const compat = mj.status === 200 ? JSON.parse(mj.body).compatibility?.nuxt : "unpkg not serving it"
    row("npmjs", `✅ ${latest}`, `module.json says nuxt ${compat}`)
  } else {
    row("npmjs", `❌ ${status}`, "a 404 within ~5 min of an exit-0 publish is propagation, not failure")
  }
}

// ------------------------------------------------------- 2. GitHub Packages
if (process.env.NODE_AUTH_TOKEN) {
  const { status, body } = await get(`https://npm.pkg.github.com/${PKG.replace("/", "%2f")}`, {
    authorization: `Bearer ${process.env.NODE_AUTH_TOKEN}`,
  })
  row("GitHub Packages", status === 200 ? `✅ ${JSON.parse(body)["dist-tags"].latest}` : `❌ ${status}`)
} else {
  row("GitHub Packages", "— skipped", "set NODE_AUTH_TOKEN to check")
}

// --------------------------------------------------- 3. the npm search index
// ⚠️ npm search pages only to 1000 results, so "not in the listing" is never a
// negative on its own. Ask the index for the package BY NAME and read its
// keywords back — that answers the only question that matters.
{
  const { status, body } = await get(
    `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(PKG)}&size=20`,
  )
  const hit = status === 200 ? JSON.parse(body).objects.find((o) => o.package.name === PKG) : null
  const kws = hit?.package?.keywords ?? []
  // NOT reported as evidence: the query is fuzzy, so `total` counts loose
  // text matches (22,871 of them) and says nothing about our package.
  // CONTROL: a package that certainly IS indexed under the keyword. If this
  // comes back empty the probe is broken, not the answer.
  const ctl = await get(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent("nuxt-gtag")}&size=5`)
  const ctlOk = ctl.status === 200 && JSON.parse(ctl.body).objects.some((o) => o.package.name === "nuxt-gtag")
  row(
    "npm search index",
    hit ? (kws.includes("nuxt-module") ? "✅ indexed with nuxt-module" : "⚠️ indexed, keyword missing") : "⏳ not indexed yet",
    `keywords ${kws.length ? kws.join(",") : "(none read back)"} · control (nuxt-gtag findable): ${ctlOk ? "ok" : "🔴 PROBE BROKEN"}`,
  )
}

// ------------------------------------------- 4. nuxt.com/modules, the listing
// The published @nuxt/modules package IS the site's data. Reading it answers
// "can a stranger find us on nuxt.com today", which the PR state does not.
{
  const { status, body } = await get("https://cdn.jsdelivr.net/npm/@nuxt/modules@latest/modules.json")
  if (status === 200) {
    const all = JSON.parse(body)
    const ours = all.find((m) => m.name === ENTRY)
    // CONTROL: an entry we know is in there. Proves a miss means absent and
    // not "the shape changed and every lookup now returns undefined".
    const ctl = all.find((m) => m.name === "plausible")
    row(
      "nuxt.com/modules",
      ours ? `✅ listed (${ours.compatibility?.nuxt})` : "⏳ not in the database",
      `${all.length} entries · control (plausible present): ${ctl ? "ok" : "🔴 PROBE BROKEN"}`,
    )
  } else {
    row("nuxt.com/modules", `❌ jsdelivr ${status}`)
  }
}

// ---------------------------------------------------------- 5. the open PRs
for (const pr of PRS) {
  if (pr.number === null) {
    row(pr.label, "⏳ not submitted")
    continue
  }
  const out = gh(`repos/${pr.repo}/pulls/${pr.number}`, '"\\(.state) merged=\\(.merged) \\(.mergeable_state)"')
  row(pr.label, out ? `#${pr.number} ${out}` : `#${pr.number} — gh call failed`)
}

// ------------------------------------- 6. @nuxt/scripts: merged vs RELEASED
//
// 🔴 The check this replaces was structurally unable to say yes.
// `gh api repos/nuxt/scripts/releases/latest` EXCLUDES prereleases, and the
// merge shipped in a 2.0.0 prerelease while the stable line sat at v1.3.9 from
// a week earlier. Comparing against `releases/latest` therefore returns
// "diverged" until the whole 2.0 line goes stable, whatever ships in between.
// Both lines are checked here, and the control proves the comparison works.
{
  const stable = gh("repos/nuxt/scripts/releases/latest", ".tag_name")
  const newest = gh("repos/nuxt/scripts/releases?per_page=1", ".[0].tag_name")
  const statusOf = (tag) => (tag ? gh(`repos/nuxt/scripts/compare/${SCRIPTS_MERGE_SHA}...${tag}`, ".status") : null)
  const released = (s) => s === "ahead" || s === "identical"

  const stableStatus = statusOf(stable)
  const newestStatus = statusOf(newest)
  // CONTROL, both directions: v1.3.8...v1.3.9 must be `ahead` (the probe can
  // say yes) and the merge must be `behind` beta.6, published before it (the
  // probe can say no).
  const ctlYes = gh("repos/nuxt/scripts/compare/v1.3.8...v1.3.9", ".status") === "ahead"
  const ctlNo = gh(`repos/nuxt/scripts/compare/${SCRIPTS_MERGE_SHA}...v2.0.0-beta.6`, ".status") === "behind"

  row(
    "@nuxt/scripts — stable line",
    released(stableStatus) ? `✅ in ${stable}` : `⏳ not in ${stable} (${stableStatus})`,
    "this is the gate for adding nuxt to the Pulse integrations registry and docs",
  )
  row(
    "@nuxt/scripts — newest release",
    released(newestStatus) ? `✅ in ${newest}` : `⏳ not in ${newest} (${newestStatus})`,
    `controls: yes-path ${ctlYes ? "ok" : "🔴 BROKEN"} · no-path ${ctlNo ? "ok" : "🔴 BROKEN"}`,
  )
}

// ---------------------------------------------- 7. the nuxt-module GH topic
// `nuxt/awesome` lists no individual modules; its whole Modules section is two
// links, one of them github.com/topics/nuxt-module. The topic IS the listing.
{
  const topics = gh(`repos/${REPO}/topics`, ".names | join(\",\")")
  row(
    "github.com/topics/nuxt-module",
    topics?.split(",").includes("nuxt-module") ? "✅ topic set" : "❌ topic missing",
    topics ?? "",
  )
}

// ------------------------------------------------------------------- output
const w = Math.max(...rows.map((r) => r.surface.length))
console.log()
for (const r of rows) {
  console.log(`${r.surface.padEnd(w)}  ${r.state}${r.note ? `\n${" ".repeat(w + 2)}${r.note}` : ""}`)
}
console.log()
if (rows.some((r) => r.note.includes("BROKEN"))) {
  console.log("🔴 a CONTROL failed — a probe above is broken, so believe none of its answers")
  process.exit(1)
}
