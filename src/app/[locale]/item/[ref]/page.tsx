/**
 * Full item page — SEO-crawlable, server-rendered.
 * Reached via direct URL or when JS is disabled.
 *
 * Uses `item-detail` cache tag so revalidation of browse pages
 * doesn't trigger regeneration of all detail pages (and vice versa).
 *
 * Loads the merged detail blob (reviews, price history, shipping)
 * for a complete item view with a sticky "Browse the Index" top bar.
 */

import { cacheLife, cacheTag } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LocalizedText } from "@/components/LocalizedText";
import { OutboundLink } from "@/components/OutboundLink";
import { ShowOriginalToggle } from "@/components/ShowOriginalToggle";
import { SuggestLink } from "@/components/SuggestLink";
import { loadMergedDetail } from "@/lib/data";
import { decodeEntities } from "@/lib/format";
import { getItemGalleryImages, getItemPrimaryImage } from "@/lib/images";
import { localeToMarket, marketCurrencySymbol } from "@/lib/market/market";
import type { MergedDetailBlob, PriceSnapshot } from "@/lib/types";
import { parseVariant } from "@/lib/variants";

interface ItemPageProps {
  params: Promise<{ locale: string; ref: string }>;
}

/* ── Helpers ── */

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ratingColor(r: number): string {
  if (r <= 3) return "text-red-500";
  if (r <= 5) return "text-amber-500";
  if (r <= 7) return "text-lime-500";
  return "text-emerald-500";
}

function ratingBg(r: number): string {
  if (r <= 3) return "bg-red-500/10 border-red-500/20";
  if (r <= 5) return "bg-amber-500/10 border-amber-500/20";
  if (r <= 7) return "bg-lime-500/10 border-lime-500/20";
  return "bg-emerald-500/10 border-emerald-500/20";
}

type AttributeScalar = string | number | boolean;

interface DetailReviewSegment {
  type?: string;
  value?: string;
}

interface DetailReview {
  id?: string | number;
  created?: number | null;
  rating: number;
  daysToArrive?: number | null;
  segments?: DetailReviewSegment[];
}

function isDetailReview(value: unknown): value is DetailReview {
  if (!value || typeof value !== "object") return false;
  const review = value as Record<string, unknown>;
  return typeof review.rating === "number";
}

function attributeLabel(key: string): string {
  if (key === "mg") return "Potency";
  if (key === "mlSize") return "Size";
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

function attributeValue(key: string, value: AttributeScalar): string {
  if (key === "mg") return `${value} mg`;
  if (key === "mlSize") return `${value} ml`;
  if (value === true) return "Yes";
  if (value === false) return "No";
  return String(value);
}

function attributeRows(
  attrs: MergedDetailBlob["at"],
): Array<{ key: string; label: string; values: string[] }> {
  if (!attrs) return [];

  return Object.entries(attrs)
    .map(([key, rawValue]) => {
      const values = (Array.isArray(rawValue) ? rawValue : [rawValue])
        .filter(
          (value): value is AttributeScalar =>
            value != null && value !== false && value !== "",
        )
        .map((value) => attributeValue(key, value));

      return { key, label: attributeLabel(key), values };
    })
    .filter((row) => row.values.length > 0);
}

/* ── Page content ── */

async function ItemContent({ params }: ItemPageProps) {
  "use cache";
  cacheLife("item-detail");
  cacheTag("item-detail");

  const { ref, locale } = await params;
  const t = await getTranslations({ locale, namespace: "item.page" });
  const market = localeToMarket(locale);
  const mkt = market.toLowerCase();
  const cSym = marketCurrencySymbol(market);

  const item = await loadMergedDetail(ref, mkt);

  if (!item) {
    return (
      <>
        <ItemPageBar
          browseLabel={t("browseIndex")}
          breadcrumbLabel={t("breadcrumb")}
        />
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            {t("notFoundTitle")}
          </h1>
          <p className="mt-2 text-muted">{t("notFoundDescription", { ref })}</p>
          <Link
            href="/browse"
            prefetch={false}
            className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("backToIndex")}
          </Link>
        </div>
      </>
    );
  }

  const translatedName = decodeEntities(item.n);
  const englishName = item.nEn ? decodeEntities(item.nEn) : null;
  const name = translatedName;
  const translatedDesc = item.d ? decodeEntities(item.d) : null;
  const englishDesc = item.dEn ? decodeEntities(item.dEn) : null;
  const primaryImage = getItemPrimaryImage(item, "full", { forceStatic: true });
  const additionalImages = getItemGalleryImages(item, "thumb", {
    forceStatic: true,
  }).slice(1, 5);
  const reviews = ((item as MergedDetailBlob).reviews ?? []).filter(
    isDetailReview,
  );
  const priceHistory = (item as MergedDetailBlob).ph ?? [];
  const shipOptions = (item as MergedDetailBlob).shOpts ?? [];
  const shareLink = item.sl;
  const attrs = attributeRows(item.at);

  // Compute PPG for variants
  const variantRows =
    item.v
      ?.filter((v) => v.usd > 0)
      .map((v, i) => {
        const parsed = parseVariant(v);
        return {
          key: v.vid != null ? String(v.vid) : String(i),
          label: decodeEntities(v.d || "—"),
          price: v.usd,
          grams: parsed?.grams ?? null,
          ppg:
            parsed && parsed.grams != null && parsed.grams > 0
              ? v.usd / parsed.grams
              : null,
        };
      }) ?? [];

  const bestPpgKey = (() => {
    if (variantRows.length <= 1) return null;
    let best: { key: string; ppg: number } | null = null;
    for (const row of variantRows) {
      if (row.ppg != null && (!best || row.ppg < best.ppg)) {
        best = { key: row.key, ppg: row.ppg };
      }
    }
    return best?.key ?? null;
  })();

  return (
    <>
      <ItemPageBar
        category={item.c}
        subcategory={item.sc?.[0]}
        name={name}
        browseLabel={t("browseIndex")}
        breadcrumbLabel={t("breadcrumb")}
      />

      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* ── Main grid ── */}
        <div className="grid gap-8 md:grid-cols-2">
          {/* Left: Images */}
          <div className="space-y-3">
            {primaryImage && (
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-surface border border-border">
                <Image
                  src={primaryImage}
                  alt={name}
                  fill
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                />
              </div>
            )}
            {additionalImages.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {additionalImages.map((url, i) => (
                  <div
                    key={url}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface border border-border"
                  >
                    <Image
                      src={url}
                      alt={t("imageAlt", { item: name, index: i + 2 })}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Details */}
          <div className="space-y-5">
            {/* Category / subcategory pills */}
            <div className="flex flex-wrap gap-1.5">
              {item.c && (
                <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {item.c}
                </span>
              )}
              {item.sc?.map((sc) => (
                <span
                  key={sc}
                  className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted border border-border"
                >
                  {sc}
                </span>
              ))}
            </div>

            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                {englishName ? (
                  <LocalizedText
                    translated={translatedName}
                    english={englishName}
                  />
                ) : (
                  name
                )}
              </h1>
              {englishName && (
                <ShowOriginalToggle market={market} className="shrink-0" />
              )}
            </div>

            {/* Seller + ships from */}
            {item.sn && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <span>
                  {t("by")}{" "}
                  <span className="font-medium text-foreground">{item.sn}</span>
                </span>
                {item.sf && (
                  <span className="text-xs text-muted-foreground">
                    · {t("shipsFrom", { country: item.sf })}
                  </span>
                )}
              </div>
            )}

            {/* Price */}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-primary">
                {item.uMin != null
                  ? `${cSym}${item.uMin.toFixed(2)}`
                  : t("unavailable")}
              </span>
              {item.uMax != null && item.uMax !== item.uMin && (
                <span className="text-lg text-muted">
                  – {cSym}
                  {item.uMax.toFixed(2)}
                </span>
              )}
              {priceHistory.length >= 2 && (
                <PriceChangeBadge history={priceHistory} />
              )}
            </div>

            {/* Review stats summary */}
            {item.rs && (item.rs.avg != null || item.rs.cnt != null) && (
              <div className="flex items-center gap-3 text-sm text-muted">
                {item.rs.avg != null && (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className={`font-semibold ${ratingColor(item.rs.avg)}`}
                    >
                      {item.rs.avg.toFixed(1)}
                    </span>
                    <span>/10</span>
                  </span>
                )}
                {item.rs.cnt != null && (
                  <span>{t("reviewsCount", { count: item.rs.cnt })}</span>
                )}
                {item.rs.days != null && (
                  <span>
                    {t("deliveryShort", { count: Math.round(item.rs.days) })}
                  </span>
                )}
              </div>
            )}

            {/* Attributes */}
            {attrs.length > 0 && (
              <div className="space-y-1.5">
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
                  {t("attributes")}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {attrs.map(({ key, label, values }) =>
                    values.map((value) => (
                      <span
                        key={`${key}-${value}`}
                        className="rounded-full bg-surface border border-border px-2 py-0.5 text-xs text-muted"
                      >
                        <span className="text-muted-foreground">{label}:</span>{" "}
                        {value}
                      </span>
                    )),
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {translatedDesc && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                <LocalizedText
                  translated={translatedDesc}
                  english={englishDesc}
                  preserveNewlines
                />
              </p>
            )}

            {/* Variants */}
            {variantRows.length > 0 && (
              <div>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                  {t("variants")}
                </h2>
                <div className="space-y-1">
                  {variantRows.map((v) => (
                    <div
                      key={v.key}
                      className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${
                        v.key === bestPpgKey
                          ? "bg-primary/5 border border-primary/20"
                          : "bg-surface"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{v.label}</span>
                        {v.key === bestPpgKey && (
                          <span className="text-[10px] font-medium text-primary uppercase">
                            {t("bestValue")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {v.ppg != null && (
                          <span className="text-xs text-muted">
                            {cSym}
                            {v.ppg.toFixed(2)}/g
                          </span>
                        )}
                        <span className="font-medium text-primary">
                          {cSym}
                          {v.price.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Shipping options */}
            {shipOptions.length > 0 && (
              <div>
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                  {t("shipping")}
                </h2>
                <div className="space-y-1">
                  {shipOptions.map((opt) => (
                    <div
                      key={`${opt.label}-${opt.cost}`}
                      className="flex justify-between rounded-md bg-surface px-3 py-1.5 text-sm"
                    >
                      <span className="text-foreground">{opt.label}</span>
                      <span className="font-medium text-muted">
                        {opt.cost === 0
                          ? t("free")
                          : `${cSym}${opt.cost.toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-3 pt-2">
              {shareLink && (
                <OutboundLink
                  href={shareLink}
                  id={String(item.refNum ?? item.id)}
                  n={name}
                  sid={item.sid != null ? String(item.sid) : undefined}
                  sn={item.sn ?? undefined}
                  c={item.c ?? undefined}
                  mkt={market}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity shadow-md"
                >
                  {t("viewOnLittleBiggy")}
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </OutboundLink>
              )}
              <SuggestLink
                refNum={ref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
              />
            </div>

            {/* Timestamps */}
            <div className="flex gap-4 text-xs text-muted-foreground pt-2">
              {item.fsa && (
                <span>{t("firstSeen", { date: fmtDate(item.fsa) ?? "" })}</span>
              )}
              {item.lua && (
                <span>{t("updated", { date: fmtDate(item.lua) ?? "" })}</span>
              )}
              {item.lur && <span className="text-muted">({item.lur})</span>}
            </div>
          </div>
        </div>

        {/* ── Price History ── */}
        {priceHistory.length > 1 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              {t("priceHistory")}
            </h2>
            <div className="overflow-x-auto">
              <div className="flex gap-2 text-xs">
                {priceHistory.map((snap, i) => (
                  <div
                    key={snap.d}
                    className="flex flex-col items-center rounded-lg bg-surface border border-border px-3 py-2 min-w-20"
                  >
                    <span className="text-muted-foreground">
                      {new Date(snap.d).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <span className="font-semibold text-foreground mt-0.5">
                      {cSym}
                      {snap.min.toFixed(2)}
                    </span>
                    {snap.max !== snap.min && (
                      <span className="text-muted">
                        – {cSym}
                        {snap.max.toFixed(2)}
                      </span>
                    )}
                    {i > 0 && snap.min !== priceHistory[i - 1].min && (
                      <PriceDir
                        prev={priceHistory[i - 1].min}
                        curr={snap.min}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Reviews ── */}
        {reviews.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              {t("reviews")}
              <span className="ml-1 font-normal text-muted">
                ({reviews.length})
              </span>
            </h2>
            <div className="space-y-3">
              {reviews.slice(0, 20).map((r) => (
                <div
                  key={r.id}
                  className={`rounded-lg border p-3 ${ratingBg(r.rating)}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-sm font-bold ${ratingColor(r.rating)}`}
                    >
                      {r.rating}/10
                    </span>
                    {r.daysToArrive != null && (
                      <span className="text-xs text-muted">
                        {t("reviewDelivery", { days: r.daysToArrive })}
                      </span>
                    )}
                    {r.created && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(r.created * 1000).toLocaleDateString(
                          "en-GB",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </span>
                    )}
                  </div>
                  {r.segments && (
                    <div className="text-sm text-muted-foreground leading-relaxed">
                      {r.segments
                        .filter((s) => s.type === "text")
                        .map((s) => (
                          <span key={`${s.type}-${s.value}`}>
                            {decodeEntities(s.value)}{" "}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              ))}
              {reviews.length > 20 && (
                <p className="text-xs text-muted italic">
                  {t("moreReviews", { count: reviews.length - 20 })}
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

/* ── Sticky top bar ── */

function ItemPageBar({
  category,
  subcategory,
  name,
  browseLabel,
  breadcrumbLabel,
}: {
  category?: string | null;
  subcategory?: string | null;
  name?: string | null;
  browseLabel: string;
  breadcrumbLabel: string;
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-border bg-(--background)/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-4">
        <Link
          href="/browse"
          prefetch={false}
          className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 hover:shadow-primary/30 transition-all"
        >
          <span className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5">
            ←
          </span>
          {browseLabel}
        </Link>
        {(category || name) && (
          <nav
            aria-label={breadcrumbLabel}
            className="min-w-0 flex items-center gap-1.5 text-xs text-muted"
          >
            {category && (
              <>
                <span className="text-muted-foreground/50">/</span>
                <Link
                  href={`/browse?cat=${encodeURIComponent(category)}`}
                  prefetch={false}
                  className="shrink-0 hover:text-foreground transition-colors"
                >
                  {category}
                </Link>
              </>
            )}
            {category && subcategory && (
              <>
                <span className="text-muted-foreground/50">/</span>
                <Link
                  href={`/browse?cat=${encodeURIComponent(category)}&sub=${encodeURIComponent(subcategory)}`}
                  prefetch={false}
                  className="shrink-0 hover:text-foreground transition-colors"
                >
                  {subcategory}
                </Link>
              </>
            )}
            {name && (
              <>
                <span className="text-muted-foreground/50">/</span>
                <span className="truncate text-foreground/80" title={name}>
                  {name}
                </span>
              </>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}

/* ── Price direction indicator ── */

function PriceDir({ prev, curr }: { prev: number; curr: number }) {
  const pct = Math.round(Math.abs(((curr - prev) / prev) * 100));
  if (pct === 0) return null;
  const down = curr < prev;
  return (
    <span
      className={`text-[10px] font-medium mt-0.5 ${down ? "text-emerald-500" : "text-red-400"}`}
    >
      {down ? "↓" : "↑"} {pct}%
    </span>
  );
}

/* ── Price change badge (for header) ── */

function PriceChangeBadge({ history }: { history: PriceSnapshot[] }) {
  const prev = history[history.length - 2].min;
  const curr = history[history.length - 1].min;
  const pct = Math.round(Math.abs(((curr - prev) / prev) * 100));
  if (pct === 0) return null;
  const down = curr < prev;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        down
          ? "bg-emerald-500/10 text-emerald-600"
          : "bg-red-500/10 text-red-500"
      }`}
    >
      {down ? "↓" : "↑"} {pct}%
    </span>
  );
}

/* ── Page export ── */

export default async function ItemPage(props: ItemPageProps) {
  return (
    <Suspense>
      <ItemContent params={props.params} />
    </Suspense>
  );
}
