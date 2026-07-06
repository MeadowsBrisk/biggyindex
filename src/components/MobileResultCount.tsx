"use client";

import { useAtomValue } from "jotai";
import { useTranslations } from "next-intl";
import { filteredItemsAtom, itemsAtom } from "@/store/atoms";

/**
 * Mobile-only result count, rendered as its own muted line directly above the
 * grid (below the ActiveFilterBar pills card). On mobile the toolbar has no
 * room for the count without it colliding with the Filters / Sort / View / Saved
 * controls at ~360px, so it lives here instead. Desktop keeps the count inline
 * in the Toolbar (ResultCount). Its own line also has room to surface the
 * distinct-seller count, which the cramped mobile bar hid.
 */
export function MobileResultCount() {
  const t = useTranslations("browse.toolbar");
  const filtered = useAtomValue(filteredItemsAtom);
  const total = useAtomValue(itemsAtom);
  const isFiltered = filtered.length !== total.length;

  // Distinct sellers among the visible (filtered) items — mirrors ResultCount.
  const sellerCount = new Set(
    filtered.map((i) => i.sid).filter((sid): sid is number => sid != null),
  ).size;

  return (
    <div className="mb-2.5 flex items-baseline gap-1.5 px-0.5 text-[13px] tabular-nums sm:hidden">
      <span className="font-bold text-foreground">
        {(isFiltered ? filtered.length : total.length).toLocaleString()}
      </span>
      <span className="text-muted">
        {isFiltered
          ? `${t("ofLabel")} ${total.length.toLocaleString()}`
          : t("itemsLabel", { count: total.length })}
      </span>
      {sellerCount > 0 && (
        <span className="text-muted-foreground">
          · {sellerCount.toLocaleString()}{" "}
          {t("sellersLabel", { count: sellerCount })}
        </span>
      )}
    </div>
  );
}
