import type { CastMemberDto } from '../dto.js';

interface GenreRow {
  genre: { name: string };
}

interface PersonRow {
  id: string;
  name: string;
  photo: string | null;
  birthday: Date | null;
  deathday: Date | null;
  biography: string | null;
  biographyAr: string | null;
  placeOfBirth: string | null;
}

interface CastRow {
  character: string | null;
  person: PersonRow;
}

interface CrewRow {
  role: string;
  person: PersonRow;
}

interface CountryRow {
  country: { name: string };
}

export function mapGenres(rows: readonly GenreRow[]): string[] {
  return rows.map((row) => row.genre.name);
}

function mapPerson(person: PersonRow, character: string | null): CastMemberDto {
  return {
    id: person.id,
    name: person.name,
    character,
    photo: person.photo,
    birthday: person.birthday ? person.birthday.toISOString() : null,
    deathday: person.deathday ? person.deathday.toISOString() : null,
    biography: person.biography,
    biographyAr: person.biographyAr,
    placeOfBirth: person.placeOfBirth,
  };
}

export function mapCast(rows: readonly CastRow[]): CastMemberDto[] {
  return rows.map((row) => mapPerson(row.person, row.character));
}

// Director/writer used to be exposed as a bare name string - the app had no way to show their
// photo/age/biography or link to their other work without it (see PersonScreen). Reusing the
// same CastMemberDto shape as a regular cast credit gives it all of that for free; `character`
// is just always null here since it's not an acting role.
export function mapDirector(rows: readonly CrewRow[]): CastMemberDto | null {
  const row = rows.find((r) => r.role === 'Director');
  return row ? mapPerson(row.person, null) : null;
}

// The importer's CREW_ROLE_MAP already normalizes Writer/Screenplay/Story to the single
// 'Writer' role (see bootstrap-importer.mjs) - this just reads that same role back out,
// mirroring mapDirector's own shape exactly.
export function mapWriter(rows: readonly CrewRow[]): CastMemberDto | null {
  const row = rows.find((r) => r.role === 'Writer');
  return row ? mapPerson(row.person, null) : null;
}

// Shows only. TMDB's show-level credits genuinely have no 'Director'/'Writer' entries for
// almost any real series (directing/writing credits there are per-*episode*, not for the show
// as a whole - confirmed directly against the API) - mapDirector/mapWriter above always return
// null for a show for exactly that reason, reported as "director and writer for the show are
// never imported." TMDB's own `created_by` field (imported as this separate 'Creator' role, see
// bootstrap-importer.mjs) is the real show-level equivalent worth surfacing instead - not the
// same *role* as directing (a creator conceives the series; they don't necessarily direct or
// write any of it), which is why this doesn't just reuse mapDirector's role name.
export function mapCreator(rows: readonly CrewRow[]): CastMemberDto | null {
  const row = rows.find((r) => r.role === 'Creator');
  return row ? mapPerson(row.person, null) : null;
}

// Comma-joined rather than an array - MovieDetailDto/ShowDetailDto expose this as one display
// string (matching how `director`/`writer` are already single names, not arrays), since a
// title's production countries are typically 1-2 entries shown together, not browsed as a list.
export function mapCountry(rows: readonly CountryRow[]): string | null {
  if (rows.length === 0) return null;
  return rows.map((row) => row.country.name).join(', ');
}
