"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useLocale } from "@/providers/IntlProvider";
import { EMBASSY_LINKS } from "@/lib/market/embassyLinks";
import type { ReactElement } from "react";

/**
 * Standalone CTA section for non-English home pages.
 * Points users to a localized LittleBiggy embassy — a community post
 * where they can ask questions and get help in their own language.
 * Hidden for English locales (no embassy link).
 */
export default function EmbassySection(): ReactElement | null {
  const tHome = useTranslations("Home");
  const { locale } = useLocale();
  const localePrefix = (locale || "en-GB").split("-")[0].toLowerCase();
  const embassyUrl = EMBASSY_LINKS[localePrefix];
  const isEnglish = localePrefix === "en";

  if (isEnglish || !embassyUrl) return null;

  return (
    <section className="relative overflow-hidden py-16 sm:py-20">
      {/* Subtle emerald gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/60 dark:from-emerald-950/30 dark:via-slate-950 dark:to-teal-950/20" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.08),transparent)] dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(16,185,129,0.12),transparent)]" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="rounded-3xl border border-emerald-200/60 bg-white/70 p-8 shadow-lg shadow-emerald-500/5 backdrop-blur-sm sm:p-10 dark:border-emerald-700/30 dark:bg-slate-900/60 dark:shadow-emerald-900/10"
        >
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:gap-8 sm:text-left">
            {/* Icon — speech bubble / help */}
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
            </div>

            {/* Text */}
            <div className="flex-1 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                {tHome("embassy.badge")}
              </span>
              <h2 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">
                {tHome("embassy.title")}
              </h2>
              <p className="max-w-lg text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-400">
                {tHome("embassy.subtitle")}
              </p>
            </div>

            {/* CTA */}
            <Link
              href={embassyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-emerald-500/40 dark:shadow-emerald-800/30"
            >
              {tHome("embassy.cta")}
              <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>
                →
              </span>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
