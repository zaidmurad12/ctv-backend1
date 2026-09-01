import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider } from '../context/AuthContext';
import { LocaleProvider, useLocale } from '../context/LocaleContext';
import '../styles/globals.css';

function LocalizedShell({ children }: { readonly children: React.ReactNode }) {
  const { locale, dir } = useLocale();
  return (
    <div dir={dir} lang={locale} className="min-h-screen bg-black text-white">
      {children}
    </div>
  );
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>CTV — Watch</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <LocaleProvider>
        <LocalizedShell>
          <AuthProvider>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={router.pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                <Component {...pageProps} />
              </motion.div>
            </AnimatePresence>
          </AuthProvider>
        </LocalizedShell>
      </LocaleProvider>
    </>
  );
}
