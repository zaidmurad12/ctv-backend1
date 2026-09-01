import { useRouter } from 'next/router';
import { Navbar } from '../../components/Navbar';
import { VideoPlayer } from '../../components/VideoPlayer';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { episodesService } from '../../services/episodesService';

export default function EpisodeDetailPage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const isReady = Boolean(user && id);

  const episode = useFetch(
    () => (id ? episodesService.getById(id) : Promise.reject(new Error('missing id'))),
    [id],
    isReady,
  );

  if (!user || !id) {
    return null;
  }

  if (episode.isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex items-center justify-center text-zinc-500">
          {t('detail.loading')}
        </main>
      </div>
    );
  }

  if (!episode.data) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex items-center justify-center text-zinc-500">
          {t('detail.episodeNotFound')}
        </main>
      </div>
    );
  }

  const data = episode.data;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-8 flex flex-col gap-4">
          <span className="self-start px-2 py-0.5 bg-white text-black text-xs font-black uppercase rounded-sm">
            {t('detail.episode')} {data.episodeNumber}
          </span>
          <h1 className="text-3xl font-black leading-tight">{data.title}</h1>
          {data.runtime && (
            <p className="text-sm font-semibold text-zinc-400">
              {data.runtime} {t('detail.minutes')}
            </p>
          )}
          <p className="text-zinc-300 leading-relaxed max-w-2xl">{data.overview}</p>

          <VideoPlayer episodeId={id} streams={data.streams} subtitles={data.subtitles} />
        </div>
      </main>
    </div>
  );
}
