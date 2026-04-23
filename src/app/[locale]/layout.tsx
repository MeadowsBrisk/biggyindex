import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { JotaiProvider } from "@/components/Providers";
import { HydrationGate } from "@/components/HydrationGate";
import {
  SettingsModal,
  AccentSync,
  PauseGifsSync,
} from "@/components/SettingsModal";
import { SellerModal } from "@/components/SellerModal";
import { ItemDetailOverlay } from "@/components/ItemDetailOverlay";
import { PhotoReviewModal } from "@/components/home/PhotoReviewModal";
import { ExchangeRateProvider } from "@/components/ExchangeRateProvider";
import { Basket } from "@/components/Basket";
import { AnnouncementBannerGate } from "@/components/AnnouncementBannerGate";
import { ToastHost } from "@/components/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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

  return {
    title: `${site.title} — ${site.tagline}`,
    description: site.description,
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
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        {/* Critical inline styles — define --background/--foreground for BOTH themes
            so HydrationGate's bg-[var(--background)] is always opaque.
            :root provides light defaults; [data-theme="dark"] overrides. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--background:#f7f9f7;--foreground:#1a1a1a;--muted:#5f7060;background-color:#f7f9f7;color:#1a1a1a}html[data-theme="dark"]{--background:#0c0f0c;--foreground:#e8ece8;--muted:#7f917f;background-color:#0c0f0c;color:#e8ece8}`,
          }}
        />
        {/* Prevent FOUC — apply theme + accent + pauseGifs before first paint.
            Matches food-agg pattern: defaults to light when no localStorage. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=localStorage.getItem('darkMode');var dark=d==='true'||d==='"true"';document.documentElement.setAttribute('data-theme',dark?'dark':'light');var a=localStorage.getItem('accentColor');if(a){a=a.replace(/"/g,'');if(a&&a!=='green')document.documentElement.setAttribute('data-accent',a)}var p=localStorage.getItem('pauseGifs');if(p==='true'||p==='"true"')document.documentElement.setAttribute('data-pause-gifs','true')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased bg-background">
        <NextIntlClientProvider messages={messages}>
          <JotaiProvider>
            <ExchangeRateProvider />
            <AnnouncementBannerGate locale={locale} />
            {children}
            {modal}
            <ItemDetailOverlay />
            <PhotoReviewModal />
            <Basket />
            <SettingsModal />
            <SellerModal />
            <ToastHost />
            <AccentSync />
            <PauseGifsSync />
            <HydrationGate />
          </JotaiProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
