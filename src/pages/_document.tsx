import Document, { Html, Head, Main, NextScript, DocumentContext } from 'next/document';

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps };
  }

  render() {
    // Dynamic lang: Next.js sets __NEXT_DATA__.locale from i18n config
    // Use full BCP-47 tag (en-GB, de-DE) for regional specificity
    const locale = this.props.__NEXT_DATA__?.locale || 'en-GB';

    return (
      <Html lang={locale}>
        <Head>
          {/* Removed viewport meta per Next.js recommendation; moved to _app.tsx */}
          <meta name="HandheldFriendly" content="true" />
          <meta name="MobileOptimized" content="320" />
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="icon" type="image/x-icon" sizes="32x32" href="/favicon.ico" />
          <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />
          <meta name="theme-color" content="#1a1a2e" media="(prefers-color-scheme: dark)" />
          <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
          <link rel="manifest" href="/manifest.json"></link>
          {/* Preconnect to R2 image CDN for faster LCP */}
          <link rel="preconnect" href="https://img.biggyindex.com" />
          <link rel="dns-prefetch" href="https://img.biggyindex.com" />
          <script
            dangerouslySetInnerHTML={{
              __html: `(() => { try { const ls = localStorage.getItem('darkMode'); const isDark = ls === 'true'; const root = document.documentElement; if (isDark) { root.classList.add('dark'); root.setAttribute('data-theme','dark'); root.style.setProperty('--background','#0a0a0a'); root.style.setProperty('--foreground','#ededed'); } else { root.classList.remove('dark'); root.setAttribute('data-theme','light'); root.style.setProperty('--background','#ffffff'); root.style.setProperty('--foreground','#171717'); } } catch(_) {} })();`
            }}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
