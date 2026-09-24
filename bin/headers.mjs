// kit headers — write the fleet's hosting contract into vercel.json (merged, idempotent):
//   caching   immutable for hashed assets, images and fonts; must-revalidate for HTML (LiteSpeed browser-cache equivalent)
//   security  HSTS, nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy
//   redirects www → apex, the interim vercel.app host → the domain (once site.json.domain is set),
//             /index.php /index.html /index/ /home/ → /  (legacy CMS URLs; RankMath Redirections equivalent)
// Site-specific redirects and headers already in vercel.json are kept. Prints what changed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readSite, cwd } from './lib/pages.mjs';
import { siteUrl } from '../index.mjs';

export const KIT_HEADERS = {
  '/(.*)': [
    ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['X-Frame-Options', 'SAMEORIGIN'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'],
    ['X-DNS-Prefetch-Control', 'on'],
  ],
  '/_astro/(.*)': [['Cache-Control', 'public, max-age=31536000, immutable']],
  '/(.*)\\.(svg|png|jpg|jpeg|webp|avif|gif|ico|woff2|woff|ttf|mp4|webm)': [['Cache-Control', 'public, max-age=31536000, immutable']],
  '/(.*)\\.(xml|txt|json)': [['Cache-Control', 'public, max-age=3600, must-revalidate']],
};
export const KIT_REDIRECTS = (site) => {
  const apex = site.domain;
  const interim = new URL(site.interim_url).host;
  const r = [];
  if (apex) {
    r.push({ source: '/(.*)', has: [{ type: 'host', value: interim }], destination: `https://${apex}/$1`, permanent: true });
    r.push({ source: '/(.*)', has: [{ type: 'host', value: `www.${apex}` }], destination: `https://${apex}/$1`, permanent: true });
  }
  for (const s of ['/index.php', '/index.html', '/index/', '/home/', '/index', '/home']) r.push({ source: s, destination: '/', statusCode: 308 });
  return r;
};

export function headers() {
  const site = readSite();
  const file = join(cwd, 'vercel.json');
  const v = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  v.cleanUrls = false; v.trailingSlash = true;
  const key = (r) => `${r.source}|${JSON.stringify(r.has ?? null)}`;
  const have = new Map((v.redirects ?? []).map((r) => [key(r), r]));
  let added = 0;
  for (const r of KIT_REDIRECTS(site)) if (!have.has(key(r))) { have.set(key(r), r); added++; }
  v.redirects = [...have.values()];
  const hmap = new Map((v.headers ?? []).map((h) => [h.source, h]));
  let set = 0;
  for (const [source, pairs] of Object.entries(KIT_HEADERS)) {
    const entry = hmap.get(source) ?? { source, headers: [] };
    entry.headers = entry.headers.filter((h) => h.key !== 'X-Robots-Tag' || !/noindex/.test(h.value) || site.noindex_all);
    for (const [k, value] of pairs) {
      const cur = entry.headers.find((h) => h.key === k);
      if (!cur) { entry.headers.push({ key: k, value }); set++; }
      else if (cur.value !== value) { cur.value = value; set++; }
    }
    hmap.set(source, entry);
  }
  v.headers = [...hmap.values()];
  writeFileSync(file, JSON.stringify(v, null, 2) + '\n');
  console.log(JSON.stringify({ file: 'vercel.json', host: new URL(siteUrl(site)).host, redirects_added: added, headers_set: set, redirects: v.redirects.length }));
}
