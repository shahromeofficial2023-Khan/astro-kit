/// <reference path="./virtual.d.ts" />
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
  /** light is required; dark overrides only what changes. Keys: header on_header hero_ink heading accent
   *  on_accent accent_ink progress result ground surface ink muted line err shadow */
  brand_tokens?: { light: Record<string, string>; dark?: Record<string, string> };
  /** "auto" (default): dark follows the OS. "toggle": light for everyone, dark only via the header button (localStorage). */
  theme?: 'auto' | 'toggle';
  /** footer sentence after the site name, e.g. "gives estimates, not medical advice." */
  disclaimer?: string;
  /** one-line site description for footers and feeds */
  description?: string;
  /** who runs the site; About/Contact pages and the author meta need name + email (never invented) */
  owner?: { name: string; email: string; about?: string; location?: string; role?: string };
  /** "Last updated" date printed on the legal pages, YYYY-MM-DD */
  legal_date?: string;
  /** true when the site runs (or is being prepared for) advertising — the privacy page then covers ads and cookies */
  ads?: boolean;
  /** true when the site serves /rss.xml — the head then advertises it */
  rss?: boolean;
  /** paths (with trailing slash) that carry a noindex robots meta; kept out of the XML sitemap */
  noindex?: string[];
  /** public profiles, rendered as footer links and schema.org sameAs */
  social?: { label: string; url: string }[];
  /** when present, the kit generates /llms.txt from it */
  llms?: { summary: string; facts?: string[]; heading?: string; note?: string;
           links?: { title: string; path: string; note?: string }[] };
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
export declare function tokensCss(tokens: SiteConfig['brand_tokens'], theme?: 'auto' | 'toggle'): string;
export declare function contrast(a: string, b: string): number;
export declare function contrastProblems(tokens: SiteConfig['brand_tokens']): string[];
export declare const CONTRAST_PAIRS: [string, string, number][];
