import type { FormEvent } from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { Clapperboard, Globe, LogOut, Search, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';

export function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t, toggleLocale } = useLocale();
  const [query, setQuery] = useState('');

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length >= 2) {
      void router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <motion.header
      className="flex items-center gap-7 px-6 md:px-10 py-3.5 bg-black/72 backdrop-blur-xl border-b border-white/10 sticky top-0 z-30"
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href="/"
        className="inline-flex items-center gap-2 font-black text-lg tracking-wide shrink-0"
      >
        <motion.span
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white text-black"
          whileHover={{ scale: 1.08, rotate: -4 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        >
          <Clapperboard size={16} />
        </motion.span>
        {t('brand.name')}
      </Link>
      <nav className="flex items-center gap-5">
        <Link
          href="/"
          className={`text-sm font-semibold pb-1.5 border-b-2 transition-colors ${
            router.pathname === '/'
              ? 'text-white border-white'
              : 'text-zinc-400 border-transparent hover:text-white'
          }`}
        >
          {t('nav.home')}
        </Link>
      </nav>
      <form className="flex-1 max-w-sm ms-auto" onSubmit={handleSearch}>
        <div className="relative flex items-center">
          <Search className="absolute start-3.5 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input
            type="search"
            placeholder={t('nav.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full ps-9 pe-3.5 py-2 rounded-full border border-zinc-800 bg-[#14161f] text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
          />
        </div>
      </form>
      <div className="flex items-center gap-3 text-zinc-400 shrink-0">
        <button
          type="button"
          onClick={toggleLocale}
          title={t('nav.language')}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-zinc-800 hover:bg-zinc-900 hover:text-white hover:border-zinc-700 transition-colors"
        >
          <Globe size={16} />
        </button>
        {user && (
          <>
            <Link
              href="/settings"
              title={t('nav.settings')}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-zinc-800 hover:bg-zinc-900 hover:text-white hover:border-zinc-700 transition-colors"
            >
              <Settings size={16} />
            </Link>
            <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-full bg-[#191c26] border border-zinc-700 text-white font-bold text-sm uppercase">
              {user.username.charAt(0)}
            </span>
            <span className="hidden md:inline text-sm text-zinc-400">{user.username}</span>
          </>
        )}
        <button
          type="button"
          className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-zinc-800 hover:bg-zinc-900 hover:text-white hover:border-zinc-700 transition-colors"
          onClick={() => void logout()}
          title={t('nav.logout')}
        >
          <LogOut size={16} />
        </button>
      </div>
    </motion.header>
  );
}
