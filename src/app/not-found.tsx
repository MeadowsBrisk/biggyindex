import "@/styles/globals.css";

import Link from "next/link";

/**
 * ROOT 404 — the fallback that replaces Next's built-in black/white
 * "This page could not be found" default.
 *
 * It catches the traffic the locale boundaries can't:
 *   - genuinely unmatched URLs under a locale (/fr-FR/does-not-exist), which
 *     Next resolves against the ROOT tree, not [locale]/not-found.tsx
 *   - non-locale / dotted paths (/bogus.xyz) that skip the proxy matcher and
 *     never enter the locale segment at all
 *
 * Because the root layout (app/layout.tsx) is a bare pass-through, this
 * component must render its own <html>/<body>. It also renders OUTSIDE the
 * next-intl request scope (no reliable locale for /bogus.xyz), so the copy is
 * a small styled English fallback — acceptable since real localized 404s are
 * served by the per-type boundaries under [locale].
 *
 * A pre-paint script mirrors the main app's theme boot so dark-mode users
 * don't get a white flash. Next auto-adds the noindex robots tag for the
 * not-found response.
 */
const THEME_BOOT = `(function(){try{var h=document.documentElement;var d=localStorage.getItem('darkMode');var dark=d==='true'||d==='"true"'||d==='1'||d==='dark';h.setAttribute('data-theme',dark?'dark':'light');}catch(e){}})()`;

export default function RootNotFound() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="robots" content="noindex" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="antialiased bg-background text-foreground">
        <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-5 px-4 text-center">
          <span
            className="bg-clip-text text-6xl font-black leading-none tracking-tight text-transparent sm:text-7xl"
            style={{ backgroundImage: "var(--accent-gradient)" }}
            aria-hidden="true"
          >
            404
          </span>
          <h1 className="text-2xl font-bold sm:text-3xl">Page not found</h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            This page doesn&apos;t exist. Head back to BiggyIndex to browse the
            cannabis index.
          </p>
          <Link
            href="/"
            prefetch={false}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 hover:shadow-lg hover:shadow-primary/25"
          >
            Go to BiggyIndex
          </Link>
        </main>
      </body>
    </html>
  );
}
