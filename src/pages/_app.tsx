"use client";
import "../styles/globals.css";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import FixedControls from "@/components/layout/FixedControls";
import ThemeSync from "@/components/hydrators/ThemeSync";
import VotesHydrator from "@/components/hydrators/VotesHydrator";
import FXHydrator from "@/components/hydrators/FXHydrator";
import Head from "next/head";
import type { AppProps } from "next/app";
import { IntlProvider } from "@/providers/IntlProvider";
import { Lato, Nunito_Sans } from 'next/font/google';

const lato = Lato({
  subsets: ['latin'],
  weight: ['300', '400', '700', '900'],
  variable: '--font-heading',
  display: 'swap',
});

const nunito = Nunito_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="google-site-verification" content="h5z6Ra99x78ektZLUE6YlghVddCXyhdjxf3fMaHSLiw" />
      </Head>
      <style jsx global>{`
        :root {
          --font-heading: ${lato.style.fontFamily};
          --font-body: ${nunito.style.fontFamily};
        }
      `}</style>

      <ThemeSync />
      <VotesHydrator />
      <FXHydrator />
      <IntlProvider>
        <Component {...pageProps} />
        {/* Place FixedControls inside the IntlProvider so useTranslations has context */}
        <FixedControls />
      </IntlProvider>
    </>
  );
}
