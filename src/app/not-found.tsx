import "@/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { getTranslations } from "next-intl/server";
import { FlagFontPolyfill } from "@/components/FlagFontPolyfill";
import { IntlClientProvider } from "@/components/IntlClientProvider";
import { MarketHydrate } from "@/components/MarketHydrate";
import { ModalHost } from "@/components/ModalHost";
import {
  NotFoundPrimaryLink,
  NotFoundSecondaryLink,
  NotFoundView,
} from "@/components/NotFoundView";
import { JotaiProvider } from "@/components/Providers";
import { ToastHost } from "@/components/Toast";
import { pickMessages } from "@/i18n/client-messages";
import { defaultLocale, type Locale } from "@/i18n/routing";
import { localeToMarket } from "@/lib/market/market";

/**
 * Root 404 — unknown paths resolve against the root tree, not [locale], and
 * this is the one 404 surface that answers with a real 404 status (routes that
 * throw notFound() flush a prerendered shell first). The root layout is a bare
 * pass-through, so this component owns <html>/<body> and re-creates the slice
 * of the locale layout the shared chrome needs; copy is the default locale's.
 * A pre-paint script mirrors the app's theme boot to avoid a white flash.
 */
const THEME_BOOT = `(function(){try{var h=document.documentElement;var d=localStorage.getItem('darkMode');var dark=d==='true'||d==='"true"'||d==='1'||d==='dark';h.setAttribute('data-theme',dark?'dark':'light');}catch(e){}})()`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

/**
 * Title/robots for the 404 response. Declared as metadata rather than a hand
 * written <title> so the tag survives whichever head Next builds for this
 * route, and so the copy still comes from the message catalogue.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({
    locale: defaultLocale,
    namespace: "notFound.generic",
  });

  return {
    title: `${t("title")} | BiggyIndex`,
    description: t("description"),
    robots: { index: false, follow: true },
  };
}

export default async function RootNotFound() {
  const locale: Locale = defaultLocale;
  const t = await getTranslations({ locale, namespace: "notFound.generic" });
  const tCta = await getTranslations({ locale, namespace: "notFound.cta" });
  const messages = (await import(`@/messages/${locale}/index.json`)).default;

  return (
    <html
      lang={locale.split("-")[0]}
      suppressHydrationWarning
      className={`${geistSans.variable} antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="antialiased bg-background text-foreground">
        <IntlClientProvider locale={locale} messages={pickMessages(messages)}>
          <JotaiProvider>
            <MarketHydrate market={localeToMarket(locale)} />
            <NotFoundView title={t("title")} description={t("description")}>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <NotFoundPrimaryLink href="/browse">
                  {tCta("browse")}
                </NotFoundPrimaryLink>
                <NotFoundSecondaryLink href="/sellers">
                  {tCta("sellers")}
                </NotFoundSecondaryLink>
                <NotFoundSecondaryLink href="/prices">
                  {tCta("prices")}
                </NotFoundSecondaryLink>
              </div>
            </NotFoundView>
            {/* The header's settings/basket controls open into these; without
                them the chrome would render buttons that do nothing. The flag
                polyfill keeps the market chip a flag on Windows. */}
            <ModalHost />
            <ToastHost />
            <FlagFontPolyfill />
          </JotaiProvider>
        </IntlClientProvider>
      </body>
    </html>
  );
}
