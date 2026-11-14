import { describe, it, expect } from "vitest"
import {
  SCRIPT_URL,
  COMPANION_URL,
  normalizeDomain,
  isValidDomain,
  hostnameFromSite,
  resolveDomain,
  ignoredOptions,
  buildScripts,
  type ModuleOptions,
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

describe("ignoredOptions", () => {
  it("is empty when no deprecated option is set", () => {
    expect(ignoredOptions({ domain: "example.com", apiUrl: "https://p.example.com" })).toEqual([])
  })

  it("names each deprecated option that is set, even when it is false", () => {
    expect(ignoredOptions({ trackScroll: false, companion: true })).toEqual(["trackScroll", "companion"])
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

  describe("the deprecated options", () => {
    const all: ModuleOptions = {
      trackScroll: false,
      trackOutbound: false,
      trackDownloads: false,
      companion: { copy: false },
    }

    it("are ignored: the build still emits exactly one script", () => {
      const scripts = buildScripts("example.com", all)
      expect(scripts).toHaveLength(1)
      expect(scripts[0]!.src).toBe(SCRIPT_URL)
      expect(scripts[0]!["data-domain"]).toBe("example.com")
    })

    it("never write a data-no-* or data-ignore-* attribute, and never the interactions script", () => {
      for (const options of [all, { companion: true }, {}]) {
        const scripts = buildScripts("example.com", options)
        for (const script of scripts) {
          expect(script.src).not.toBe(COMPANION_URL)
          for (const key of Object.keys(script)) expect(key).not.toMatch(/^data-(no|ignore)-/)
        }
      }
    })

    it("leave data-api alone", () => {
      const [core] = buildScripts("example.com", { ...all, apiUrl: "https://proxy.example.com/" })
      expect(core!["data-api"]).toBe("https://proxy.example.com")
    })
  })
})
