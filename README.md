# Pulse Analytics for Nuxt

This module adds privacy-first analytics to a Nuxt site. Pulse Analytics
sets no cookies and never stores IP addresses, and the script it adds to your
pages is about 3 KB.

[Pulse Analytics](https://pulse.ciphera.net) is built by [Ciphera](https://ciphera.net), a
company in Belgium, and hosted in Switzerland.

## Install

```bash
npx nuxi module add @ciphera-net/pulse-nuxt
```

You can also set it up by hand:

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
in Pulse. If a site-config module (`@nuxtjs/sitemap`, `@nuxtjs/robots`,
`@nuxtjs/seo`) already gives you a `site.url`, you can leave it out and the
module reads the hostname from there.

You need a Pulse Analytics account with a site registered for the same domain.
The free plan is enough to start.

## Options

| Option | Default | What it does |
|---|---|---|
| `domain` | from `site.url` | The domain your site is registered under in Pulse Analytics. Pass this when `site.url` is not the domain you track, for example on a preview deployment. |
| `apiUrl` | unset | Route events through your own proxy origin. Enter the origin only (`https://example.com`), without a path, because the tracker adds its own. |
| `injectInDev` | `false` | Inject during `nuxt dev` too. This is off by default (see below). |

Scroll depth, outbound links, file downloads, and clicks, copies and form submits
are each switched on or off in your site's settings in Pulse (Settings → General).
The tag stays the same, so there is nothing to change here.

`trackScroll`, `trackOutbound`, `trackDownloads` and `companion` are deprecated
and have been ignored since 1.1.0. The module logs one line for each one that is still set.

## Three things worth knowing

**It does not run in `nuxt dev`.** The tracker has no localhost guard, so a dev
server would send real pageviews at your production dashboard. The module prints
a line saying it stayed out. Set `injectInDev: true` if you want the tracker to
run in dev.

**A script served from your own origin needs the interactions script beside
it.** The core script loads the interactions script from the same origin it was
served from. If you serve the core script yourself, for example when Nuxt
Scripts bundles it, put `script.interactions.js` next to it.

**View-source shows the tag itself.** Unlike the Astro and Framer integrations,
this module adds a real `<script src>` to `app.head`, so the tag Nuxt renders is
byte-for-byte the one you would paste into a layout by hand, and no JavaScript
of ours reaches your bundle. It works with a strict Content-Security-Policy that
forbids inline script.

## Already using `@nuxt/scripts`?

Then you may not need this module. Pulse is a first-party entry in the
[Nuxt Scripts registry](https://scripts.nuxt.com) as `useScriptPulseAnalytics`,
which gives you loading triggers, consent gating and a typed `track()` you can
call from a component. The `domain` and `apiUrl` option names here are
deliberately the same, so moving either way is a copy and paste. Since version
1.9.0 of the tracking script, your site's settings in Pulse decide scroll depth,
outbound links and downloads, so neither surface needs an option for them.

Take this module when you want the tag and nothing else; take `@nuxt/scripts`
when you want the tag *and* a way to fire events from your components. Do not
install both, because they would each add a tag and the pageviews would double.

## What Pulse Analytics measures

Pulse Analytics measures pageviews, referrers, countries, devices, time on page
and scroll depth, plus goals, funnels and campaigns.
It sets no cookies and never stores IP addresses. Visitors whose browser sends
Do Not Track or Global Privacy Control are not counted, so if you test in Brave
or Firefox and see nothing, the tracker is behaving correctly. Safari is the
easiest browser to verify an install in.

## Compatibility

The module supports Nuxt 3 and Nuxt 4. The range is measured: `npm run verify`
builds a real Nuxt site on each major and reads the tag out of the emitted HTML.
The module refuses Nuxt 2 with an error. Its head is Vue Meta, which has a
different shape.

## Licence

Copyright 2026 Ciphera BV. Licensed under the Apache License, Version 2.0.
The `LICENSE` file is the licence text verbatim, so the copyright line lives
here rather than inside it.

This package has **zero runtime dependencies**, asserted in CI.

Nuxt is a trademark of its owners; this is an independent module and is not
affiliated with or endorsed by the Nuxt project.
