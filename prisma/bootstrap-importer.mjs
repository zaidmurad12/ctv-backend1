/**
 * Temporary Bootstrap Importer.
 *
 * Populates the platform with real TMDB movies/TV shows (genres, cast, crew,
 * companies, countries, languages, artwork) and attaches a "Local Demo
 * Provider" so every movie/episode has two playable demo streams and demo
 * subtitles — until the real Cinemana provider exists.
 *
 * This does NOT go through services/importer's pipeline: that pipeline's own
 * README documents it cannot carry cast/crew/genres/companies (Milestone 1
 * never modeled those as domain aggregates), so routing TMDB's full metadata
 * through it would silently drop most of what this script needs to write.
 * This script talks to Prisma directly instead — it never touches the
 * pipeline, the provider SDK, or any existing tested code path.
 *
 * Idempotent: every write is an upsert (or delete+recreate for rows with no
 * natural unique key, e.g. images/streams/subtitles) keyed off a stable
 * identifier, so re-running this at any time safely converges instead of
 * duplicating data.
 *
 * Usage: node prisma/bootstrap-importer.mjs   (requires TMDB_API_KEY in .env)
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch {
  // No .env file (e.g. real environment variables are already set) — proceed.
}

const TMDB_API_KEY = process.env.TMDB_API_KEY;
if (!TMDB_API_KEY || TMDB_API_KEY === 'replace-me') {
  console.error(
    'TMDB_API_KEY is missing or still the placeholder value. Set a real key in .env before running the bootstrap importer.',
  );
  process.exit(1);
}

// Optional - a person's Arabic biography translation is a nice-to-have, not a hard
// requirement to import at all. Missing this key just means biographyAr stays null for
// everyone, logged once up front rather than failing per-person.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY not set - cast/crew biographies will be imported in English only.');
}

// Optional - same graceful-skip treatment as Gemini above. Automatically attaches an Arabic
// subtitle to every newly-imported movie (see ensureSubtitle below) via the official,
// licensed OpenSubtitles API - never downloaded/re-hosted, see externalFileId's own comment
// in schema.prisma for how the link stays valid past OpenSubtitles' own short-lived download
// links. Idempotent: skips a movie that already has any subtitle at all, so re-running this
// script never re-searches (and never burns OpenSubtitles' daily download quota) for a title
// that's already covered.
const OPENSUBTITLES_API_KEY = process.env.OPENSUBTITLES_API_KEY;
if (!OPENSUBTITLES_API_KEY) {
  console.warn('OPENSUBTITLES_API_KEY not set - movies will import with no subtitle attached.');
}
const PUBLIC_API_BASE_URL =
  process.env.PUBLIC_API_BASE_URL || 'https://ctv-platform-backend-afcem6ospa-ww.a.run.app/api/v1';

const MOVIE_TARGET = Number(process.env.BOOTSTRAP_MOVIE_TARGET ?? 100);
const SHOW_TARGET = Number(process.env.BOOTSTRAP_SHOW_TARGET ?? 50);
const CONCURRENCY = Number(process.env.BOOTSTRAP_CONCURRENCY ?? 4);
// Originally low "safety" caps from this importer's earliest, untested version - in practice
// they silently truncated any real show past its 4th-5th season (or ~40 total episodes) with no
// error or admin-visible warning, reported as "shows with more seasons just don't get imported."
// Raised high enough to comfortably cover ordinary long-running shows while still guarding
// against a truly pathological one (a soap opera with several thousand episodes).
const MAX_SEASONS_PER_SHOW = Number(process.env.BOOTSTRAP_MAX_SEASONS_PER_SHOW ?? 60);
const MAX_EPISODES_PER_SHOW = Number(process.env.BOOTSTRAP_MAX_EPISODES_PER_SHOW ?? 2000);

// A season/episode only gets imported once it's actually aired, or is confirmed to air within
// this many days - announced-but-undated (or dated well in the future) seasons/episodes are
// skipped entirely rather than creating an empty placeholder nobody can act on yet. Re-running
// the same import (the admin panel's "reimport" button) re-checks every season/episode against
// today, so one already exists to add each one the moment it crosses into this window - that's
// the "update seasons and episodes" mechanism, not a separate one.
const AIR_DATE_IMPORT_HORIZON_DAYS = 60;

/** No date at all = an unannounced episode/season, deliberately left out until it actually has one. */
function isAirDateImportable(dateStr) {
  if (!dateStr) return false;
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + AIR_DATE_IMPORT_HORIZON_DAYS);
  return new Date(dateStr) <= horizon;
}

const TMDB_BASE = 'https://api.themoviedb.org/3';
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);

const CREW_ROLE_MAP = {
  Director: 'Director',
  Writer: 'Writer',
  Screenplay: 'Writer',
  Story: 'Writer',
  Producer: 'Producer',
  'Executive Producer': 'Producer',
  'Original Music Composer': 'Composer',
  Music: 'Composer',
  Editor: 'Editor',
  'Director of Photography': 'Cinematographer',
};

const MOVIE_LIST_PATHS = ['/movie/popular', '/movie/top_rated', '/trending/movie/week'];
const SHOW_LIST_PATHS = ['/tv/popular', '/tv/top_rated', '/trending/tv/week'];

const prisma = new PrismaClient();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function tmdbGet(pathname, params = {}) {
  const url = new URL(TMDB_BASE + pathname);
  url.searchParams.set('api_key', TMDB_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(url);
    if (response.ok) {
      return response.json();
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      const retryAfter = Number(response.headers.get('retry-after')) || attempt * 1.5;
      await sleep(retryAfter * 1000);
      continue;
    }
    const body = await response.text().catch(() => '');
    throw new Error(`TMDB ${response.status} ${pathname}: ${body.slice(0, 200)}`);
  }
  throw new Error(`TMDB request failed after retries: ${pathname}`);
}

async function mapLimit(items, limit, fn) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function imageUrl(base, size, filePath) {
  return filePath ? `${base}${size}${filePath}` : null;
}

// Plain REST call instead of an SDK - this script already talks to TMDB the same bare-fetch
// way, and pulling in a whole Gemini client library for one call type isn't worth a new
// dependency in this package. Best-effort: any failure (quota, network, missing key) just
// means no Arabic translation for this one person, not an aborted import run.
// A serialized queue (not per-call concurrency) plus a minimum gap between requests - the free
// tier's per-minute request limit is easily blown through otherwise, since MOVIE_CONCURRENCY
// movies/shows import in parallel, each firing off translation calls for its own ~10-15 cast/
// crew members with no coordination between them. Mirrors tmdbGet's own request-pacing idea,
// just applied globally across every translateToArabic call instead of per-title.
let geminiChain = Promise.resolve();
const GEMINI_MIN_GAP_MS = 4200;
let lastGeminiCallAt = 0;

// Set by import-one.mjs for on-demand single-title admin imports, where waiting through
// several people's worth of 429 retries (up to ~35s each while the shared key's quota is
// exhausted) would make a single "import this movie" click feel hung for minutes. The bulk
// reimport scripts leave this unset, since they're already expected to run unattended.
const SKIP_TRANSLATION = process.env.SKIP_GEMINI_TRANSLATION === '1';

export async function translateToArabic(text) {
  if (!GEMINI_API_KEY || !text || SKIP_TRANSLATION) return null;

  const gate = geminiChain.then(async () => {
    const wait = Math.max(0, lastGeminiCallAt + GEMINI_MIN_GAP_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastGeminiCallAt = Date.now();
  });
  geminiChain = gate.catch(() => {});
  await gate;

  // "gemini-flash-latest" is a moving alias - it now resolves to gemini-3.7-flash, a
  // reasoning-capable model that burns a large, variable number of hidden "thinking" tokens on
  // every call (confirmed live: usageMetadata.thoughtsTokenCount ~165 for a one-line prompt) on
  // top of the actual translation. That's both unnecessary for a plain translation task and
  // pushes usage against the free tier's per-minute/per-day cap far faster than before, which is
  // what was actually causing the daily backfill job to fail almost every call with 429s (see
  // TranslationBackfillService's own comment) despite the pacing/retry logic below already being
  // correct. "-lite" models are the non-reasoning tier - confirmed no thoughtsTokenCount in their
  // response at all - and have a materially higher free-tier quota for exactly that reason.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_API_KEY}`;
  const prompt = `ترجم السيرة الذاتية التالية لأحد الممثلين أو صناع الأفلام إلى اللغة العربية الفصحى، بأسلوب طبيعي واحترافي، دون إضافة أو حذف أي معلومة. أعد نص الترجمة فقط، بدون أي مقدمات أو تعليقات إضافية:\n\n${text}`;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (response.status === 429 && attempt < 4) {
        await sleep(attempt * 5000);
        continue;
      }
      if (!response.ok) {
        console.warn(`  Gemini translation failed (${response.status}), leaving biographyAr empty.`);
        return null;
      }
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (err) {
      if (attempt < 4) {
        await sleep(attempt * 3000);
        continue;
      }
      console.warn(`  Gemini translation error: ${err.message}`);
      return null;
    }
  }
  return null;
}

// Arabic-language works get their Arabic poster/logo (falling back to English, then to
// whatever TMDB considers primary, if this title has no Arabic image at all); foreign works
// get the reverse. Requires the detail fetch to have actually requested multiple image
// languages in the first place (include_image_language=en,ar,null - see importMovie/importShow
// below), since TMDB's default `images` response otherwise only carries one language's set.
export function pickImageByLang(images, originalLanguage) {
  if (!images || images.length === 0) return null;
  const preferred = originalLanguage === 'ar' ? ['ar', 'en'] : ['en', 'ar'];
  for (const lang of preferred) {
    const hit = images.find((img) => img.iso_639_1 === lang);
    if (hit) return hit.file_path;
  }
  return images[0].file_path;
}

// Horizontal backdrop for the app's hero/detail banners: prefers a textless ("general", TMDB's
// iso_639_1 == null) image over one with a language's title/tagline baked in - this used to just
// take TMDB's first-listed backdrop, which was frequently an English-lettered one - then the
// highest-voted, and prefers >= 1920px wide so it stays sharp full-screen on a TV. Falls back
// step by step (textless any size -> any 1920+ -> anything) rather than ever returning nothing.
// Artwork is chosen once, when a title is first imported (poster with its title lettered in the
// title's language, textless backdrop, logo) and never replaced afterwards: a re-import used to
// delete and re-pick every image, and TMDB's votes shift over time, so titles kept getting a
// different poster or backdrop (owner: "keep every poster as it is"). A missing type is still
// filled in. The scalar columns keep their value too (the logo one carries the #dark/#light mark).
async function keepExistingArtwork(model, tmdbId, fields) {
  const existing = await model.findUnique({ where: { tmdbId }, select: { poster: true, backdrop: true, logo: true } });
  if (!existing) return fields;
  const update = { ...fields };
  for (const key of ['poster', 'backdrop', 'logo']) {
    if (existing[key]) delete update[key];
  }
  return update;
}

async function addMissingImages(owner, imageRows) {
  if (!imageRows.length) return;
  const have = new Set((await prisma.image.findMany({ where: owner, select: { type: true } })).map((img) => img.type));
  const missing = imageRows.filter((row) => !have.has(row.type));
  if (missing.length) await prisma.image.createMany({ data: missing });
}

export function pickBackdrop(backdrops, fallbackPath) {
  if (!backdrops || backdrops.length === 0) return fallbackPath ?? null;
  const score = (b) => (b.vote_average ?? 0) * 10 + Math.log10((b.vote_count ?? 0) + 1);
  const best = (list) => [...list].sort((a, b) => score(b) - score(a))[0];
  const hiRes = (b) => (b.width ?? 0) >= 1920;
  const textless = backdrops.filter((b) => b.iso_639_1 == null);
  const tiers = [textless.filter(hiRes), textless, backdrops.filter(hiRes), backdrops];
  const tier = tiers.find((list) => list.length > 0);
  return best(tier).file_path;
}

// Title logos carry baked-in lettering, so only languages whose script is readable to this audience
// are considered - Latin-script ones (Turkish, Spanish, German, French, ...) plus Arabic. Logos in
// Japanese/Korean/Chinese/Cyrillic/Thai/Hindi/etc. would show up as unreadable glyphs, so those
// languages are never requested from TMDB at all. Order = preference: English and Arabic first
// (as before), then the title's own language when it is one of these, then the rest, then textless.
export const LOGO_IMAGE_LANGUAGES = 'en,ar,tr,es,de,fr,it,pt,nl,sv,da,no,fi,pl,cs,ro,hu,id,ms,null';
const READABLE_LOGO_LANGS = LOGO_IMAGE_LANGUAGES.split(',').filter((l) => l !== 'null');

export function pickLogo(logos, originalLanguage) {
  if (!logos || logos.length === 0) return null;
  const order = originalLanguage === 'ar' ? ['ar', 'en'] : ['en', 'ar'];
  if (READABLE_LOGO_LANGS.includes(originalLanguage)) order.push(originalLanguage);
  order.push(...READABLE_LOGO_LANGS);
  for (const lang of order) {
    const hit = logos.find((img) => img.iso_639_1 === lang);
    if (hit) return hit.file_path;
  }
  const textless = logos.find((img) => img.iso_639_1 == null);
  return textless ? textless.file_path : null;
}

// Posters keep the original en/ar/textless-only behavior even though the detail fetch now asks TMDB
// for more image languages (needed for logos).
export function enArOnly(images) {
  return images?.filter((img) => img.iso_639_1 == null || img.iso_639_1 === 'en' || img.iso_639_1 === 'ar');
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// TMDB's translations response carries a community-contributed Arabic title/overview together
// when one exists - free (no Gemini call), and often already correct. overview is used as an
// overviewAr fallback source and, when TMDB has none, that field then falls back further to a
// real (quota-limited) Gemini translation.
export function extractArabicTranslation(translations, isShow) {
  const entry = translations?.translations?.find((t) => t.iso_639_1 === 'ar');
  const title = isShow ? entry?.data?.name : entry?.data?.title;
  const overview = entry?.data?.overview;
  return {
    title: title && title.trim() ? title.trim() : null,
    overview: overview && overview.trim() ? overview.trim() : null,
  };
}

function extractTrailer(videos) {
  const list = (videos?.results ?? []).filter((v) => v.site === 'YouTube' && v.type === 'Trailer');
  const best = list.find((v) => v.official) ?? list[0];
  return best ? `https://www.youtube.com/watch?v=${best.key}` : null;
}

function extractAgeRating(releaseDates) {
  const us = releaseDates?.results?.find((r) => r.iso_3166_1 === 'US');
  const entry = us?.release_dates?.find((d) => d.certification);
  return entry?.certification || null;
}

// TV's content_ratings has a flat shape ({results: [{iso_3166_1, rating}]}), unlike movies'
// nested release_dates ({results: [{iso_3166_1, release_dates: [{certification}]}]}).
function extractShowAgeRating(contentRatings) {
  const us = contentRatings?.results?.find((r) => r.iso_3166_1 === 'US');
  return us?.rating || null;
}

function mappedCrew(crewList) {
  const byKey = new Map();
  for (const member of crewList) {
    const role = CREW_ROLE_MAP[member.job];
    if (!role) continue;
    byKey.set(`${member.id}|${role}`, { person: member, role });
  }
  return [...byKey.values()];
}

async function ensureGenre(cache, tmdbGenre) {
  const key = String(tmdbGenre.id);
  if (cache.has(key)) return cache.get(key);
  const slug = slugify(tmdbGenre.name);
  let genre;
  try {
    genre = await prisma.genre.upsert({
      where: { tmdbId: key },
      create: { tmdbId: key, name: tmdbGenre.name, slug },
      update: { name: tmdbGenre.name },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      genre = await prisma.genre.findUnique({ where: { name: tmdbGenre.name } });
    }
    if (!genre) throw err;
  }
  cache.set(key, genre.id);
  return genre.id;
}

export async function ensurePerson(cache, imgBase, p) {
  const key = String(p.id);
  if (cache.has(key)) return cache.get(key);

  // The cast/crew credit object (`p`) only ever carries name/photo/popularity - birthday,
  // deathday, biography, and place of birth need this separate per-person detail call. One extra
  // TMDB request per *unique* person (the cache above already de-dupes anyone credited on
  // multiple titles), not per credit.
  let detail = null;
  try {
    detail = await tmdbGet(`/person/${p.id}`, { language: 'en-US' });
  } catch (err) {
    console.warn(`  Person detail fetch failed for ${p.name} (${p.id}): ${err.message}`);
  }
  const biography = detail?.biography?.trim() || null;
  const detailFields = {
    birthday: detail?.birthday ? new Date(detail.birthday) : null,
    deathday: detail?.deathday ? new Date(detail.deathday) : null,
    biography,
    biographyAr: biography ? await translateToArabic(biography) : null,
    placeOfBirth: detail?.place_of_birth?.trim() || null,
  };

  const baseFields = { name: p.name, photo: imageUrl(imgBase, 'w500', p.profile_path), popularity: p.popularity ?? null };
  const person = await prisma.person.upsert({
    where: { tmdbId: key },
    create: { tmdbId: key, ...baseFields, ...detailFields },
    // A failed detail fetch above (rate limit, timeout - not rare across a bulk import's
    // hundreds of person lookups) must not blank out birthday/biography/etc. that a *previous*
    // successful import already stored - this is exactly why so many already-imported people
    // were missing that data despite having been imported (and even re-imported) more than
    // once: every retry had its own independent chance to fail and wipe the last good values.
    // Only ever merging detailFields in when this call actually got them keeps a transient
    // failure a no-op instead of a regression.
    update: detail ? { ...baseFields, ...detailFields } : baseFields,
  });
  cache.set(key, person.id);
  return person.id;
}

async function ensureCompany(cache, imgBase, c) {
  const key = String(c.id);
  if (cache.has(key)) return cache.get(key);
  const fields = { name: c.name, logo: imageUrl(imgBase, 'w500', c.logo_path), country: c.origin_country || null };
  const company = await prisma.company.upsert({
    where: { tmdbId: key },
    create: { tmdbId: key, ...fields },
    update: fields,
  });
  cache.set(key, company.id);
  return company.id;
}

async function ensureCountry(cache, c) {
  const key = c.iso_3166_1;
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  const country = await prisma.country.upsert({
    where: { isoCode: key },
    create: { isoCode: key, name: c.name },
    update: { name: c.name },
  });
  cache.set(key, country.id);
  return country.id;
}

async function ensureLanguage(cache, l) {
  const key = l.iso_639_1;
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  const fields = {
    englishName: l.english_name || l.name || key,
    nativeName: l.name || null,
    rtl: RTL_LANGS.has(key),
  };
  const language = await prisma.language.upsert({
    where: { isoCode: key },
    create: { isoCode: key, ...fields },
    update: fields,
  });
  cache.set(key, language.id);
  return language.id;
}

// This used to also seed two fake "Demo Server" streams + demo subtitle files onto every
// movie/episode - removed per explicit request: a title with no real stream configured yet
// should have *no* Stream rows at all, not a placeholder pointing at a generic test clip. The
// client's own job is to read that absence and show "Coming Soon" instead of a Play button
// (see MovieCard/MovieDetailsScreen) - not this importer's job to fake one up. The provider
// row itself is still needed as the anchor MovieProvider/EpisodeProvider records (and, later,
// real streams entered through the admin panel) attach to.
export async function ensureImportProvider() {
  return prisma.provider.upsert({
    where: { slug: 'tmdb-import' },
    create: {
      name: 'TMDB Import',
      slug: 'tmdb-import',
      version: '1.0.0',
      isEnabled: true,
      healthStatus: 'HEALTHY',
    },
    update: { healthStatus: 'HEALTHY', isEnabled: true },
  });
}

async function ensureOpenSubtitlesProvider() {
  return prisma.provider.upsert({
    where: { slug: 'opensubtitles' },
    create: {
      name: 'OpenSubtitles',
      slug: 'opensubtitles',
      version: '1.0.0',
      isEnabled: true,
      healthStatus: 'HEALTHY',
    },
    update: { healthStatus: 'HEALTHY', isEnabled: true },
  });
}

// Mirrors apps/backend/src/admin/infrastructure/openSubtitlesService.ts's own search()/
// resolveDownloadLink() - duplicated in plain JS here rather than imported, since this script
// runs standalone (no NestJS runtime) exactly like the rest of this file's TMDB/Gemini calls.
// Same quality-aware ranking: community rating first, download count as a tiebreaker, a small
// bonus for a real fps.
async function searchOpenSubtitlesCandidate(title, year, language, imdbId) {
  if (!OPENSUBTITLES_API_KEY || !title) return null;
  try {
    const params = new URLSearchParams({ query: title, languages: language, order_by: 'download_count', order_direction: 'desc' });
    if (year) params.set('year', String(year));
    if (imdbId) params.set('imdb_id', imdbId.replace(/^tt/i, ''));

    const res = await fetch(`https://api.opensubtitles.com/api/v1/subtitles?${params.toString()}`, {
      headers: { 'Api-Key': OPENSUBTITLES_API_KEY, 'User-Agent': 'CTV-Platform v1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const pool = (json.data ?? []).slice(0, 15);
    const ranked = pool
      .map((item) => {
        const a = item.attributes ?? {};
        const fileId = a.files?.[0]?.file_id;
        if (!fileId) return null;
        const rating = Number(a.ratings) || 0;
        const downloads = Number(a.download_count) || 0;
        const fpsBonus = Number(a.fps) > 0 ? 1 : 0;
        return { fileId: String(fileId), score: rating * 2 + Math.log10(downloads + 1) + fpsBonus };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.fileId ?? null;
  } catch (err) {
    console.warn(`  OpenSubtitles search failed for "${title}": ${err.message}`);
    return null;
  }
}

// Automatically attaches an Arabic subtitle to a movie via the official OpenSubtitles API -
// never downloaded/re-hosted, see Subtitle.externalFileId's own comment in schema.prisma for
// how the stored link stays valid past OpenSubtitles' own short-lived download links.
// Idempotent by design: skips a movie that already has ANY subtitle (from this or any other
// source), so re-running the importer never re-searches - and never spends OpenSubtitles' daily
// download quota - for a title that's already covered.
export async function ensureSubtitle(movieId, title, year, imdbId) {
  if (!OPENSUBTITLES_API_KEY) return;

  const existing = await prisma.subtitle.findFirst({ where: { movieProvider: { movieId } } });
  if (existing) return;

  const fileId = await searchOpenSubtitlesCandidate(title, year, 'ar', imdbId);
  if (!fileId) return;

  const provider = await ensureOpenSubtitlesProvider();
  const movieProvider = await prisma.movieProvider.upsert({
    where: { movieId_providerId: { movieId, providerId: provider.id } },
    create: { movieId, providerId: provider.id },
    update: {},
  });
  const created = await prisma.subtitle.create({
    data: { movieProviderId: movieProvider.id, language: 'ar', format: 'srt', url: '', externalFileId: fileId },
  });
  await prisma.subtitle.update({
    where: { id: created.id },
    data: { url: `${PUBLIC_API_BASE_URL}/subtitles/${created.id}/resolve` },
  });
  console.log(`  Attached OpenSubtitles subtitle for "${title}"`);
}

async function collectIds(paths, target) {
  const ids = new Set();
  outer: for (const listPath of paths) {
    for (let page = 1; page <= 10; page++) {
      const data = await tmdbGet(listPath, { page, language: 'en-US' });
      for (const item of data.results ?? []) {
        ids.add(item.id);
        if (ids.size >= target) break outer;
      }
      if (page >= (data.total_pages ?? 1)) break;
    }
  }
  return [...ids];
}

export async function importMovie(caches, imgBase, providerId, tmdbId, counters) {
  const data = await tmdbGet(`/movie/${tmdbId}`, {
    append_to_response: 'credits,external_ids,images,videos,translations,release_dates',
    language: 'en-US',
    // Without this, TMDB's `images` only ever comes back in one language (whatever the
    // request's own `language` was, plus textless) - both en and ar variants are needed for
    // pickImageByLang below to actually have something to choose between.
    include_image_language: LOGO_IMAGE_LANGUAGES,
  });

  let collectionId = null;
  if (data.belongs_to_collection) {
    const bc = data.belongs_to_collection;
    const fields = {
      title: bc.name,
      poster: imageUrl(imgBase, 'w500', bc.poster_path),
      backdrop: imageUrl(imgBase, 'w1280', bc.backdrop_path),
    };
    const collection = await prisma.collection.upsert({
      where: { tmdbId: String(bc.id) },
      create: { tmdbId: String(bc.id), ...fields },
      update: fields,
    });
    collectionId = collection.id;
  }

  const genreIds = [];
  for (const g of data.genres ?? []) genreIds.push(await ensureGenre(caches.genre, g));

  const castTop = (data.credits?.cast ?? []).slice(0, 10);
  const castPersonIds = [];
  for (const c of castTop) castPersonIds.push(await ensurePerson(caches.person, imgBase, c));

  const crewEntries = mappedCrew(data.credits?.crew ?? []);
  const crewPersonIds = [];
  for (const c of crewEntries) crewPersonIds.push(await ensurePerson(caches.person, imgBase, c.person));

  const companyIds = [];
  for (const c of data.production_companies ?? []) companyIds.push(await ensureCompany(caches.company, imgBase, c));

  const countryIds = [];
  for (const c of data.production_countries ?? []) {
    const id = await ensureCountry(caches.country, c);
    if (id) countryIds.push(id);
  }

  const languageIds = [];
  for (const l of data.spoken_languages ?? []) {
    const id = await ensureLanguage(caches.language, l);
    if (id) languageIds.push(id);
  }

  // Arabic-language films get their Arabic poster/logo, foreign films get English. Backdrops are
  // picked separately (see pickBackdrop): textless + high-res + best-voted, not language-based.
  const posterPath = pickImageByLang(enArOnly(data.images?.posters), data.original_language) ?? data.poster_path;
  const backdropPath = pickBackdrop(data.images?.backdrops, data.backdrop_path);
  const logoPath = pickLogo(data.images?.logos, data.original_language);

  const movieArabic = extractArabicTranslation(data.translations, false);
  const movieOverviewAr = movieArabic.overview || (data.overview ? await translateToArabic(data.overview) : null);

  const fields = {
    imdbId: data.external_ids?.imdb_id || data.imdb_id || null,
    title: data.title,
    originalTitle: data.original_title,
    titleAr: movieArabic.title,
    overview: data.overview || null,
    overviewAr: movieOverviewAr,
    tagline: data.tagline || null,
    releaseDate: data.release_date ? new Date(data.release_date) : null,
    runtime: data.runtime || null,
    status: 'PUBLISHED',
    rating: data.vote_average ?? null,
    voteCount: data.vote_count ?? 0,
    ageRating: extractAgeRating(data.release_dates),
    originalLanguage: data.original_language || null,
    poster: imageUrl(imgBase, 'w500', posterPath),
    backdrop: imageUrl(imgBase, 'w1280', backdropPath),
    logo: imageUrl(imgBase, 'w500', logoPath),
    trailer: extractTrailer(data.videos),
    popularity: data.popularity ?? null,
    homepage: data.homepage || null,
    budget: data.budget ? BigInt(data.budget) : null,
    revenue: data.revenue ? BigInt(data.revenue) : null,
    collectionId,
  };

  const movie = await prisma.movie.upsert({
    where: { tmdbId: String(data.id) },
    create: { tmdbId: String(data.id), ...fields },
    update: await keepExistingArtwork(prisma.movie, String(data.id), fields),
  });

  await prisma.movieGenre.createMany({
    data: genreIds.map((genreId) => ({ movieId: movie.id, genreId })),
    skipDuplicates: true,
  });
  await prisma.movieCompany.createMany({
    data: companyIds.map((companyId) => ({ movieId: movie.id, companyId })),
    skipDuplicates: true,
  });
  await prisma.movieCountry.createMany({
    data: countryIds.map((countryId) => ({ movieId: movie.id, countryId })),
    skipDuplicates: true,
  });
  await prisma.movieLanguage.createMany({
    data: languageIds.map((languageId) => ({ movieId: movie.id, languageId })),
    skipDuplicates: true,
  });
  await prisma.movieCastMember.createMany({
    data: castTop.map((c, i) => ({
      movieId: movie.id,
      personId: castPersonIds[i],
      character: c.character || null,
      order: c.order ?? i,
    })),
    skipDuplicates: true,
  });
  await prisma.movieCrewMember.createMany({
    data: crewEntries.map((c, i) => ({ movieId: movie.id, personId: crewPersonIds[i], role: c.role })),
    skipDuplicates: true,
  });

  const imageRows = [];
  if (posterPath) imageRows.push({ movieId: movie.id, type: 'POSTER', url: imageUrl(imgBase, 'w500', posterPath), provider: 'tmdb' });
  if (backdropPath) imageRows.push({ movieId: movie.id, type: 'BACKDROP', url: imageUrl(imgBase, 'w1280', backdropPath), provider: 'tmdb' });
  if (logoPath) imageRows.push({ movieId: movie.id, type: 'LOGO', url: imageUrl(imgBase, 'w500', logoPath), provider: 'tmdb' });
  await addMissingImages({ movieId: movie.id }, imageRows);

  // No demo/placeholder stream rows attached here - a freshly-imported movie intentionally has
  // none until a real one is entered through the admin panel (see the comment on
  // ensureImportProvider above). A subtitle, unlike a stream, CAN be found automatically via a
  // real licensed source - see ensureSubtitle below.
  await prisma.movieProvider.upsert({
    where: { movieId_providerId: { movieId: movie.id, providerId } },
    create: { movieId: movie.id, providerId, externalId: String(data.id), sourceTitle: data.title },
    update: { sourceTitle: data.title },
  });

  // Off by default (per explicit request) - imports no longer auto-attach OpenSubtitles tracks
  // (the sources' own subtitles are used instead). Set ATTACH_OPENSUBTITLES=1 to re-enable; the
  // standalone backfill-movie-subtitles.mjs script still calls ensureSubtitle directly.
  // Arabic-language movies don't need an Arabic subtitle - the audio itself already is Arabic.
  if (process.env.ATTACH_OPENSUBTITLES === '1' && data.original_language !== 'ar') {
    await ensureSubtitle(movie.id, data.title, data.release_date ? new Date(data.release_date).getUTCFullYear() : null, fields.imdbId);
  }

  counters.movies++;
}

export async function importShow(caches, imgBase, providerId, tmdbId, counters) {
  const data = await tmdbGet(`/tv/${tmdbId}`, {
    append_to_response: 'credits,external_ids,images,translations,content_ratings',
    language: 'en-US',
    include_image_language: LOGO_IMAGE_LANGUAGES,
  });

  const genreIds = [];
  for (const g of data.genres ?? []) genreIds.push(await ensureGenre(caches.genre, g));

  const castTop = (data.credits?.cast ?? []).slice(0, 10);
  const castPersonIds = [];
  for (const c of castTop) castPersonIds.push(await ensurePerson(caches.person, imgBase, c));

  const crewEntries = mappedCrew(data.credits?.crew ?? []);
  const crewPersonIds = [];
  for (const c of crewEntries) crewPersonIds.push(await ensurePerson(caches.person, imgBase, c.person));

  const companyIds = [];
  for (const c of data.production_companies ?? []) companyIds.push(await ensureCompany(caches.company, imgBase, c));

  const countryIds = [];
  for (const c of data.production_countries ?? []) {
    const id = await ensureCountry(caches.country, c);
    if (id) countryIds.push(id);
  }

  const languageIds = [];
  for (const l of data.spoken_languages ?? []) {
    const id = await ensureLanguage(caches.language, l);
    if (id) languageIds.push(id);
  }

  const posterPath = pickImageByLang(enArOnly(data.images?.posters), data.original_language) ?? data.poster_path;
  const backdropPath = pickBackdrop(data.images?.backdrops, data.backdrop_path);
  const logoPath = pickLogo(data.images?.logos, data.original_language);

  const showArabic = extractArabicTranslation(data.translations, true);
  const showOverviewAr = showArabic.overview || (data.overview ? await translateToArabic(data.overview) : null);

  const fields = {
    imdbId: data.external_ids?.imdb_id || null,
    title: data.name,
    originalTitle: data.original_name,
    titleAr: showArabic.title,
    overview: data.overview || null,
    overviewAr: showOverviewAr,
    status: 'PUBLISHED',
    releaseDate: data.first_air_date ? new Date(data.first_air_date) : null,
    lastAirDate: data.last_air_date ? new Date(data.last_air_date) : null,
    numberOfSeasons: data.number_of_seasons ?? 0,
    numberOfEpisodes: data.number_of_episodes ?? 0,
    rating: data.vote_average ?? null,
    voteCount: data.vote_count ?? 0,
    ageRating: extractShowAgeRating(data.content_ratings),
    originalLanguage: data.original_language || null,
    poster: imageUrl(imgBase, 'w500', posterPath),
    backdrop: imageUrl(imgBase, 'w1280', backdropPath),
    logo: imageUrl(imgBase, 'w500', logoPath),
    homepage: data.homepage || null,
    popularity: data.popularity ?? null,
  };

  // A hand-arranged season layout (see TVShow.seasonLayoutCustom) is left exactly as the admin set it.
  const existingShow = await prisma.tVShow.findUnique({ where: { tmdbId: String(data.id) }, select: { seasonLayoutCustom: true } });
  const layoutIsCustom = !!existingShow?.seasonLayoutCustom;
  if (layoutIsCustom) {
    delete fields.numberOfSeasons;
    delete fields.numberOfEpisodes;
  }

  const show = await prisma.tVShow.upsert({
    where: { tmdbId: String(data.id) },
    create: { tmdbId: String(data.id), ...fields },
    update: await keepExistingArtwork(prisma.tVShow, String(data.id), fields),
  });

  await prisma.tVShowGenre.createMany({
    data: genreIds.map((genreId) => ({ showId: show.id, genreId })),
    skipDuplicates: true,
  });
  await prisma.tVShowCompany.createMany({
    data: companyIds.map((companyId) => ({ showId: show.id, companyId })),
    skipDuplicates: true,
  });
  await prisma.tVShowCountry.createMany({
    data: countryIds.map((countryId) => ({ showId: show.id, countryId })),
    skipDuplicates: true,
  });
  await prisma.tVShowLanguage.createMany({
    data: languageIds.map((languageId) => ({ showId: show.id, languageId })),
    skipDuplicates: true,
  });
  await prisma.tVShowCastMember.createMany({
    data: castTop.map((c, i) => ({
      showId: show.id,
      personId: castPersonIds[i],
      character: c.character || null,
      order: c.order ?? i,
    })),
    skipDuplicates: true,
  });
  await prisma.tVShowCrewMember.createMany({
    data: crewEntries.map((c, i) => ({ showId: show.id, personId: crewPersonIds[i], role: c.role })),
    skipDuplicates: true,
  });

  const imageRows = [];
  if (posterPath) imageRows.push({ showId: show.id, type: 'POSTER', url: imageUrl(imgBase, 'w500', posterPath), provider: 'tmdb' });
  if (backdropPath) imageRows.push({ showId: show.id, type: 'BACKDROP', url: imageUrl(imgBase, 'w1280', backdropPath), provider: 'tmdb' });
  if (logoPath) imageRows.push({ showId: show.id, type: 'LOGO', url: imageUrl(imgBase, 'w500', logoPath), provider: 'tmdb' });
  await addMissingImages({ showId: show.id }, imageRows);

  await prisma.tVShowProvider.upsert({
    where: { showId_providerId: { showId: show.id, providerId } },
    create: { showId: show.id, providerId, externalId: String(data.id), sourceTitle: data.name },
    update: { sourceTitle: data.name },
  });

  const seasons = layoutIsCustom ? [] : (data.seasons ?? []).filter((s) => s.season_number >= 1).slice(0, MAX_SEASONS_PER_SHOW);
  let episodesSoFar = 0;
  for (const s of seasons) {
    if (episodesSoFar >= MAX_EPISODES_PER_SHOW) break;

    const seasonData = await tmdbGet(`/tv/${tmdbId}/season/${s.season_number}`, { language: 'en-US' });
    // Skip a season entirely - no placeholder row at all - if it hasn't aired, isn't starting
    // within AIR_DATE_IMPORT_HORIZON_DAYS, or has no confirmed date yet (an unannounced future
    // season). A season already in progress (started, still airing new episodes) always passes
    // this since its own air_date is its first episode's date, already in the past.
    if (!isAirDateImportable(seasonData.air_date)) continue;

    // One extra request per *season* (not per episode) gets every episode's Arabic name/overview
    // TMDB has on file at once - cheap compared to a Gemini call per episode, which would
    // multiply that already-tight quota by the show's entire episode count. Left null per
    // episode when TMDB has nothing for it (see Episode.titleAr's own comment) rather than
    // falling back to Gemini here.
    let arabicEpisodesByNumber = new Map();
    try {
      const seasonDataAr = await tmdbGet(`/tv/${tmdbId}/season/${s.season_number}`, { language: 'ar' });
      arabicEpisodesByNumber = new Map((seasonDataAr.episodes ?? []).map((e) => [e.episode_number, e]));
    } catch (err) {
      console.warn(`  Arabic season fetch failed for S${s.season_number}: ${err.message}`);
    }

    const seasonFields = {
      name: seasonData.name || null,
      overview: seasonData.overview || null,
      poster: imageUrl(imgBase, 'w500', seasonData.poster_path),
      airDate: seasonData.air_date ? new Date(seasonData.air_date) : null,
      episodeCount: seasonData.episodes?.length ?? 0,
    };
    const season = await prisma.season.upsert({
      where: { showId_seasonNumber: { showId: show.id, seasonNumber: s.season_number } },
      create: { showId: show.id, seasonNumber: s.season_number, ...seasonFields },
      update: seasonFields,
    });
    counters.seasons++;

    for (const ep of seasonData.episodes ?? []) {
      if (episodesSoFar >= MAX_EPISODES_PER_SHOW) break;
      // Same rule per episode, independently of the season - a currently-airing season mixes
      // already-aired episodes with ones still weeks out, and only the former (plus anything
      // landing within the next week) should actually show up for the admin to manage yet.
      if (!isAirDateImportable(ep.air_date)) continue;
      episodesSoFar++;

      const epArabic = arabicEpisodesByNumber.get(ep.episode_number);
      const episodeFields = {
        title: ep.name || `Episode ${ep.episode_number}`,
        titleAr: epArabic?.name?.trim() || null,
        overview: ep.overview || null,
        overviewAr: epArabic?.overview?.trim() || null,
        runtime: ep.runtime || null,
        airDate: ep.air_date ? new Date(ep.air_date) : null,
        rating: ep.vote_average ?? null,
        voteCount: ep.vote_count ?? 0,
        stillImage: imageUrl(imgBase, 'w300', ep.still_path),
      };
      const episode = await prisma.episode.upsert({
        where: { seasonId_episodeNumber: { seasonId: season.id, episodeNumber: ep.episode_number } },
        create: { seasonId: season.id, episodeNumber: ep.episode_number, ...episodeFields },
        update: episodeFields,
      });

      await prisma.episodeProvider.upsert({
        where: { episodeId_providerId: { episodeId: episode.id, providerId } },
        create: {
          episodeId: episode.id,
          providerId,
          externalId: `${tmdbId}-S${s.season_number}E${ep.episode_number}`,
          sourceTitle: ep.name || null,
        },
        update: { sourceTitle: ep.name || null },
      });
      counters.episodes++;
    }
  }

  counters.shows++;
}

async function main() {
  console.log('Bootstrap Importer starting...');

  const provider = await ensureImportProvider();
  console.log(`Import provider ready: ${provider.id}`);

  const config = await tmdbGet('/configuration');
  const imgBase = config.images.secure_base_url;

  const caches = {
    genre: new Map(),
    person: new Map(),
    company: new Map(),
    country: new Map(),
    language: new Map(),
  };
  const counters = {
    movies: 0,
    shows: 0,
    seasons: 0,
    episodes: 0,
    errors: 0,
  };

  console.log(`Collecting >= ${MOVIE_TARGET} movie ids...`);
  const movieIds = await collectIds(MOVIE_LIST_PATHS, MOVIE_TARGET);
  console.log(`Collected ${movieIds.length} movie ids.`);

  console.log(`Collecting >= ${SHOW_TARGET} show ids...`);
  const showIds = await collectIds(SHOW_LIST_PATHS, SHOW_TARGET);
  console.log(`Collected ${showIds.length} show ids.`);

  console.log(`Importing movies (concurrency=${CONCURRENCY})...`);
  await mapLimit(movieIds, CONCURRENCY, async (id) => {
    try {
      await importMovie(caches, imgBase, provider.id, id, counters);
      console.log(`  movie ${id} imported (${counters.movies}/${movieIds.length})`);
    } catch (err) {
      counters.errors++;
      console.error(`  movie ${id} FAILED: ${err.message}`);
    }
  });

  console.log(`Importing shows (concurrency=${CONCURRENCY})...`);
  await mapLimit(showIds, CONCURRENCY, async (id) => {
    try {
      await importShow(caches, imgBase, provider.id, id, counters);
      console.log(`  show ${id} imported (${counters.shows}/${showIds.length})`);
    } catch (err) {
      counters.errors++;
      console.error(`  show ${id} FAILED: ${err.message}`);
    }
  });

  console.log('\nBootstrap Importer summary:');
  console.log(`  Movies:    ${counters.movies}`);
  console.log(`  Shows:     ${counters.shows}`);
  console.log(`  Seasons:   ${counters.seasons}`);
  console.log(`  Episodes:  ${counters.episodes}`);
  console.log(`  Genres:    ${caches.genre.size}`);
  console.log(`  People:    ${caches.person.size}`);
  console.log(`  Companies: ${caches.company.size}`);
  console.log(`  Countries: ${caches.country.size}`);
  console.log(`  Languages: ${caches.language.size}`);
  console.log(`  Errors:    ${counters.errors}`);
}

// Guarded so other scripts can `import { ensureImportProvider, importShow, ... } from
// './bootstrap-importer.mjs'` to reuse its helpers without also triggering a full
// 100-movie/50-show bootstrap run as an unwanted side effect of the import.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error('Bootstrap importer failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
