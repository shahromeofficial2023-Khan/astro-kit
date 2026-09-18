import type { AstroIntegration } from 'astro';

export type Host = 'vercel' | 'sftp';

export interface OgCard {
  file: string;
  lines: [string] | [string, string];
  lede?: string;
  chip?: string;
  kicker?: string;
}

/** A site's site.json. */
export interface SiteConfig {
  id: string;
  name: string;
  host: Host;
  /** https://host with no path — where the site lives until it gets its domain */
  interim_url: string;
  /** bare hostname once the site moves, e.g. "poolvolume.com"; null while on the interim URL */
  domain: string | null;
  topic: string;
  kit: string;
  brand?: string;
  locales?: string[];
  analytics?: string | null;
  og?: { colors?: Record<string, string>; cards: OgCard[] };
}

export declare const HOSTS: Host[];
export declare function validateSite(s: unknown): string[];
export declare function siteUrl(s: SiteConfig): string;
export declare function kit(s: SiteConfig | Record<string, unknown>): AstroIntegration;
export declare function llmsTxt(o: {
  site: URL;
  title: string;
  summary: string;
  heading?: string;
  links: { title: string; path: string; note?: string }[];
  facts?: string[];
}): Response;
