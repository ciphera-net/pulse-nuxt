# Pulse Analytics for Nuxt

Privacy-first analytics for a Nuxt site, in one module. No cookies, no personal
data, and the script it adds to your pages is under 3 KB.

[Pulse Analytics](https://pulse.ciphera.net) is built by [Ciphera](https://ciphera.net), a
company in Belgium, and hosted in Europe.

## Install

```bash
npx nuxi module add @ciphera-net/pulse-nuxt
```

Or by hand:

```bash
npm install -D @ciphera-net/pulse-nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@ciphera-net/pulse-nuxt"],
  pulse: { domain: "example.com" },
})
```

That is the whole setup. `domain` is the hostname your site is registered under
in Pulse — if a site-config module (`@nuxtjs/sitemap`, `@nuxtjs/robots`,
`@nuxtjs/seo`) already gives you a `site.url`, you can leave it out and the
module reads the hostname from there.

You need a Pulse Analytics account with a site registered for the same domain.
The free plan is enough to start.

## Options

| Option | Default | What it does |
|---|---|---|
| `domain` | from `site.url` | The domain your site is registered under in Pulse Analytics. Pass this when `site.url` is not the domain you track, for example on a preview deployment. |
| `apiUrl` | — | Route events through your own proxy origin. A bare origin (`https://example.com`), not a full URL: the tracker appends its own path. |
| `trackScroll` | `true` | Record scroll depth. |
| `trackOutbound` | `true` | Record outbound link clicks as `outbound_link` events. |
| `trackDownloads` | `true` | Record file download clicks as `file_download` events. |
| `companion` | `false` | Also record clicks, copies and form submits. A second, separate script — see below. `true` records all three; an object turns individual ones off. |
| `injectInDev` | `false` | Inject during `nuxt dev` too. Off by default — see below. |

```ts
pulse: {
  domain: "example.com",
  companion: { copy: false },
  trackScroll: false,
}
```

## Three things worth knowing

**It does not run in `nuxt dev`.** The tracker has no localhost guard, so a dev
server would send real pageviews at your production dashboard. The module prints
a line saying it stayed out. Set `injectInDev: true` if you actually want it.

**The interaction capture is a second request on purpose.** The core script's
size is a published claim, and nothing gets folded into it to make a feature
look free. `companion: true` costs you a second, separate file.

**View-source shows the tag itself.** Unlike the Astro and Framer integrations,
this module adds a real `<script src>` to `app.head`, so the tag Nuxt renders is
byte-for-byte the one you would paste into a layout by hand, and no JavaScript
of ours reaches your bundle. It works with a strict Content-Security-Policy that
forbids inline script.

## Already using `@nuxt/scripts`?

Then you may not need this module. Pulse is a first-party entry in the
[Nuxt Scripts registry](https://scripts.nuxt.com) as `useScriptPulseAnalytics`,
which gives you loading triggers, consent gating and a typed `track()` you can
call from a component. The option names here (`domain`, `apiUrl`, `trackScroll`,
`trackOutbound`, `trackDownloads`) are deliberately the same, so moving either
way is a copy and paste.

Take this module when you want the tag and nothing else; take `@nuxt/scripts`
when you want the tag *and* a way to fire events from your components. Do not
install both — they would each add a tag, and the pageviews would double.

## What Pulse Analytics measures

Pageviews, referrers, countries, devices, time on page and scroll depth, plus
goals, funnels and campaigns. It sets no cookies and stores no personal data.
Visitors whose browser sends Do Not Track or Global Privacy Control are not
counted at all — so if you test in Brave or Firefox and see nothing, that is the
tracker behaving correctly. Safari is the easiest browser to verify an install in.

## Compatibility

Nuxt 3 and Nuxt 4. The range is measured, not asserted: `npm run verify` builds
a real Nuxt site on each major and reads the tag out of the emitted HTML.
Nuxt 2 is refused with an error — its head is Vue Meta and a different shape
entirely.

## Licence

Copyright 2026 Ciphera BV. Licensed under the Apache License, Version 2.0 —
the `LICENSE` file is the licence text verbatim, so the copyright line lives
here rather than inside it.

This package has **zero runtime dependencies**, asserted in CI.

Nuxt is a trademark of its owners; this is an independent module and is not
affiliated with or endorsed by the Nuxt project.
