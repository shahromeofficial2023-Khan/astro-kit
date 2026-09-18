# @shahrome/astro-kit

The code every site in the fleet shares: SEO head, `/robots.txt`, sitemap, build defaults, an
`llms.txt` helper, a post-build contract, and a share-image renderer. Sites pin it by git tag, so a
change here reaches a site only when that site is upgraded on purpose.

## Install

```sh
npm install github:shahromeofficial2023-Khan/astro-kit#v0.1.0
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

## CLI

Run from a site's root, after `npm run build`:

| Command | Does |
|---|---|
| `kit check` | Inspects `dist/`: one canonical per page on the live host, hreflang targets exist and link back, sitemap lists every page, robots points at it, JSON-LD parses, no leftover `{tokens}`, no placeholder host, and every referenced share image and favicon exists. Exit 1 on any problem. |
| `kit og` | Renders the 1200×630 share images listed under `og.cards` in `site.json` into `public/`. |
| `kit doctor` | Is `site.json` valid? Does the pin in `package.json` match `site.json`? Is a newer kit tag out? |

## Versioning

Semver tags (`v0.1.0`). A patch or minor release must not change any site's built output except to
fix a defect; anything that changes output is called out in the tag's notes.
