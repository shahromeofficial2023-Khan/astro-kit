// /robots.txt, injected by the kit() integration. The Sitemap line follows Astro's `site`,
// so it moves with the domain — no hand-edited robots.txt to forget.
export const prerender = true;

/** @type {import('astro').APIRoute} */
export const GET = ({ site }) => {
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site).href}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
