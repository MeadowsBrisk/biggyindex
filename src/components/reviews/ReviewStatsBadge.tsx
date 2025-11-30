"use client";
import React from "react";
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from "framer-motion";
import cn from "@/app/cn";

function getRatingClasses(rating: number | undefined) {
  if (typeof rating !== "number") return "bg-gray-500 text-white";
  if (rating >= 9) return "bg-[#187f3f] text-white";
  if (rating >= 8) return "bg-[#a96a08] text-white";
  return "bg-gray-500 text-white";
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M12 .587l3.668 7.431 8.2 1.73-6 5.848 1.4 8.404L12 19.771 4.732 24l1.4-8.404-6-5.848 8.2-1.73L12 .587z" />
    </svg>
  );
}

export type ReviewStats = {
  averageRating?: number;
  numberOfReviews?: number;
  averageDaysToArrive?: number;
  // Minified keys
  avg?: number;
  cnt?: number;
  days?: number;
} | null | undefined;

export default function ReviewStatsBadge({ reviewStats }: { reviewStats?: ReviewStats }): React.ReactElement | null {
  const tStats = useTranslations('ReviewStats');
  const tRev = useTranslations('Reviews');
  // Support both minified (avg, cnt, days) and legacy keys
  const rating = reviewStats?.avg ?? reviewStats?.averageRating;
  if (typeof rating !== "number") return null;

  const [open, setOpen] = React.useState(false);

  const reviewsCount = reviewStats?.cnt ?? reviewStats?.numberOfReviews;
  const avgDays = reviewStats?.days ?? reviewStats?.averageDaysToArrive;
  const ratingPercent = Math.max(0, Math.min(100, (rating / 10) * 100));

  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        onFocus={show}
        onBlur={hide}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-transparent shadow-sm select-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40",
          getRatingClasses(rating)
        )}
      >
        <StarIcon className="w-[10px] h-[10px]" />
        {rating.toFixed(1)}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute right-0 -top-2 -translate-y-full z-20"
          >
            <div className="relative">
              <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-2 w-56 text-[12px] leading-tight">
                <div className="flex items-center gap-2">
                  <div className={cn("rounded-md p-1 shrink-0", rating >= 9 ? "bg-green-100 dark:bg-green-900/30" : rating >= 8 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-gray-100 dark:bg-gray-800") }>
                    <StarIcon className={cn("w-3.5 h-3.5", rating >= 9 ? "text-green-700 dark:text-green-300" : rating >= 8 ? "text-amber-700 dark:text-amber-300" : "text-gray-600 dark:text-gray-300")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-[13px]">{tStats('title')}</span>
                      <span className="text-gray-500 dark:text-gray-400 truncate">{tStats('snapshot')}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-none">{rating.toFixed(1)}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-none">{tStats('outOfTen')}</div>
                  </div>
                </div>

                <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      rating >= 9 ? "bg-[#187f3f]" : rating >= 8 ? "bg-[#a96a08]" : "bg-gray-500"
                    )}
                    style={{ width: `${ratingPercent}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{tStats('avgArrival')}</div>
                    {(() => {
                      if (typeof avgDays === "number") {
                        const rounded = Math.round(avgDays);
                        const label = tRev('arrival', { days: rounded });
                        return <div className="text-[12px] font-medium text-gray-900 dark:text-gray-100">{label}</div>;
                      }
                      return <div className="text-[12px] font-medium text-gray-900 dark:text-gray-100">—</div>;
                    })()}
                  </div>
                  <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{tStats('reviews')}</div>
                    <div className="text-[12px] font-medium text-gray-900 dark:text-gray-100">{typeof reviewsCount === "number" ? reviewsCount : "—"}</div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-1 right-5 w-2.5 h-2.5 bg-white dark:bg-gray-900 border-b border-r border-gray-200 dark:border-gray-700 rotate-45" />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
