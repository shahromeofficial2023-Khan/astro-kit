// kit launch [url] — the pre-launch gate. Everything the launch checklist can verify by machine, in one run:
//   dist/  → kit check, kit cannibal, kit onpage (when keyword-map.json exists), content QA (lorem, placeholders, year)
//   live   → HTTPS, http→https, www→apex, no-slash→slash, /index.php→/, security + cache headers, no noindex header,
//            robots.txt + sitemap on the host, every sitemap URL 200, GA tag when site.analytics is set, IndexNow key,
//            mixed content, response compression
// Rows the machine cannot judge are listed as MANUAL for the qa-report. Writes docs/launch_audit.md. Exit 1 on FAIL.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readPages, readSite, isNoindex, cwd } from './lib/pages.mjs';
import { siteUrl } from '../index.mjs';

const MANUAL = [
  ['Domain & DNS', 'DNS by records (A + CNAME) at the registrar, not nameservers; old host 301s'],
  ['Consoles', 'Google Search Console verified, sitemap submitted'],
  ['Consoles', 'Bing Webmaster verified (import from GSC), sitemap submitted'],
  ['Consoles', 'Yandex Webmaster verified, sitemap submitted'],
  ['Consoles', 'GA4 property created; Realtime shows a visit'],
  ['Performance', 'Lighthouse mobile: perf ≥ 90, a11y ≥ 95, best-practices ≥ 95, SEO ≥ 95 (Chrome DevTools MCP)'],
  ['Performance', 'Core Web Vitals field data green after 28 days (Search Console → Experience)'],
  ['Responsive', 'No overflow at 390 / 768 / 1440; screenshots in qa-report'],
  ['UX', 'Search returns results; 404 page links to key pages; forms submit'],
  ['Content', 'No invented trust facts (reviews, numbers, certifications); owner identity fields real'],
  ['Trust pages', 'About, Contact, Privacy, Terms, Disclaimer read correctly for this site'],
  ['Footer', 'Social profile links present (site.json social); DMCA badge if the owner has one'],
  ['Post-launch', 'Day 1: GSC sitemap read, no coverage errors. Day 7: pages indexed, IndexNow accepted'],
];

export async function launch(url) {
  const site = readSite();
  const base = (url ?? siteUrl(site)).replace(/\/$/, '');
  const rows = [];
  const add = (group, name, ok, detail = '') => rows.push({ group, name, verdict: ok === null ? 'MANUAL' : ok ? 'PASS' : 'FAIL', detail });
  const run = (args) => spawnSync(process.execPath, [join(import.meta.dirname, 'kit.mjs'), ...args], { cwd, encoding: 'utf8' });

  // ---- dist gates
  const pages = readPages();
  const ck = run(['check']); add('Build contract', 'kit check', ck.status === 0, ck.stdout.trim().split('\n').at(-1));
  if (existsSync(join(cwd, 'keyword-map.json'))) {
    const cb = run(['cannibal']); add('Keywords', 'kit cannibal (one page per keyword)', cb.status === 0, cb.stdout.trim().split('\n').at(-1));
    const op = run(['onpage']); add('On-page', 'kit onpage (62-check template)', op.status === 0, op.stdout.trim().split('\n').at(-1));
  } else add('Keywords', 'keyword-map.json present', false, 'add one primary keyword per indexable page');
  const YEAR = String(new Date().getUTCFullYear());
  let lorem = 0, holders = 0, year = 0, kwMeta = 0, mixed = 0, noH1 = 0;
  for (const [p, s] of Object.entries(pages)) {
    if (/lorem ipsum/i.test(s)) lorem++;
    if (/\[(?:OWNER|SOCIAL|CITY|DOMAIN|TODO|TBD)[A-Z_ ,]*\]|\bTODO\b|\bTBD\b/.test(s.replace(/<script[\s\S]*?<\/script>/g, ''))) holders++;
    if (/©\s*\d{4}/.test(s) && !s.includes(`© ${YEAR}`)) year++;
    if (/<meta name="keywords"/.test(s)) kwMeta++;
    if (/(src|href)="http:\/\//.test(s)) mixed++;
    if (!isNoindex(s) && !/<h1[\s>]/.test(s)) noH1++;
  }
  add('Content', 'No lorem ipsum', lorem === 0, `${lorem} pages`);
  add('Content', 'No placeholders / TODO', holders === 0, `${holders} pages`);
  add('Content', 'Copyright year is current', year === 0, `${year} pages stale`);
  add('Content', 'No keywords meta tag', kwMeta === 0, `${kwMeta} pages`);
  add('Content', 'No mixed content (http:// assets)', mixed === 0, `${mixed} pages`);
  add('Content', 'Every indexable page has an H1', noH1 === 0, `${noH1} missing`);

  // ---- live probes
  const head = async (u, redirect = 'manual') => { try { const r = await fetch(u, { method: 'GET', redirect, headers: { 'Accept-Encoding': 'br, gzip' } }); return r; } catch (e) { return { status: 0, headers: new Headers(), error: e.message }; } };
  const loc = (r) => r.headers.get('location') ?? '';
  const host = new URL(base).host;
  const home = await head(base + '/');
  add('HTTPS', 'Homepage serves 200 over https', home.status === 200, `${home.status} ${home.error ?? ''}`);
  if (home.status !== 200) {
    add('HTTPS', 'Live probes', null, 'site not reachable — the remaining live rows were not run');
  } else {
    const h = home.headers;
    const http = await head('http://' + host + '/');
    add('Redirects', 'http → https', [301, 308, 307, 302].includes(http.status) && loc(http).startsWith('https://'), `${http.status} → ${loc(http)}`);
    const www = await head(`https://www.${host}/`);
    const wwwOk = host.startsWith('www.') ? true : [301, 308].includes(www.status) && loc(www).startsWith(base);
    add('Redirects', 'www → apex (one preferred version)', wwwOk, `${www.status} → ${loc(www)}`);
    if (site.domain && site.interim_url && !base.includes(new URL(site.interim_url).host)) {
      const old = await head(site.interim_url.replace(/\/$/, '') + '/');
      add('Redirects', 'interim host → domain', [301, 308].includes(old.status) && loc(old).startsWith(base), `${old.status} → ${loc(old)}`);
    }
    const inner = Object.keys(pages).find((p) => p !== '/' && !isNoindex(pages[p]) && p.split('/').length === 3);
    if (inner) {
      const ns = await head(base + inner.slice(0, -1));
      add('Redirects', 'no trailing slash → trailing slash', [301, 308].includes(ns.status) && loc(ns).endsWith(inner), `${inner.slice(0, -1)} ${ns.status} → ${loc(ns)}`);
    }
    const php = await head(base + '/index.php');
    add('Redirects', '/index.php → /', [301, 308].includes(php.status) && /\/$/.test(loc(php)), `${php.status} → ${loc(php)}`);
    const need = { 'strict-transport-security': /max-age=\d{6,}/, 'x-content-type-options': /nosniff/, 'referrer-policy': /./, 'x-frame-options': /./, 'permissions-policy': /./ };
    for (const [k, re] of Object.entries(need)) add('Security headers', k, re.test(h.get(k) ?? ''), h.get(k) ?? 'missing');
    add('Indexation', 'No X-Robots-Tag noindex header', !/noindex/.test(h.get('x-robots-tag') ?? ''), h.get('x-robots-tag') ?? 'none');
    add('Performance', 'Response compressed (br/gzip)', /br|gzip/.test(h.get('content-encoding') ?? ''), h.get('content-encoding') ?? 'none');
    const asset = (pages['/'].match(/<link rel="icon" href="([^"]+)"|src="(\/_astro\/[^"]+)"/) ?? [])[1] ?? '/favicon.svg';
    const a = await head(base + asset);
    add('Performance', 'Static assets cached immutable', /max-age=31536000/.test(a.headers.get('cache-control') ?? ''), `${asset}: ${a.headers.get('cache-control') ?? 'none'}`);
    const robots = await head(base + '/robots.txt', 'follow');
    const rtxt = robots.status === 200 ? await robots.text() : '';
    add('Indexation', 'robots.txt 200 with Sitemap on this host', robots.status === 200 && rtxt.includes(`Sitemap: ${base}/sitemap-index.xml`), rtxt.split('\n').find((l) => l.startsWith('Sitemap')) ?? `${robots.status}`);
    const smi = await head(base + '/sitemap-index.xml', 'follow');
    const smiTxt = smi.status === 200 ? await smi.text() : '';
    const smUrls = [...smiTxt.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    add('Indexation', 'sitemap-index.xml 200', smi.status === 200 && smUrls.length > 0, `${smUrls.length} sitemap file(s)`);
    let urls = [];
    for (const u of smUrls) { const r = await head(u, 'follow'); if (r.status === 200) urls.push(...[...(await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])); }
    add('Indexation', 'Sitemap URLs on this host', urls.length > 0 && urls.every((u) => u.startsWith(base + '/')), `${urls.length} URLs`);
    let bad = [];
    for (let i = 0; i < urls.length; i += 8) {
      const batch = await Promise.all(urls.slice(i, i + 8).map(async (u) => [u, (await head(u)).status]));
      bad.push(...batch.filter(([, s]) => s !== 200).map(([u, s]) => `${u} ${s}`));
    }
    add('Indexation', 'Every sitemap URL returns 200', urls.length > 0 && bad.length === 0, bad.slice(0, 3).join(' ') || `${urls.length}/${urls.length}`);
    const html = await (await head(base + '/', 'follow')).text();
    if (site.analytics) add('Consoles', 'GA4 tag on the live page', html.includes(`gtag/js?id=${site.analytics}`), site.analytics);
    else add('Consoles', 'GA4 tag on the live page', false, 'site.json analytics is empty');
    if (site.indexnow) { const k = await head(`${base}/${site.indexnow}.txt`, 'follow'); add('Consoles', 'IndexNow key file 200', k.status === 200, `${k.status}`); }
    else add('Consoles', 'IndexNow key file', false, 'run: kit indexnow key');
    add('HTTPS', 'Canonical on the live host', html.includes(`<link rel="canonical" href="${base}/"`), '');
  }
  for (const [g, n] of MANUAL) add(g, n, null);

  const fails = rows.filter((r) => r.verdict === 'FAIL'), manual = rows.filter((r) => r.verdict === 'MANUAL');
  for (const r of rows) console.log(`${r.verdict.padEnd(6)} ${r.group.padEnd(18)} ${r.name}${r.detail ? '  — ' + String(r.detail).slice(0, 100) : ''}`);
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  const md = [`# Launch audit — ${base}`, '', `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by \`kit launch\`. PASS/FAIL are machine-verified; MANUAL rows are ticked in qa-report.md with evidence.`, '',
    '| Group | Check | Verdict | Detail |', '|---|---|---|---|', ...rows.map((r) => `| ${r.group} | ${r.name} | ${r.verdict} | ${String(r.detail).replace(/\|/g, '/').slice(0, 110)} |`), ''].join('\n');
  writeFileSync(join(cwd, 'docs', 'launch_audit.md'), md);
  console.log(JSON.stringify({ url: base, pass: rows.length - fails.length - manual.length, fail: fails.length, manual: manual.length, report: 'docs/launch_audit.md' }));
  process.exit(fails.length ? 1 : 0);
}
