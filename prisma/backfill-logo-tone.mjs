/**
 * Marks each title logo as dark or light, so the TV app can draw dark logos white: a black title
 * logo sitting over the app's dark hero/details/player backgrounds is close to unreadable. The mark
 * is appended to the stored logo URL as a fragment (`#dark` / `#light`) - never sent to the image
 * server, so every existing consumer of the URL keeps working, and no schema change is needed. The
 * app (LogoImage) strips it and applies a white tint for `#dark`.
 *
 * Dark = at least DARK_SHARE of the logo's visible pixels are near-black *and* colorless. Colored
 * logos stay as they are even when their luminance is low (a red title reads fine on a dark
 * background, and tinting it white would throw its color away).
 * Decodes the small (w185) PNG with Node's own zlib - no image library in the runtime image. Anything
 * it can't decode (SVG, 16-bit, interlaced) is marked light, i.e. left as it is.
 * Run nightly by TranslationBackfillService, after backfill-logos.mjs; only unmarked logos are checked.
 * Usage: node prisma/backfill-logo-tone.mjs
 */
import { inflateSync } from 'node:zlib';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DARK_SHARE = 0.6;

function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buf.length < 8 || sig.some((b, i) => buf[i] !== b)) return null;
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!width || !height || bitDepth !== 8 || interlace !== 0 || !channels) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 255;
    }
    prev = out;
  }
  return { width, height, colorType, channels, pixels, palette, trns };
}

// Share (0..1) of visible pixels that are near-black and colorless, or null if nothing is visible.
function darkShare(img) {
  let darkCount = 0, visible = 0;
  const { pixels, channels, colorType, palette, trns } = img;
  for (let i = 0; i < pixels.length; i += channels) {
    let r, g, b, alpha = 255;
    if (colorType === 6) [r, g, b, alpha] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    else if (colorType === 4) [r, g, b, alpha] = [pixels[i], pixels[i], pixels[i], pixels[i + 1]];
    else if (colorType === 2) [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    else if (colorType === 0) r = g = b = pixels[i];
    else {
      const idx = pixels[i];
      if (!palette) return null;
      [r, g, b] = [palette[idx * 3], palette[idx * 3 + 1], palette[idx * 3 + 2]];
      alpha = trns && idx < trns.length ? trns[idx] : 255;
    }
    if (alpha < 64) continue;
    visible++;
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (y < 0.22 && chroma < 45) darkCount++;
  }
  return visible > 0 ? darkCount / visible : null;
}

async function tone(logoUrl) {
  // An SVG logo is checked through the PNG rendition TMDB serves for it (same address, .png) - it
  // used to be marked "light" unchecked, so a near-black SVG logo was never drawn white.
  const png = logoUrl.replace(/\.svg$/i, '.png');
  if (!/\.png$/i.test(png)) return 'light';
  const small = png.replace(/\/t\/p\/(w\d+|original)\//, '/t/p/w185/');
  const res = await fetch(small, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const img = decodePng(Buffer.from(await res.arrayBuffer()));
  if (!img) return 'light';
  const share = darkShare(img);
  return share != null && share >= DARK_SHARE ? 'dark' : 'light';
}

async function run(kind) {
  const model = kind === 'movie' ? prisma.movie : prisma.tVShow;
  const rows = await model.findMany({
    // Unmarked logos, plus SVG ones marked "light" back when SVGs weren't actually checked.
    where: { deletedAt: null, logo: { not: null }, OR: [{ NOT: { logo: { contains: '#' } } }, { logo: { contains: '.svg#light' } }] },
    select: { id: true, logo: true },
  });
  let dark = 0, light = 0, failed = 0;
  let i = 0;
  async function worker() {
    while (i < rows.length) {
      const row = rows[i++];
      if (!row.logo) continue;
      try {
        const base = row.logo.split('#')[0];
        const t = await tone(base);
        await model.update({ where: { id: row.id }, data: { logo: `${base}#${t}` } });
        if (t === 'dark') dark++;
        else light++;
      } catch (err) {
        failed++;
        console.warn(`  ${kind} ${row.id}: fetch failed (${err.message})`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { checked: rows.length, dark, light, failed };
}

const movies = await run('movie');
const shows = await run('show');
await prisma.$disconnect();
console.log(
  `Done. movies: ${movies.dark} dark, ${movies.light} light, ${movies.failed} failed (of ${movies.checked}); ` +
    `shows: ${shows.dark} dark, ${shows.light} light, ${shows.failed} failed (of ${shows.checked}).`,
);
