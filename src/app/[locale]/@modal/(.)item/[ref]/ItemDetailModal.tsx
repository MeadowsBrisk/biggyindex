"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAtomValue } from "jotai";
import Image from "next/image";
import Link from "next/link";
import { X, Star, Clock, ExternalLink, Share2 } from "lucide-react";
import { itemsAtom } from "@/store/atoms";
import type { Item } from "@/lib/types";

export function ItemDetailModal({ refNum }: { refNum: string }) {
  const router = useRouter();
  const items = useAtomValue(itemsAtom);

  const item = useMemo(
    () => items.find((i) => String(i.refNum) === refNum || String(i.id) === refNum),
    [items, refNum],
  );

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
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={() => router.back()}
        role="presentation"
      >
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-8">
          <p className="text-muted">Item not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => router.back()}
      role="presentation"
    >
      <div
        className="relative mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={item.n}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute right-3 top-3 z-10 rounded-full bg-[var(--background)]/80 p-1.5 text-muted hover:text-foreground transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Image */}
        {item.i && (
          <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-surface">
            <Image
              src={item.i}
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
                by <span className="font-medium text-foreground">{item.sn}</span>
              </p>
            )}
          </div>

          {/* Price */}
          <div className="text-lg font-semibold text-primary">
            {item.uMin != null ? `$${item.uMin.toFixed(2)}` : "N/A"}
            {item.uMax != null && item.uMax !== item.uMin && ` – $${item.uMax.toFixed(2)}`}
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
                Variants
              </h3>
              <div className="space-y-1">
                {item.v.map((v, i) => (
                  <div
                    key={v.vid ?? i}
                    className="flex justify-between rounded-md bg-surface px-3 py-1.5 text-sm"
                  >
                    <span className="text-foreground">{v.d}</span>
                    <span className="font-medium text-primary">${v.usd.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attributes */}
          {item.at && Object.keys(item.at).length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Attributes
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(item.at).map(([key, vals]) =>
                  Array.isArray(vals)
                    ? vals.map((val) => (
                        <span
                          key={`${key}-${val}`}
                          className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs text-muted"
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
                  <span className="text-muted-foreground">({item.rs.cnt} reviews)</span>
                )}
              </span>
            )}
            {item.rs?.days != null && (
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {item.rs.days.toFixed(1)} days avg delivery
              </span>
            )}
            {item.sh && (
              <span>
                Shipping: {item.sh.free ? "Free available" : `$${item.sh.min ?? 0} – $${item.sh.max ?? 0}`}
              </span>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            {item.fsa && <span>First seen: {new Date(item.fsa).toLocaleDateString()}</span>}
            {item.lua && <span>Updated: {new Date(item.lua).toLocaleDateString()}</span>}
          </div>

          {/* Action links */}
          <div className="flex items-center gap-3 border-t border-[var(--border)] pt-4">
            {item.sl && (
              <a
                href={item.sl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <ExternalLink size={14} />
                View on LittleBiggy
              </a>
            )}
            <Link
              href={`/item/${refNum}`}
              prefetch={false}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              <Share2 size={14} />
              Full page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
