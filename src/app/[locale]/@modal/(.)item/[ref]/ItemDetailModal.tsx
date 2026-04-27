"use client";

import { useAtomValue } from "jotai";
import { Clock, ExternalLink, Share2, Star, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useLBGuideGate } from "@/hooks/useLBGuideGate";
import { decodeEntities } from "@/lib/format";
import { getItemPrimaryImage } from "@/lib/images";
import { normalizeLittleBiggyUrl } from "@/lib/tracking/littlebiggy";
import { itemsAtom, marketAtom } from "@/store/atoms";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ItemDetailModal({ refNum }: { refNum: string }) {
  const t = useTranslations("item.legacyModal");
  const router = useRouter();
  const items = useAtomValue(itemsAtom);
  const market = useAtomValue(marketAtom);

  const item = useMemo(
    () =>
      items.find((i) => String(i.refNum) === refNum || String(i.id) === refNum),
    [items, refNum],
  );
  const littleBiggyUrl = useMemo(
    () => (item?.sl ? normalizeLittleBiggyUrl(item.sl) : null),
    [item?.sl],
  );
  const littleBiggyEvent = useMemo(() => {
    if (!item || !littleBiggyUrl) return null;
    return {
      id: String(item.refNum ?? item.id),
      url: littleBiggyUrl,
      n: decodeEntities(item.n),
      sid: item.sid != null ? String(item.sid) : undefined,
      sn: item.sn ?? undefined,
      c: item.c ?? undefined,
      mkt: market,
    };
  }, [item, littleBiggyUrl, market]);
  const handleLittleBiggyClick = useLBGuideGate(littleBiggyEvent);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.back();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!item) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <button
          type="button"
          aria-label={t("close")}
          className="absolute inset-0 cursor-default"
          onClick={() => router.back()}
        />
        <div className="relative z-10 rounded-2xl border border-border bg-background p-8">
          <p className="text-muted">{t("itemNotFound")}</p>
        </div>
      </div>
    );
  }

  const imageUrl = getItemPrimaryImage(item, "full", { forceStatic: true });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <button
        type="button"
        aria-label={t("close")}
        className="absolute inset-0 cursor-default"
        onClick={() => router.back()}
      />
      <div
        className="relative z-10 mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl"
        role="dialog"
        aria-label={item.n}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute right-3 top-3 z-10 rounded-full bg-(--background)/80 p-1.5 text-muted hover:text-foreground transition-colors cursor-pointer"
          aria-label={t("close")}
        >
          <X size={18} />
        </button>

        {/* Image */}
        {imageUrl && (
          <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-surface">
            <Image
              src={imageUrl}
              alt={item.n}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 672px"
              priority
            />
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Category + subcategories */}
          <div className="flex flex-wrap gap-1.5">
            {item.c && (
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {item.c}
              </span>
            )}
            {item.sc?.map((sc) => (
              <span
                key={sc}
                className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted"
              >
                {sc}
              </span>
            ))}
          </div>

          {/* Name + seller */}
          <div>
            <h2 className="text-xl font-bold text-foreground">{item.n}</h2>
            {item.sn && (
              <p className="mt-1 text-sm text-muted">
                {t("by")}{" "}
                <span className="font-medium text-foreground">{item.sn}</span>
              </p>
            )}
          </div>

          {/* Price */}
          <div className="text-lg font-semibold text-primary">
            {item.uMin != null ? `$${item.uMin.toFixed(2)}` : t("unavailable")}
            {item.uMax != null &&
              item.uMax !== item.uMin &&
              ` – $${item.uMax.toFixed(2)}`}
          </div>

          {/* Description */}
          {item.d && (
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {item.d}
            </p>
          )}

          {/* Variants */}
          {item.v && item.v.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                {t("variants")}
              </h3>
              <div className="space-y-1">
                {item.v.map((v) => (
                  <div
                    key={v.vid ?? v.d}
                    className="flex justify-between rounded-md bg-surface px-3 py-1.5 text-sm"
                  >
                    <span className="text-foreground">
                      {decodeEntities(v.d)}
                    </span>
                    <span className="font-medium text-primary">
                      ${v.usd.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attributes */}
          {item.at && Object.keys(item.at).length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                {t("attributes")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(item.at).map(([key, vals]) =>
                  Array.isArray(vals)
                    ? vals.map((val) => (
                        <span
                          key={`${key}-${val}`}
                          className="rounded-md border border-border px-2 py-0.5 text-xs text-muted"
                        >
                          {key}: {val}
                        </span>
                      ))
                    : null,
                )}
              </div>
            </div>
          )}

          {/* Review stats + shipping */}
          <div className="flex flex-wrap gap-4 text-sm text-muted">
            {item.rs?.avg != null && (
              <span className="flex items-center gap-1">
                <Star size={14} className="text-amber-500" />
                {item.rs.avg.toFixed(1)}/10
                {item.rs.cnt != null && (
                  <span className="text-muted-foreground">
                    ({t("reviewsCount", { count: item.rs.cnt })})
                  </span>
                )}
              </span>
            )}
            {item.rs?.days != null && (
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {t("avgDelivery", { days: item.rs.days.toFixed(1) })}
              </span>
            )}
            {item.sh && (
              <span>
                {t("shipping")}:{" "}
                {item.sh.free
                  ? t("freeAvailable")
                  : `$${item.sh.min ?? 0} – $${item.sh.max ?? 0}`}
              </span>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            {item.fsa && (
              <span>
                {t("firstSeen", {
                  date: formatDate(item.fsa),
                })}
              </span>
            )}
            {item.lua && (
              <span>
                {t("updated", {
                  date: formatDate(item.lua),
                })}
              </span>
            )}
          </div>

          {/* Action links */}
          <div className="flex items-center gap-3 border-t border-border pt-4">
            {littleBiggyUrl && (
              <a
                href={littleBiggyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleLittleBiggyClick}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <ExternalLink size={14} />
                {t("viewOnLittleBiggy")}
              </a>
            )}
            <Link
              href={`/item/${refNum}`}
              prefetch={false}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              <Share2 size={14} />
              {t("fullPage")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
