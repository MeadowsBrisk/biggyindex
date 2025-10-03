import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import cn from "@/app/cn";
import Image from "next/image";
import { proxyImage } from "@/lib/images";
import { timeAgo } from "@/lib/format";
import { AnimatePresence, motion } from "framer-motion";
import SellerAvatarTooltip from "@/components/SellerAvatarTooltip";

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => (p[0] || '').toUpperCase()).join("") || "?";
}

const fallbackItems = [
  {
    id: "placeholder-1",
    name: "Freshly indexed cannabis flower",
    sellerName: "Vendor pending",
    category: "Flower",
    createdAt: null,
    url: null,
    imageUrl: null,
  },
  {
    id: "placeholder-2",
    name: "New concentrates or extracts",
    sellerName: "Vendor pending",
    category: "Concentrates",
    createdAt: null,
    url: null,
    imageUrl: null,
  },
  {
    id: "placeholder-3",
    name: "Recently crawled edibles",
    sellerName: "Vendor pending",
    category: "Edibles",
    createdAt: null,
    url: null,
    imageUrl: null,
  },
];

const tabs = [
  { key: "added", label: "Recently added" },
  { key: "updated", label: "Recently updated" },
];

export default function RecentItemsSection({ items }) {
  const { added = [], updated = [] } = items || {};
  const fallbackMap = useMemo(() => ({
    added: fallbackItems,
    updated: fallbackItems,
  }), []);

  const [activeTab, setActiveTab] = useState("added");
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0); // refresh relative times periodically
  const [isBeginning, setIsBeginning] = useState(true);
  const [isEnd, setIsEnd] = useState(false);

  useEffect(() => {
    setMounted(true);
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const list = useMemo(() => {
    const source = activeTab === "updated" ? updated : added;
    if (Array.isArray(source) && source.length) return source;
    return fallbackMap[activeTab];
  }, [activeTab, added, updated, fallbackMap]);

  return (
    <section className="bg-slate-100 py-20 xl:pb-30 transition-colors duration-300 dark:bg-slate-950">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-12 xl:px-16 overflow-hidden">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500/80 dark:text-emerald-400/80">Fresh Activity</span>
            <h2 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">Recently indexed items</h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-white/70">See the latest, or most recently updated items on LittleBiggy.</p>
          </div>
          <div className="flex items-center justify-end gap-3">
            {tabs.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 dark:focus-visible:ring-offset-slate-950",
                    isActive
                      ? "bg-emerald-500 text-slate-950 shadow shadow-emerald-500/40"
                      : "border border-slate-300 text-slate-600 hover:border-emerald-400/60 hover:text-emerald-600 dark:border-white/15 dark:text-white/70 dark:hover:text-white"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
            <div className="ml-2 hidden items-center gap-2 lg:flex">
              <button
                type="button"
                disabled={isBeginning}
                className={cn(
                  "recent-items-prev rounded-full border p-2.5 shadow-sm transition",
                  isBeginning
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-white/30"
                    : "border-slate-300 bg-white text-slate-600 hover:border-emerald-400/60 hover:text-emerald-500 dark:border-white/20 dark:bg-white/10 dark:text-white"
                )}
                aria-label="Previous"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={isEnd}
                className={cn(
                  "recent-items-next rounded-full border p-2.5 shadow-sm transition",
                  isEnd
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-white/30"
                    : "border-slate-300 bg-white text-slate-600 hover:border-emerald-400/60 hover:text-emerald-500 dark:border-white/20 dark:bg-white/10 dark:text-white"
                )}
                aria-label="Next"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        <div className="relative">

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: [0.25, 0.8, 0.25, 1] }}
            >
              <Swiper
                modules={[Navigation, Autoplay]}
                navigation={{
                  nextEl: ".recent-items-next",
                  prevEl: ".recent-items-prev",
                }}
                slidesPerView={1.15}
                centeredSlides
                spaceBetween={29}
                breakpoints={{
                  640: { slidesPerView: 2, centeredSlides: false, spaceBetween: 20 },
                  1000: { slidesPerView: 3, centeredSlides: false, spaceBetween: 20 },
                  1224: { slidesPerView: 4, centeredSlides: false, spaceBetween: 24 },
                  2400: { slidesPerView: 6, centeredSlides: false, spaceBetween: 24 },
                  3400: { slidesPerView: 7, centeredSlides: false, spaceBetween: 24 },
                }}
                style={{ overflow: 'visible' }}
                autoplay={{ delay: 5000, disableOnInteraction: false }}
                onSwiper={(swiper) => {
                  setIsBeginning(swiper.isBeginning);
                  setIsEnd(swiper.isEnd);
                }}
                onSlideChange={(swiper) => {
                  setIsBeginning(swiper.isBeginning);
                  setIsEnd(swiper.isEnd);
                }}
              >
                {list.map((item, index) => (
                  <SwiperSlide key={`${activeTab}-${item.id || index}`} className="flex">
                    <div className="flex w-full">
                      <Link
                        href={item.refNum ? `/item/${item.refNum}` : item.url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full"
                      >
                        <article
                          className={cn(
                            "flex h-full w-full min-h-[360px] flex-col overflow-hidden rounded-xl p-1 border border-slate-200 bg-white text-left shadow-sm shadow-black/10 transition-colors duration-200 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-black/20",
                            "hover:border-emerald-400/50"
                          )}
                        >
                          <div className="relative aspect-square md:aspect-[350/280] w-full overflow-hidden border-b border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5 rounded-[6px] overflow-hidden">
                            {item.imageUrl ? (
                              <img
                                src={proxyImage(item.imageUrl)}
                                alt={item.name}
                                loading="lazy"
                                decoding="async"
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs text-slate-400 dark:text-white/40">No image</div>
                            )}
                            <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-white shadow-sm">
                              {item.category || "New"}
                            </span>
                          </div>
                          <div className="flex flex-1 flex-col gap-3 px-4 py-4">
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white line-clamp-3">{item.name}</h3>
                            <div className="my-2 h-px w-full bg-slate-200 dark:bg-white/10" />
                            <div className="mt-auto flex items-start gap-3 text-[11px] text-slate-500 dark:text-white/60">
                              <SellerAvatarTooltip sellerName={item.sellerName} sellerImageUrl={item.sellerImageUrl}>
                                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded bg-slate-100 dark:bg-white/10 cursor-pointer">
                                  {item.sellerImageUrl ? (
                                    <img src={proxyImage(item.sellerImageUrl)} alt={item.sellerName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase text-slate-400 dark:text-white/50">
                                      {getInitials(item.sellerName)}
                                    </div>
                                  )}
                                </div>
                              </SellerAvatarTooltip>
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-slate-700 dark:text-white/80">{item.sellerName}</div>
                                <div className="text-[10px] text-slate-500 dark:text-white/60">
                                  {(item.metaLabel || "Added")} {" "}
                                  <span suppressHydrationWarning>{mounted && item.createdAt ? timeAgo(item.createdAt) : ""}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </article>
                      </Link>
                    </div>
                  </SwiperSlide>
                ))}
              </Swiper>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

