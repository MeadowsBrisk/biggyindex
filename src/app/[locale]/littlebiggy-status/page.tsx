/**
 * /littlebiggy-status — "Is Little Biggy down?" live status + access guide.
 *
 * SEO target: navigational + status queries (littlebiggy.org, little biggy
 * login, littlebiggy down, is little biggy legit). Fully SSR'd and cached
 * under the short `status` profile (revalidate 5m) so the live indicator
 * stays honest.
 *
 * LIVE STATUS: reads the public `shared/status.json` blob the crawler writes.
 * The blob ships separately from this page, so a missing/malformed blob
 * degrades gracefully to an "unknown" state — the page never 500s or looks
 * broken before the blob exists.
 */

import { ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusRelativeTime } from "@/components/status/StatusRelativeTime";
import { UptimeCard } from "@/components/status/UptimeCard";
import { VerifyCard } from "@/components/status/VerifyCard";
import { CATEGORY_SLUGS, slugToCategory } from "@/lib/categories";
import { loadLittleBiggyStatus } from "@/lib/data";
import { localeToMarket } from "@/lib/market/market";
import { pageMetadata } from "@/lib/seo/metadata";
import { buildUptimeWindow } from "@/lib/status-window";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const market = localeToMarket(locale);
  const t = await getTranslations({ locale, namespace: "littleBiggyStatus" });

  return pageMetadata({
    market,
    path: "/littlebiggy-status",
    title: t("meta.title"),
    description: t("meta.description"),
  });
}

type StatusState = "up" | "down" | "unknown";

/**
 * Deterministic absolute timestamp — a pure function of (iso, locale) with a
 * fixed UTC zone and NO clock read, so it is safe to bake into the cached
 * HTML. Relative "N minutes ago" strings are computed client-side by
 * <StatusRelativeTime>; computing them here would freeze them into the cache.
 */
function formatTime(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const INDICATOR: Record<
  StatusState,
  { dot: string; ring: string; text: string }
> = {
  up: {
    dot: "bg-emerald-500",
    ring: "bg-emerald-500/10 border-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  down: {
    dot: "bg-rose-500",
    ring: "bg-rose-500/10 border-rose-500/30",
    text: "text-rose-600 dark:text-rose-400",
  },
  unknown: {
    dot: "bg-amber-500",
    ring: "bg-amber-500/10 border-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
  },
};

export default async function LittleBiggyStatusPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  "use cache";
  cacheLife("status");
  cacheTag("status");

  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "littleBiggyStatus" });
  const tCategories = await getTranslations({
    locale,
    namespace: "categories",
  });

  const status = await loadLittleBiggyStatus();
  const state: StatusState = status ? (status.up ? "up" : "down") : "unknown";
  const ind = INDICATOR[state];

  const statusLabel = t(`status.${state}`);
  const statusDetail = t(`status.${state}Detail`);

  const uptime = status
    ? buildUptimeWindow(status.recentChecks, status.lastCheckedAt)
    : null;

  // Down or unknown → the escape route (verified links) comes BEFORE the
  // statistics. Up → evidence first, anti-phishing context after.
  const verifyFirst = state !== "up";

  const SECTION_KEYS = ["isDown", "address", "login", "legit"] as const;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
          <h1 className="text-3xl font-bold text-foreground">{t("heading")}</h1>
          <p className="mt-3 text-sm text-muted leading-relaxed">
            {t("intro")}
          </p>

          {/* Live status indicator */}
          <section
            aria-live="polite"
            className={`mt-8 rounded-2xl border p-5 sm:p-6 ${ind.ring}`}
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                {state !== "unknown" && (
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${ind.dot} ${state === "up" ? "animate-ping" : ""}`}
                  />
                )}
                <span
                  className={`relative inline-flex h-3 w-3 rounded-full ${ind.dot}`}
                />
              </span>
              <span className={`text-lg font-semibold ${ind.text}`}>
                {statusLabel}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              {statusDetail}
            </p>

            {/* Meta block — a real 16px rule above and below, never collapsed
                padding. Both relative lines are client leaves so they can't
                freeze inside this page's `"use cache"` scope; the absolute
                label they fall back to is built here, deterministically. */}
            {status && (
              <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-4 text-xs text-muted">
                <StatusRelativeTime
                  iso={status.lastCheckedAt}
                  absoluteLabel={t("status.lastCheckedAbsolute", {
                    time: formatTime(status.lastCheckedAt, locale),
                  })}
                  keyPrefix="lastChecked"
                />
                {state === "down" ? (
                  <span>
                    {t("status.lastSeenUp", {
                      time: formatTime(status.lastUpAt, locale),
                    })}
                  </span>
                ) : status.lastDownAt ? (
                  <StatusRelativeTime
                    iso={status.lastDownAt}
                    absoluteLabel={t("status.lastOutageAbsolute", {
                      time: formatTime(status.lastDownAt, locale),
                    })}
                    keyPrefix="lastOutage"
                  />
                ) : (
                  <span>{t("status.noRecentOutages")}</span>
                )}
              </div>
            )}
          </section>

          {/* Escape route first when we can't confirm LB is up. */}
          {verifyFirst && (
            <VerifyCard
              locale={locale}
              headingKey="headingDown"
              className="mt-4"
            />
          )}

          {/* Uptime — 24 fixed hourly buckets, never wraps. Not rendered at all
              when the window is empty: an all-grey strip under a "0% reachable"
              chip would be a lie, not a chart. */}
          {status &&
            uptime &&
            (uptime.total > 0 ? (
              <UptimeCard
                window={uptime}
                locale={locale}
                className={verifyFirst ? "mt-8" : "mt-4"}
              />
            ) : (
              <p className="mt-4 text-sm text-muted">
                {t("status.uptimeEmpty")}
              </p>
            ))}

          {!verifyFirst && (
            <VerifyCard locale={locale} headingKey="heading" className="mt-8" />
          )}

          {/* Guide sections */}
          <div className="mt-12 space-y-10">
            {SECTION_KEYS.map((key) => (
              <section key={key} id={key === "legit" ? "legit" : undefined}>
                <h2 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                  {key === "legit" && (
                    <ShieldCheck size={18} className="text-primary" />
                  )}
                  {t(`sections.${key}.heading`)}
                </h2>
                <p className="text-sm text-muted leading-relaxed">
                  {t(`sections.${key}.body`)}
                </p>
                {key === "address" && (
                  <a
                    href="https://littlebiggy.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    littlebiggy.org
                    <ExternalLink size={13} />
                  </a>
                )}
                {key === "legit" && (
                  <Link
                    href="/sellers"
                    prefetch={false}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    {t("sections.legit.sellersLink")}
                    <ArrowRight size={14} />
                  </Link>
                )}
              </section>
            ))}
          </div>

          {/* Telegram alerts — rendered only once the channel exists and
              NEXT_PUBLIC_TELEGRAM_CHANNEL_URL is set on the frontend site
              (inlined at build time; changing it needs a redeploy). The
              channel's bot posts LB down/up alerts, so this page is the
              natural place to offer the subscription. */}
          {process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL && (
            <section className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <p className="text-sm font-medium text-foreground">
                {t("telegram.copy")}
              </p>
              <a
                href={process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                {t("telegram.button")}
                <ArrowRight size={14} />
              </a>
            </section>
          )}

          {/* CTA — browse the index */}
          <section className="mt-12 rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-xl font-bold text-foreground">
              {t("cta.heading")}
            </h2>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              {t("cta.body")}
            </p>
            <Link
              href="/browse"
              prefetch={false}
              className="group mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 hover:shadow-lg hover:shadow-primary/25"
            >
              {t("cta.button")}
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>

            <div className="mt-6 border-t border-border pt-4">
              {/* Canonical group eyebrow. `text-muted` not
                  `text-muted-foreground`: the latter is ~2.5:1 on the light
                  background and fails WCAG 1.4.3 at this size. */}
              <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted">
                {t("cta.categoriesTitle")}
              </span>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {CATEGORY_SLUGS.map((slug) => {
                  const category = slugToCategory(slug);
                  if (!category) return null;
                  return (
                    <Link
                      key={slug}
                      href={`/category/${slug}`}
                      prefetch={false}
                      className="text-sm text-muted hover:text-primary transition-colors"
                    >
                      {tCategories(category)}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
