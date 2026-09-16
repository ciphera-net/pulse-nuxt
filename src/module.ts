// Type-only, erased at build. `@nuxt/schema` and `@nuxt/kit` are
// devDependencies; neither is a runtime dependency and CI asserts there are
// zero of those. See RELEASING.md § "Why there is no @nuxt/kit dependency" —
// that is about not calling `defineNuxtModule`, not about importing types.
//
// 🔑 `NuxtModule` is imported so TypeScript CHECKS this file against Nuxt's own
// module contract. Without `defineNuxtModule` nothing else would, and a bare
// function whose signature had quietly drifted would still compile.
import type { Nuxt, NuxtModule } from "@nuxt/schema"
import { buildScripts, resolveDomain, type ModuleOptions, type ScriptDescriptor } from "./pulse.js"

export type { ModuleOptions, CompanionOptions, ScriptDescriptor } from "./pulse.js"
export {
  SCRIPT_URL,
  COMPANION_URL,
  buildScripts,
  normalizeDomain,
  isValidDomain,
  hostnameFromSite,
  resolveCompanion,
  resolveDomain,
} from "./pulse.js"

const MODULE_NAME = "@ciphera-net/pulse-nuxt"
const CONFIG_KEY = "pulse"

/** The oldest Nuxt whose module contract and `app.head` this module is built
 *  for. Nuxt 2's head is Vue Meta with a different shape entirely, so this is
 *  a real boundary, not a courtesy. */
const MIN_MAJOR = 3

interface SiteConfigured {
  site?: { url?: string }
  [CONFIG_KEY]?: ModuleOptions
}

/**
 * Pulse Analytics — privacy-first web analytics for Nuxt.
 *
 *   export default defineNuxtConfig({
 *     modules: ["@ciphera-net/pulse-nuxt"],
 *     pulse: { domain: "example.com" },
 *   })
 *
 * 🔑 This is a plain module function rather than a `defineNuxtModule()` call,
 * and that is a deliberate, measured choice — see RELEASING.md § "Why there is
 * no @nuxt/kit dependency". The short version: everything this module does is
 * push two objects into `nuxt.options.app.head.script`, `defineNuxtModule` is
 * sugar around that, and taking `@nuxt/kit` costs a runtime dependency plus a
 * version range that peers have already got wrong. The one thing the sugar
 * would buy — the compatibility gate — is done explicitly below, because Nuxt
 * does NOT read `.meta.compatibility` off a bare function module. That was
 * proven with a control: a module declaring `nuxt: "^99.0.0"` built clean
 * against Nuxt 4.5.2, silently.
 */
function pulseModule(inlineOptions: ModuleOptions | undefined, nuxt: Nuxt): void {
  const options: ModuleOptions = {
    ...((nuxt.options as unknown as SiteConfigured)[CONFIG_KEY] ?? {}),
    ...(inlineOptions ?? {}),
  }

  const major = nuxtMajor(nuxt)
  if (major !== null && major < MIN_MAJOR) {
    throw new Error(
      `[pulse] ${MODULE_NAME} requires Nuxt ${MIN_MAJOR} or newer; this project is running Nuxt ${major}.`,
    )
  }

  // The tracker has no localhost guard, so a dev server would send real
  // pageviews at the production dashboard. Opt in deliberately — and say so
  // either way, because an analytics module that is quietly absent is the
  // worst of the three outcomes.
  if (nuxt.options.dev && !options.injectInDev) {
    log("info", "not injected in dev (set `injectInDev: true` to override)")
    return
  }

  // `site.url` is not a Nuxt core option. `nuxt-site-config` adds it, and
  // @nuxtjs/sitemap, @nuxtjs/robots and @nuxtjs/seo all install that — so it
  // is there often enough to be worth reading and never there reliably enough
  // to depend on.
  const siteUrl = (nuxt.options as unknown as SiteConfigured).site?.url

  // Throws on an explicitly supplied domain that cannot be a hostname. A typo
  // there is a silent no-data install, which is worth a build error.
  const { domain, source } = resolveDomain(options, siteUrl)

  const head = (nuxt.options.app.head ??= {})
  const scripts = (head.script ??= []) as ScriptDescriptor[]
  scripts.push(...buildScripts(domain, options))

  if (source === "browser") {
    log(
      "warn",
      "no `pulse.domain` and no `site.url` — the tag will auto-detect the browser's hostname. Set `pulse: { domain: \"…\" }` if this site is served on more than one domain.",
    )
  } else {
    const from = source === "option" ? "the `domain` option" : "`site.url`"
    const extra = options.companion ? ", with interaction capture" : ""
    log("info", `tracking ${domain} (from ${from})${extra}`)
  }
}

/** Nuxt's major version, or null when it cannot be read.
 *
 *  `nuxt._version` is the full string (`"4.5.2"`, measured) and
 *  `nuxt.options._majorVersion` is the number. Both are private fields, which
 *  is why this returns null rather than guessing when neither is present: a
 *  module that refuses to load because it could not read a private field would
 *  be worse than one that loads and works. */
function nuxtMajor(nuxt: Nuxt): number | null {
  const full = (nuxt as unknown as { _version?: string })._version
  if (typeof full === "string") {
    const major = Number.parseInt(full.split(".")[0] ?? "", 10)
    if (Number.isFinite(major)) return major
  }
  const fromOptions = (nuxt.options as unknown as { _majorVersion?: number })._majorVersion
  return typeof fromOptions === "number" ? fromOptions : null
}

/** Nuxt's own logger lives in `@nuxt/kit`, which this module deliberately does
 *  not take, so these go to the console. They are the only output the module
 *  produces, and saying nothing at all would make "did it inject?" an
 *  unanswerable question. */
function log(level: "info" | "warn", message: string): void {
  const line = `[${CONFIG_KEY}] ${message}`
  if (level === "warn") console.warn(line)
  else console.info(line)
}

pulseModule.meta = {
  name: MODULE_NAME,
  configKey: CONFIG_KEY,
  // ⚠️ Declared for tooling, and NOT a gate. Nuxt does not read this off a
  // bare function module — proven with a control that declared `^99.0.0` and
  // built clean. The gate is `nuxtMajor()` above.
  compatibility: { nuxt: ">=3.0.0" },
}

// The assertion is the point: it fails to compile if the signature stops
// matching what Nuxt will call.
export default pulseModule satisfies NuxtModule<ModuleOptions>

// Makes `pulse: { … }` typed inside `defineNuxtConfig`. Written as a literal
// key rather than `[CONFIG_KEY]` so it reads as what it is in an editor.
declare module "@nuxt/schema" {
  interface NuxtConfig {
    pulse?: ModuleOptions
  }
  interface NuxtOptions {
    pulse?: ModuleOptions
  }
}
