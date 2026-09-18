// /llms.txt from site.json "llms": { summary, facts?, links? }. Injected only when that key exists.
import site from 'virtual:fleet-site';
import { llmsTxt } from '../index.mjs';

export const prerender = true;

/** @type {import('astro').APIRoute} */
export const GET = ({ site: base }) => llmsTxt({
  site: base,
  title: site.name,
  summary: site.llms.summary,
  heading: site.llms.heading ?? 'Tool',
  links: site.llms.links ?? [{ title: site.name, path: '/', note: site.llms.note ?? '' }],
  facts: site.llms.facts ?? [],
});
