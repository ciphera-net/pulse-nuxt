# Releasing @ciphera-net/pulse-nuxt

Two surfaces, and they are not the same thing:

- **npm** is the install. Publishing makes the module usable.
- **[nuxt.com/modules](https://nuxt.com/modules)** is the listing, and it is a
  **hand-reviewed pull request** against [`nuxt/modules`](https://github.com/nuxt/modules).
  Unlike astro.build there is no crawler: nothing appears because you published.

A third surface exists and is **not this package** — `useScriptPulseAnalytics`
in [`@nuxt/scripts`](https://scripts.nuxt.com). It is tracked below because it
is the other way a Nuxt user reaches Pulse, and its state gates what our own
docs may claim.

## How the nuxt.com listing actually decides — read from its own code, 16-09-2026

`nuxt/modules` holds one YAML file per module in `modules/`, 446 of them, and
publishes the compiled `modules.json` as the npm package `@nuxt/modules`, which
is what nuxt.com renders. `pnpm sync <name> <repo>` generates and validates an
entry; the README says *"If some data is outdated please directly open a pull
request"*, and the "module is missing" issue form is the other route.

🔑 **Prefer the PR.** It is the route you can validate before submitting — the
same reason the Docusaurus listing went in as a fork PR rather than an
issue-form bot.

What `sync` reads, and therefore what is worth getting right at publish time:

| Field | Where it comes from |
|---|---|
| `npm` | `package.json` `name`, fetched from the repo's default branch on raw.githubusercontent |
| `description` | only defaulted from `package.json` when the YAML leaves it empty |
| `type` | derived from the repo owner — `ciphera-net/*` is `3rd-party` |
| `github`, `website` | derived from `repo`; `website` is then overwritten by `docs` from `dist/module.json` if present |
| `compatibility.nuxt` | 🔴 **read from `dist/module.json` on unpkg and it OVERWRITES the YAML** |
| `maintainers` | the YAML, enriched from the GitHub GraphQL user query when `GITHUB_TOKEN` is set |
| `icon` | a file that must exist in `icons/` — an external URL is not accepted |

🔴 **`dist/module.json` is the durable source of truth for the compatibility
claim, not the listing.** Their `nightly.yaml` re-syncs every entry, so anything
typed into the YAML that disagrees with the published package is overwritten on
their schedule, not ours. That is why `scripts/emit-module-json.mjs` derives
`compatibility.nuxt` from `peerDependencies.nuxt` and `scripts/check-package.mjs`
asserts the two are the same string: one range, written once.

⏱ **unpkg is a SECOND propagation stage after npm, and `sync` reads unpkg.**
Measured on the 1.0.1 publish: the npm packument was readable at about t+160 s,
`unpkg.com/<pkg>@1.0.1/dist/module.json` not until **t+350 s**. A `sync` run in
between succeeds, silently falls back to the YAML value, and looks identical to
a correct one. **Wait for the unpkg 200 before running `pnpm sync`.**

⚠️ **The icon is a file in their repo.** 151 of the 326 icons are PNG
(`matomo.png` and `wideangle.png` are both 512×512 RGBA), so the absence of a
vector Pulse mark is not a blocker — `icons/pulse-analytics.png` is the
512×512 mark from `pulse-frontend/public/icon-512x512.png`. Swap it for an SVG
when a vector mark exists.

### The controls that make `pnpm sync` green mean something

Run before trusting a pass — both were run on 16-09-2026 and both went red:

```bash
# A: an invalid category
sed -i '' 's/^category: Analytics$/category: NotACategory/' modules/pulse-analytics.yml
pnpm sync pulse-analytics ciphera-net/pulse-nuxt
#   ■ Unknown category NotACategory for pulse-analytics.  → Sync failed

# B: an icon file that does not exist
sed -i '' 's/^icon: pulse-analytics.png$/icon: does-not-exist.png/' modules/pulse-analytics.yml
pnpm sync pulse-analytics ciphera-net/pulse-nuxt
#   ■ Icon does-not-exist.png does not exist for pulse-analytics  → Sync failed
```

A checker that has not been shown able to fail has told you nothing. This
estate lost hours to a JED Checker that returned all-green three times on a
package with its licence tag deleted.

## 📍 Follow-up tracker — where this module is listed

State captured **16-09-2026**. One command reports all of it, and every probe
in it carries its own control:

```bash
node scripts/check-listings.mjs
```

| # | Where | State at capture | Done looks like | If it stalls |
|---|---|---|---|---|
| 1 | **npmjs** | ✅ `1.0.2` | n/a | n/a |
| 2 | **GitHub Packages** | ✅ `1.0.2` | n/a | n/a |
| 3 | **npm search index** | ⏳ not yet indexed | the package answers a name query with its keywords | npm's search index lags the registry by hours. ⚠️ It pages only to 1000 results, so "not in the keyword listing" is never a negative on its own — query by NAME and read the keywords back |
| 4 | [`nuxt/modules#1618`](https://github.com/nuxt/modules/pull/1618) | OPEN, MERGEABLE/**CLEAN**, all 7 checks green (`ci`, `agentscan`, `autofix`, `check-provenance`, CodeRabbit, 2× Socket) | merged, then `pulse-analytics` appears in `@nuxt/modules`' published `modules.json` and on nuxt.com/modules | Nothing blocks it — purely maintainer attention. ⚠️ It read `BLOCKED` for the first few minutes purely because checks were still pending; that is not `REVIEW_REQUIRED`. Recent comparable PRs (`feat: add @nuxtjs/critters`, `feat: add better-auth`) landed without changes. ⚠️ nuxt.com only updates when they cut a new `@nuxt/modules` release, so merged ≠ visible; row 5 is the one that answers "can a stranger find us" |
| 5 | **nuxt.com/modules itself** | ⏳ 444 entries, not among them | our card in the **Analytics** category (24 entries today) | follows #1618 plus their next `@nuxt/modules` publish |
| 6 | [`ansidev/awesome-nuxt#403`](https://github.com/ansidev/awesome-nuxt/pull/403) | OPEN, MERGEABLE/**UNSTABLE** | merged into `content/resources/modules.md` → Community | Purely maintainer attention. ⚠️ `UNSTABLE` here is **zero checks reported**, not a failing one — measured: 0 statuses, combined `pending`, and the merged precedent #395 has exactly the same shape |
| 7 | **`github.com/topics/nuxt-module`** | ✅ topic set | n/a | This IS a listing: `nuxt/awesome` lists no individual modules — its entire Modules section is two links, and this topic is one of them |
| 8 | **`@nuxt/scripts` stable release** | ⏳ merged, in `2.0.0-beta.8`, NOT in `v1.3.9` | our merge contained in a **stable** `@nuxt/scripts` tag | 🔴 See the correction below. Nothing to chase; the check is the signal |

### 🔴 The `@nuxt/scripts` containment check was testing the wrong tag

The handoff's check was:

```bash
TAG=$(gh api repos/nuxt/scripts/releases/latest -q .tag_name)
gh api "repos/nuxt/scripts/compare/9ee23c39e69f...$TAG" -q .status
```

**`/releases/latest` excludes prereleases.** The merge shipped in
`v2.0.0-beta.7` (16-09 08:32Z) and `v2.0.0-beta.8`, while the stable line sat
at `v1.3.9` from **09-09**, a week before the merge. So that check returns
`diverged` and will keep returning `diverged` until the whole 2.0 line goes
stable, whatever ships in between — a probe that cannot say yes about the thing
it appears to be asking about.

Measured 16-09-2026, and both statements are true at once:

| Tag | `compare/9ee23c39e69f...<tag>` | Reachable by |
|---|---|---|
| `v1.3.9` (stable, `latest`) | `diverged` | ❌ no |
| `v2.0.0-beta.6` | `behind` | ❌ no — and this is the **negative control** |
| `v2.0.0-beta.7` | `ahead` | ✅ yes |
| `v2.0.0-beta.8` (`beta`) | `ahead` | ✅ yes |

`npm pack @nuxt/scripts@beta` confirms it from the other end: the tarball
contains `dist/runtime/registry/pulse-analytics.js`. **A user on
`@nuxt/scripts@beta` can reach Pulse today; a user on `@latest` cannot.**

`scripts/check-listings.mjs` therefore reports **both lines** and runs two
controls every time — `v1.3.8...v1.3.9` must be `ahead` (the probe can say yes)
and `9ee23c39e69f...v2.0.0-beta.6` must be `behind` (it can say no).

⚠️ Do **not** test this against the npm packument. It carries no registry-entry
names at all — `google-analytics` and `fathom` are absent from it too — so that
probe returns false for everything and can never say yes.

### Surfaces checked and deliberately NOT used

Recorded so the search is not repeated:

- 🔴 **`nuxt/awesome` (5,529 ★) lists no individual modules.** Its whole
  `### Modules` section is two links: nuxt.com/modules and
  `github.com/topics/nuxt-module`. **There is nothing to submit**, and it is
  dead besides — **zero merged PRs in the last twelve months**, the most recent
  being Sept 2025. The topic is the actionable half, and it is set.
  (`nuxt-community/awesome-nuxt` is the same repo under its old name.)
- **`productdevbookcom/awesome-nuxt-plugins`** (43 ★) — last pushed March 2023.
- **`Developerayo/awesome-nuxtjs`** (63 ★, 2019) and
  **`viandwi24/nuxt3-awesome-starter`** (1,793 ★) — the latter is a starter
  template, not a list. Wrong content type.
- **`ansidev/awesome-nuxt`** (36 ★) — small, but the only live one, and
  **proven open to outsiders**: `s00d` had `nuxt-i18n-micro` merged on
  05-08-2026, one line appended to `content/resources/modules.md` against
  `main`. #403 copies that shape exactly. ⚠️ 339 merged PRs sounds like an
  active list; 14 of the last 20 are renovate. **Count authorship, not PRs.**

📍 **One owner action, optional:** Nuxt's Discord (`discord.com/invite/nuxt`)
and `reddit.com/r/Nuxt` are the informal announcement channels. No review, no
listing — reach only, and each needs a human with an account.

🔑 **How the extra surfaces were found, since this generalises:** read what the
*official* listing page links OUT to. `nuxt/awesome` pointed at the
`nuxt-module` topic, which is a real listing nobody had thought to claim. Same
move that surfaced `awesome-docusaurus` and `one-aalam/awesome-astro`.

## 🔴 Publish to BOTH registries

npm routes a registry per **scope**, never per package. Every Ciphera
frontend's `.npmrc` maps `@ciphera-net` to GitHub Packages because Facet and
friends are private and live there — and that one line also captures this
package. A public `@ciphera-net` package that exists only on npmjs is
**uninstallable from any estate machine**, and the error it produces is
`No matching version found`, which reads like a wrong version rather than a
wrong registry.

⚠️ **The machine's `~/.npmrc` points `@ciphera-net` at GitHub Packages, so a
bare `npm publish` goes to the WRONG registry.** Always pass `--registry` and an
explicit `--userconfig`.

🔑 **Use `CIPHERA_SCOPE_NPMJS_TOKEN`.** `.env` holds three npm tokens and only
that one can write to this scope; `NPMJS_TOKEN` is older and narrower and
cannot even read the org. `npm whoami` succeeds for all of them and proves
nothing. The one call that separates them, **run it first**:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $TOKEN" \
  https://registry.npmjs.org/-/org/ciphera-net/user
# 200 = CIPHERA_SCOPE_NPMJS_TOKEN   403 = the narrow one
```

```bash
# 1. public npmjs — the registry unpkg, nuxt/modules and every user read from
umask 077; NPMRC=$(mktemp)
printf '//registry.npmjs.org/:_authToken=%s\n@ciphera-net:registry=https://registry.npmjs.org/\n' "$CIPHERA_SCOPE_NPMJS_TOKEN" > "$NPMRC"
npm publish --registry=https://registry.npmjs.org --access public --userconfig "$NPMRC"

# 2. GitHub Packages — so the estate can install it
printf '//npm.pkg.github.com/:_authToken=%s\n@ciphera-net:registry=https://npm.pkg.github.com/\n' "$NODE_AUTH_TOKEN" > "$NPMRC"
npm publish --registry=https://npm.pkg.github.com --userconfig "$NPMRC"

rm -f "$NPMRC"
```

Never put a token on a command line; write it to a `umask 077` file and delete
it afterwards.

### ⏳ npmjs takes about four minutes to become readable

A successful `npm publish` prints `+ @ciphera-net/pulse-nuxt@X.Y.Z` and exits 0
**before the packument is fetchable**. Measured on the 1.0.0 publish here: 404
until t+230 s, 200 at **t+260 s**. An authenticated read 404s just the same.
**Do not read an early 404 as a failed publish** — a 404 *from* the publish call
is a credential; a 404 *after* an exit-0 publish is propagation. GitHub Packages
has no lag. unpkg is slower still: see the timing note above.

### 🔴 A granular token cannot unpublish

`npm unpublish` returns `403 Forbidden … Granular access tokens that bypass
two-factor authentication may not perform this action`. `npm deprecate` works
with the same token. Removing a package needs 2FA — the npm website or a classic
token. GitHub Packages answers the same way: the estate's `NODE_AUTH_TOKEN`
carries `repo, workflow, write:packages` and no `delete:packages`.

## Why there is no `@nuxt/kit` dependency

Every peer in the Nuxt Analytics category takes `@nuxt/kit` and calls
`defineNuxtModule()`. This module does not, and the reasoning is worth keeping
because it is a decision a future maintainer could reasonably reverse.

**What the module does is push two objects into `nuxt.options.app.head.script`.**
`defineNuxtModule` is sugar around exactly that: it merges the config key,
applies defaults, and checks compatibility. The first two are four lines here.

**What it costs.** `@nuxt/kit@^4` adds two packages net to a Nuxt 4 tree, and a
version range that peers have already got wrong in a way that bites — `nuxt-umami`
pins `@nuxt/kit@^3.15.4`, which in a Nuxt 4 project installs a second copy of
kit. A range spanning both majors resolves to one of them, arbitrarily.

🔴 **What it would actually have bought, measured: nothing that is free.** Nuxt
does **not** read `.meta.compatibility` off a bare function module. Proven with
a control — a module declaring `compatibility: { nuxt: "^99.0.0" }` built clean
against Nuxt 4.5.2, no warning, no error. So the gate is not something
`defineNuxtModule` would have given us for free anywhere; it is done explicitly
in `src/module.ts` against `nuxt._version` and tested three ways.

**To reverse this**, take `@nuxt/kit` as a dependency, wrap the setup body in
`defineNuxtModule({ meta, defaults, setup })`, drop `nuxtMajor()` and its tests,
and relax the zero-dependency assertion in `scripts/check-package.mjs` to "one
dependency, and it is `@nuxt/kit`". The render harness should stay green
unchanged; if it does not, the change did more than it looks like.

## Compatibility is measured, not assumed

`peerDependencies` claims `^3.0.0 || ^4.0.0`, and `dist/module.json` is
generated from that same string. The range was verified on 16-09-2026 by
`node scripts/verify-build.mjs`, which for each major builds a real Nuxt site
against a packed tarball of this module, reads the tag out of the emitted HTML,
and then loads the built page in Chromium:

| Nuxt | build | emitted tag | after hydration |
|---|---|---|---|
| 3.21.11 | ok | `<script src="…/script.js" defer data-domain="example.com" data-no-scroll="">` | 1 core + 1 companion tag, 2 requests |
| 4.5.2 | ok | identical | 1 core + 1 companion tag, 2 requests |

**40 assertions, 20 per major.** Widening the range means adding a version to
`VERSIONS` in the harness and seeing it go green — not editing a semver string.

### 🔴 Why it asserts raw bytes and not a parsed DOM

Four Pulse install surfaces have now shipped four different byte-strings for one
intent, and Nuxt makes five:

| Surface | What the code passes | What actually ships |
|---|---|---|
| Drupal | `'defer' => TRUE` | `<script defer …>` |
| Joomla | `'defer' => true` | `<script … defer …>` — and it wanted to append `?mediaVersion` to our CDN url |
| Docusaurus | `{defer: true}` | `<script … defer="defer" …>` — its **HTML minifier** re-serialised a bare `defer` |
| TYPO3 | `'defer' => 'defer'` | `<script defer="defer" …>` — `implodeAttributes()` has **no bare-attribute path** |
| **Nuxt** | `defer: true` | `<script … defer …>` — **bare**, and Unhead emits `defer="defer"` faithfully if you hand it the string |

A DOM query reports `defer` and `defer="defer"` identically. That is exactly the
bug class the harness exists for, so it regexes the raw HTML.

### 🔴 The presence-flag inversion, and its mutation test

Unhead stringifies a `data-*` prop before its emptiness guard runs, and that
guard tests the boolean `false`, not the string `"false"`. The Pulse tracker
reads `data-no-scroll`, `data-no-outbound`, `data-no-downloads`,
`data-no-clicks`, `data-no-copy` and `data-no-forms` with `hasAttribute()`. So a
boolean `false` would switch OFF the very feature the option asked to keep on.

`flag()` in `src/pulse.ts` emits `''` or `undefined` and never a boolean. Both
that and the `defer` assertion are **mutation-tested**, not assumed:

```
flag() returns `false` instead of undefined
  → <script … data-no-scroll="" data-no-outbound="false" data-no-downloads="false">
  → 2 assertions red

defer: true becomes defer: "defer"
  → <script … defer="defer" …>
  → 1 assertion red
```

A green harness that has never been shown to fail is a green tick, not a guard.

## The install path has a load-bearing devDependency

🔴 **`nuxi module add` decides whether a package IS a Nuxt module by reading the
published packument and checking `Object.assign(pkg.dependencies,
pkg.devDependencies)` for `nuxt`, `nuxt-edge` or `@nuxt/kit`.** Not the
keywords, not `dist/module.json` — measured in `@nuxt/cli`'s `add` command,
16-09-2026, and confirmed against `@ciphera-net/pulse-astro`, which has none of
them and gets *"It seems that @ciphera-net/pulse-astro is not a Nuxt module.
Do you want to continue installing anyway?"* with the prompt defaulted to **No**.

This package imports its types from `@nuxt/schema`, which is **not** on that
list, and takes none of the three at runtime. So `@nuxt/kit` in
**devDependencies** is the only reason the README's install command is clean.
Dropping it in a tidy-up would break the documented path and nothing else would
notice, so `scripts/check-package.mjs` asserts it with the reason written next
to it.

✅ **Verified against the live registry, 16-09-2026**, in a throwaway Nuxt 4.5.2
app with `@ciphera-net` mapped to npmjs: `npx nuxt module add
@ciphera-net/pulse-nuxt` installed 1.0.2, wrote the entry into `nuxt.config.ts`
and printed **no "not a Nuxt module" prompt**. Building that app emitted, from
the published package:

```html
<script src="https://js.ciphera.net/script.js" defer data-domain="example.com">
<script src="https://js.ciphera.net/script.interactions.js" defer>
```

### 🔴 …and `nuxt` itself cannot be that devDependency

1.0.0 and 1.0.1 used `nuxt` as the marker, and the first CI run on repo 71
failed on `npm ci`:

```
npm ci can only install packages when your package.json and package-lock.json are in sync
  Invalid: lock file's cac@7.0.0 does not satisfy cac@6.7.14
  Missing: commander@11.1.0 from lock file
```

A fresh `npm install` produced a lockfile that `npm ci` rejected immediately, so
it was reproducible locally too. **Isolated with a control**: `nuxt@4.5.2` alone
breaks `npm ci` under npm 11.6.2, `vitest@4.0.18` alone does not. The cause is
`@nuxt/cli` → `@bomb.sh/tab`, which wants `cac ^6.7.14` and
`commander ^13 || ^14 || ^15` while `fast-npm-meta` and `vite-node` want
`cac ^7`; npm's lockfile writer hoists cac@7 and then `npm ci` reports the
nested `cac@6.7.14` as missing. An `overrides` entry fixes `cac` and the failure
simply moves to `commander`. It is an upstream npm/`@nuxt/cli` interaction, not
something in this package.

`@nuxt/kit` is on the marker list, is a tenth of the tree, and does not have the
problem — and this package never needed `nuxt` installed anyway: the render
harness installs its own copy per fixture.

⚠️ The lesson is the cheap one. **Run `npm ci` from a deleted `node_modules`
before pushing.** `npm install` had been green the whole time; the two commands
answer different questions.

## Why `NuxtModule` is imported

`src/module.ts` ends with `export default pulseModule satisfies
NuxtModule<ModuleOptions>`. Without `defineNuxtModule` nothing else would check
this file against Nuxt's own module contract, and a bare function whose
signature had quietly drifted would still compile and still publish.

Mutation-tested: swapping the two parameters gives
`TS1360: Type 'typeof pulseModule' does not satisfy the expected type
'NuxtModule<ModuleOptions, Partial<ModuleOptions>, false>'`.

## Release steps

1. Bump `version` in `package.json`.
2. 🔴 **`node scripts/verify-build.mjs`** — the render harness. CI does **not**
   run it (it installs ~600 packages per fixture and drives a headless
   Chromium), so "CI is green" never means "the rendered tag was checked".
   This is the step that would have caught Joomla's cache-buster and TYPO3's
   `defer="1"`.
3. Merge to `main`. `.woodpecker/test.yml` runs on the PR **and** on the push:
   typecheck, tests, a test-count floor, build, and `scripts/check-package.mjs`.
4. Tag: `git tag -a vX.Y.Z -m "Release X.Y.Z" && git push origin vX.Y.Z`.
5. `npm pack --dry-run` — the tarball is LICENSE, README, `dist/` and
   `package.json`, nothing else. `prepack` rebuilds `dist/`, which is
   gitignored, so a fresh clone cannot ship an empty package.
6. Publish to both registries (above).
7. Confirm with `npm view @ciphera-net/pulse-nuxt version` against **each**
   registry explicitly — a single `npm view` answers from whichever registry the
   scope happens to be mapped to and will happily report the other one's version.
   ⚠️ `npm view --registry=…` does NOT override a scope mapping in `~/.npmrc`;
   use a `--userconfig` file.
8. Wait for `unpkg.com/@ciphera-net/pulse-nuxt@<version>/dist/module.json` to
   return 200 before touching anything in `nuxt/modules` — see the timing note.
9. `node scripts/check-listings.mjs`.

## A CI release pipeline is deliberately NOT here yet

A `publish.yml` referencing a secret that does not exist would **halt the whole
pipeline, `test` included** — a missing secret is a pipeline-level error in
Woodpecker, not a step-level one, and zero steps run. Woodpecker validates every
referenced secret **against the event**.

So: add `npmjs_token` to repo **71** first, then copy
`Tessera/tessera-ts/.woodpecker/publish.yml` — it is the worked example, with a
step per registry, `test -n "$NODE_AUTH_TOKEN"` guards that fail loudly when a
secret is not injected, and an idempotent publish that tolerates a re-tag.
Release by **tagging**, not by a manual trigger.

## Version history

- **1.0.2** — `nuxt` swapped for `@nuxt/kit` in devDependencies. `nuxt` made
  `npm ci` reject the lockfile (see above), and `@nuxt/kit` satisfies the same
  `nuxi module add` marker. No change to the shipped code.
- **1.0.1** — `dist/module.json`'s compatibility range is now derived from
  `peerDependencies.nuxt` instead of being written a second time. 1.0.0 shipped
  `>=3.0.0` there against a peer range of `^3.0.0 || ^4.0.0`; the two disagreed,
  and `nuxt/modules` reads the module.json one. Functionally identical.
- **1.0.0** — first release.
