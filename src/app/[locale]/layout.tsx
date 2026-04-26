import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { AnnouncementBannerGate } from "@/components/AnnouncementBannerGate";
import { ExchangeRateProvider } from "@/components/ExchangeRateProvider";
import { HydrationGate } from "@/components/HydrationGate";
import { ModalHost } from "@/components/ModalHost";
import { JotaiProvider } from "@/components/Providers";
import { AccentSync, PauseGifsSync } from "@/components/SettingsSync";
import { ToastHost } from "@/components/Toast";
import { type Locale, routing } from "@/i18n/routing";

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
        {/* Prevent FOUC — apply theme + accent + pauseGifs before first paint.
            Keep this before critical styles so the initial canvas is correct. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var h=document.documentElement;var d=localStorage.getItem('darkMode');var dark=d==='true'||d==='"true"'||d==='1'||d==='dark';h.setAttribute('data-theme',dark?'dark':'light');h.style.backgroundColor=dark?'#0c0f0c':'#f7f9f7';h.style.color=dark?'#e8ece8':'#1a1a1a';h.style.colorScheme=dark?'dark':'light';var a=localStorage.getItem('accentColor');if(a){a=a.replace(/"/g,'');if(a&&a!=='green')h.setAttribute('data-accent',a)}var p=localStorage.getItem('pauseGifs');if(p==='true'||p==='"true"')h.setAttribute('data-pause-gifs','true')}catch(e){}})()`,
          }}
        />
        {/* Critical inline styles — define --background/--foreground for BOTH themes.
          :root provides light defaults; [data-theme="dark"] overrides. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--background:#f7f9f7;--foreground:#1a1a1a;--muted:#5f7060;background-color:#f7f9f7;color:#1a1a1a}html[data-theme="dark"]{--background:#0c0f0c;--foreground:#e8ece8;--muted:#7f917f;background-color:#0c0f0c;color:#e8ece8;color-scheme:dark}html[data-theme="light"]{color-scheme:light}`,
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
            <ModalHost />
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
