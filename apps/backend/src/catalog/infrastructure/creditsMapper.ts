import type { CastMemberDto } from '../dto.js';

interface GenreRow {
  genre: { name: string };
}

interface CastRow {
  character: string | null;
  person: { name: string; photo: string | null };
}

interface CrewRow {
  role: string;
  person: { name: string };
}

export function mapGenres(rows: readonly GenreRow[]): string[] {
  return rows.map((row) => row.genre.name);
}

export function mapCast(rows: readonly CastRow[]): CastMemberDto[] {
  return rows.map((row) => ({
    name: row.person.name,
    character: row.character,
    photo: row.person.photo,
  }));
}

export function mapDirector(rows: readonly CrewRow[]): string | null {
  return rows.find((row) => row.role === 'Director')?.person.name ?? null;
}
