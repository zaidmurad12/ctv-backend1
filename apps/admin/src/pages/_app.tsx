import type { ReactElement, ReactNode } from 'react';
import type { NextPage } from 'next';
import type { AppProps } from 'next/app';
import type { EmotionCache } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import Head from 'next/head';
import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../lib/queryClient';
import createEmotionCache from '../lib/createEmotionCache';
import { ThemeModeProvider } from '../context/ThemeModeContext';
import { NotificationProvider } from '../context/NotificationContext';
import { AuthProvider } from '../context/AuthContext';
import { AdminLayout } from '../components/layout/AdminLayout';

export type NextPageWithLayout<P = Record<string, never>> = NextPage<P> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
  emotionCache?: EmotionCache;
};

const clientSideEmotionCache = createEmotionCache();

export default function App({
  Component,
  pageProps,
  emotionCache = clientSideEmotionCache,
}: AppPropsWithLayout) {
  const [queryClient] = useState(() => createQueryClient());
  const getLayout =
    Component.getLayout ?? ((page: ReactElement) => <AdminLayout>{page}</AdminLayout>);

  return (
    <CacheProvider value={emotionCache}>
      <Head>
        <title>CTV Platform — Admin</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <QueryClientProvider client={queryClient}>
        <ThemeModeProvider>
          <NotificationProvider>
            <AuthProvider>{getLayout(<Component {...pageProps} />)}</AuthProvider>
          </NotificationProvider>
        </ThemeModeProvider>
      </QueryClientProvider>
    </CacheProvider>
  );
}
