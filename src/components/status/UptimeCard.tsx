import { getTranslations } from "next-intl/server";
import type {
  BucketState,
  UptimeBucket,
  UptimeWindow,
} from "@/lib/status-window";

/**
 * 24-hour uptime strip for /littlebiggy-status.
 *
 * Server component: pure, cacheable, zero client JS. Every value it renders
 * comes from `buildUptimeWindow()`, which is anchored to the blob's own
 * `lastCheckedAt` — so nothing here reads the wall clock inside the page's
 * `"use cache"` scope.
 *
 * THE STRIP NEVER WRAPS. It is a `flex` row (default `nowrap`) of exactly 24
 * `flex-1 min-w-0` segments, so flexbox does the width maths and wrapping is
 * structurally impossible at any viewport. Re-adding `flex-wrap`, or removing
 * `flex-1` / `min-w-0` from the segments, re-breaks that.
 */

const BUCKET_CLASS: Record<BucketState, string> = {
  up: "bg-emerald-600 dark:bg-emerald-500",
  mixed: "bg-amber-600 dark:bg-amber-400",
  down: "bg-rose-600 dark:bg-rose-500",
  // Absence of data is not information — it must not read as a state.
  none: "bg-[var(--border)]",
};

interface Props {
  window: UptimeWindow;
  locale: string;
  className?: string;
}

export async function UptimeCard({ window: w, locale, className }: Props) {
  const t = await getTranslations({ locale, namespace: "littleBiggyStatus" });

  // ONE formatter, not 24. Bucket boundaries are UTC hour marks.
  const hhmm = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
  const fmtRange = (b: UptimeBucket) =>
    `${hhmm.format(new Date(b.start))}–${hhmm.format(new Date(b.end))} UTC`;

  const percentLabel =
    w.uptimePct != null ? t("status.uptimePercent", { pct: w.uptimePct }) : "";
  const captionLabel =
    w.medianLatencyMs != null
      ? t("status.uptimeCaption", { checks: w.total, ms: w.medianLatencyMs })
      : t("status.uptimeCaptionNoLatency", { checks: w.total });

  return (
    <section
      className={`${className ?? ""} rounded-2xl border border-[var(--border)] bg-surface p-4 sm:p-5`}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* Card title: sentence case, `min-w-0` so long locales wrap instead
            of pushing the percent chip off-screen. */}
        <h2 className="min-w-0 text-sm font-semibold text-foreground">
          {t("status.uptimeTitle")}
        </h2>
        {w.uptimePct != null && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {percentLabel}
          </span>
        )}
      </div>

      {/* Screen readers get one sentence instead of 24 unlabelled nodes. */}
      <div
        role="img"
        aria-label={`${percentLabel}. ${captionLabel}`}
        className="mt-3 flex items-stretch gap-[2px] sm:gap-[3px]"
      >
        {w.buckets.map((b) => (
          <span
            key={b.start}
            title={
              b.total === 0
                ? t("status.bucketTitleNoData", { range: fmtRange(b) })
                : t("status.bucketTitle", {
                    range: fmtRange(b),
                    up: b.up,
                    total: b.total,
                  })
            }
            className={`h-8 min-w-0 flex-1 rounded-[2px] ${BUCKET_CLASS[b.state]}`}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] leading-4 text-muted">
        <span>{t("status.uptimeAxisStart")}</span>
        <span>{t("status.uptimeAxisEnd")}</span>
      </div>

      {/* Colour is never the sole channel: the legend names all four states. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] pt-3 text-[11px] leading-4 text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-emerald-600 dark:bg-emerald-500" />
          {t("status.uptimeUp")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-amber-600 dark:bg-amber-400" />
          {t("status.uptimeMixed")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-rose-600 dark:bg-rose-500" />
          {t("status.uptimeDown")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-[var(--border)]" />
          {t("status.uptimeNoData")}
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-4 text-muted">{captionLabel}</p>
    </section>
  );
}
