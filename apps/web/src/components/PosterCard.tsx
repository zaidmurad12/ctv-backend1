import Link from 'next/link';
import { motion } from 'framer-motion';
import { Play, Star } from 'lucide-react';
import { CINEMA_TOKENS } from '../design/tokens';

export interface PosterItem {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  readonly poster?: string | null;
  readonly rating?: number | null;
}

export const posterCardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
};

export function PosterCard({ item }: { readonly item: PosterItem }) {
  return (
    <motion.div variants={posterCardVariants} className="flex-none w-40">
      <Link href={item.href} className="block group">
        <motion.div
          className={`${CINEMA_TOKENS.card.sharpPoster} ${CINEMA_TOKENS.card.normalCard} group-hover:border-white group-hover:bg-[#0a0e1a]`}
          whileHover={{ y: -8, scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        >
          {item.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.poster}
              alt={item.title}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-full p-2 text-center text-sm text-zinc-500">
              {item.title}
            </div>
          )}
          {typeof item.rating === 'number' && (
            <span className="absolute top-2 end-2 z-10 inline-flex items-center gap-0.5 bg-black/75 text-white text-xs font-bold px-1.5 py-0.5 rounded">
              <Star size={10} className="fill-current" /> {item.rating.toFixed(1)}
            </span>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/15 border-[1.5px] border-white/60 text-white backdrop-blur-sm scale-90 group-hover:scale-100 transition-transform">
              <Play size={18} />
            </span>
          </div>
        </motion.div>
        <p className="mt-2 text-xs font-bold text-white truncate">{item.title}</p>
      </Link>
    </motion.div>
  );
}
