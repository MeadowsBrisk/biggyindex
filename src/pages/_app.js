"use client";
import "../app/globals.css";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import ThemeToggle from "@/components/ThemeToggle";
import ThemeSync from "@/components/ThemeSync";
import VotesHydrator from "@/components/VotesHydrator";
import FXHydrator from "@/components/FXHydrator";
import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="google-site-verification" content="h5z6Ra99x78ektZLUE6YlghVddCXyhdjxf3fMaHSLiw" />
      </Head>

      <ThemeSync />
      <VotesHydrator />
      <FXHydrator />
      <Component {...pageProps} />
      <ThemeToggle />
    </>
  );
}
