import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { AnnouncementBannerGate } from "@/components/AnnouncementBannerGate";
import { ExchangeRateProvider } from "@/components/ExchangeRateProvider";
import { FlagFontPolyfill } from "@/components/FlagFontPolyfill";
import { HydrationGate } from "@/components/HydrationGate";
import { IntlClientProvider } from "@/components/IntlClientProvider";
import { MarketHydrate } from "@/components/MarketHydrate";
import { ModalHost } from "@/components/ModalHost";
import { JotaiProvider } from "@/components/Providers";
import { RouterRefreshOnReturn } from "@/components/RouterRefreshOnReturn";
import { ScrollToTopButton } from "@/components/ScrollToTopButton";
import { SeedParamsScript } from "@/components/SeedParamsScript";
import { AccentSync, PauseGifsSync } from "@/components/SettingsSync";
import { ToastHost } from "@/components/Toast";
import { pickMessages } from "@/i18n/client-messages";
import { type Locale, routing } from "@/i18n/routing";
import { computeCustomAccentVars } from "@/lib/accent";
import { IMAGE_CDN_ORIGIN } from "@/lib/images";
import { localeToMarket } from "@/lib/market/market";
import { marketBaseUrl, SITE_ICONS } from "@/lib/seo/metadata";

/**
 * Pre-hydration boot script — runs synchronously before first paint on every
 * hard load so nothing visibly snaps once React hydrates. Each piece stamps
 * the EXACT attribute/class/inline-style its post-hydration counterpart
 * re-applies, making hydration a visual no-op:
 *   - darkMode        → html[data-theme] + bg/fg/color-scheme (ThemeToggle)
 *   - accentColor     → html[data-accent] for the named accents (AccentSync)
 *   - customAccentHex → --primary/--accent/--accent-gradient/
 *                       --primary-foreground inline vars, computed by the
 *                       SAME shared function AccentSync uses
 *                       (lib/accent.ts, embedded via toString for parity)
 *   - pauseGifs       → html[data-pause-gifs] (PauseGifsSync)
 *   - filterPanelOpen → html.bi-panel-open, which reveals the browse
 *                       sidebar's SSR'd 280px skeleton placeholder
 *                       (FilterPanel removes the class in the same commit
 *                       its hydrated panel first takes its real width)
 * Storage keys/defaults must track store/atoms.ts (atomWithStorage
 * JSON-encodes values, hence the '"true"'/quote-stripping tolerance).
 */
const BOOT_SCRIPT = `(function(){try{var h=document.documentElement;var d=localStorage.getItem('darkMode');var dark=d==='true'||d==='"true"'||d==='1'||d==='dark';h.setAttribute('data-theme',dark?'dark':'light');h.style.backgroundColor=dark?'#0c0f0c':'#f7f9f7';h.style.color=dark?'#e8ece8':'#1a1a1a';h.style.colorScheme=dark?'dark':'light';var a=localStorage.getItem('accentColor');if(a){a=a.replace(/"/g,'');if(a==='custom'){var x=localStorage.getItem('customAccentHex');x=x?x.replace(/"/g,''):'#6366f1';if(/^#[0-9a-fA-F]{6}$/.test(x)){var v=(${computeCustomAccentVars.toString()})(x,dark);h.style.setProperty('--primary',v.primary);h.style.setProperty('--accent',v.accent);h.style.setProperty('--accent-gradient',v.gradient);h.style.setProperty('--primary-foreground',v.foreground)}}else if(a!=='green'){h.setAttribute('data-accent',a)}}var p=localStorage.getItem('pauseGifs');if(p==='true'||p==='"true"')h.setAttribute('data-pause-gifs','true');var f=localStorage.getItem('filterPanelOpen');if(f==='true'||f==='"true"')h.classList.add('bi-panel-open')}catch(e){}})()`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

/** Load messages for a specific locale (no request context needed). */
async function loadMessages(locale: Locale) {
  return (await import(`@/messages/${locale}/index.json`)).default;
}

/** Generate static params for all locales so layout can be prerendered. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};

  const messages = await loadMessages(locale as Locale);
  const site = messages.site;
  const market = localeToMarket(locale);

  return {
    metadataBase: new URL(marketBaseUrl(market)),
    applicationName: site.title,
    title: `${site.title} | ${site.tagline}`,
    description: site.description,
    // Re-declared here (not just on the root layout): a child segment's
    // `icons` replaces the parent's, so omitting it would blank the tab icon
    // for every page under [locale]. See SITE_ICONS for the full rationale.
    icons: SITE_ICONS,
  };
}

export default async function LocaleLayout({
  children,
  modal,
  params,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering for this locale
  setRequestLocale(locale);

  const messages = await loadMessages(locale as Locale);
  const lang = locale.split("-")[0];

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${geistSans.variable} antialiased`}
    >
      <head>
        {/* Warm up the image CDN connection before the first card thumbnails
            are requested — saves DNS+TCP+TLS (~100-300ms) on the LCP image.
            No crossOrigin: images are plain <img> (no-cors) requests. */}
        <link rel="preconnect" href={IMAGE_CDN_ORIGIN} />
        <link rel="dns-prefetch" href={IMAGE_CDN_ORIGIN} />
        {/* Prevent FOUC — apply theme + accent (incl. custom) + pauseGifs +
            the browse sidebar placeholder before first paint. See BOOT_SCRIPT
            above. Keep this before critical styles so the initial canvas is
            correct. */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        {/* Seed-grid guard for /browse — must live HERE (layout, hard loads
            only), not in the page tree: React never executes inline scripts
            re-rendered during client navigation and warns about them.
            SeedParamsSync (browse page) covers client navs. */}
        <SeedParamsScript />
        {/* Critical inline styles — define --background/--foreground for BOTH themes.
          :root provides light defaults; [data-theme="dark"] overrides. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--background:#f7f9f7;--foreground:#1a1a1a;--muted:#5f7060;background-color:#f7f9f7;color:#1a1a1a}html[data-theme="dark"]{--background:#0c0f0c;--foreground:#e8ece8;--muted:#7f917f;background-color:#0c0f0c;color:#e8ece8;color-scheme:dark}html[data-theme="light"]{color-scheme:light}`,
          }}
        />
      </head>
      <body className="antialiased bg-background">
        {/* Only ship the namespaces CLIENT components consume — Server
            Components read the full catalog via getTranslations. Adding a
            client useTranslations namespace requires listing it in
            CLIENT_NAMESPACES (src/i18n/client-messages.ts). */}
        <IntlClientProvider locale={locale} messages={pickMessages(messages)}>
          <JotaiProvider>
            {/* Seed marketAtom from the host-pinned locale BEFORE first
                render so the dropdown / currency / shipping logic never
                see the GB default on a non-GB host. Must be the first
                child of JotaiProvider — useHydrateAtoms only sets the
                value once per Provider scope. */}
            <MarketHydrate market={localeToMarket(locale)} />
            <ExchangeRateProvider />
            <AnnouncementBannerGate locale={locale} />
            {children}
            {modal}
            <ModalHost />
            <ToastHost />
            <AccentSync />
            <PauseGifsSync />
            <FlagFontPolyfill />
            <ScrollToTopButton />
            <RouterRefreshOnReturn />
            <HydrationGate />
          </JotaiProvider>
        </IntlClientProvider>
      </body>
    </html>
  );
}
