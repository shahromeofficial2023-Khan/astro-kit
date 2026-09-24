# @shahrome/astro-kit

The code every site in the fleet shares: SEO head, `/robots.txt`, sitemap, build defaults, an
`llms.txt` helper, a post-build contract, and a share-image renderer. Sites pin it by git tag, so a
change here reaches a site only when that site is upgraded on purpose.

## Install

```sh
npm install github:shahromeofficial2023-Khan/astro-kit#v0.2.0
```

No registry, no token. Always pin a tag — never a branch.

## Use

Every site has a `site.json` at its root:

```json
{
  "id": "p002",
  "name": "Pool Volume Calculator",
  "host": "vercel",
  "interim_url": "https://pool-volume-calculator.vercel.app",
  "domain": null,
  "topic": "pool volume calculator",
  "kit": "0.1.0"
}
```

`domain` stays `null` while the site lives on its interim URL. Set it to a bare hostname and every
absolute URL the site emits — canonical, hreflang, OG, sitemap, robots, llms.txt — moves with it.
`host` is `vercel` or `sftp`.

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { kit } from '@shahrome/astro-kit';
import site from './site.json' with { type: 'json' };

export default defineConfig({ integrations: [kit(site)] });
```

`kit()` sets `site`, static output, trailing slashes, inlined CSS, the sitemap and `/robots.txt`.
It refuses to build if `site.json` is invalid or still points at a placeholder host.

```astro
---
import Head from '@shahrome/astro-kit/Head.astro';
import JsonLd from '@shahrome/astro-kit/JsonLd.astro';
---
<head>
  <Head title="…" description="…" path="/tool/" siteName="…" ogLocale="en_US" />
  <JsonLd graph={[{ '@type': 'WebApplication', name: '…' }]} />
</head>
```

Multi-language sites pass `alternates`, `xDefault` and `ogLocaleAlternates`.

## Calculator options slot (v0.3.3)

`<Calculator label="…">` names the form for assistive tech. The optional `options` slot holds secondary controls
(a method chooser, units); pass `form="calc"` on its inputs (`<Choice form="calc">`). Phones stack
input → result → options so the answer is on the first screen; from 768px the result sits on the right.

## Theme (v0.3.2)

`brand_tokens.light` is required; `brand_tokens.dark` is optional. `theme` decides how dark is applied:

- `"auto"` (default) — dark follows the visitor's OS setting (`prefers-color-scheme`).
- `"toggle"` — the page is light for everyone. Layout renders a 44px sun/moon button in the header
  (slot `header-tools` sits beside it; `themeLabel` names it in the page's language); the choice is kept in
  `localStorage("theme")` and applied before first paint, and `theme-color` follows it.

`kit check` verifies contrast for both token sets either way.

## Page building blocks (v0.2)

A fleet tool page is assembled, not written. Everything below reads `site.json` itself.

```astro
---
import Layout from '@shahrome/astro-kit/Layout.astro';
import Hero from '@shahrome/astro-kit/Hero.astro';
import Calculator from '@shahrome/astro-kit/Calculator.astro';
import Choice from '@shahrome/astro-kit/Choice.astro';
import Field from '@shahrome/astro-kit/Field.astro';
import ResultCard from '@shahrome/astro-kit/ResultCard.astro';
import Facts from '@shahrome/astro-kit/Facts.astro';
import Timeline from '@shahrome/astro-kit/Timeline.astro';
import Faq from '@shahrome/astro-kit/Faq.astro';
import ToolSchema from '@shahrome/astro-kit/ToolSchema.astro';
---
<Layout title="…" description="…" path="/">
  <ToolSchema slot="head" description="…" />
  <Hero title="…">One-paragraph intro.</Hero>
  <Calculator>
    <Fragment slot="inputs">
      <Choice name="mode" legend="Calculate from" options={[…]} />
      <Field id="x" label="…" hint="…" errors><input id="x" name="x" /></Field>
    </Fragment>
    <Fragment slot="result">
      <ResultCard tag="Example" pre="You get" big="…" sub="…" percent={40} note="…" />
      <Facts items={[{ id: 'r-a', value: '…', label: '…' }]} />
      <Timeline items={[{ key: 'k', label: '…', when: '…', state: 'done' }]} />
    </Fragment>
  </Calculator>
  <article class="wrap content">… <Faq items={[['Question?', 'Answer.']]} /></article>
</Layout>
```

| Piece | What it gives you |
|---|---|
| `Layout` | SEO head, brand colours from `site.json` `brand_tokens`, skip link, header, footer with `disclaimer` |
| `Hero` | coloured band with H1 + intro; wraps any length of text |
| `Calculator` | inputs/result card; result side is a live region |
| `Choice` | radio options as tiles (≤ 4 per row) or a compact pair |
| `Field` | label + control + hint + error line, with stable ids; `show` ties it to one Choice option |
| `ResultCard` | headline answer; ids `r-tag r-pre r-big r-sub r-bar r-note` |
| `Facts`, `Timeline` | secondary figures; dated steps with done/next states |
| `Faq` | the questions **and** FAQPage JSON-LD from one list |
| `ToolSchema` | WebApplication JSON-LD |
| `@shahrome/astro-kit/client` | `createResult(out)` (an error never leaves an old answer looking current), `showFieldsFor`, `localToday` |

**Brand colours** live in `site.json` → `brand_tokens.light` (+ `dark` for what changes). Keys: `header on_header
hero_ink heading accent on_accent accent_ink progress result ground surface ink muted line err shadow`.
`kit check` fails the build if any text/background pair is under WCAG AA (4.5:1; 3:1 for the progress bar), in
either mode.

**`/llms.txt`** is generated from `site.json` → `llms: { summary, facts }` when present.

## CLI

Run from a site's root, after `npm run build`:

| Command | Does |
|---|---|
| `kit check` | Checks brand contrast, then inspects `dist/`: one canonical per page on the live host, hreflang targets exist and link back, sitemap lists every page, robots points at it, JSON-LD parses, no leftover `{tokens}`, no placeholder host, and every referenced share image and favicon exists. Exit 1 on any problem. |
| `kit og` | Renders the 1200×630 share images listed under `og.cards` in `site.json` into `public/`. |
| `kit doctor` | Is `site.json` valid? Does the pin in `package.json` match `site.json`? Is a newer kit tag out? |

## Versioning

Semver tags (`v0.1.0`). A patch or minor release must not change any site's built output except to
fix a defect; anything that changes output is called out in the tag's notes.

## 0.3.4
- Layout renders the GA4 gtag snippet when `site.analytics` is a `G-` measurement id.

## 0.3.5
- `site.dmca` typed (badge id); fleet footers may render the DMCA badge from it.

## 0.3.6
- `site.noindex` accepts prefix wildcards (`/blog/*`); such pages are noindex,follow by default and leave the sitemap. `isNoindexPath()` exported.
