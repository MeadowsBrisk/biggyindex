import { getTranslations } from "next-intl/server";
import type {
  BucketState,
  UptimeBucket,
  UptimeWindow,
} from "@/lib/status-window";

/**
 * Hourly uptime strip for /littlebiggy-status.
 *
 * Server component: pure and cacheable — every value comes from
 * `buildUptimeWindow()`, anchored to the blob's own timestamps, so nothing
 * here reads the wall clock inside the page's `"use cache"` scope.
 *
 * Renders as a borderless section: the page composes it into the live-status
 * card under a hairline, so status and history read as one module.
 *
 * THE STRIP NEVER WRAPS. It is a `flex` row (default `nowrap`) of `flex-1
 * min-w-0` segments inside an `overflow-hidden rounded` track, so flexbox
 * does the width maths and wrapping is structurally impossible. Re-adding
 * `flex-wrap`, or removing `flex-1` / `min-w-0`, re-breaks that.
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

  const hasMixed = w.buckets.some((b) => b.state === "mixed");
  const hasDown = w.buckets.some((b) => b.state === "down");
  const hasGap = w.buckets.some((b) => b.state === "none");

  // The percent chip's tint follows the worst state in the window, so the
  // number and the strip can never disagree.
  const chipClass = hasDown
    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
    : hasMixed
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";

  return (
    <section className={className ?? ""}>
      <div className="flex items-center justify-between gap-3">
        {/* `min-w-0` so long locales wrap instead of pushing the chip out. */}
        <h2 className="min-w-0 text-sm font-semibold text-foreground">
          {t("status.uptimeTitle", { hours: w.windowHours })}
        </h2>
        {w.uptimePct != null && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${chipClass}`}
          >
            {percentLabel}
          </span>
        )}
      </div>

      {/* Screen readers get one sentence instead of N unlabelled nodes. */}
      <div
        role="img"
        aria-label={`${percentLabel}. ${captionLabel}`}
        className="mt-3 flex h-6 items-stretch gap-px overflow-hidden rounded-md sm:h-7"
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
            className={`min-w-0 flex-1 ${BUCKET_CLASS[b.state]}`}
          />
        ))}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] leading-4 text-muted">
        <span>{t("status.uptimeAxisStart", { hours: w.windowHours })}</span>
        <span>{t("status.uptimeAxisEnd")}</span>
      </div>

      {/* Legend + caption share one row; colour is never the sole channel.
          The "no data" swatch appears only when a gap is actually shown. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] leading-4 text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-600 dark:bg-emerald-500" />
          {t("status.uptimeUp")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-amber-600 dark:bg-amber-400" />
          {t("status.uptimeMixed")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-rose-600 dark:bg-rose-500" />
          {t("status.uptimeDown")}
        </span>
        {hasGap && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[var(--border)]" />
            {t("status.uptimeNoData")}
          </span>
        )}
        <span className="ml-auto tabular-nums">{captionLabel}</span>
      </div>
    </section>
  );
}
