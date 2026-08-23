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
import { fileURLToPath } from 'node:url';
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

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
const MOVIE_TARGET = Number(process.env.BOOTSTRAP_MOVIE_TARGET ?? 100);
const SHOW_TARGET = Number(process.env.BOOTSTRAP_SHOW_TARGET ?? 50);
const CONCURRENCY = Number(process.env.BOOTSTRAP_CONCURRENCY ?? 4);
const MAX_SEASONS_PER_SHOW = Number(process.env.BOOTSTRAP_MAX_SEASONS_PER_SHOW ?? 5);
const MAX_EPISODES_PER_SHOW = Number(process.env.BOOTSTRAP_MAX_EPISODES_PER_SHOW ?? 40);

const TMDB_BASE = 'https://api.themoviedb.org/3';
const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur']);

// Well-known, publicly reachable sample MP4s (verified reachable), rotated
// two-at-a-time (Demo Server 1 / Demo Server 2) across movies and episodes.
const DEMO_TITLES = [
  {
    hi: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4',
    lo: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  },
  {
    hi: 'https://test-videos.co.uk/vids/sintel/mp4/h264/1080/Sintel_1080_10s_1MB.mp4',
    lo: 'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
  },
  {
    hi: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/1080/Jellyfish_1080_10s_1MB.mp4',
    lo: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
  },
];

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

async function tmdbGet(pathname, params = {}) {
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

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function extractArabicTitle(translations, isShow) {
  const entry = translations?.translations?.find((t) => t.iso_639_1 === 'ar');
  const value = isShow ? entry?.data?.name : entry?.data?.title;
  return value && value.trim() ? value.trim() : null;
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

async function ensurePerson(cache, imgBase, p) {
  const key = String(p.id);
  if (cache.has(key)) return cache.get(key);
  const fields = {
    name: p.name,
    photo: imageUrl(imgBase, 'w500', p.profile_path),
    popularity: p.popularity ?? null,
  };
  const person = await prisma.person.upsert({
    where: { tmdbId: key },
    create: { tmdbId: key, ...fields },
    update: fields,
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

async function ensureLocalDemoProvider() {
  return prisma.provider.upsert({
    where: { slug: 'local-demo' },
    create: {
      name: 'Local Demo Provider',
      slug: 'local-demo',
      version: '1.0.0',
      isEnabled: true,
      healthStatus: 'HEALTHY',
    },
    update: { healthStatus: 'HEALTHY', isEnabled: true },
  });
}

async function attachDemoPlayback(link, seedIndex, counters) {
  const where = link.movieProviderId
    ? { movieProviderId: link.movieProviderId }
    : { episodeProviderId: link.episodeProviderId };
  await prisma.stream.deleteMany({ where });
  await prisma.subtitle.deleteMany({ where });

  const source = DEMO_TITLES[seedIndex % DEMO_TITLES.length];
  await prisma.stream.createMany({
    data: [
      { ...link, quality: '1080p', serverName: 'Demo Server 1', streamUrl: source.hi, isDefault: true, isActive: true },
      { ...link, quality: '360p', serverName: 'Demo Server 2', streamUrl: source.lo, isDefault: false, isActive: true },
    ],
  });
  await prisma.subtitle.createMany({
    data: [
      { ...link, language: 'en', format: 'vtt', url: `${APP_URL}/static/subtitles/demo-en.vtt`, isDefault: true },
      { ...link, language: 'ar', format: 'vtt', url: `${APP_URL}/static/subtitles/demo-ar.vtt`, isDefault: false },
    ],
  });
  counters.streams += 2;
  counters.subtitles += 2;
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

async function importMovie(caches, imgBase, providerId, tmdbId, counters) {
  const data = await tmdbGet(`/movie/${tmdbId}`, {
    append_to_response: 'credits,external_ids,images,videos,translations,release_dates',
    language: 'en-US',
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

  const posterPath = data.images?.posters?.[0]?.file_path ?? data.poster_path;
  const backdropPath = data.images?.backdrops?.[0]?.file_path ?? data.backdrop_path;
  const logoPath = data.images?.logos?.[0]?.file_path ?? null;

  const fields = {
    imdbId: data.external_ids?.imdb_id || data.imdb_id || null,
    title: data.title,
    originalTitle: data.original_title,
    titleAr: extractArabicTitle(data.translations, false),
    overview: data.overview || null,
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
    update: fields,
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

  await prisma.image.deleteMany({ where: { movieId: movie.id, provider: 'tmdb' } });
  const imageRows = [];
  if (posterPath) imageRows.push({ movieId: movie.id, type: 'POSTER', url: imageUrl(imgBase, 'w500', posterPath), provider: 'tmdb' });
  if (backdropPath) imageRows.push({ movieId: movie.id, type: 'BACKDROP', url: imageUrl(imgBase, 'w1280', backdropPath), provider: 'tmdb' });
  if (logoPath) imageRows.push({ movieId: movie.id, type: 'LOGO', url: imageUrl(imgBase, 'w500', logoPath), provider: 'tmdb' });
  if (imageRows.length) await prisma.image.createMany({ data: imageRows });

  const movieProvider = await prisma.movieProvider.upsert({
    where: { movieId_providerId: { movieId: movie.id, providerId } },
    create: { movieId: movie.id, providerId, externalId: String(data.id), sourceTitle: data.title },
    update: { sourceTitle: data.title },
  });
  await attachDemoPlayback({ movieProviderId: movieProvider.id }, tmdbId, counters);

  counters.movies++;
}

async function importShow(caches, imgBase, providerId, tmdbId, counters) {
  const data = await tmdbGet(`/tv/${tmdbId}`, {
    append_to_response: 'credits,external_ids,images,translations',
    language: 'en-US',
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

  const posterPath = data.images?.posters?.[0]?.file_path ?? data.poster_path;
  const backdropPath = data.images?.backdrops?.[0]?.file_path ?? data.backdrop_path;
  const logoPath = data.images?.logos?.[0]?.file_path ?? null;

  const fields = {
    imdbId: data.external_ids?.imdb_id || null,
    title: data.name,
    originalTitle: data.original_name,
    titleAr: extractArabicTitle(data.translations, true),
    overview: data.overview || null,
    status: 'PUBLISHED',
    releaseDate: data.first_air_date ? new Date(data.first_air_date) : null,
    lastAirDate: data.last_air_date ? new Date(data.last_air_date) : null,
    numberOfSeasons: data.number_of_seasons ?? 0,
    numberOfEpisodes: data.number_of_episodes ?? 0,
    rating: data.vote_average ?? null,
    voteCount: data.vote_count ?? 0,
    poster: imageUrl(imgBase, 'w500', posterPath),
    backdrop: imageUrl(imgBase, 'w1280', backdropPath),
    logo: imageUrl(imgBase, 'w500', logoPath),
    homepage: data.homepage || null,
    popularity: data.popularity ?? null,
  };

  const show = await prisma.tVShow.upsert({
    where: { tmdbId: String(data.id) },
    create: { tmdbId: String(data.id), ...fields },
    update: fields,
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

  await prisma.image.deleteMany({ where: { showId: show.id, provider: 'tmdb' } });
  const imageRows = [];
  if (posterPath) imageRows.push({ showId: show.id, type: 'POSTER', url: imageUrl(imgBase, 'w500', posterPath), provider: 'tmdb' });
  if (backdropPath) imageRows.push({ showId: show.id, type: 'BACKDROP', url: imageUrl(imgBase, 'w1280', backdropPath), provider: 'tmdb' });
  if (logoPath) imageRows.push({ showId: show.id, type: 'LOGO', url: imageUrl(imgBase, 'w500', logoPath), provider: 'tmdb' });
  if (imageRows.length) await prisma.image.createMany({ data: imageRows });

  await prisma.tVShowProvider.upsert({
    where: { showId_providerId: { showId: show.id, providerId } },
    create: { showId: show.id, providerId, externalId: String(data.id), sourceTitle: data.name },
    update: { sourceTitle: data.name },
  });

  const seasons = (data.seasons ?? []).filter((s) => s.season_number >= 1).slice(0, MAX_SEASONS_PER_SHOW);
  let episodesSoFar = 0;
  for (const s of seasons) {
    if (episodesSoFar >= MAX_EPISODES_PER_SHOW) break;

    const seasonData = await tmdbGet(`/tv/${tmdbId}/season/${s.season_number}`, { language: 'en-US' });
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
      episodesSoFar++;

      const episodeFields = {
        title: ep.name || `Episode ${ep.episode_number}`,
        overview: ep.overview || null,
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

      const episodeProvider = await prisma.episodeProvider.upsert({
        where: { episodeId_providerId: { episodeId: episode.id, providerId } },
        create: {
          episodeId: episode.id,
          providerId,
          externalId: `${tmdbId}-S${s.season_number}E${ep.episode_number}`,
          sourceTitle: ep.name || null,
        },
        update: { sourceTitle: ep.name || null },
      });
      await attachDemoPlayback({ episodeProviderId: episodeProvider.id }, tmdbId + ep.episode_number, counters);
      counters.episodes++;
    }
  }

  counters.shows++;
}

async function main() {
  console.log('Bootstrap Importer starting...');

  const provider = await ensureLocalDemoProvider();
  console.log(`Local Demo Provider ready: ${provider.id}`);

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
    streams: 0,
    subtitles: 0,
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
  console.log(`  Streams:   ${counters.streams}`);
  console.log(`  Subtitles: ${counters.subtitles}`);
  console.log(`  Errors:    ${counters.errors}`);
}

main()
  .catch((error) => {
    console.error('Bootstrap importer failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
