import { motion } from 'framer-motion';
import { PosterCard, type PosterItem } from './PosterCard';
import { useLocale } from '../context/LocaleContext';

interface SectionRowProps {
  readonly title: string;
  readonly items: readonly PosterItem[] | undefined;
  readonly isLoading: boolean;
}

const trackVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

export function SectionRow({ title, items, isLoading }: SectionRowProps) {
  const { t } = useLocale();
  return (
    <section className="px-6 md:px-10">
      <h2 className="mb-3.5 text-base font-black flex items-center gap-2.5">
        <span className="inline-block w-1 h-4 rounded-sm bg-white" />
        {title}
      </h2>
      {isLoading ? (
        <p className="text-sm text-zinc-500">{t('section.loading')}</p>
      ) : items && items.length > 0 ? (
        <motion.div
          className="flex gap-4 overflow-x-auto pb-3 px-1 -mx-1"
          initial="hidden"
          animate="visible"
          variants={trackVariants}
        >
          {items.map((item) => (
            <PosterCard key={item.id} item={item} />
          ))}
        </motion.div>
      ) : (
        <p className="text-sm text-zinc-500">{t('section.empty')}</p>
      )}
    </section>
  );
}
