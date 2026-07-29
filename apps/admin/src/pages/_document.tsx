import * as React from 'react';
import type { ComponentType } from 'react';
import Document, {
  Head,
  Html,
  Main,
  NextScript,
  type DocumentContext,
  type DocumentInitialProps,
} from 'next/document';
import createEmotionServer from '@emotion/server/create-instance';
import type { EmotionCache } from '@emotion/cache';
import createEmotionCache from '../lib/createEmotionCache';

interface EmotionCacheProps {
  readonly emotionCache?: EmotionCache;
}

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          <meta charSet="utf-8" />
          <link rel="icon" href="data:," />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

MyDocument.getInitialProps = async (ctx: DocumentContext): Promise<DocumentInitialProps> => {
  const originalRenderPage = ctx.renderPage;
  const cache = createEmotionCache();
  const { extractCriticalToChunks } = createEmotionServer(cache);

  ctx.renderPage = () =>
    originalRenderPage({
      enhanceApp: (App) => {
        const AppWithEmotionCache = App as unknown as ComponentType<EmotionCacheProps>;
        return function EnhanceApp(props: EmotionCacheProps) {
          return <AppWithEmotionCache emotionCache={cache} {...props} />;
        };
      },
    });

  const initialProps = await Document.getInitialProps(ctx);
  const emotionStyles = extractCriticalToChunks(initialProps.html);
  const emotionStyleTags = emotionStyles.styles.map((style) => (
    <style
      data-emotion={`${style.key} ${style.ids.join(' ')}`}
      key={style.key}
      dangerouslySetInnerHTML={{ __html: style.css }}
    />
  ));

  return {
    ...initialProps,
    styles: [...React.Children.toArray(initialProps.styles), ...emotionStyleTags],
  };
};
