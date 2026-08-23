import { Navbar } from '../components/Navbar';
import { SectionRow } from '../components/SectionRow';
import { HeroBanner } from '../components/HeroBanner';
import type { PosterItem } from '../components/PosterCard';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { useFetch } from '../hooks/useFetch';
import { moviesService } from '../services/moviesService';
import { showsService } from '../services/showsService';
import { favoritesService } from '../services/favoritesService';
import { continueWatchingService } from '../services/continueWatchingService';
import { historyService } from '../services/historyService';
import type {
  ContinueWatchingResponseDto,
  FavoriteResponseDto,
  HistoryResponseDto,
  MovieSummaryDto,
  ShowSummaryDto,
} from '../lib/types';

function fromMovies(items: MovieSummaryDto[] | undefined): PosterItem[] | undefined {
  return items?.map((movie) => ({
    id: movie.id,
    href: `/movies/${movie.id}`,
    title: movie.title,
    poster: movie.artwork.poster,
    rating: movie.rating,
  }));
}

function fromShows(items: ShowSummaryDto[] | undefined): PosterItem[] | undefined {
  return items?.map((show) => ({
    id: show.id,
    href: `/shows/${show.id}`,
    title: show.title,
    poster: show.artwork.poster,
    rating: show.rating,
  }));
}

function fromFavorites(items: FavoriteResponseDto[] | undefined): PosterItem[] | undefined {
  return items?.map((fav) => ({
    id: fav.id,
    href: fav.movieId ? `/movies/${fav.movieId}` : `/shows/${fav.showId}`,
    title: fav.title,
    poster: fav.poster,
  }));
}

function fromContinueWatching(
  items: ContinueWatchingResponseDto[] | undefined,
): PosterItem[] | undefined {
  return items?.map((row) => ({
    id: row.id,
    href: row.movieId ? `/movies/${row.movieId}` : `/episodes/${row.episodeId}`,
    title: row.title,
    poster: row.poster,
  }));
}

function fromHistory(items: HistoryResponseDto[] | undefined): PosterItem[] | undefined {
  return items?.map((row) => ({
    id: row.id,
    href: row.movieId ? `/movies/${row.movieId}` : `/episodes/${row.episodeId}`,
    title: row.title,
    poster: row.poster,
  }));
}

export default function HomePage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const isReady = Boolean(user);

  const latest = useFetch(() => moviesService.latest(), [], isReady);
  const trending = useFetch(() => moviesService.trending(), [], isReady);
  const popular = useFetch(() => moviesService.popular(), [], isReady);
  const topRated = useFetch(() => moviesService.topRated(), [], isReady);
  const recommended = useFetch(() => moviesService.recommended(), [], isReady);
  const latestShows = useFetch(() => showsService.latest(), [], isReady);
  const continueWatching = useFetch(() => continueWatchingService.list(), [], isReady);
  const favorites = useFetch(() => favoritesService.list(), [], isReady);
  const history = useFetch(() => historyService.list(), [], isReady);

  if (!user) {
    return null;
  }

  const featured = trending.data?.[0];

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      {featured && (
        <HeroBanner
          item={{
            href: `/movies/${featured.id}`,
            title: featured.title,
            overview: featured.overview,
            backdrop: featured.artwork.backdrop,
            year: featured.releaseDate ? new Date(featured.releaseDate).getFullYear() : undefined,
            rating: featured.rating,
          }}
        />
      )}
      <main className="pt-2 pb-16 flex flex-col gap-9">
        <SectionRow
          title={t('home.continueWatching')}
          items={fromContinueWatching(continueWatching.data)}
          isLoading={continueWatching.isLoading}
        />
        <SectionRow
          title={t('home.latest')}
          items={fromMovies(latest.data)}
          isLoading={latest.isLoading}
        />
        <SectionRow
          title={t('home.trending')}
          items={fromMovies(trending.data)}
          isLoading={trending.isLoading}
        />
        <SectionRow
          title={t('home.popular')}
          items={fromMovies(popular.data)}
          isLoading={popular.isLoading}
        />
        <SectionRow
          title={t('home.topRated')}
          items={fromMovies(topRated.data)}
          isLoading={topRated.isLoading}
        />
        <SectionRow
          title={t('home.recommended')}
          items={fromMovies(recommended.data)}
          isLoading={recommended.isLoading}
        />
        <SectionRow
          title={t('home.latestShows')}
          items={fromShows(latestShows.data)}
          isLoading={latestShows.isLoading}
        />
        <SectionRow
          title={t('home.favorites')}
          items={fromFavorites(favorites.data)}
          isLoading={favorites.isLoading}
        />
        <SectionRow
          title={t('home.history')}
          items={fromHistory(history.data)}
          isLoading={history.isLoading}
        />
      </main>
    </div>
  );
}
