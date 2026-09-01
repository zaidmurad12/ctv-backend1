import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Heart, Play, Star, Users } from 'lucide-react';
import { Navbar } from '../../components/Navbar';
import { VideoPlayer } from '../../components/VideoPlayer';
import { TVButton } from '../../components/TVButton';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { moviesService } from '../../services/moviesService';
import { favoritesService } from '../../services/favoritesService';

const EASE = [0.16, 1, 0.3, 1] as const;

const infoVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

export default function MovieDetailPage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const isReady = Boolean(user && id);

  const movie = useFetch(
    () => (id ? moviesService.getById(id) : Promise.reject(new Error('missing id'))),
    [id],
    isReady,
  );
  const favorites = useFetch(() => favoritesService.list(), [], isReady);
  const [pendingFavorite, setPendingFavorite] = useState(false);

  if (!user || !id) {
    return null;
  }

  const existingFavorite = favorites.data?.find((favorite) => favorite.movieId === id);

  async function toggleFavorite() {
    if (!id) return;
    setPendingFavorite(true);
    try {
      if (existingFavorite) {
        await favoritesService.remove(existingFavorite.id);
      } else {
        await favoritesService.add({ movieId: id });
      }
      await favorites.refetch?.();
    } finally {
      setPendingFavorite(false);
    }
  }

  if (movie.isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex items-center justify-center text-zinc-500">
          {t('detail.loading')}
        </main>
      </div>
    );
  }

  if (!movie.data) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 flex items-center justify-center text-zinc-500">
          {t('detail.movieNotFound')}
        </main>
      </div>
    );
  }

  const data = movie.data;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main
        className="flex-1 bg-cover bg-top bg-[#0c0e14]"
        style={
          data.artwork.backdrop ? { backgroundImage: `url(${data.artwork.backdrop})` } : undefined
        }
      >
        <div className="min-h-full bg-gradient-to-b from-black/35 via-black/85 to-black">
          <div className="max-w-[1100px] mx-auto px-6 md:px-10 pt-6 pb-[88px] flex flex-col gap-10">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={14} /> {t('detail.back')}
            </Link>

            <div className="flex flex-col-reverse md:flex-row gap-8 items-center md:items-start pt-6">
              <motion.div
                className="flex-1 min-w-0 flex flex-col gap-3"
                initial="hidden"
                animate="visible"
                variants={infoVariants}
              >
                {data.streams.length > 0 && (
                  <motion.span
                    className="self-start px-2.5 py-1 rounded-full border border-zinc-700 bg-[#14161f] text-[11px] font-bold uppercase tracking-wide text-zinc-300"
                    variants={itemVariants}
                  >
                    {t('detail.availableNow')}
                  </motion.span>
                )}
                {data.artwork.logo ? (
                  <>
                    <motion.img
                      src={data.artwork.logo}
                      alt={data.title}
                      variants={itemVariants}
                      className="max-w-[420px] w-full h-auto self-start object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
                    />
                    <motion.p
                      className="text-lg font-semibold text-zinc-400"
                      variants={itemVariants}
                    >
                      {data.title}
                    </motion.p>
                  </>
                ) : (
                  <motion.h1
                    className="text-3xl md:text-4xl font-black leading-tight"
                    variants={itemVariants}
                  >
                    {data.title}
                  </motion.h1>
                )}
                {data.titleAr && (
                  <motion.h2
                    className="text-lg font-medium text-zinc-400"
                    dir="rtl"
                    variants={itemVariants}
                  >
                    {data.titleAr}
                  </motion.h2>
                )}
                <motion.div
                  className="flex items-center gap-2.5 text-sm font-semibold text-zinc-300"
                  variants={itemVariants}
                >
                  <span className="w-1 h-1 rounded-full bg-zinc-500" />
                  <span>{t('detail.typeMovie')}</span>
                  {data.genres.length > 0 && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-zinc-500" />
                      <span>{data.genres.join(' · ')}</span>
                    </>
                  )}
                </motion.div>
                {data.tagline && (
                  <motion.p className="italic text-zinc-400" variants={itemVariants}>
                    {data.tagline}
                  </motion.p>
                )}
                <motion.p
                  className="text-zinc-300 leading-relaxed max-w-2xl"
                  variants={itemVariants}
                >
                  {data.overview}
                </motion.p>

                <motion.div
                  className="flex items-center gap-2.5 flex-wrap text-sm font-semibold text-zinc-300"
                  variants={itemVariants}
                >
                  {data.releaseDate && <span>{new Date(data.releaseDate).getFullYear()}</span>}
                  {typeof data.rating === 'number' && (
                    <span className="flex items-center gap-1 text-white font-black">
                      <Star size={13} className="fill-current" /> {data.rating.toFixed(1)}
                    </span>
                  )}
                  {data.runtime && (
                    <span>
                      {data.runtime} {t('detail.minutes')}
                    </span>
                  )}
                  {data.streams.find((stream) => stream.isDefault)?.quality && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#191c26] border border-zinc-700 text-xs font-bold uppercase text-zinc-300">
                      {data.streams.find((stream) => stream.isDefault)?.quality}
                    </span>
                  )}
                </motion.div>

                <motion.div
                  className="flex items-center gap-3 flex-wrap mt-1.5"
                  variants={itemVariants}
                >
                  <a href="#player">
                    <TVButton variant="primary" icon={<Play size={16} className="fill-current" />}>
                      {t('detail.play')}
                    </TVButton>
                  </a>
                  <TVButton
                    variant="secondary"
                    icon={<Heart size={16} className={existingFavorite ? 'fill-current' : ''} />}
                    onClick={() => void toggleFavorite()}
                    disabled={pendingFavorite}
                  >
                    {existingFavorite ? t('detail.removeFavorite') : t('detail.addFavorite')}
                  </TVButton>
                </motion.div>
              </motion.div>
              <motion.div
                className="w-[210px] aspect-[2/3] rounded-2xl overflow-hidden shrink-0 bg-[#14161f] border border-white/10 shadow-2xl"
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                {data.artwork.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.artwork.poster}
                    alt={data.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full p-3 text-center text-sm text-zinc-500">
                    {data.title}
                  </div>
                )}
              </motion.div>
            </div>

            <motion.section
              id="player"
              className="bg-[#14161f] border border-zinc-800 rounded-2xl p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE, delay: 0.3 }}
            >
              <h3 className="mb-3.5 text-base font-black">{t('detail.watchNow')}</h3>
              <VideoPlayer movieId={id} streams={data.streams} subtitles={data.subtitles} />
            </motion.section>

            {(data.director || data.cast.length > 0) && (
              <motion.section
                className="border-t border-zinc-800 pt-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE, delay: 0.4 }}
              >
                <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-400">
                  <Users size={14} /> {t('detail.castAndFilmmakers')}
                </h3>
                <div className="flex gap-[18px] overflow-x-auto pb-2">
                  {data.director && (
                    <div className="flex-none w-[92px] text-center text-xs">
                      <div className="w-20 h-20 rounded-full bg-[#191c26] border-2 border-zinc-700 mx-auto flex items-center justify-center text-lg font-bold">
                        {data.director.charAt(0)}
                      </div>
                      <p className="mt-2 font-semibold text-white truncate">{data.director}</p>
                      <p className="text-zinc-500 text-[10px] uppercase tracking-wide">
                        {t('detail.director')}
                      </p>
                    </div>
                  )}
                  {data.cast.map((member, index) => (
                    <div
                      key={`${member.name}-${index}`}
                      className="flex-none w-[92px] text-center text-xs"
                    >
                      {member.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={member.photo}
                          alt={member.name}
                          className="w-20 h-20 rounded-full object-cover border-2 border-zinc-700 mx-auto hover:border-white transition-colors"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-[#191c26] border-2 border-zinc-700 mx-auto flex items-center justify-center text-lg font-bold">
                          {member.name.charAt(0)}
                        </div>
                      )}
                      <p className="mt-2 font-semibold text-white truncate">{member.name}</p>
                      {member.character && (
                        <p className="text-zinc-500 text-[10px] truncate">{member.character}</p>
                      )}
                    </div>
                  ))}
                </div>
              </motion.section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
