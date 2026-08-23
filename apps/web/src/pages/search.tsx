import { useRouter } from 'next/router';
import { Navbar } from '../components/Navbar';
import { useFetch } from '../hooks/useFetch';
import { searchService } from '../services/searchService';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { PosterCard } from '../components/PosterCard';

export default function SearchPage() {
  const { user } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const query = typeof router.query.q === 'string' ? router.query.q : '';
  const isReady = Boolean(user);

  const results = useFetch(
    () => (query ? searchService.search(query) : Promise.resolve([])),
    [query],
    isReady,
  );

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="px-6 md:px-10 py-8 pb-16">
        <h1 className="text-xl font-black">
          {t('search.resultsFor')} <span className="text-white">&ldquo;{query}&rdquo;</span>
        </h1>
        {results.isLoading ? (
          <p className="mt-5 text-sm text-zinc-500">{t('search.searching')}</p>
        ) : results.data && results.data.length > 0 ? (
          <div className="grid gap-5 mt-5 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
            {results.data.map((item) => (
              <PosterCard
                key={item.id}
                item={{
                  id: item.id,
                  href: item.type === 'movie' ? `/movies/${item.id}` : `/shows/${item.id}`,
                  title: item.title,
                  poster: item.poster,
                }}
              />
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-zinc-500">{t('search.noResults')}</p>
        )}
      </main>
    </div>
  );
}
