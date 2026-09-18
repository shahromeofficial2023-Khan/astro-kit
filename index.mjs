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

/** The URL the site is served at: its real domain once set, the interim URL until then. */
export function siteUrl(s) {
  return s.domain ? `https://${s.domain}` : s.interim_url.replace(/\/$/, '');
}

/** Astro integration: fleet defaults + site from site.json + sitemap + /robots.txt. */
export function kit(s) {
  const problems = validateSite(s);
  if (problems.length) throw new Error(`astro-kit:\n  ${problems.join('\n  ')}`);
  return {
    name: '@shahrome/astro-kit',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectRoute }) => {
        updateConfig({
          site: siteUrl(s),
          output: 'static',
          trailingSlash: 'always',
          build: { inlineStylesheets: 'always' },
          integrations: [sitemap()],
        });
        injectRoute({ pattern: '/robots.txt', entrypoint: '@shahrome/astro-kit/routes/robots.js', prerender: true });
      },
    },
  };
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
