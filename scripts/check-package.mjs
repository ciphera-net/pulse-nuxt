#!/usr/bin/env node
// The publishable-shape guards, in a committed script that CI and a human both
// invoke the same way.
//
// 🔴 They live here rather than inline in `.woodpecker/test.yml` because an
// inline `node -e` regex in this estate once lost a backslash across
// YAML -> sh -> node and died quietly, after passing locally through a heredoc
// that quotes differently. A guard whose local run and CI run are not the same
// bytes is not a guard.
import { execFileSync } from "node:child_process"
import { readFileSync, existsSync, rmSync, mkdtempSync } from "node:fs"
import { dirname, resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))

let failures = 0
const check = (ok, label, detail) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`)
  if (!ok) {
    failures++
    if (detail !== undefined) console.log(`  ${detail}`)
  }
}

// 1. Zero runtime dependencies. This module's whole job is to add one script
//    tag to a head; anything it dragged in would be a build-time dependency in
//    every consumer's project for no return. `@nuxt/kit` is the one every peer
//    takes and the one deliberately not taken here — see RELEASING.md.
const deps = Object.keys(pkg.dependencies ?? {})
check(deps.length === 0, `zero runtime dependencies (found ${deps.length})`, deps.join(", "))

// 2. dist/module.json must exist and agree with package.json. nuxt/modules
//    reads it off unpkg during `pnpm sync` and OVERWRITES the listing's
//    compatibility claim with what it finds — so a stale one silently
//    republishes a wrong claim to nuxt.com/modules.
const moduleJsonPath = join(ROOT, "dist/module.json")
check(existsSync(moduleJsonPath), "dist/module.json exists (run `npm run build`)")
if (existsSync(moduleJsonPath)) {
  const mj = JSON.parse(readFileSync(moduleJsonPath, "utf8"))
  check(mj.name === pkg.name, `dist/module.json name matches package.json`, `${mj.name} vs ${pkg.name}`)
  check(mj.version === pkg.version, `dist/module.json version matches package.json`, `${mj.version} vs ${pkg.version}`)
  check(
    mj.compatibility?.nuxt === pkg.peerDependencies?.nuxt,
    "dist/module.json compatibility.nuxt IS peerDependencies.nuxt — one range, not two",
    `${mj.compatibility?.nuxt} vs ${pkg.peerDependencies?.nuxt}`,
  )
  check(mj.configKey === "pulse", "dist/module.json declares configKey: pulse", JSON.stringify(mj))
}

// 3. The tarball is exactly what it should be. `prepack` rebuilds `dist/`,
//    which is gitignored, so a fresh clone that skipped the build would
//    otherwise publish an empty package and nothing would say so.
const work = mkdtempSync(join(tmpdir(), "pulse-nuxt-pack-"))
try {
  execFileSync("npm", ["pack", "--pack-destination", work], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] })
  const tgz = execFileSync("ls", [work], { encoding: "utf8" }).trim().split("\n")[0]
  const listed = execFileSync("tar", ["-tzf", join(work, tgz)], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((f) => f.replace(/^package\//, ""))
    .filter(Boolean)
    .sort()
  const expected = ["LICENSE", "README.md", "dist/module.d.ts", "dist/module.js", "dist/module.json", "dist/pulse.d.ts", "dist/pulse.js", "package.json"]
  check(
    JSON.stringify(listed) === JSON.stringify(expected),
    "the tarball holds exactly the eight files it should",
    `got:  ${listed.join(" ")}\n  want: ${expected.join(" ")}`,
  )
  // A `.test.js` in the tarball would mean tsconfig.build.json stopped
  // excluding tests — harmless bytes, but it is the signal that the build
  // config drifted.
  check(!listed.some((f) => f.includes(".test.")), "no test files in the tarball")
} finally {
  rmSync(work, { recursive: true, force: true })
}

// 4. 🔴 `nuxt` must stay in devDependencies, and not for testing.
//    `nuxi module add` decides whether something IS a Nuxt module by reading
//    the published packument and checking
//    `Object.assign(pkg.dependencies, pkg.devDependencies)` for `nuxt`,
//    `nuxt-edge` or `@nuxt/kit` — not the keywords, not dist/module.json
//    (measured in @nuxt/cli's `add` command, 16-09-2026). This package takes
//    none of those as a runtime dependency, so `nuxt` in devDependencies is
//    the ONLY reason `npx nuxi module add @ciphera-net/pulse-nuxt` installs
//    without warning "It seems that … is not a Nuxt module". Dropping it
//    breaks the documented install path and nothing else would notice.
const devDeps = pkg.devDependencies ?? {}
check(
  "nuxt" in devDeps || "@nuxt/kit" in devDeps,
  "`nuxt` stays in devDependencies — `nuxi module add` reads it to recognise a module",
  JSON.stringify(Object.keys(devDeps)),
)

// 5. The keywords nuxt.com's ecosystem and npm search rely on.
for (const kw of ["nuxt", "nuxt-module"]) {
  check((pkg.keywords ?? []).includes(kw), `package.json keeps the "${kw}" keyword`)
}

console.log(failures ? `\nREFUSING: ${failures} check(s) failed` : "\nall package checks passed")
process.exit(failures ? 1 : 0)
