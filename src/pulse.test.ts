import { describe, it, expect } from "vitest"
import {
  SCRIPT_URL,
  COMPANION_URL,
  normalizeDomain,
  isValidDomain,
  hostnameFromSite,
  resolveDomain,
  resolveCompanion,
  buildScripts,
} from "./pulse.js"

describe("normalizeDomain", () => {
  it("strips scheme, path, query, fragment, port and a trailing dot", () => {
    expect(normalizeDomain("https://Example.com/blog?x=1#y")).toBe("example.com")
    expect(normalizeDomain("  HTTP://example.com:8080/  ")).toBe("example.com")
    expect(normalizeDomain("example.com.")).toBe("example.com")
  })

  it("keeps www, because a Pulse site may be registered either way", () => {
    expect(normalizeDomain("https://www.example.com")).toBe("www.example.com")
  })

  it("agrees with pulse-astro's cuts on the cases that differ by order", () => {
    expect(normalizeDomain("a.com:8080/p?q#f")).toBe("a.com")
    expect(normalizeDomain("a.com/p:8080")).toBe("a.com")
  })
})

describe("isValidDomain", () => {
  it("accepts real hostnames", () => {
    for (const d of ["example.com", "www.example.com", "a.co", "sub.do-main.example.museum"]) {
      expect(isValidDomain(d), d).toBe(true)
    }
  })

  it("rejects anything that could break out of an HTML attribute", () => {
    for (const d of [
      'a.com"',
      "a.com'",
      "a.com\\",
      "a.com\n",
      "a.com</script>",
      "a.com ",
      "a com.com",
      "localhost",
      "127.0.0.1",
      "",
      "-a.com",
      "a.com-",
    ]) {
      expect(isValidDomain(d), JSON.stringify(d)).toBe(false)
    }
  })
})

describe("hostnameFromSite", () => {
  it("reads the hostname out of a site-config `site.url`", () => {
    expect(hostnameFromSite("https://example.com/base/")).toBe("example.com")
    expect(hostnameFromSite(new URL("https://www.example.com"))).toBe("www.example.com")
  })

  it("returns null rather than guessing", () => {
    expect(hostnameFromSite(undefined)).toBeNull()
    expect(hostnameFromSite("")).toBeNull()
    expect(hostnameFromSite("not a url")).toBeNull()
    expect(hostnameFromSite("http://localhost:3000")).toBeNull()
  })
})

describe("resolveDomain", () => {
  it("prefers the explicit option over site.url", () => {
    expect(resolveDomain({ domain: "a.com" }, "https://b.com")).toEqual({
      domain: "a.com",
      source: "option",
    })
  })

  it("falls back to site.url", () => {
    expect(resolveDomain({}, "https://b.com")).toEqual({ domain: "b.com", source: "site" })
  })

  it("falls back to browser auto-detect, which is a working install", () => {
    expect(resolveDomain({}, undefined)).toEqual({ domain: null, source: "browser" })
    expect(resolveDomain({}, "http://localhost:3000")).toEqual({ domain: null, source: "browser" })
  })

  it("THROWS on a bad explicit domain instead of silently auto-detecting", () => {
    expect(() => resolveDomain({ domain: "not a domain" }, "https://b.com")).toThrow(/not a valid domain/)
  })
})

describe("resolveCompanion", () => {
  it("is null unless asked for — the second request is never implicit", () => {
    expect(resolveCompanion(undefined)).toBeNull()
    expect(resolveCompanion(false)).toBeNull()
  })

  it("records all three by default", () => {
    expect(resolveCompanion(true)).toEqual({ clicks: true, copy: true, forms: true })
    expect(resolveCompanion({})).toEqual({ clicks: true, copy: true, forms: true })
  })

  it("turns off only what is explicitly false", () => {
    expect(resolveCompanion({ copy: false })).toEqual({ clicks: true, copy: false, forms: true })
  })
})

describe("buildScripts", () => {
  it("refuses to emit an invalid domain even if one reaches it", () => {
    expect(() => buildScripts('a.com" onload="alert(1)')).toThrow(/refusing to inject/)
  })

  it("emits only the core script by default", () => {
    const [core, ...rest] = buildScripts("example.com")
    expect(rest).toHaveLength(0)
    expect(core!.src).toBe(SCRIPT_URL)
    expect(core!["data-domain"]).toBe("example.com")
    expect(core!.defer).toBe(true)
  })

  it("omits data-domain entirely when auto-detecting — never an empty attribute", () => {
    const [core] = buildScripts(null)
    // `undefined` is the only value Unhead drops; `''` would render a present,
    // empty `data-domain`, which the tracker reads as a domain of "".
    expect(core!["data-domain"]).toBeUndefined()
    expect("data-domain" in core!).toBe(true)
  })

  it("trims a trailing slash off apiUrl, because the tracker appends its own path", () => {
    const [core] = buildScripts("example.com", { apiUrl: "https://proxy.example.com/" })
    expect(core!["data-api"]).toBe("https://proxy.example.com")
  })

  it("omits data-api when no proxy origin is given", () => {
    const [core] = buildScripts("example.com")
    expect(core!["data-api"]).toBeUndefined()
  })

  // 🔴 The whole reason `flag()` exists. Unhead stringifies a `data-*` prop
  // before its emptiness guard runs, and that guard tests the boolean `false`,
  // not the string "false" — so `'data-no-scroll': false` ships as
  // `data-no-scroll="false"`, an attribute that is PRESENT. The tracker reads
  // these with hasAttribute(), so a boolean would invert every one of them.
  describe("the data-no-* flags are presence flags, never booleans", () => {
    it("emits nothing at all when the feature is on", () => {
      const [core] = buildScripts("example.com", {
        trackScroll: true,
        trackOutbound: true,
        trackDownloads: true,
      })
      for (const key of ["data-no-scroll", "data-no-outbound", "data-no-downloads"]) {
        expect(core![key], key).toBeUndefined()
      }
    })

    it("emits an EMPTY STRING — not `true`, not `false` — when the feature is off", () => {
      const [core] = buildScripts("example.com", {
        trackScroll: false,
        trackOutbound: false,
        trackDownloads: false,
      })
      for (const key of ["data-no-scroll", "data-no-outbound", "data-no-downloads"]) {
        expect(core![key], key).toBe("")
        expect(typeof core![key], key).toBe("string")
      }
    })

    it("treats an omitted flag as on, like the tracker's own default", () => {
      const [core] = buildScripts("example.com", {})
      expect(core!["data-no-scroll"]).toBeUndefined()
    })
  })

  describe("the companion", () => {
    it("is a SECOND entry, after the core, and never carries data-domain", () => {
      const [core, companion, ...rest] = buildScripts("example.com", { companion: true })
      expect(rest).toHaveLength(0)
      expect(core!.src).toBe(SCRIPT_URL)
      expect(companion!.src).toBe(COMPANION_URL)
      expect(companion!["data-domain"]).toBeUndefined()
      expect(companion!.defer).toBe(true)
    })

    it("carries no data-no-* flags when everything is recorded", () => {
      const [, companion] = buildScripts("example.com", { companion: true })
      for (const key of ["data-no-clicks", "data-no-copy", "data-no-forms"]) {
        expect(companion![key], key).toBeUndefined()
      }
    })

    it("turns off exactly what was asked for, as presence flags", () => {
      const [, companion] = buildScripts("example.com", { companion: { copy: false } })
      expect(companion!["data-no-copy"]).toBe("")
      expect(companion!["data-no-clicks"]).toBeUndefined()
      expect(companion!["data-no-forms"]).toBeUndefined()
    })

    it("is absent for `false`, so turning it off cannot leave a stray request", () => {
      expect(buildScripts("example.com", { companion: false })).toHaveLength(1)
    })
  })
})
