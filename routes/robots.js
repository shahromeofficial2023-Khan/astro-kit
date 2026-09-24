// /robots.txt, injected by the kit() integration. The Sitemap line follows Astro's `site`,
// so it moves with the domain — no hand-edited robots.txt to forget.
// site.json "robots": { disallow: [...paths], block_agents: [...user-agents] } — defaults keep crawlers out of the
// internal search page and parameterised URLs (crawl budget); index control stays with the noindex meta.
import site from 'virtual:fleet-site';
export const prerender = true;

const DEFAULT_DISALLOW = ['/search/', '/*?*'];

/** @type {import('astro').APIRoute} */
export const GET = ({ site: base }) => {
  const r = site.robots ?? {};
  const disallow = r.disallow ?? DEFAULT_DISALLOW;
  const blocks = (r.block_agents ?? []).map((ua) => `User-agent: ${ua}\nDisallow: /\n`).join('\n');
  const body = `User-agent: *\nAllow: /\n${disallow.map((p) => `Disallow: ${p}`).join('\n')}\n\n${blocks}${blocks ? '\n' : ''}Sitemap: ${new URL('/sitemap-index.xml', base).href}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
