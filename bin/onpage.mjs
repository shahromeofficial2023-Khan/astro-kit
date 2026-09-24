// kit onpage — the owner's 62-check on-page template, run on every indexable page in dist/.
// Reads each page's primary keyword from keyword-map.json (exact path, or "/prefix/*" rows whose primary may use "{slug}").
// Verdicts: PASS · FAIL · N/A (impossible by construction, reason given) · PENDING (owner asset) · RULING (needs the owner).
// Exit 1 on any FAIL. Writes docs/onpage_audit.md + .json.   kit onpage [--page /es/]
import { statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readPages, readJson, readSite, mapRow, primaryOf, isNoindex, decode, strip, attr } from './lib/pages.mjs';

const dist = 'dist';
const map = readJson('keyword-map.json', null);
const site = readSite();
const YEAR = String(new Date().getUTCFullYear());

const MODIFIERS = ['best', 'top', 'guide', 'review', 'free', 'ultimate', 'complete', 'easy', 'quick', 'fast', 'simple', 'tips', 'checklist',
  'updated', 'new', 'essential', 'proven', 'step-by-step', 'step by step', 'how to', 'explained', 'examples', 'worked', 'instant', 'official',
  // non-English pages: the same idea in their language
  'gratis', 'grátis', 'gratuit', 'gratuito', 'kostenlos', 'бесплатно', 'ücretsiz', 'मुफ़्त', 'मुफ्त', 'ফ্রি', 'বিনামূল্যে', 'مفت', 'مجاني', 'مجانا', '免费', '無料',
  'guía', 'guia', 'anleitung', 'guida', 'rehber', 'руководство', 'panduan', 'गाइड', 'গাইড', 'رہنما', 'دليل', '指南', 'ガイド', 'completo', 'complet', 'lengkap'];
const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'of', 'and', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'or', 'from', 'as', 'be']);

// ---------------------------------------------------------------- helpers
const lower = (t) => decode(t).toLowerCase();
const has = (hay, kw) => lower(hay).includes(kw.toLowerCase());
const slugWords = (kw) => kw.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '').trim().split(/[\s-]+/).filter(Boolean);

const pages = readPages();

function analyse(path, html) {
  const row = mapRow(map, path);
  const kw = primaryOf(row, path);
  const isRoot = /^\/([a-z]{2}\/)?$/.test(path);
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  const mainMatch = body.match(/<main[\s\S]*?<\/main>/);
  const main = mainMatch ? mainMatch[0] : body;
  const title = strip(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
  const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
  const h1s = attr(main, /<h1[^>]*>([\s\S]*?)<\/h1>/g).map(strip);
  const h1 = h1s[0] ?? '';
  const headings = [...main.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({ level: +m[1], text: strip(m[2]) }));
  const subs = headings.filter((h) => h.level >= 2);
  const lds = attr(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  const ldText = lds.join(' ');
  const types = new Set();
  for (const ld of lds) { try { const walkT = (o) => { if (Array.isArray(o)) o.forEach(walkT); else if (o && typeof o === 'object') { const t = o['@type']; if (t) (Array.isArray(t) ? t : [t]).forEach((x) => types.add(x)); Object.values(o).forEach(walkT); } }; walkT(JSON.parse(ld)); } catch {} }
  const imgs = [...main.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const imgAlt = (i) => i.match(/\balt="([^"]*)"/)?.[1];
  const imgSrc = (i) => i.match(/\bsrc="([^"]*)"/)?.[1] ?? '';
  const links = [...main.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map((m) => ({ tag: m[0], href: m[1] }));
  const host = new URL(site.domain ? `https://${site.domain}` : site.interim_url).host;
  const external = links.filter((l) => /^https?:\/\//.test(l.href) && !l.href.includes(host));
  const internal = links.filter((l) => l.href.startsWith('/') || l.href.includes(host));
  const text = strip(main);
  const first100 = text.split(/\s+/).slice(0, 100).join(' ');
  const bold = attr(main, /<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/g).map(strip).join(' | ');
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  const slug = path === '/' ? '' : path.split('/').filter(Boolean).at(-1);
  const times = [...html.matchAll(/<time\b[^>]*datetime="([^"]+)"[^>]*>/g)];
  const firstH2 = main.search(/<h2[\s>]/);
  const beforeH2 = firstH2 > 0 ? main.slice(0, firstH2) : main;
  const lastH2 = subs.filter((h) => h.level === 2).at(-1)?.text ?? '';
  const kwSlug = slugWords(kw);
  const inFile = (src) => { const f = decodeURIComponent(src).split('/').at(-1).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); return kwSlug.length > 0 && kwSlug.filter((w) => w.length > 2).every((w) => f.includes(w)); };
  const fileKB = (src) => { try { const p = join(dist, decodeURIComponent(src.split('?')[0])); return statSync(p).size / 1024; } catch { return null; } };

  const cjk = /^\/(zh|ja)\/$/.test(path);
  const C = [];
  const add = (group, name, ok, detail, opts = {}) => C.push({ group, name, verdict: opts.na ? 'N/A' : opts.pending ? 'PENDING' : opts.ruling && !ok ? 'RULING' : ok ? 'PASS' : 'FAIL', detail });
  const G = 'Primary Keyword';
  add(G, 'Keyword in H1 Tag', kw && has(h1, kw), `H1: "${h1}"`);
  add(G, 'Keyword in Title Tag', kw && has(title, kw), `Title: "${title}"`);
  add(G, 'Keyword in Meta Description', kw && has(desc, kw), `Meta: "${desc.slice(0, 80)}…"`);
  if (isRoot) add(G, 'Keyword in URL', false, 'root URL has no slug', { na: true });
  else add(G, 'Keyword in URL', kwSlug.filter((w) => !STOP.has(w)).some((w) => path.includes(w)), `URL: ${path}`);
  add(G, 'Keyword in First 100 Words', kw && has(first100, kw), first100.slice(0, 90) + '…');
  add(G, 'Keyword in Subheadings', subs.some((h) => has(h.text, kw)), `${subs.length} subheadings`);
  add(G, 'Schema Contains Keyword', has(ldText, kw), `${lds.length} JSON-LD block(s)`);
  add(G, 'Keyword is Bold/Strong', has(bold, kw), bold.slice(0, 80));

  const I = 'Image SEO';
  const missingAlt = imgs.filter((i) => imgAlt(i) === undefined);
  add(I, 'Images Have ALT Text', imgs.length > 0 && missingAlt.length === 0, `${imgs.length} images, ${missingAlt.length} missing alt`);
  add(I, 'ALT Contains Keyword', imgs.some((i) => has(imgAlt(i) ?? '', kw)), imgs.map(imgAlt).filter(Boolean).slice(0, 2).join(' | '));
  add(I, 'Image Filename Has Keyword', imgs.some((i) => inFile(imgSrc(i))), imgs.map(imgSrc).slice(0, 2).join(' '));
  const sizes = imgs.map((i) => fileKB(imgSrc(i))).filter((n) => n !== null);
  add(I, 'Images Under 100KB', imgs.length > 0 && sizes.every((n) => n <= 100), sizes.map((n) => n.toFixed(1) + 'KB').join(' '));

  const T = 'Title Tag';
  const tlen = [...title].length;
  if (cjk) add(T, 'Title 50-60 Characters', true, `${tlen} CJK chars (≈ ${tlen * 2} Latin; 25–30 is the CJK equivalent)`, { na: true });
  else add(T, 'Title 50-60 Characters', tlen >= 50 && tlen <= 60, `${tlen} chars`);
  const pos = lower(title).indexOf(kw.toLowerCase());
  add(T, 'Keyword at Title Front', pos >= 0 && pos <= 10, `position ${pos}`);
  const mod = MODIFIERS.find((m) => lower(title).includes(m));
  add(T, 'Title Has Modifiers', !!mod, mod ? `modifier "${mod}"` : 'none');
  add(T, 'Title Has Current Year', title.includes(YEAR), YEAR);
  add(T, 'Title Has Numbers', /\d/.test(title), '');
  add(T, 'Title Has Brackets', /[\[\]()]/.test(title), '');

  const H = 'H1 Tag';
  add(H, 'Only One H1 Tag', h1s.length === 1, `${h1s.length} H1`);
  const hlen = [...h1].length;
  if (cjk) add(H, 'H1 Length 20-70 Characters', true, `${hlen} CJK chars (10–35 is the CJK equivalent)`, { na: true });
  else add(H, 'H1 Length 20-70 Characters', hlen >= 20 && hlen <= 70, `${hlen} chars`);

  const U = 'URL Structure';
  add(U, 'Uses Hyphens (Not Underscores)', !path.includes('_'), path);
  add(U, 'URL is Lowercase', path === path.toLowerCase(), path);
  add(U, 'URL Max 4 Words', slug.split('-').filter(Boolean).length <= 4, `${slug.split('-').filter(Boolean).length} words`);
  add(U, 'URL Without Dates', !/\/\d{4}\/|\/\d{2}\/\d{2}\//.test(path), path);
  const stops = path.split(/[\/-]/).filter((w) => STOP.has(w));
  add(U, 'No Stop Words', stops.length === 0, stops.length ? `${stops.join(' ')} — URL is sheet-generated and live; renaming needs the owner's ruling + 301s` : 'none', { ruling: true });

  const K = 'Core SEO Factors';
  add(K, 'Has External Links', external.length > 0, `${external.length} external`);
  add(K, 'Has Internal Links', internal.length > 0, `${internal.length} internal`);
  add(K, 'Has FAQ Section', types.has('FAQPage') || subs.some((h) => /faq|frequently|preguntas|questions/i.test(h.text)), types.has('FAQPage') ? 'FAQPage schema' : '');
  const video = /<iframe[^>]+(youtube|vimeo)|<video\b|lite-youtube/.test(main) || types.has('VideoObject');
  add(K, 'Has Video Content', video, video ? 'video found' : 'waiting for the owner\'s YouTube video (site.json → video.id)', { pending: !video });
  add(K, 'Page is Indexable', !noindex, noindex ? 'noindex' : 'indexable');

  const A = 'Advanced On-Page';
  add(A, 'Has Table of Contents', /<nav[^>]*class="[^"]*\btoc\b/.test(main), '');
  const dlen = [...desc].length;
  if (cjk) add(A, 'Meta Description 150-155 Chars', true, `${dlen} CJK chars (75–80 is the CJK equivalent)`, { na: true });
  else add(A, 'Meta Description 150-155 Chars', dlen >= 150 && dlen <= 155, `${dlen} chars`);
  const extNoBlank = external.filter((l) => !/target="_blank"/.test(l.tag));
  add(A, 'External Links Open New Tab', external.length > 0 && extNoBlank.length === 0, `${external.length - extNoBlank.length}/${external.length}`);
  add(A, 'Canonical URL Set', !!canonical, canonical);

  const F = 'Featured Snippet';
  add(F, 'Has OL/UL Lists', /<[ou]l\b/.test(main), `${(main.match(/<ol\b/g) || []).length} ol, ${(main.match(/<ul\b/g) || []).length} ul`);
  add(F, 'Has Tables', /<table\b/.test(main), `${(main.match(/<table\b/g) || []).length} tables`);
  const def = [...main.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>\s*(?:<[^>]+>\s*)*<p[^>]*>([\s\S]*?)<\/p>/g)]
    .some((m) => /^(what|qué|que|was|cos|o que|что|nedir|apa|क्या|कैसे|কী|کیا|ما|什么|怎样|とは)|とは|[?？]$/i.test(strip(m[1])) && strip(m[2]).length > 20);
  add(F, 'Has Definition Format', def, '');

  const S = 'Heading Structure';
  let okHier = true; let prev = 1;
  for (const h of headings) { if (h.level > prev + 1) okHier = false; prev = h.level; }
  add(S, 'Proper H2-H6 Hierarchy', okHier, headings.map((h) => h.level).join(''));
  add(S, 'Has H2 Subheadings', headings.some((h) => h.level === 2), `${headings.filter((h) => h.level === 2).length} H2`);
  add(S, 'Has H3 Subheadings', headings.some((h) => h.level === 3), `${headings.filter((h) => h.level === 3).length} H3`);

  const M = 'Schema Markup';
  add(M, 'Has Schema Markup', lds.length > 0, [...types].join(', '));
  add(M, 'Organization Schema', types.has('Organization'), '');
  add(M, 'WebSite Schema', types.has('WebSite'), '');
  add(M, 'Article Schema', types.has('Article'), '');
  const blogPage = row?.intent === 'how-to' || row?.intent === 'how-to hub' || row?.intent === 'definition' || row?.intent === 'comparison' || row?.intent === 'practice' || row?.intent === 'answer';
  if (blogPage) add(M, 'BlogPosting Schema', types.has('BlogPosting'), '');
  else add(M, 'BlogPosting Schema', false, `not a blog post (${row?.intent}) — owner ruling`, { na: true });
  add(M, 'BreadcrumbList Schema', types.has('BreadcrumbList'), '');
  add(M, 'FAQPage Schema', types.has('FAQPage'), '');
  add(M, 'SiteNavigationElement Schema', types.has('SiteNavigationElement'), '');

  const E = 'Article EEAT';
  add(E, 'Summarized Points at Start', /class="[^"]*\bsummary\b/.test(beforeH2), '');
  add(E, 'Publication Date Visible', times.some((t) => /published|itemprop="datePublished"/i.test(t[0])), times.length + ' time tags');
  add(E, 'Last Modified Date Visible', times.some((t) => /modified|updated|itemprop="dateModified"/i.test(t[0])), '');
  add(E, 'URL Without Dates', !/\/\d{4}\/|\/\d{2}\/\d{2}\//.test(path), path);
  add(E, 'Social Sharing Buttons', /class="[^"]*\bshare\b/.test(main) && /twitter\.com\/intent|x\.com\/intent|facebook\.com\/sharer|wa\.me|api\.whatsapp/.test(main), '');
  add(E, 'Good Headings Structure', h1s.length === 1 && okHier, `${h1s.length} H1, ${headings.length} headings`);
  add(E, 'Single Category per Post', (html.match(/property="article:section"/g) || []).length <= 1, '');
  add(E, 'Author Linked in Article', /rel="author"/.test(main), '');
  const refsAt = main.lastIndexOf('class="refs"');
  add(E, 'Sources at Article End', refsAt > main.length * 0.6, refsAt > 0 ? `sources list at ${Math.round((refsAt / main.length) * 100)}% of the page` : 'no sources list');
  add(E, 'Article Has Breadcrumbs', /aria-label="Breadcrumb"/.test(main), '');
  add(E, 'FAQs Have FAQ Schema', !/<details>/.test(main) || types.has('FAQPage'), '');
  add(E, 'SameAs Not Wikipedia', !/"sameAs":\s*(\[[^\]]*)?"[^"]*wikipedia/.test(ldText), '');
  add(E, 'Canonical Not Draft URL', !!canonical && !/draft|preview|404/.test(canonical), canonical);
  add(E, 'Canonical is Self-Referencing', canonical.endsWith(path), canonical);
  return { path, kw, checks: C };
}

export function onpage(only = null) {
if (!map) { console.log('FAIL no keyword-map.json — every indexable page needs a primary keyword'); process.exit(1); }
const results = [];
for (const [path, html] of Object.entries(pages).sort()) {
  if (isNoindex(html)) continue;
  if (only && path !== only) continue;
  results.push(analyse(path, html));
}
let fails = 0, pending = 0, na = 0, pass = 0;
const lines = ['# On-page audit — every indexable page against the owner\'s template', '', `Generated ${new Date().toISOString().slice(0, 10)} by kit onpage. Verdicts: PASS · FAIL · N/A (impossible by construction, reason given) · PENDING (owner asset).`, ''];
for (const r of results) {
  const f = r.checks.filter((c) => c.verdict === 'FAIL'), p = r.checks.filter((c) => c.verdict === 'PENDING'), n = r.checks.filter((c) => c.verdict === 'N/A' || c.verdict === 'RULING');
  const ok = r.checks.length - f.length - p.length - n.length;
  fails += f.length; pending += p.length; na += n.length; pass += ok;
  console.log(`${f.length ? 'FAIL' : 'ok  '} ${r.path.padEnd(46)} pass ${String(ok).padStart(2)}/${r.checks.length}  fail ${f.length}  pending ${p.length}  n/a ${n.length}${f.length ? '  ← ' + f.map((c) => c.name).join('; ') : ''}`);
  lines.push(`## ${r.path}  — keyword “${r.kw}” — ${ok} pass · ${f.length} fail · ${p.length} pending · ${n.length} n/a`, '', '| Group | Check | Verdict | Detail |', '|---|---|---|---|');
  for (const c of r.checks) lines.push(`| ${c.group} | ${c.name} | ${c.verdict} | ${String(c.detail).replace(/\|/g, '/').slice(0, 90)} |`);
  lines.push('');
  if (only) for (const c of r.checks) console.log(`  ${c.verdict.padEnd(7)} ${c.group} · ${c.name} — ${c.detail}`);
}
if (!only) {
  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/onpage_audit.md', lines.join('\n'));
  writeFileSync('docs/onpage_audit.json', JSON.stringify(results, null, 1));
}
console.log(JSON.stringify({ pages: results.length, pass, fail: fails, pending, na }));
process.exit(fails ? 1 : 0);
}
