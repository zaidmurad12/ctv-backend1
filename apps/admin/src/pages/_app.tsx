import type { AppProps } from 'next/app';
import Head from 'next/head';
import { AuthProvider } from '../context/AuthContext';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>CTV Admin</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div dir="rtl" lang="ar" className="min-h-screen bg-black text-white">
        <AuthProvider>
          <Component {...pageProps} />
        </AuthProvider>
      </div>
    </>
  );
}
