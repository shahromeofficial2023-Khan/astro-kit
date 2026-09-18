#!/usr/bin/env node
// kit — the fleet's build contract and helpers. Run from a site's repo root.
//
//   kit check    inspect dist/ against the contract every fleet site must pass
//   kit og       render the share images listed in site.json → public/
//   kit doctor   site.json valid? kit pin current? what would an upgrade change?
//
// Prints JSON; exits 1 on any problem, so CI and fleet.py can gate on it.
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateSite, siteUrl } from '../index.mjs';

const KIT_REPO = 'https://github.com/shahromeofficial2023-Khan/astro-kit.git';
const cwd = process.cwd();
const readSite = () => JSON.parse(readFileSync(join(cwd, 'site.json'), 'utf8'));
const out = (summary, problems) => {
  for (const p of problems) console.log('FAIL', p);
  console.log(JSON.stringify({ ...summary, problems: problems.length }));
  process.exit(problems.length ? 1 : 0);
};

// ---------------------------------------------------------------- check
function check() {
  const site = readSite();
  const problems = validateSite(site);
  const base = new URL(siteUrl(site));
  const dist = join(cwd, 'dist');
  if (!existsSync(dist)) out({ pages: 0 }, [...problems, 'no dist/ — run the build first']);

  const pages = {};
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f === 'index.html') {
        const rel = '/' + relative(dist, d).split(sep).join('/');
        pages[rel === '/' ? '/' : rel + '/'] = readFileSync(p, 'utf8');
      }
    }
  };
  walk(dist);

  const attr = (s, re) => [...s.matchAll(re)].map((m) => m[1]);
  const alternatesOf = {};
  for (const [path, s] of Object.entries(pages).sort()) {
    const body = s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
    if (!/<html[^>]* lang="[^"]+"/.test(s)) problems.push(`${path}: <html> has no lang`);
    if (/example\.(com|org|net)/.test(s)) problems.push(`${path}: placeholder host (example.com) in output`);

    const canon = attr(s, /<link rel="canonical" href="([^"]+)"/g);
    if (canon.length !== 1) problems.push(`${path}: ${canon.length} canonical tags`);
    else if (canon[0] !== new URL(path, base).href) problems.push(`${path}: canonical ${canon[0]} ≠ ${new URL(path, base).href}`);

    const alts = {};
    for (const m of s.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)) {
      const u = new URL(m[2]);
      if (u.host !== base.host) problems.push(`${path}: hreflang ${m[1]} on foreign host ${u.host}`);
      alts[m[1]] = u.pathname;
    }
    alternatesOf[path] = alts;

    for (const ld of attr(s, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(ld); } catch (e) { problems.push(`${path}: JSON-LD does not parse — ${e.message}`); }
    }
    const visible = body.replace(/<[^>]+>/g, ' ');
    const left = new Set(visible.match(/\{[A-Za-z]\w*\}/g) ?? []);
    if (left.size) problems.push(`${path}: leftover template tokens ${[...left].join(' ')}`);

    // every referenced local asset must ship — a missing share image is invisible on the page
    const refs = [
      ...attr(s, /(?:og:image|twitter:image)" content="([^"]+)"/g),
      ...attr(s, /<link rel="icon" href="([^"]+)"/g),
    ];
    for (const r of refs) {
      const u = new URL(r, base);
      if (u.host === base.host && !existsSync(join(dist, decodeURIComponent(u.pathname)))) {
        problems.push(`${path}: asset not in dist → ${u.pathname}`);
      }
    }
  }

  // hreflang: every target exists and links back
  for (const [path, alts] of Object.entries(alternatesOf)) {
    for (const [lang, target] of Object.entries(alts)) {
      if (!(target in pages)) { problems.push(`${path}: hreflang ${lang} → missing page ${target}`); continue; }
      if (lang !== 'x-default' && !Object.values(alternatesOf[target]).includes(path)) {
        problems.push(`${path}: ${target} does not link back`);
      }
    }
  }

  // sitemap lists every page, on the live host
  let sm = '';
  for (const f of readdirSync(dist)) if (/^sitemap-\d+\.xml$/.test(f)) sm += readFileSync(join(dist, f), 'utf8');
  if (!sm) problems.push('no sitemap-N.xml in dist');
  const missing = Object.keys(pages).filter((p) => !sm.includes(`<loc>${new URL(p, base).href}</loc>`));
  if (sm && missing.length) problems.push(`sitemap is missing ${missing.join(' ')}`);

  // robots.txt points at the sitemap on the live host
  const robotsPath = join(dist, 'robots.txt');
  if (!existsSync(robotsPath)) problems.push('no robots.txt in dist');
  else if (!readFileSync(robotsPath, 'utf8').includes(`Sitemap: ${new URL('/sitemap-index.xml', base).href}`)) {
    problems.push('robots.txt Sitemap line is not on the live host');
  }

  out({ site: base.host, pages: Object.keys(pages).length }, problems);
}

// ---------------------------------------------------------------- og
function og() {
  const site = readSite();
  const cfg = site.og;
  if (!cfg?.cards?.length) out({ cards: 0 }, ['site.json has no og.cards']);
  const c = { bg: '#0B2545', accent: '#0FA3B1', chip: '#FF6B4A', chipInk: '#1A0B06', text: '#FFFFFF', lede: '#D6E4F0', ...cfg.colors };
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const HEAD = "Futura, 'Avenir Next', 'Helvetica Neue', Arial, sans-serif";
  const BODY = "Arial, 'Helvetica Neue', sans-serif";

  return import('sharp').then(async ({ default: sharp }) => {
    const done = [];
    for (const card of cfg.cards) {
      const [l1, l2 = ''] = card.lines;
      const chipW = Math.round((card.chip ?? '').length * 23) + 56;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${c.bg}"/>
  <rect y="430" width="1200" height="200" fill="${c.accent}" opacity=".15"/>
  <rect y="470" width="1200" height="160" fill="${c.accent}" opacity=".24"/>
  <rect y="515" width="1200" height="115" fill="${c.accent}" opacity=".37"/>
  <rect x="72" y="92" width="96" height="6" fill="${c.accent}"/>
  <text x="72" y="210" font-family="${HEAD}" font-size="92" fill="${c.text}">${esc(l1)}</text>
  <text x="72" y="310" font-family="${HEAD}" font-size="92" fill="${c.text}">${esc(l2)}</text>
  <text x="72" y="388" font-family="${BODY}" font-size="34" fill="${c.lede}">${esc(card.lede ?? '')}</text>
  ${card.chip ? `<rect x="72" y="440" width="${chipW}" height="104" rx="16" fill="${c.chip}"/>
  <text x="100" y="478" font-family="${BODY}" font-weight="700" font-size="22" fill="${c.chipInk}">${esc(card.kicker ?? 'FREE · NO SIGN-UP')}</text>
  <text x="100" y="526" font-family="${BODY}" font-weight="700" font-size="40" fill="${c.chipInk}">${esc(card.chip)}</text>` : ''}
</svg>`;
      const file = join(cwd, 'public', card.file);
      await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(file);
      done.push({ file: card.file, bytes: statSync(file).size });
    }
    console.log(JSON.stringify({ cards: done }));
  });
}

// ---------------------------------------------------------------- doctor
function doctor() {
  const site = readSite();
  const problems = validateSite(site);
  const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  const spec = pkg.dependencies?.['@shahrome/astro-kit'] ?? '';
  const pinned = spec.split('#v')[1] ?? null;
  if (!pinned) problems.push(`package.json: @shahrome/astro-kit is not pinned to a tag ("${spec}")`);
  if (pinned && site.kit !== pinned) problems.push(`site.json kit "${site.kit}" ≠ package.json pin "${pinned}"`);
  let latest = null;
  try {
    const tags = execFileSync('git', ['ls-remote', '--tags', '--refs', KIT_REPO], { encoding: 'utf8' })
      .split('\n').map((l) => l.split('refs/tags/v')[1]).filter(Boolean);
    const n = (v) => v.split('.').map(Number);
    latest = tags.sort((a, b) => { const x = n(a), y = n(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }).at(-1) ?? null;
  } catch { problems.push('could not reach the kit repo to read its tags'); }
  out({ site: site.id, pinned, latest, behind: Boolean(pinned && latest && pinned !== latest) }, problems);
}

const cmd = process.argv[2];
const run = { check, og, doctor }[cmd];
if (!run) { console.error('usage: kit <check|og|doctor>'); process.exit(2); }
await run();
