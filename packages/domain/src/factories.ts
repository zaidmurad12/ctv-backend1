import { Episode, Movie, Season, TVShow } from './entities/content.js';

export class MovieFactory {
  static create(props: { id: string; title: string; overview?: string | null; runtimeMinutes?: number | null; rating?: number | null; trailerUrl?: string | null }): Movie {
    return Movie.create(props);
  }
}

export class TVShowFactory {
  static create(props: { id: string; title: string; overview?: string | null }): TVShow {
    return TVShow.create(props);
  }
}

export class SeasonFactory {
  static create(props: { id: string; showId: string; seasonNumber: number; title?: string | null; overview?: string | null }): Season {
    return Season.create(props);
  }
}

export class EpisodeFactory {
  static create(props: { id: string; seasonId: string; episodeNumber: number; title: string; overview?: string | null; runtimeMinutes?: number | null }): Episode {
    return Episode.create(props);
  }
}
