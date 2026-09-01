import { motion } from 'framer-motion';
import { Info, Play, Star } from 'lucide-react';
import { TVLinkButton } from './TVButton';
import { useLocale } from '../context/LocaleContext';

export interface HeroItem {
  readonly href: string;
  readonly title: string;
  readonly overview?: string | null;
  readonly backdrop?: string | null;
  readonly year?: number | null;
  readonly rating?: number | null;
  readonly genres?: readonly string[];
  readonly badge?: string;
}

const heroVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

export function HeroBanner({ item }: { readonly item: HeroItem }) {
  const { t } = useLocale();
  return (
    <section
      className="relative w-full h-[450px] overflow-hidden bg-black text-white border-b border-zinc-800 bg-cover bg-top"
      style={item.backdrop ? { backgroundImage: `url(${item.backdrop})` } : undefined}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r rtl:bg-gradient-to-l from-black via-black/60 to-transparent" />

      <motion.div
        className="relative z-10 p-8 md:p-12 h-full flex flex-col justify-end max-w-2xl gap-3"
        initial="hidden"
        animate="visible"
        variants={heroVariants}
      >
        <motion.span
          className="self-start px-2 py-0.5 bg-white text-black text-xs font-black uppercase rounded-sm"
          variants={itemVariants}
        >
          {item.badge ?? t('hero.badge')}
        </motion.span>
        <motion.h1
          className="text-4xl md:text-5xl font-black tracking-tight [text-shadow:0_4px_20px_rgba(0,0,0,0.5)]"
          variants={itemVariants}
        >
          {item.title}
        </motion.h1>
        <motion.div
          className="flex items-center gap-2.5 text-sm font-semibold text-zinc-300"
          variants={itemVariants}
        >
          {typeof item.rating === 'number' && (
            <span className="flex items-center gap-1 text-white font-bold">
              <Star size={13} className="fill-current" /> {item.rating.toFixed(1)}
            </span>
          )}
          {item.year && <span>{item.year}</span>}
          {item.genres && item.genres.length > 0 && (
            <>
              <span className="w-1 h-1 rounded-full bg-zinc-500" />
              <span>{item.genres.slice(0, 3).join(' · ')}</span>
            </>
          )}
        </motion.div>
        {item.overview && (
          <motion.p
            className="text-sm text-zinc-300 line-clamp-2 leading-relaxed"
            variants={itemVariants}
          >
            {item.overview}
          </motion.p>
        )}
        <motion.div className="flex items-center gap-3 mt-2" variants={itemVariants}>
          <TVLinkButton
            href={item.href}
            variant="primary"
            icon={<Play size={16} className="fill-current" />}
          >
            {t('hero.play')}
          </TVLinkButton>
          <TVLinkButton href={item.href} variant="secondary" icon={<Info size={16} />}>
            {t('hero.moreInfo')}
          </TVLinkButton>
        </motion.div>
      </motion.div>
    </section>
  );
}
