// kit images — build-time image optimisation (LiteSpeed "image optimisation" + Perfmatters lazy-load equivalent).
// Every raster in src/images/ → public/images/<name>-<w>.webp and .avif at the widths below, plus the original size
// as WebP. SVGs are copied as they are. Pair with <Picture> from the kit. Skips outputs newer than their source.
import { readdirSync, statSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { cwd } from './lib/pages.mjs';

export const WIDTHS = [480, 800, 1200];
export async function images() {
  const src = join(cwd, 'src', 'images'), out = join(cwd, 'public', 'images');
  if (!existsSync(src)) { console.log(JSON.stringify({ images: 0, note: 'no src/images/' })); return; }
  mkdirSync(out, { recursive: true });
  const { default: sharp } = await import('sharp');
  const done = [];
  for (const f of readdirSync(src)) {
    const ext = extname(f).toLowerCase(), name = basename(f, ext), file = join(src, f), mtime = statSync(file).mtimeMs;
    if (ext === '.svg') { copyFileSync(file, join(out, f)); done.push(f); continue; }
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) continue;
    const meta = await sharp(file).metadata();
    for (const w of [...WIDTHS.filter((x) => x < meta.width), meta.width]) {
      for (const fmt of ['webp', 'avif']) {
        const target = join(out, `${name}-${w}.${fmt}`);
        if (existsSync(target) && statSync(target).mtimeMs > mtime) continue;
        await sharp(file).resize(w).toFormat(fmt, { quality: fmt === 'avif' ? 50 : 78 }).toFile(target);
        done.push(`${name}-${w}.${fmt}`);
      }
    }
  }
  console.log(JSON.stringify({ images: done.length }));
}
