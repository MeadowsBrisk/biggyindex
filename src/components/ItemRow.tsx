"use client";

/**
 * ItemRow — compact one-row-per-item rendering for the browse list view
 * (viewLayoutAtom === "list"). A scanning layout: small thumb, name +
 * category/subcategory pill + key attributes + rating, seller, price + PPU.
 * Everything richer (gallery, variants, description) lives one click away in
 * the item detail overlay — same as the cards. Ported from food-aggregator's
 * ItemRow, adapted to biggy's item shape + minified keys.
 */

import { useSetAtom } from "jotai";
import { Heart, Package, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CountryFlag } from "@/components/icons/CountryFlag";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { getItemBrowseMeta } from "@/lib/browse/item-index";
import { cx } from "@/lib/cn";
import { decodeEntities } from "@/lib/format";
import { getItemPrimaryImage, getSellerImageUrl } from "@/lib/images";
import { shipFromCode, shipFromLabel } from "@/lib/shipFrom";
import type { Item } from "@/lib/types";
import {
  cheapestPpu,
  itemVariantContext,
  UNIT_DISPLAY_LABEL,
} from "@/lib/variants";
import { expandedRefNumAtom, toggleBookmarkAtom } from "@/store/atoms";
import { type CardConfig, type RelativeAge, relativeAge } from "./ItemCard";

function fmtPrice(
  min: number | null | undefined,
  max: number | null | undefined,
  sym: string,
  rate: number,
): string {
  if (min == null) return "N/A";
  const lo = `${sym}${(min * rate).toFixed(2)}`;
  return max != null && max > min ? `${sym}${Math.round(min * rate)}+` : lo;
}

export function ItemRow({
  item,
  config,
  isBookmarked,
}: {
  item: Item;
  config: CardConfig;
  isBookmarked: boolean;
}) {
  const { cSym, cRate, sellersMap, includeShipping, itemIndex, clientNow } =
    config;
  const t = useTranslations("browse.card");
  const locale = useLocale();
  const setRefNum = useSetAtom(expandedRefNumAtom);
  const toggleBookmark = useSetAtom(toggleBookmarkAtom);

  const meta = getItemBrowseMeta(itemIndex, item);
  const itemKey = meta.bookmarkKey;
  const displayName = decodeEntities(item.n);

  const img = getItemPrimaryImage(item, "thumb", { forceStatic: true });
  const seller =
    item.sid != null ? sellersMap.get(String(item.sid)) : undefined;
  const sellerAvatarUrl = getSellerImageUrl(seller?.imageUrl);

  const subcategory = item.sc?.[0];
  const effect =
    item.c === "Flower" || item.c === "Shake"
      ? (item.at?.effect?.[0] ?? null)
      : null;
  const tierValue = item.at?.tier;
  const tier = Array.isArray(tierValue)
    ? (tierValue[0] ?? null)
    : typeof tierValue === "string"
      ? tierValue
      : null;

  const shipCode = item.sf ? shipFromCode(item.sf) : null;

  // Cheapest PPU across the item's variants (shipping folded in when the
  // include-shipping toggle is on), mirroring the card footer.
  const shipSurcharge =
    includeShipping && item.sh?.free !== 1 && item.sh?.min != null
      ? item.sh.min
      : 0;
  const bestPpu = cheapestPpu(item.v, shipSurcharge, itemVariantContext(item));

  // Compact freshness line under the price — updated when the crawler saw a
  // real change, else the listed age. One line only; the row is too dense for
  // the card footer's two-line stack (hover title carries the other value).
  const updatedAge =
    item.lua && item.lur && item.lur !== "N"
      ? relativeAge(item.lua, clientNow)
      : null;
  const listedAge = relativeAge(item.fsa, clientNow);
  const rowAge: { key: "updated" | "listed"; age: RelativeAge } | null =
    updatedAge
      ? { key: "updated", age: updatedAge }
      : listedAge
        ? { key: "listed", age: listedAge }
        : null;

  return (
    <div className="irow">
      <button
        type="button"
        className="irow-main"
        onClick={() => setRefNum(String(item.refNum ?? item.id))}
        aria-label={t("preview", { item: displayName })}
      >
        <span className="irow-art">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" loading="lazy" />
          ) : (
            <Package size={20} />
          )}
        </span>
        <span className="irow-id">
          <span className="irow-name" title={displayName}>
            {displayName}
          </span>
          <span className="irow-tags">
            {item.rs?.avg != null && item.rs.avg > 0 && (
              <span className="irow-rating">
                <Star size={9} className="fill-current" />
                {item.rs.avg.toFixed(1)}
                {item.rs.cnt != null && item.rs.cnt > 0 && (
                  <span className="irow-rating__count">({item.rs.cnt})</span>
                )}
              </span>
            )}
            {item.c && (
              <span className="irow-pill">
                {subcategory ? `${item.c} · ${subcategory}` : item.c}
              </span>
            )}
            {effect && (
              <span className="irow-pill irow-pill--attr">
                <span
                  className={`irow-effect-dot irow-effect-dot--${effect.toLowerCase()}`}
                  aria-hidden="true"
                />
                {effect}
              </span>
            )}
            {tier && <span className="irow-pill">{tier}</span>}
          </span>
        </span>
        <span className="irow-seller">
          <SellerAvatarTooltip
            sellerName={item.sn ?? "?"}
            imageUrl={sellerAvatarUrl}
          >
            {sellerAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sellerAvatarUrl}
                alt=""
                className="irow-seller-logo"
                loading="lazy"
              />
            ) : (
              <span className="irow-seller-avatar" aria-hidden="true">
                {(item.sn ?? "?").charAt(0)}
              </span>
            )}
          </SellerAvatarTooltip>
          {/* Seller name is plain text here — the row itself opens the item
              overlay, from which the seller modal is reachable. Keeping it
              non-interactive avoids nesting a button inside the row button. */}
          <span className="irow-seller-name">{item.sn}</span>
          {shipCode && (
            <span
              className="irow-ship-flag"
              title={shipFromLabel(shipCode, locale)}
            >
              <CountryFlag code={shipCode} size={12} />
            </span>
          )}
        </span>
        <span className="irow-price">
          <span className="irow-price-main">
            {fmtPrice(item.uMin, item.uMax, cSym, cRate)}
          </span>
          {bestPpu && (
            <span className="irow-ppu">
              {cSym}
              {(bestPpu.ppu * cRate).toFixed(2)}/
              {UNIT_DISPLAY_LABEL[bestPpu.unit] ?? bestPpu.unit}
            </span>
          )}
          {rowAge && (
            <span
              className="irow-time"
              title={
                [
                  updatedAge && item.lua
                    ? t("updated", {
                        time: t(`time.${updatedAge.unit}Ago`, {
                          count: updatedAge.count,
                        }),
                      })
                    : null,
                  listedAge
                    ? t("listed", {
                        time: t(`time.${listedAge.unit}Ago`, {
                          count: listedAge.count,
                        }),
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            >
              {t(rowAge.key, {
                time: t(`time.${rowAge.age.unit}Ago`, {
                  count: rowAge.age.count,
                }),
              })}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        className={cx("irow-save", isBookmarked && "irow-save--on")}
        onClick={(e) => {
          e.stopPropagation();
          toggleBookmark(itemKey);
        }}
        aria-label={isBookmarked ? t("removeBookmark") : t("bookmarkProduct")}
        title={isBookmarked ? t("removeBookmark") : t("bookmarkProduct")}
      >
        <Heart size={14} className={isBookmarked ? "fill-current" : ""} />
      </button>
    </div>
  );
}
