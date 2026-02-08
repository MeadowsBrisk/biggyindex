"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAtom } from "jotai";
import { RedditIcon } from "@/components/common/icons";
import ChevronDown from "@/components/common/icons/ChevronDown";
import { EMBASSY_LINKS } from "@/lib/market/embassyLinks";
import { LOCALE_LINKS } from "@/lib/market/localeLinks";
import { useLocale } from "@/providers/IntlProvider";
import { darkModeAtom } from "@/store/atoms";
import { useFormatter, useTranslations } from "next-intl";

interface IndexFooterProps {
  lastCrawlTime?: string | number | null;
}

export default function IndexFooter({ lastCrawlTime }: IndexFooterProps): ReactElement {
  const t = useTranslations("IndexFooter");
  const tTheme = useTranslations("Theme");
  const { locale } = useLocale();
  const format = useFormatter();
  const year = new Date().getFullYear();
  const [darkMode, setDarkMode] = useAtom(darkModeAtom);
  const footerRef = useRef<HTMLElement>(null);

  // Determine locale prefix for embassy link lookup (e.g. "fr-FR" → "fr")
  const localePrefix = (locale || "en-GB").split("-")[0].toLowerCase();
  const embassyUrl = EMBASSY_LINKS[localePrefix];
  const isEnglish = localePrefix === "en";

  const formattedLastCrawl = (() => {
    if (!lastCrawlTime) return null;
    const d = new Date(lastCrawlTime);
    if (Number.isNaN(d.getTime())) return null;
    return format.dateTime(d, { dateStyle: "short", timeStyle: "medium" });
  })();

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Set data attribute on <html> so FixedControls can auto-hide when footer is visible
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        document.documentElement.dataset.footerVisible = entry.isIntersecting ? "true" : "false";
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      delete document.documentElement.dataset.footerVisible;
    };
  }, []);

  return (
    <footer ref={footerRef} className="mt-12 border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
      {/* Community + Embassy row */}
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-2">
          {/* Community */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              {t("community.label")}
            </h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 max-w-xs">
              {t("community.text")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="https://www.reddit.com/r/LittleBiggy/"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500"
              >
                <RedditIcon className="h-5 w-5 text-orange-500" />
                <span>{t("community.reddit")}</span>
              </Link>
              <Link
                href="https://littlebiggy.net/wall"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500"
                title={t("community.wallTitle")}
              >
                <span className="font-mono text-base font-semibold leading-none">{"{ }"}</span>
                <span>{t("community.wall")}</span>
              </Link>
            </div>
          </div>

          {/* Embassy – only for non-English locales with a guide */}
          {!isEnglish && embassyUrl && (
            <div className="space-y-3 rounded-2xl border border-emerald-200/60 bg-emerald-50/60 p-5 shadow-sm dark:border-emerald-800/40 dark:bg-emerald-950/20">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
                {t("embassy.label")}
              </h3>
              <p className="text-sm leading-relaxed text-emerald-800/80 dark:text-emerald-300/80 max-w-xs">
                {t("embassy.text")}
              </p>
              <Link
                href={embassyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 hover:shadow-md"
              >
                {t("embassy.cta")}
                <span aria-hidden>→</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* FAQ Section */}
      <FaqSection t={t} />

      {/* Language selector row */}
      <div className="border-t border-slate-200 px-6 py-5 dark:border-slate-700">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            {t("languages.label")}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {LOCALE_LINKS.map(({ code, href, label, Flag }) => (
              <a
                key={code}
                href={href}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-500"
                hrefLang={code}
              >
                <Flag className="h-4 w-4 rounded-sm" />
                <span>{label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar — copyright + theme toggle + back to top */}
      <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-700">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          {/* Left: copyright + metadata */}
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span>{t("meta.copyright", { year })}</span>
            {formattedLastCrawl && (
              <time dateTime={new Date(lastCrawlTime!).toISOString()} className="opacity-70">
                {t("meta.lastCrawled", { date: formattedLastCrawl })}
              </time>
            )}
            <span className="hidden opacity-50 sm:inline">{t("meta.disclaimer")}</span>
          </div>

          {/* Right: theme toggle + back to top */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500"
              aria-pressed={darkMode}
              aria-label={tTheme("toggleTitle")}
              title={tTheme("toggleTitle")}
            >
              {darkMode ? (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
                </svg>
              ) : (
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.07l-.71.71M21 12h-1M4 12H3m16.66 5.66l-.71-.71M4.05 4.93l-.71-.71" />
                  <circle cx="12" cy="12" r="5" strokeWidth={2} />
                </svg>
              )}
              <span>{darkMode ? tTheme("dark") : tTheme("light")}</span>
            </button>

            <button
              type="button"
              onClick={scrollToTop}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-500"
              aria-label="Back to top"
              title="Back to top"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              <span className="hidden sm:inline">Top</span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ section with animated accordion (matches home FaqSection)      */
/* ------------------------------------------------------------------ */

function FaqSection({ t }: { t: ReturnType<typeof useTranslations<"IndexFooter">> }) {
  const [openIndex, setOpenIndex] = useState(1); // First question open by default

  return (
    <div className="border-t border-slate-200 dark:border-slate-700">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="mb-6 text-lg font-bold text-slate-900 dark:text-slate-100">
          {t("faq.title")}
        </h2>
        <div className="flex flex-col gap-3">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <FaqItem
              key={n}
              question={t(`faq.q${n}`)}
              answer={t(`faq.a${n}`)}
              isOpen={openIndex === n}
              onToggle={() => setOpenIndex(openIndex === n ? -1 : n)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ accordion item — card-style with hover lift + animated expand   */
/* ------------------------------------------------------------------ */

function FaqItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md hover:shadow-emerald-500/10 dark:border-slate-700 dark:bg-slate-800/50"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-slate-900 dark:text-slate-100"
        aria-expanded={isOpen}
      >
        <span>{question}</span>
        <span
          className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
            isOpen
              ? "border-emerald-400 text-emerald-500"
              : "border-slate-200 text-slate-400 dark:border-slate-600 dark:text-slate-500"
          }`}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-300 ${isOpen ? "rotate-180" : "rotate-0"}`}
          />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="overflow-hidden">
              <p className="px-5 pb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
