import type { FormEvent } from 'react';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clapperboard, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { ApiError } from '../lib/apiError';

export default function LoginPage() {
  const { login } = useAuth();
  const { t, toggleLocale } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('login.error'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-7 p-6 bg-black relative">
      <button
        type="button"
        onClick={toggleLocale}
        title={t('nav.language')}
        className="absolute top-5 end-5 inline-flex items-center justify-center w-9 h-9 rounded-full border border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white transition-colors"
      >
        <Globe size={16} />
      </button>

      <motion.div
        className="inline-flex items-center gap-2.5 text-2xl font-black"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="inline-flex items-center justify-center w-[38px] h-[38px] rounded-[10px] bg-white text-black">
          <Clapperboard size={20} />
        </span>
        {t('brand.name')}
      </motion.div>
      <motion.form
        className="w-[340px] flex flex-col gap-4 bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-9 shadow-2xl"
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      >
        <h1 className="text-xl font-black">{t('login.welcome')}</h1>
        <p className="-mt-2 text-sm text-zinc-500">{t('login.subtitle')}</p>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-400">
          {t('login.email')}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="px-3.5 py-2.5 rounded-lg border border-zinc-800 bg-black text-white text-sm focus:outline-none focus:border-white transition-colors"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-400">
          {t('login.password')}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="px-3.5 py-2.5 rounded-lg border border-zinc-800 bg-black text-white text-sm focus:outline-none focus:border-white transition-colors"
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 py-3 rounded-lg bg-white text-black font-bold text-sm disabled:opacity-60 disabled:cursor-default hover:bg-zinc-200 transition-colors"
        >
          {isSubmitting ? t('login.signingIn') : t('login.signIn')}
        </button>
      </motion.form>
    </div>
  );
}
