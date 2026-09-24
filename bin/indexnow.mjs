// kit indexnow — instant indexing for Bing, Yandex, Naver, Seznam, Yep (RankMath Instant Indexing equivalent).
//   kit indexnow key      create public/<key>.txt from site.json.indexnow (or generate + save the key)
//   kit indexnow submit   POST every sitemap URL (or --urls a,b,c) to api.indexnow.org; prints the status
// Google does not use IndexNow; Google gets the sitemap through Search Console.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readSite, cwd } from './lib/pages.mjs';
import { siteUrl } from '../index.mjs';

export async function indexnow(sub = 'submit', argv = []) {
  const site = readSite();
  const host = new URL(siteUrl(site)).host;
  if (!site.indexnow) {
    site.indexnow = randomBytes(16).toString('hex');
    writeFileSync(join(cwd, 'site.json'), JSON.stringify(site, null, 2) + '\n');
    console.log(`site.json: indexnow key generated`);
  }
  const keyFile = join(cwd, 'public', `${site.indexnow}.txt`);
  if (!existsSync(keyFile)) writeFileSync(keyFile, site.indexnow);
  if (sub === 'key') { console.log(JSON.stringify({ key: site.indexnow, file: `public/${site.indexnow}.txt` })); return; }

  let urls = [];
  const i = argv.indexOf('--urls');
  if (i >= 0) urls = argv[i + 1].split(',').map((u) => new URL(u, siteUrl(site)).href);
  else {
    const dist = join(cwd, 'dist');
    for (const f of existsSync(dist) ? readdirSync(dist) : []) if (/^sitemap-\d+\.xml$/.test(f)) urls.push(...[...readFileSync(join(dist, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }
  if (!urls.length) { console.log('FAIL no URLs — build first or pass --urls'); process.exit(1); }
  if (!site.domain) { console.log(JSON.stringify({ skipped: 'interim host — IndexNow runs once the real domain is set', urls: urls.length })); return; }
  const body = { host, key: site.indexnow, keyLocation: `https://${host}/${site.indexnow}.txt`, urlList: urls.slice(0, 10000) };
  const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
  const ok = r.status === 200 || r.status === 202;
  console.log(JSON.stringify({ host, urls: urls.length, status: r.status, ok }));
  if (!ok) process.exit(1);
}
