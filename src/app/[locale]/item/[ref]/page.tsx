/**
 * Full item page - SEO-crawlable, server-rendered.
 * Reached via direct URL or when JS is disabled.
 *
 * Uses `item-detail` cache tag so revalidation of browse pages
 * doesn't trigger regeneration of all detail pages (and vice versa).
 *
 * Loads the merged detail blob (reviews, price history, shipping)
 * for a complete item view with a sticky "Browse the Index" top bar.
 */

import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Fragment, Suspense } from "react";
import { ItemDetailGallery } from "@/components/ItemDetailGallery";
import { ItemDetailTabs } from "@/components/ItemDetailTabs";
import {
  type ItemReview,
  ItemReviewsBlock,
} from "@/components/ItemReviewsBlock";
import { LocalizedText } from "@/components/LocalizedText";
import { OutboundLink } from "@/components/OutboundLink";
import { ShowOriginalToggle } from "@/components/ShowOriginalToggle";
import { SuggestLink } from "@/components/SuggestLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadMergedDetail } from "@/lib/data";
import { decodeEntities, formatPriceRangeChange } from "@/lib/format";
import { getItemGalleryImages } from "@/lib/images";
import { localeToMarket, marketCurrencySymbol } from "@/lib/market/market";
import { compactMetaDescription, pageMetadata } from "@/lib/seo/metadata";
import { getLittleBiggyItemUrl } from "@/lib/tracking/littlebiggy";
import type { MergedDetailBlob, PriceSnapshot } from "@/lib/types";
import {
  itemVariantContext,
  parseVariant,
  pricePerUnit,
  UNIT_DISPLAY_LABEL,
} from "@/lib/variants";

interface ItemPageProps {
  params: Promise<{ locale: string; ref: string }>;
}

type AttributeScalar = string | number | boolean;

interface RawDetailReview {
  id?: string | number | null;
  created?: number | null;
  rating?: unknown;
  daysToArrive?: number | null;
  segments?: Array<{ type?: string | null; value?: string | null }> | null;
  item?: {
    refNum?: string | number | null;
    name?: string | null;
    id?: string | number | null;
  } | null;
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function ratingColor(rating: number): string {
  if (rating <= 3) return "text-red-500";
  if (rating <= 5) return "text-amber-500";
  if (rating <= 7) return "text-lime-500";
  return "text-emerald-500";
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
    .filter(([key]) => key !== "tier")
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

function toFiniteNumber(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function itemReviewsFromDetail(
  rawReviews: unknown[] | undefined,
  item: MergedDetailBlob,
): ItemReview[] {
  const fallbackItemId = toFiniteNumber(item.id ?? item.refNum ?? null) ?? 0;
  const fallbackItem = {
    refNum: String(item.refNum ?? item.id ?? ""),
    name: decodeEntities(item.n),
    id: fallbackItemId,
  };

  return (rawReviews ?? []).flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const raw = value as RawDetailReview;
    if (typeof raw.rating !== "number" || !Number.isFinite(raw.rating)) {
      return [];
    }

    const created =
      typeof raw.created === "number" && Number.isFinite(raw.created)
        ? raw.created
        : 0;
    const explicitId = toFiniteNumber(raw.id ?? null);
    const id = explicitId ?? created * 1000 + index;
    const daysToArrive =
      typeof raw.daysToArrive === "number" && Number.isFinite(raw.daysToArrive)
        ? raw.daysToArrive
        : null;
    const segments = Array.isArray(raw.segments)
      ? raw.segments.flatMap((segment) => {
          if (
            !segment ||
            typeof segment.type !== "string" ||
            typeof segment.value !== "string"
          ) {
            return [];
          }
          return [{ type: segment.type, value: segment.value }];
        })
      : [];
    const rawItemId = toFiniteNumber(raw.item?.id ?? null);
    const reviewItem =
      raw.item?.refNum && raw.item.name
        ? {
            refNum: String(raw.item.refNum),
            name: raw.item.name,
            id: rawItemId ?? fallbackItemId,
          }
        : fallbackItem;

    return [
      {
        id,
        created,
        rating: raw.rating,
        daysToArrive,
        segments,
        item: reviewItem,
      },
    ];
  });
}

function itemMetadataDescription(item: MergedDetailBlob): string {
  const seller = item.sn ? decodeEntities(item.sn) : null;
  const description = decodeEntities(item.d ?? item.dEn ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (description) {
    return compactMetaDescription(
      `${description}${seller ? ` Sold by ${seller} on Little Biggy.` : ""}`,
    );
  }

  const name = decodeEntities(item.n);
  const facts = [
    item.c ? `${item.c} listing` : null,
    item.rs?.cnt ? `${item.rs.cnt} reviews` : null,
    item.rs?.avg ? `${item.rs.avg.toFixed(1)}/10 rating` : null,
  ].filter(Boolean);

  return compactMetaDescription(
    `Browse ${name}${seller ? ` from ${seller}` : ""} on Little Biggy. ${facts.join(". ")}`,
  );
}

export async function generateMetadata({
  params,
}: ItemPageProps): Promise<Metadata> {
  const { ref, locale } = await params;
  const t = await getTranslations({ locale, namespace: "item.page" });
  const market = localeToMarket(locale);
  const item = await loadMergedDetail(ref, market.toLowerCase());

  if (!item) {
    return {
      title: t("notFoundTitle"),
      robots: { index: false, follow: false },
    };
  }

  const name = decodeEntities(item.n);
  const seller = item.sn ? decodeEntities(item.sn) : null;
  const image = getItemGalleryImages(item, "full", { forceStatic: true })[0];

  return pageMetadata({
    market,
    path: `/item/${encodeURIComponent(ref)}`,
    title: seller
      ? `${name} by ${seller} | BiggyIndex`
      : `${name} | BiggyIndex`,
    description: itemMetadataDescription(item),
    alternateMarkets: [market],
    images: image ? [{ url: image, alt: name }] : undefined,
  });
}

async function ItemContent({ params }: ItemPageProps) {
  "use cache";
  cacheLife("item-detail");
  cacheTag("item-detail");

  const { ref, locale } = await params;
  const t = await getTranslations({ locale, namespace: "item.page" });
  const detailT = await getTranslations({ locale, namespace: "item.detail" });
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
  const images = getItemGalleryImages(item);
  const reviews = itemReviewsFromDetail(item.reviews, item);
  const priceHistory = (item as MergedDetailBlob).ph ?? [];
  const shipOptions = (item as MergedDetailBlob).shOpts ?? [];
  const shareLink = getLittleBiggyItemUrl(item);
  const attrs = attributeRows(item.at);
  const variantContext = itemVariantContext(item);

  const variantRows =
    item.v
      ?.filter((variant) => variant.usd > 0)
      .map((variant, index) => {
        const parsed = parseVariant(variant, variantContext);
        const ppu = pricePerUnit(variant.usd, parsed);
        const unitLabel = parsed
          ? (UNIT_DISPLAY_LABEL[parsed.unit] ?? parsed.unit)
          : null;

        return {
          key: variant.vid != null ? String(variant.vid) : String(index),
          label: decodeEntities(variant.d || parsed?.originalLabel || "-"),
          price: variant.usd,
          ppu,
          unitLabel,
        };
      }) ?? [];

  const bestPpuKey = (() => {
    if (variantRows.length <= 1) return null;
    let best: { key: string; ppu: number } | null = null;
    for (const row of variantRows) {
      if (row.ppu != null && (!best || row.ppu < best.ppu)) {
        best = { key: row.key, ppu: row.ppu };
      }
    }
    return best?.key ?? null;
  })();

  return (
    <>
      <ItemPageBar
        category={item.c}
        subcategory={item.sc?.[0]}
        browseLabel={t("browseIndex")}
        breadcrumbLabel={t("breadcrumb")}
      />

      <main className="idp">
        <div className="ido-panel idp-panel">
          <div className="ido-grid">
            <div className="ido-left">
              <div className="ido-image-area">
                <ItemDetailGallery images={images} alt={name} itemKey={ref} />
              </div>
            </div>

            <div className="ido-center">
              <div className="ido-center__header">
                <div className="flex flex-wrap gap-1.5">
                  {item.c && (
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {item.c}
                    </span>
                  )}
                  {item.sc?.map((subcategory) => (
                    <span
                      key={subcategory}
                      className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted"
                    >
                      {subcategory}
                    </span>
                  ))}
                </div>

                <div className="flex items-start justify-between gap-2">
                  <h1 className="text-xl font-bold leading-tight text-foreground">
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

                {item.sn && (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <span>
                      {t("by")}{" "}
                      <span className="font-medium text-foreground">
                        {item.sn}
                      </span>
                    </span>
                    {item.sf && (
                      <span className="text-xs text-muted-foreground">
                        {t("shipsFrom", { country: item.sf })}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <ItemDetailTabs
                refNum={ref}
                className="idp-tabs"
                topOffset={140}
              />

              <div className="ido-center__body">
                <section
                  id="prices"
                  data-section-id="prices"
                  className="ido-section"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-lg font-semibold text-primary">
                      {item.uMin != null
                        ? `${cSym}${item.uMin.toFixed(2)}`
                        : t("unavailable")}
                      {item.uMax != null &&
                        item.uMax !== item.uMin &&
                        ` - ${cSym}${item.uMax.toFixed(2)}`}
                    </span>
                    {priceHistory.length >= 2 && item.uMin != null && (
                      <PriceChangeBadge
                        history={priceHistory}
                        current={{
                          min: item.uMin,
                          max: item.uMax ?? item.uMin,
                        }}
                      />
                    )}
                  </div>

                  {variantRows.length > 0 && (
                    <div className="ido-card ido-card--variants">
                      <div className="ido-table__caption">
                        <span>{detailT("variants.heading")}</span>
                        <span className="ido-table__count">
                          {variantRows.length}
                        </span>
                      </div>
                      <table className="ido-table">
                        <thead>
                          <tr>
                            <th>{detailT("variants.variant")}</th>
                            <th>{detailT("variants.price")}</th>
                            <th>{detailT("variants.unit")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {variantRows.map((variant) => (
                            <tr key={variant.key}>
                              <td>
                                <span className="ido-table__format">
                                  {variant.label}
                                  {variant.key === bestPpuKey && (
                                    <span className="ido-best-value">
                                      {t("bestValue")}
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="ido-table__price">
                                {cSym}
                                {variant.price.toFixed(2)}
                              </td>
                              <td className="ido-table__ppu">
                                {variant.ppu != null &&
                                variant.unitLabel != null
                                  ? `${cSym}${variant.ppu.toFixed(2)}/${variant.unitLabel}`
                                  : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {shipOptions.length > 0 && (
                        <div className="ido-ship">
                          <div className="ido-ship__head">
                            <span className="ido-ship__label">
                              {t("shipping")}
                            </span>
                          </div>
                          <div className="ido-ship__chips">
                            {shipOptions.map((option) => (
                              <span
                                key={`${option.label}-${option.cost}`}
                                className={`ido-ship__chip${option.cost === 0 ? " ido-ship__chip--free" : ""}`}
                              >
                                <span className="ido-ship__chip-label">
                                  {option.label}
                                </span>
                                <span className="ido-ship__chip-cost">
                                  {option.cost === 0
                                    ? t("free")
                                    : `${cSym}${option.cost.toFixed(2)}`}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="ido-meta-strip">
                    {item.rs?.avg != null && (
                      <div className="ido-meta-cell">
                        <div className="ido-meta-cell__body">
                          <span className="ido-meta-cell__label">
                            {detailT("meta.rating")}
                          </span>
                          <span className="ido-meta-cell__value">
                            <span className={ratingColor(item.rs.avg)}>
                              {item.rs.avg.toFixed(1)}
                            </span>
                            <span className="ido-meta-cell__unit">/10</span>
                            {item.rs.cnt != null && (
                              <span className="ido-meta-cell__sub">
                                {" "}
                                ({item.rs.cnt})
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                    {item.rs?.days != null && (
                      <div className="ido-meta-cell">
                        <div className="ido-meta-cell__body">
                          <span className="ido-meta-cell__label">
                            {detailT("meta.avgDelivery")}
                          </span>
                          <span className="ido-meta-cell__value">
                            {item.rs.days.toFixed(1)}
                            <span className="ido-meta-cell__unit">d</span>
                          </span>
                        </div>
                      </div>
                    )}
                    {item.fsa && (
                      <div className="ido-meta-cell">
                        <div className="ido-meta-cell__body">
                          <span className="ido-meta-cell__label">
                            {detailT("meta.listed")}
                          </span>
                          <span className="ido-meta-cell__value">
                            {fmtDate(item.fsa)}
                          </span>
                        </div>
                      </div>
                    )}
                    {item.lua && (
                      <div className="ido-meta-cell">
                        <div className="ido-meta-cell__body">
                          <span className="ido-meta-cell__label">
                            {detailT("meta.updated")}
                          </span>
                          <span className="ido-meta-cell__value">
                            {fmtDate(item.lua)}
                          </span>
                          {item.lur && (
                            <span className="ido-meta-cell__sub">
                              {item.lur}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section
                  id="description"
                  data-section-id="description"
                  className="ido-section"
                >
                  <div className="ido-card">
                    <div className="ido-card__head">
                      <h2 className="ido-card__title">
                        {detailT("description.heading")}
                      </h2>
                      {englishDesc && <ShowOriginalToggle market={market} />}
                    </div>
                    <div className="ido-card__body">
                      {translatedDesc ? (
                        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                          <LocalizedText
                            translated={translatedDesc}
                            english={englishDesc}
                            preserveNewlines
                          />
                        </p>
                      ) : (
                        <p className="text-sm text-muted italic">
                          {detailT("description.noneProvided")}
                        </p>
                      )}
                    </div>
                  </div>

                  {attrs.length > 0 && (
                    <div className="ido-card">
                      <div className="ido-card__head">
                        <h2 className="ido-card__title">
                          {detailT("attributes.heading")}
                        </h2>
                      </div>
                      <div className="ido-card__body">
                        <dl className="ido-attr-grid">
                          {attrs.map(({ key, label, values }) => (
                            <Fragment key={key}>
                              <dt className="ido-attr-grid__label">{label}</dt>
                              <dd className="ido-attr-grid__values">
                                {values.map((value) => (
                                  <span key={value} className="ido-attr-val">
                                    {value}
                                  </span>
                                ))}
                              </dd>
                            </Fragment>
                          ))}
                        </dl>
                      </div>
                    </div>
                  )}

                  {priceHistory.length > 1 && (
                    <div className="ido-card">
                      <div className="ido-card__head">
                        <h2 className="ido-card__title">{t("priceHistory")}</h2>
                        <span className="ido-card__count">
                          {priceHistory.length}
                        </span>
                      </div>
                      <div className="ido-card__body">
                        <ul className="ido-price-history__list">
                          {[...priceHistory]
                            .reverse()
                            .map((snapshot, index, snapshots) => {
                              const previous = snapshots[index + 1];
                              return (
                                <li
                                  key={snapshot.d}
                                  className="ido-price-history__entry"
                                >
                                  <time
                                    className="ido-price-history__date"
                                    dateTime={snapshot.d}
                                  >
                                    {shortDate(snapshot.d)}
                                  </time>
                                  <span className="ido-price-history__price">
                                    {cSym}
                                    {snapshot.min.toFixed(2)}
                                    {snapshot.max !== snapshot.min && (
                                      <span className="ido-price-history__range">
                                        {" "}
                                        - {cSym}
                                        {snapshot.max.toFixed(2)}
                                      </span>
                                    )}
                                  </span>
                                  {previous ? (
                                    <PriceDir prev={previous} curr={snapshot} />
                                  ) : null}
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    </div>
                  )}
                </section>

                {reviews.length > 0 && (
                  <section
                    id="reviews"
                    data-section-id="reviews"
                    className="ido-section 2xl:hidden"
                  >
                    <div className="ido-card">
                      <div className="ido-card__body">
                        <ItemReviewsBlock
                          reviews={reviews}
                          rs={item.rs}
                          loading={false}
                          shareLink={shareLink}
                          compact
                        />
                      </div>
                    </div>
                  </section>
                )}

                <div className="flex flex-wrap gap-3 pt-1 md:hidden">
                  <SuggestLink
                    refNum={ref}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:border-foreground/30 hover:text-foreground cursor-pointer"
                  />
                  {shareLink && (
                    <OutboundLink
                      href={shareLink}
                      id={String(item.refNum ?? item.id)}
                      n={name}
                      sid={item.sid != null ? String(item.sid) : undefined}
                      sn={item.sn ?? undefined}
                      c={item.c ?? undefined}
                      mkt={market}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-opacity hover:opacity-90"
                    >
                      {t("viewOnLittleBiggy")}
                    </OutboundLink>
                  )}
                </div>
              </div>
            </div>

            {reviews.length > 0 && (
              <aside className="ido-right idp-right">
                <ItemReviewsBlock
                  reviews={reviews}
                  rs={item.rs}
                  loading={false}
                  shareLink={shareLink}
                />
              </aside>
            )}
          </div>

          <div className="ido-suggest-bottom">
            <SuggestLink refNum={ref} iconOnly />
          </div>

          {shareLink && (
            <OutboundLink
              href={shareLink}
              id={String(item.refNum ?? item.id)}
              n={name}
              sid={item.sid != null ? String(item.sid) : undefined}
              sn={item.sn ?? undefined}
              c={item.c ?? undefined}
              mkt={market}
              className="ido-lb-btn"
            >
              <span className="ido-lb-btn__label">
                {t("viewOnLittleBiggy")}
              </span>
              <span className="ido-lb-btn__arrow" aria-hidden="true">
                -&gt;
              </span>
            </OutboundLink>
          )}
        </div>
      </main>
    </>
  );
}

function ItemPageBar({
  category,
  subcategory,
  browseLabel,
  breadcrumbLabel,
}: {
  category?: string | null;
  subcategory?: string | null;
  browseLabel: string;
  breadcrumbLabel: string;
}) {
  return (
    <div className="sticky top-0 z-50 border-b border-border bg-(--background)/80 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-375 items-center gap-3 px-4">
        <Link
          href="/browse"
          prefetch={false}
          className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:shadow-primary/30"
        >
          <span className="inline-block transition-transform duration-200 group-hover:-translate-x-0.5">
            &lt;-
          </span>
          {browseLabel}
        </Link>
        {category && (
          <nav
            aria-label={breadcrumbLabel}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted"
          >
            <span className="text-muted-foreground/50">/</span>
            <Link
              href={`/browse?cat=${encodeURIComponent(category)}`}
              prefetch={false}
              className="shrink-0 transition-colors hover:text-foreground"
            >
              {category}
            </Link>
            {category && subcategory && (
              <>
                <span className="text-muted-foreground/50">/</span>
                <Link
                  href={`/browse?cat=${encodeURIComponent(category)}&sub=${encodeURIComponent(subcategory)}`}
                  prefetch={false}
                  className="shrink-0 transition-colors hover:text-foreground"
                >
                  {subcategory}
                </Link>
              </>
            )}
          </nav>
        )}
        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function PriceDir({
  prev,
  curr,
}: {
  prev: PriceSnapshot;
  curr: PriceSnapshot;
}) {
  const change = formatPriceRangeChange(prev, curr);
  if (!change) return null;
  const down = change.startsWith("↓");
  return (
    <span
      className={`ido-price-history__change ${down ? "ido-price-history__change--down" : "ido-price-history__change--up"}`}
    >
      {change}
    </span>
  );
}

function PriceChangeBadge({
  history,
  current,
}: {
  history: PriceSnapshot[];
  current: { min: number; max: number };
}) {
  const prev = history[history.length - 2];
  const curr = history[history.length - 1];
  if (curr.min !== current.min || curr.max !== current.max) return null;
  const change = formatPriceRangeChange(prev, curr);
  if (!change) return null;
  const down = change.startsWith("↓");
  return (
    <span
      className={`ido-price-badge ${down ? "ido-price-badge--down" : "ido-price-badge--up"}`}
    >
      {change}
    </span>
  );
}

export default async function ItemPage(props: ItemPageProps) {
  return (
    <Suspense>
      <ItemContent params={props.params} />
    </Suspense>
  );
}
