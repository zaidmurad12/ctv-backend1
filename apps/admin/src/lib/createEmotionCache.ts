import createCache from '@emotion/cache';

/** Standard MUI + Next.js Pages Router SSR wiring (avoids class-name hydration mismatches). */
export default function createEmotionCache() {
  return createCache({ key: 'css', prepend: true });
}
