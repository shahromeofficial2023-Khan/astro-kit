// Shared helpers for the kit's dist/ gates: walk the built pages, read site.json and keyword-map.json,
// resolve a page's keyword-map row (exact path, else the longest "/prefix/*" wildcard).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const cwd = process.cwd();
export const readJson = (f, fallback) => (existsSync(join(cwd, f)) ? JSON.parse(readFileSync(join(cwd, f), 'utf8')) : fallback);
export const readSite = () => readJson('site.json');

/** { '/path/': html } for every index.html under dist/. Exits 1 when dist/ is missing. */
export function readPages(dist = join(cwd, 'dist')) {
  if (!existsSync(dist)) { console.log('FAIL no dist/ — run the build first'); process.exit(1); }
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
  return pages;
}

export const isNoindex = (html) => /<meta name="robots" content="[^"]*noindex/.test(html);

/** The keyword-map row for a path: exact key, else the longest matching "/prefix/*" key. */
export function mapRow(map, path) {
  if (map[path]) return map[path];
  const wild = Object.keys(map).filter((k) => k.endsWith('/*') && path.startsWith(k.slice(0, -1)) && path !== k.slice(0, -1))
    .sort((a, b) => b.length - a.length)[0];
  return wild ? map[wild] : undefined;
}

/** The primary keyword for a page. "{slug}" in a wildcard row's primary becomes the slug's words ("3-and-4" → "3 and 4"). */
export function primaryOf(row, path) {
  if (!row?.primary) return '';
  const slug = path.split('/').filter(Boolean).at(-1) ?? '';
  return row.primary.replace('{slug}', slug.replace(/-/g, ' '));
}

export const decode = (t) => t.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
export const strip = (h) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
export const attr = (s, re) => [...s.matchAll(re)].map((m) => m[1]);
