import { Injectable } from '@nestjs/common';
import type { PrismaDatabaseClient } from '@ctv-platform/infrastructure';
import { PrismaService } from '../../prisma/prismaService.js';
import type { PersonCreditDto, PersonDetailDto } from '../dto.js';
import { mapImagesToArtwork } from './artworkMapper.js';

@Injectable()
export class PersonQueryRepository {
  private readonly prisma: PrismaDatabaseClient;

  constructor(prismaService: PrismaService) {
    this.prisma = prismaService.client;
  }

  async findById(id: string): Promise<PersonDetailDto | null> {
    const person = await this.prisma.person.findUnique({
      where: { id },
      include: {
        movieCast: { include: { movie: { include: { images: true } } } },
        movieCrew: { include: { movie: { include: { images: true } } } },
        showCast: { include: { show: { include: { images: true } } } },
        showCrew: { include: { show: { include: { images: true } } } },
      },
    });
    if (!person) return null;

    // A person can be credited on the same title as both cast and crew (e.g. an
    // actor-director) - de-duped by id via these maps so the filmography lists it once.
    const movies = new Map<string, PersonCreditDto>();
    for (const credit of [...person.movieCast, ...person.movieCrew]) {
      const movie = credit.movie;
      if (movie.deletedAt || movie.status !== 'PUBLISHED') continue;
      movies.set(movie.id, {
        id: movie.id,
        type: 'movie',
        title: movie.title,
        titleAr: movie.titleAr,
        hasSourceMatch: movie.hasSourceMatch ?? null,
        poster: mapImagesToArtwork(movie.images).poster ?? null,
        rating: movie.rating === null ? null : Number(movie.rating),
        releaseDate: movie.releaseDate ? movie.releaseDate.toISOString() : null,
      });
    }

    const shows = new Map<string, PersonCreditDto>();
    for (const credit of [...person.showCast, ...person.showCrew]) {
      const show = credit.show;
      if (show.deletedAt || show.status !== 'PUBLISHED') continue;
      shows.set(show.id, {
        id: show.id,
        type: 'show',
        title: show.title,
        titleAr: show.titleAr,
        hasSourceMatch: show.hasSourceMatch ?? null,
        poster: mapImagesToArtwork(show.images).poster ?? null,
        rating: show.rating === null ? null : Number(show.rating),
        releaseDate: show.releaseDate ? show.releaseDate.toISOString() : null,
      });
    }

    const filmography = [...movies.values(), ...shows.values()].sort((a, b) =>
      (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''),
    );

    return {
      id: person.id,
      name: person.name,
      photo: person.photo,
      birthday: person.birthday ? person.birthday.toISOString() : null,
      deathday: person.deathday ? person.deathday.toISOString() : null,
      biography: person.biography,
      biographyAr: person.biographyAr,
      placeOfBirth: person.placeOfBirth,
      filmography,
    };
  }
}
