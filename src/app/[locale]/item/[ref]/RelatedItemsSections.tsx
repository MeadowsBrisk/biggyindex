/**
 * SEO link sections for the full item page — "More from this seller" and
 * "More {category} on Little Biggy".
 *
 * Server-rendered plain anchors so crawlers see real item-to-item links
 * (item pages must not be PageRank dead-ends). Clicking performs a full
 * navigation to the target item page, which is correct here.
 */

import { getTranslations } from "next-intl/server";
import { loadItems } from "@/lib/data";
import { decodeEntities } from "@/lib/format";
import { getItemPrimaryImage } from "@/lib/images";
import type { Item } from "@/lib/types";

const SECTION_LIMIT = 6;

interface RelatedItemsSectionsProps {
  locale: string;
  /** Lowercase market code, e.g. "gb" */
  market: string;
  /** Ref of the item being viewed (refNum ?? id) — excluded from both sections */
  currentRef: string;
  sid?: number | null;
  sellerName?: string | null;
  category?: string | null;
  subcategories?: string[] | null;
}

function itemRef(item: Item): string {
  return String(item.refNum ?? item.id);
}

function hotness(item: Item): number {
  return Number(item.h ?? 0);
}

function RelatedItemTile({ item }: { item: Item }) {
  const ref = itemRef(item);
  const name = decodeEntities(item.n);
  const image = getItemPrimaryImage(item, "thumb", { forceStatic: true });

  return (
    <a
      href={`/item/${encodeURIComponent(ref)}`}
      className="group grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-card p-2 transition-colors hover:border-primary/40 hover:bg-surface"
    >
      <div className="aspect-square overflow-hidden rounded-md bg-surface">
        {image ? (
          // biome-ignore lint/performance/noImgElement: R2 images are already optimized before reaching this component.
          <img
            src={image}
            alt={name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full" />
        )}
      </div>
      <div className="min-w-0 py-0.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary">
          {name}
        </p>
        {item.c && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">
              {item.c}
            </span>
          </div>
        )}
      </div>
    </a>
  );
}

function RelatedItemsCard({
  heading,
  items,
}: {
  heading: string;
  items: Item[];
}) {
  return (
    <section className="ido-card">
      <div className="ido-card__head">
        <h2 className="ido-card__title">{heading}</h2>
        <span className="ido-card__count">{items.length}</span>
      </div>
      <div className="ido-card__body">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <RelatedItemTile key={itemRef(item)} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

export async function RelatedItemsSections({
  locale,
  market,
  currentRef,
  sid,
  sellerName,
  category,
  subcategories,
}: RelatedItemsSectionsProps) {
  const items = await loadItems(market);

  const sellerItems =
    sid != null && sellerName
      ? items
          .filter(
            (item) =>
              item.sid != null &&
              String(item.sid) === String(sid) &&
              itemRef(item) !== currentRef,
          )
          .sort((a, b) => hotness(b) - hotness(a))
          .slice(0, SECTION_LIMIT)
      : [];

  const shownRefs = new Set([currentRef, ...sellerItems.map(itemRef)]);
  const subcats = new Set(subcategories ?? []);
  const overlap = (item: Item): number => {
    if (subcats.size === 0 || !item.sc) return 0;
    let count = 0;
    for (const subcategory of item.sc) {
      if (subcats.has(subcategory)) count++;
    }
    return count;
  };

  const relatedItems = category
    ? items
        .filter((item) => item.c === category && !shownRefs.has(itemRef(item)))
        .sort((a, b) => {
          const overlapDiff = overlap(b) - overlap(a);
          if (overlapDiff !== 0) return overlapDiff;
          return hotness(b) - hotness(a);
        })
        .slice(0, SECTION_LIMIT)
    : [];

  if (sellerItems.length === 0 && relatedItems.length === 0) return null;

  const t = await getTranslations({ locale, namespace: "item.page" });

  return (
    <div className="mt-4 flex flex-col gap-4">
      {sellerItems.length > 0 && sellerName && (
        <RelatedItemsCard
          heading={t("moreFromSeller", {
            seller: decodeEntities(sellerName),
          })}
          items={sellerItems}
        />
      )}
      {relatedItems.length > 0 && category && (
        <RelatedItemsCard
          heading={t("relatedInCategory", { category })}
          items={relatedItems}
        />
      )}
    </div>
  );
}
