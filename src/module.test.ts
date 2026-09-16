import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Nuxt } from "@nuxt/schema"
import pulseModule from "./module.js"
import { SCRIPT_URL, COMPANION_URL, type ModuleOptions } from "./pulse.js"

/** The smallest thing the module can be handed that still answers every
 *  question it asks: a head to push into, a dev flag, a version, and the
 *  `pulse` config key. Built by hand rather than by booting Nuxt — booting
 *  Nuxt is what `scripts/verify-build.mjs` does, and it does it against the
 *  real emitted HTML rather than against an object graph. */
function fakeNuxt(
  options: { dev?: boolean; version?: string; pulse?: ModuleOptions; site?: { url?: string } } = {},
): Nuxt {
  return {
    _version: options.version ?? "4.5.2",
    options: {
      dev: options.dev ?? false,
      app: { head: {} },
      ...(options.pulse ? { pulse: options.pulse } : {}),
      ...(options.site ? { site: options.site } : {}),
    },
  } as unknown as Nuxt
}

function headScripts(nuxt: Nuxt): Array<Record<string, unknown>> {
  return (nuxt.options.app.head.script ?? []) as Array<Record<string, unknown>>
}

let info: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {})
  warn = vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  info.mockRestore()
  warn.mockRestore()
})

describe("the module function", () => {
  it("is a plain function carrying .meta — the contract Nuxt loads", () => {
    expect(typeof pulseModule).toBe("function")
    expect(pulseModule.meta).toMatchObject({
      name: "@ciphera-net/pulse-nuxt",
      configKey: "pulse",
    })
  })

  it("pushes the tag into app.head.script", () => {
    const nuxt = fakeNuxt({ pulse: { domain: "example.com" } })
    pulseModule(undefined, nuxt)
    expect(headScripts(nuxt)).toHaveLength(1)
    expect(headScripts(nuxt)[0]!.src).toBe(SCRIPT_URL)
    expect(headScripts(nuxt)[0]!["data-domain"]).toBe("example.com")
  })

  it("APPENDS — it never replaces a head somebody else already wrote to", () => {
    const nuxt = fakeNuxt({ pulse: { domain: "example.com" } })
    ;(nuxt.options.app.head.script ??= []).push({ src: "https://example.com/theirs.js" })
    pulseModule(undefined, nuxt)
    expect(headScripts(nuxt).map((s) => s.src)).toEqual(["https://example.com/theirs.js", SCRIPT_URL])
  })

  it("reads the `pulse` config key", () => {
    const nuxt = fakeNuxt({ pulse: { domain: "fromconfig.com", companion: true } })
    pulseModule(undefined, nuxt)
    expect(headScripts(nuxt).map((s) => s.src)).toEqual([SCRIPT_URL, COMPANION_URL])
    expect(headScripts(nuxt)[0]!["data-domain"]).toBe("fromconfig.com")
  })

  it("lets inline options — `modules: [['…', { … }]]` — win over the config key", () => {
    const nuxt = fakeNuxt({ pulse: { domain: "fromconfig.com" } })
    pulseModule({ domain: "frominline.com" }, nuxt)
    expect(headScripts(nuxt)[0]!["data-domain"]).toBe("frominline.com")
  })

  it("falls back to site.url when a site-config module provides one", () => {
    const nuxt = fakeNuxt({ site: { url: "https://fromsite.com/base" } })
    pulseModule(undefined, nuxt)
    expect(headScripts(nuxt)[0]!["data-domain"]).toBe("fromsite.com")
    expect(info).toHaveBeenCalledWith(expect.stringContaining("site.url"))
  })

  it("WARNS, and still installs, when there is no domain to be had", () => {
    const nuxt = fakeNuxt()
    pulseModule(undefined, nuxt)
    expect(headScripts(nuxt)).toHaveLength(1)
    expect(headScripts(nuxt)[0]!["data-domain"]).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("auto-detect"))
  })

  describe("dev", () => {
    // The tracker has no localhost guard and the API accepts localhost as an
    // Origin for any registered domain, so `nuxt dev` would post real
    // pageviews to the production dashboard.
    it("injects NOTHING in dev, and says so", () => {
      const nuxt = fakeNuxt({ dev: true, pulse: { domain: "example.com" } })
      pulseModule(undefined, nuxt)
      expect(headScripts(nuxt)).toHaveLength(0)
      expect(info).toHaveBeenCalledWith(expect.stringContaining("not injected in dev"))
    })

    it("injects in dev when explicitly asked", () => {
      const nuxt = fakeNuxt({ dev: true, pulse: { domain: "example.com", injectInDev: true } })
      pulseModule(undefined, nuxt)
      expect(headScripts(nuxt)).toHaveLength(1)
    })
  })

  describe("the Nuxt version gate", () => {
    // 🔴 This gate is hand-rolled because Nuxt does NOT read
    // `.meta.compatibility` off a bare function module. Proven with a control:
    // a module declaring `nuxt: "^99.0.0"` built clean against Nuxt 4.5.2,
    // with no warning and no error. So `.meta.compatibility` is a declaration
    // for tooling, and this is the only thing that actually refuses.
    it("refuses Nuxt 2, whose head is a different shape entirely", () => {
      expect(() => pulseModule(undefined, fakeNuxt({ version: "2.18.1" }))).toThrow(/requires Nuxt 3 or newer/)
    })

    it("accepts Nuxt 3 and 4", () => {
      for (const version of ["3.21.11", "4.5.2"]) {
        const nuxt = fakeNuxt({ version, pulse: { domain: "example.com" } })
        expect(() => pulseModule(undefined, nuxt), version).not.toThrow()
      }
    })

    it("installs rather than refusing when the version cannot be read at all", () => {
      // Both fields are private. A module that refused to load because it
      // could not read a private field would be worse than one that loads.
      const nuxt = { options: { dev: false, app: { head: {} }, pulse: { domain: "example.com" } } } as unknown as Nuxt
      expect(() => pulseModule(undefined, nuxt)).not.toThrow()
      expect(headScripts(nuxt)).toHaveLength(1)
    })
  })

  it("throws on a typo'd domain rather than shipping a no-data install", () => {
    expect(() => pulseModule({ domain: "not a domain" }, fakeNuxt())).toThrow(/not a valid domain/)
  })
})
