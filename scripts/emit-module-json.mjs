// Emits `dist/module.json`.
//
// 🔑 This file is not decoration. `nuxt/modules` — the database behind
// nuxt.com/modules — reads `https://unpkg.com/<pkg>@<version>/dist/module.json`
// during `pnpm sync` and OVERWRITES the YAML entry's `compatibility.nuxt` (and
// `website`, from `docs`) with what it finds there. So this file, not the
// listing PR, is the durable source of truth for our compatibility claim: it
// survives every re-sync, and the claim in the YAML does not.
//
// `@nuxt/module-builder` would generate it. This package has no build-time
// dependencies at all, so it is generated here instead, from package.json, and
// CI asserts the result rather than trusting it.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))

// The range is MEASURED, not asserted: `scripts/verify-build.mjs` builds a real
// Nuxt site on each supported major and reads the tag out of the emitted HTML.
// Widening it means running that, not editing this string.
const moduleJson = {
  name: pkg.name,
  version: pkg.version,
  configKey: "pulse",
  compatibility: { nuxt: ">=3.0.0" },
  docs: "https://github.com/ciphera-net/pulse-nuxt#readme",
}

mkdirSync(resolve(root, "dist"), { recursive: true })
writeFileSync(resolve(root, "dist/module.json"), JSON.stringify(moduleJson, null, 2) + "\n")
console.log(`wrote dist/module.json (${moduleJson.name}@${moduleJson.version}, nuxt ${moduleJson.compatibility.nuxt})`)
