import Document, { Html, Head, Main, NextScript, DocumentContext } from 'next/document';

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx);
    return { ...initialProps };
  }

  render() {
    return (
      <Html lang="en">
        <Head>
          {/* Removed viewport meta per Next.js recommendation; moved to _app.tsx */}
          <meta name="HandheldFriendly" content="true" />
          <meta name="MobileOptimized" content="320" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&family=Nunito+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
          <script
            dangerouslySetInnerHTML={{
              __html: `(() => { try { const ls = localStorage.getItem('darkMode'); let isDark = ls === 'true'; if (ls == null) { isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; } const root = document.documentElement; if (isDark) { root.classList.add('dark'); root.setAttribute('data-theme','dark'); root.style.setProperty('--background','#0a0a0a'); root.style.setProperty('--foreground','#ededed'); } else { root.classList.remove('dark'); root.setAttribute('data-theme','light'); root.style.setProperty('--background','#ffffff'); root.style.setProperty('--foreground','#171717'); } } catch(_) {} })();`
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
