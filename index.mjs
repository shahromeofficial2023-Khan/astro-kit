// @shahrome/astro-kit — what every fleet site shares.
//
//   import site from './site.json' with { type: 'json' };
//   import { kit } from '@shahrome/astro-kit';
//   export default defineConfig({ integrations: [kit(site)] });
//
// kit() sets the live host from site.json, the fleet build defaults, the sitemap and /robots.txt.
import sitemap from '@astrojs/sitemap';

export const HOSTS = ['vercel', 'sftp'];
const REQUIRED = ['id', 'name', 'host', 'interim_url', 'topic', 'kit'];

/** Validate a site.json object. Returns a list of problems (empty = valid). */
export function validateSite(s) {
  const problems = REQUIRED.filter((k) => !s?.[k]).map((k) => `site.json: missing "${k}"`);
  if (s?.host && !HOSTS.includes(s.host)) problems.push(`site.json: host "${s.host}" is not one of ${HOSTS.join(', ')}`);
  for (const k of ['interim_url']) {
    if (s?.[k] && !/^https:\/\/[^/]+$/.test(s[k].replace(/\/$/, ''))) problems.push(`site.json: ${k} must be https://host with no path`);
  }
  if (s?.domain && /[/:]/.test(s.domain)) problems.push('site.json: domain is a bare hostname, e.g. poolvolume.com');
  if (/example\.(com|org|net)/.test(`${s?.interim_url} ${s?.domain}`)) problems.push('site.json: placeholder host');
  return problems;
}

/** True when a path is listed in site.json "noindex" — exact ("/search/") or prefix wildcard ("/blog/*"). */
export function isNoindexPath(s, path) {
  return (s.noindex ?? []).some((n) => (n.endsWith('/*') ? path.startsWith(n.slice(0, -1)) && path !== n.slice(0, -1) : n === path));
}

/** The URL the site is served at: its real domain once set, the interim URL until then. */
export function siteUrl(s) {
  return s.domain ? `https://${s.domain}` : s.interim_url.replace(/\/$/, '');
}

/**
 * Astro integration: fleet defaults + site from site.json + sitemap + /robots.txt, and a virtual
 * module `virtual:fleet-site` so kit components read site.json without every page passing it in.
 * /llms.txt is generated from site.json "llms" when that key exists (a site may keep its own route instead).
 */
export function kit(s) {
  const problems = validateSite(s);
  if (problems.length) throw new Error(`astro-kit:\n  ${problems.join('\n  ')}`);
  const VIRTUAL = 'virtual:fleet-site';
  // pages that must stay out of the XML sitemap: the 404 page and anything the site lists as noindex (e.g. /search/)
  const excluded = (p) => p === '/404/' || isNoindexPath(s, p);
  return {
    name: '@shahrome/astro-kit',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectRoute }) => {
        updateConfig({
          site: siteUrl(s),
          output: 'static',
          trailingSlash: 'always',
          build: { inlineStylesheets: 'always' },
          integrations: [sitemap({ filter: (page) => !excluded(new URL(page).pathname) })],
          vite: { plugins: [{
            name: 'fleet-site',
            resolveId: (id) => (id === VIRTUAL ? '\0' + VIRTUAL : null),
            load: (id) => (id === '\0' + VIRTUAL ? `export default ${JSON.stringify(s)};` : null),
          }] },
        });
        injectRoute({ pattern: '/robots.txt', entrypoint: '@shahrome/astro-kit/routes/robots.js', prerender: true });
        if (s.llms) injectRoute({ pattern: '/llms.txt', entrypoint: '@shahrome/astro-kit/routes/llms.js', prerender: true });
      },
    },
  };
}

/**
 * site.json brand_tokens → CSS custom properties. Dark mode inherits any token it doesn't set.
 * theme "auto" (default): dark follows the OS (`prefers-color-scheme`).
 * theme "toggle": the page is light for everyone; dark applies only when <html data-theme="dark"> is set
 * (Layout's header button, remembered in localStorage) — the OS setting is ignored.
 */
export function tokensCss(tokens, theme = 'auto') {
  if (!tokens?.light) return '';
  const decl = (t) => Object.entries(t).map(([k, v]) =>
    k === 'shadow' ? `--shadow:0 6px 24px ${v}` : `--${k.replace(/_/g, '-')}:${v}`).join(';');
  if (!tokens.dark) return `:root{${decl(tokens.light)};color-scheme:light}`;
  if (theme === 'toggle') return `:root{${decl(tokens.light)};color-scheme:light}:root[data-theme=dark]{${decl(tokens.dark)};color-scheme:dark}`;
  return `:root{${decl(tokens.light)};color-scheme:light dark}@media (prefers-color-scheme:dark){:root{${decl(tokens.dark)}}}`;
}

/** Every text/background pair a fleet page draws, as [text token, background token, minimum ratio]. */
export const CONTRAST_PAIRS = [
  ['ink', 'ground', 4.5], ['ink', 'surface', 4.5], ['ink', 'result', 4.5],
  ['muted', 'ground', 4.5], ['muted', 'surface', 4.5], ['muted', 'result', 4.5],
  ['heading', 'ground', 4.5], ['heading', 'result', 4.5],
  ['accent_ink', 'ground', 4.5], ['accent_ink', 'surface', 4.5],
  ['on_accent', 'accent', 4.5], ['on_header', 'header', 4.5], ['hero_ink', 'header', 4.5],
  ['err', 'surface', 4.5], ['progress', 'surface', 3],
];

function luminance(hex) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** WCAG problems in a brand_tokens object, both modes. */
export function contrastProblems(tokens) {
  if (!tokens?.light) return [];
  const out = [];
  for (const mode of ['light', 'dark']) {
    if (mode === 'dark' && !tokens.dark) continue;
    const t = mode === 'dark' ? { ...tokens.light, ...tokens.dark } : tokens.light;
    for (const [fg, bg, min] of CONTRAST_PAIRS) {
      if (!/^#[0-9a-f]{6}$/i.test(t[fg] ?? '') || !/^#[0-9a-f]{6}$/i.test(t[bg] ?? '')) {
        out.push(`brand_tokens.${mode}: ${fg} or ${bg} is missing or not #rrggbb`);
        continue;
      }
      const r = contrast(t[fg], t[bg]);
      if (r < min) out.push(`brand_tokens.${mode}: ${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1`);
    }
  }
  return out;
}

/**
 * Build an llms.txt body. `links` are { title, path, note }; paths are made absolute on `site`.
 * @param {{ site: URL, title: string, summary: string, heading?: string,
 *           links: { title: string, path: string, note?: string }[], facts?: string[] }} o
 */
export function llmsTxt({ site, title, summary, heading = 'Pages', links, facts = [] }) {
  const lines = links.map((l) => `- [${l.title}](${new URL(l.path, site).href})${l.note ? ` ${l.note}` : ''}`);
  const factBlock = facts.length ? `\n## Key facts\n${facts.map((f) => `- ${f}`).join('\n')}\n` : '';
  const body = `# ${title}\n\n> ${summary}\n\n## ${heading}\n${lines.join('\n')}\n${factBlock}`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
