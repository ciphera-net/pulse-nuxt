// Pure logic for the Pulse Nuxt module: which script tags to add to the head,
// and what domain to add them with. No Nuxt API in this file, so all of it is
// unit-tested — and the rendered-page harness in `scripts/verify-build.mjs`
// then proves what these descriptors actually become as bytes.
//
// 🔴 Nuxt is the one Pulse surface where the literal tag IS expressible.
// Astro's `injectScript` takes JavaScript and never HTML, so `pulse-astro`
// has to build the element in the DOM at runtime. Nuxt's head is a list of
// element descriptors that Unhead serialises, so this module contributes a
// real `<script src … defer data-domain …>` to the server-rendered HTML and
// ships no code of its own to the browser. Measured, not assumed — see
// RELEASING.md § "Compatibility is measured, not assumed".
//
// The `domain` and `apiUrl` option names deliberately match the
// `pulse-analytics` entry in `@nuxt/scripts`. A Nuxt user can meet both, and
// two Pulse surfaces on one framework disagreeing about what an option is
// called is a support ticket waiting to happen. Scroll depth, outbound links,
// downloads and interactions are set in the site's settings in Pulse, and the
// module emits one tag only.

export const SCRIPT_URL = "https://js.ciphera.net/script.js"
/** @deprecated The module no longer loads this script; the core script does
 *  when the site's settings in Pulse switch it on. Kept so the public exports
 *  do not change. */
export const COMPANION_URL = "https://js.ciphera.net/script.interactions.js"

/** A registrable hostname: labels of letters, digits and hyphens, at least one
 *  dot, a letter-only TLD. Deliberately strict, and shared verbatim with
 *  `pulse-astro` so the two agree on what a domain is. */
const DOMAIN_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,63}$/

/** Lower-case, drop a scheme, path, port and trailing dot. Keeps `www.` — the
 *  Pulse site may be registered either way and the user can override it. */
export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase()
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
  s = s.replace(/[/?#].*$/, "")
  s = s.replace(/:.*$/, "")
  s = s.replace(/\.$/, "")
  return s
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_RE.test(domain)
}

/** The hostname of a site URL, or null when it is unset or does not parse.
 *  Nuxt core has no `site` option; `nuxt-site-config` (which `@nuxtjs/sitemap`,
 *  `@nuxtjs/robots` and `@nuxtjs/seo` all install) adds `site.url`, and this is
 *  how we read it when it happens to be there. */
export function hostnameFromSite(site: string | URL | undefined | null): string | null {
  if (!site) return null
  try {
    const host = new URL(String(site)).hostname.toLowerCase().replace(/\.$/, "")
    return isValidDomain(host) ? host : null
  } catch {
    return null
  }
}

/** @deprecated Ignored since 1.1.0. Switch clicks, copies and form submits in
 *  your site's settings in Pulse (Settings > General). */
export interface CompanionOptions {
  /** Record clicks on buttons and links as `click` events. */
  clicks?: boolean
  /** Record text copies as `copy` events. */
  copy?: boolean
  /** Record form submits as `form_submit` events. */
  forms?: boolean
}

export interface ModuleOptions {
  /** The domain the site is registered under in Pulse. Defaults to the
   *  hostname of `site.url` when a site-config module provides one. With
   *  neither, the tag carries no `data-domain` and the tracker falls back to
   *  the browser's own hostname — correct for a single-domain site. */
  domain?: string
  /** Route events through your own proxy origin. A bare origin
   *  (`https://example.com`), not a full URL: the tracker appends its own path. */
  apiUrl?: string
  /** @deprecated Ignored since 1.1.0. Switch scroll depth in your site's
   *  settings in Pulse (Settings > General). */
  trackScroll?: boolean
  /** @deprecated Ignored since 1.1.0. Switch outbound links in your site's
   *  settings in Pulse (Settings > General). */
  trackOutbound?: boolean
  /** @deprecated Ignored since 1.1.0. Switch file downloads in your site's
   *  settings in Pulse (Settings > General). */
  trackDownloads?: boolean
  /** @deprecated Ignored since 1.1.0. Switch clicks, copies and form submits
   *  in your site's settings in Pulse (Settings > General). */
  companion?: boolean | CompanionOptions
  /** Inject during `nuxt dev` as well. Off by default: the tracker has no
   *  localhost guard, so a dev server would send real pageviews at production. */
  injectInDev?: boolean
}

export type DomainSource = "option" | "site" | "browser"

export interface Resolution {
  domain: string | null
  source: DomainSource
}

/** Resolve the domain, saying WHERE it came from so the caller can log it.
 *  Never throws for a missing domain — a null domain is a working install that
 *  auto-detects — but an explicitly supplied domain that cannot be a hostname
 *  is a typo, and a typo there is a silent no-data install, which is worth a
 *  build error. */
export function resolveDomain(
  options: ModuleOptions,
  site: string | URL | undefined | null,
): Resolution {
  if (options.domain !== undefined) {
    const d = normalizeDomain(options.domain)
    if (!isValidDomain(d)) {
      throw new Error(
        `[pulse] "${options.domain}" is not a valid domain. Pass the hostname your site is registered under in Pulse, e.g. pulse: { domain: "example.com" }.`,
      )
    }
    return { domain: d, source: "option" }
  }
  const fromSite = hostnameFromSite(site)
  if (fromSite) return { domain: fromSite, source: "site" }
  return { domain: null, source: "browser" }
}

/** One entry of Nuxt's `app.head.script` array. Deliberately not imported from
 *  `@nuxt/schema` — this file must stay free of Nuxt so it can be tested
 *  without one, and the shape is a plain attribute bag either way. */
export type ScriptDescriptor = Record<string, string | boolean | undefined>

/** The deprecated options that were set, in a fixed order. They are ignored
 *  since 1.1.0; the module logs one line for each. */
export function ignoredOptions(options: ModuleOptions): string[] {
  const names = ["trackScroll", "trackOutbound", "trackDownloads", "companion"] as const
  return names.filter((name) => options[name] !== undefined)
}

/** @deprecated Since 1.1.0 nothing in this module uses it: the core script
 *  loads the interactions script by itself when the site's settings in Pulse
 *  switch it on. It stays exported, unchanged, so code that imported it keeps
 *  building in a minor release.
 *
 *  Normalises `companion` into three booleans, or null when it is not set. */
export function resolveCompanion(
  companion: ModuleOptions["companion"],
): { clicks: boolean; copy: boolean; forms: boolean } | null {
  if (!companion) return null
  if (companion === true) return { clicks: true, copy: true, forms: true }
  return {
    clicks: companion.clicks !== false,
    copy: companion.copy !== false,
    forms: companion.forms !== false,
  }
}

/** The script descriptors to append to `app.head.script`: the core script only.
 *  The core script loads the interactions script by itself when the site's
 *  settings in Pulse switch it on, so this module never emits a second tag and
 *  never writes a `data-no-*` or `data-ignore-*` attribute.
 *
 *  ⚠️ `defer` is a boolean here and Unhead renders it as a BARE `defer`
 *  attribute, which is what we want. It is spelled as a boolean rather than
 *  the string `'defer'` because the string would ship `defer="defer"` — valid
 *  HTML, a different byte-string, and one this project asserts against a real
 *  rendered page rather than trusting. */
export function buildScripts(domain: string | null, options: ModuleOptions = {}): ScriptDescriptor[] {
  if (domain !== null && !isValidDomain(domain)) {
    throw new Error(`[pulse] refusing to inject an invalid domain: ${domain}`)
  }

  return [
    {
      src: SCRIPT_URL,
      defer: true,
      "data-domain": domain ?? undefined,
      "data-api": options.apiUrl ? String(options.apiUrl).replace(/\/+$/, "") : undefined,
    },
  ]
}
