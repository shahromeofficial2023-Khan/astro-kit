// kit cannibal — one page per keyword. Fails on: duplicate title / H1 / meta description, missing or multiple H1,
// H1 words absent from the title, the same primary keyword on two pages, an indexable page missing from keyword-map.json,
// a primary keyword absent from title+H1+description. Rows with intent "locale" are translated homepages: checked for
// lang/dir/x-default, leftover {tokens} and any site.json "locale_markers" (source-language strings that must not remain).
import { readPages, readJson, readSite, mapRow, primaryOf, isNoindex } from './lib/pages.mjs';

export function cannibal() {
  const map = readJson('keyword-map.json', null);
  if (!map) { console.log('FAIL no keyword-map.json'); process.exit(1); }
  const site = readSite();
  const markers = site.locale_markers ?? [];
  const pages = readPages();
  const get = (s, re) => (s.match(re)?.[1] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const decode = (t) => t.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const norm = (t) => decode(t).toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const problems = [];
  const seen = { title: {}, h1: {}, description: {}, primary: {} };
  const dup = (kind, key, path) => { if (!key) return; if (seen[kind][key]) problems.push(`${path}: ${kind} duplicates ${seen[kind][key]} ("${key}")`); else seen[kind][key] = path; };
  let indexable = 0;
  for (const [path, html] of Object.entries(pages).sort()) {
    if (isNoindex(html)) continue;
    indexable++;
    const title = get(html, /<title>([\s\S]*?)<\/title>/), h1 = get(html, /<h1[^>]*>([\s\S]*?)<\/h1>/), desc = get(html, /<meta name="description" content="([^"]*)"/);
    if (!h1) problems.push(`${path}: no <h1>`);
    const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
    if (h1s > 1) problems.push(`${path}: ${h1s} <h1> tags`);
    dup('title', norm(title), path); dup('h1', norm(h1), path); dup('description', norm(desc), path);
    const tw = new Set(norm(title).split(' '));
    const missing = norm(h1).split(' ').filter((w) => w && !tw.has(w));
    if (missing.length) problems.push(`${path}: H1 words not in title: ${missing.join(' ')}`);
    const row = mapRow(map, path);
    if (!row) { problems.push(`${path}: not in keyword-map.json`); continue; }
    if (row.intent === 'locale') {
      const lang = html.match(/<html[^>]* lang="([^"]+)"/)?.[1];
      if (lang !== row.lang) problems.push(`${path}: <html lang> is ${lang}, expected ${row.lang}`);
      const rtl = ['ar', 'ur', 'he', 'fa'].includes(row.lang);
      if (rtl !== /<html[^>]* dir="rtl"/.test(html)) problems.push(`${path}: dir should ${rtl ? '' : 'not '}be rtl`);
      if (!/hreflang="x-default" href="[^"]+\/"/.test(html)) problems.push(`${path}: no x-default hreflang`);
      const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
      for (const m of markers) if (text.includes(m)) problems.push(`${path}: source language left on the page ("${m}")`);
      if (/\{[a-zA-Z]\w*\}/.test(text)) problems.push(`${path}: unfilled {token}`);
      continue;
    }
    const primary = primaryOf(row, path);
    const wildcard = row.primary?.includes('{slug}');
    if (primary && primary !== 'none (trust)') dup('primary', norm(primary), path);
    if (!wildcard && primary && primary !== 'none (trust)' && !norm(`${title} ${h1} ${desc}`).includes(norm(primary))) {
      problems.push(`${path}: primary keyword "${primary}" not in title/H1/description`);
    }
  }
  for (const p of problems) console.log('FAIL', p);
  console.log(JSON.stringify({ indexable, mapped: Object.keys(map).length, problems: problems.length }));
  process.exit(problems.length ? 1 : 0);
}
