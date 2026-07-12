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
import { CATEGORY_SLUGS, slugToCategory } from "@/lib/categories";
import { loadLittleBiggyStatus } from "@/lib/data";
import { localeToMarket } from "@/lib/market/market";
import { pageMetadata } from "@/lib/seo/metadata";

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
 * Minutes since the last check, computed server-side inside the cached
 * render. `cacheLife("status")` (revalidate 5m) re-stamps this so it never
 * drifts more than the revalidate window — the honest "X ago" the page needs.
 */
function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
}

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

  const diffMin = status ? minutesSince(status.lastCheckedAt) : 0;
  const checkedLabel = !status
    ? null
    : diffMin < 1
      ? t("status.lastCheckedJustNow")
      : diffMin < 60
        ? t("status.lastCheckedMinutes", { count: diffMin })
        : t("status.lastCheckedHours", { count: Math.round(diffMin / 60) });

  const SECTION_KEYS = ["isDown", "address", "login", "legit"] as const;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold text-foreground">{t("heading")}</h1>
          <p className="mt-3 text-sm text-muted leading-relaxed">
            {t("intro")}
          </p>

          {/* Live status indicator */}
          <section
            aria-live="polite"
            className={`mt-8 rounded-2xl border p-5 ${ind.ring}`}
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

            {status && (
              <p className="mt-3 text-xs text-muted-foreground">
                {checkedLabel}
                {state === "down" && (
                  <>
                    {" · "}
                    {t("status.lastSeenUp", {
                      time: formatTime(status.lastUpAt, locale),
                    })}
                  </>
                )}
              </p>
            )}
          </section>

          {/* Uptime strip */}
          {status && (
            <section className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {t("status.uptimeTitle")}
              </h2>
              {status.recentChecks.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-[3px]">
                    {status.recentChecks.map((check) => (
                      <span
                        key={check.at}
                        title={`${formatTime(check.at, locale)} — ${
                          check.up
                            ? t("status.uptimeUp")
                            : t("status.uptimeDown")
                        }${check.latencyMs != null ? ` (${check.latencyMs}ms)` : ""}`}
                        className={`h-6 w-[6px] rounded-sm ${
                          check.up ? "bg-emerald-500/80" : "bg-rose-500/80"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/80" />
                      {t("status.uptimeUp")}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/80" />
                      {t("status.uptimeDown")}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">{t("status.uptimeEmpty")}</p>
              )}
            </section>
          )}

          {/* Guide sections */}
          <div className="mt-12 space-y-8">
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
            <section className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-5">
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
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
