'use client';

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";

import { fadeInUp } from "@/sections/home/motionPresets";
import { useTranslations, useFormatter } from 'next-intl';
import { proxyImage } from "@/lib/ui/images";
import { formatBritishDateTime } from "@/lib/core/format";
import { relativeCompact } from "@/lib/ui/relativeTimeCompact";
import { useScreenSize } from "@/hooks/useScreenSize";

function normalizeMediaEntries(mediaEntries) {
  if (!Array.isArray(mediaEntries)) return [];
  return mediaEntries
    .map((entry, index) => {
      if (!entry || !Array.isArray(entry.images) || !entry.images.length) return null;
      const textSnippet = typeof entry.text === "string" ? entry.text.trim() : null;
      const images = entry.images.filter(Boolean);
      if (!images.length) return null;

      const baseId = entry.id ?? entry.refNum ?? images[0] ?? index;
      return {
        id: `${baseId}-${index}`,
        images,
        sellerName: entry.sellerName || "Unknown seller",
        itemName: entry.itemName || "Unknown item",
        refNum: entry.refNum || null,
        rating: entry.rating ?? null,
        daysToArrive: Number.isFinite(entry.daysToArrive) ? entry.daysToArrive : null,
        createdAt: entry.createdAt || null,
        text: textSnippet && textSnippet.length ? textSnippet : null,
      };
    })
    .filter(Boolean);
}

export default function RecentMediaSection({ mediaEntries }) {
  const tHome = useTranslations('Home');
  const format = useFormatter();
  const entries = useMemo(() => normalizeMediaEntries(mediaEntries), [mediaEntries]);
  if (!entries.length) return null;

  const { isMobile, isTablet, isSmallDesktop, isMediumDesktop, isUltrawide } = useScreenSize();
  const isTouchViewport = isMobile || isTablet;

  let perImageWidth = 22;
  if (isMobile) perImageWidth = 70;
  else if (isTablet) perImageWidth = 45;
  else if (isSmallDesktop) perImageWidth = 28;
  else if (isUltrawide) perImageWidth = 18;
  else if (isMediumDesktop) perImageWidth = 24;

  const tileHeight = isMobile ? "48vh" : isTablet ? "54vh" : "58vh";

  return (
    <section className="relative overflow-hidden py-24 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-100 via-white to-slate-100 opacity-70 blur-3xl dark:hidden" aria-hidden />
      <div className="pointer-events-none absolute inset-0 hidden bg-slate-950/70 blur-3xl dark:block" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[120%] -translate-y-1/2 bg-gradient-to-r from-emerald-200/40 via-transparent to-blue-200/40 blur-3xl dark:from-emerald-500/10 dark:via-transparent dark:to-blue-500/10" aria-hidden />

      <div className="relative px-0">
        <motion.div {...fadeInUp({ trigger: "view", viewportAmount: 0.45 })} className="mx-auto max-w-5xl px-6 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600/80 dark:text-emerald-400/80">{tHome('media.latestSnaps')}</span>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{tHome('media.title')}</h2>
          <p className="mt-4 text-base text-slate-600 dark:text-white/70">
            {tHome('media.subtitle')}
          </p>
        </motion.div>

        <MediaStrip
          entries={entries}
          perImageWidth={perImageWidth}
          tileHeight={tileHeight}
          isTouchViewport={isTouchViewport}
        />
      </div>
    </section>
  );
}

function MediaStrip({ entries, perImageWidth, tileHeight, isTouchViewport }) {
  if (isTouchViewport) {
    return (
      <div className="relative mt-14 w-full">
        <Swiper
          modules={[Navigation, Autoplay]}
          slidesPerView={1.15}
          centeredSlides
          spaceBetween={16}
          breakpoints={{
            640: { slidesPerView: 1.5, centeredSlides: false, spaceBetween: 20 },
            1024: { slidesPerView: 2, centeredSlides: false, spaceBetween: 24 },
          }}
          autoplay={{ delay: 4000, disableOnInteraction: true }}
          className="pb-6"
        >
          {entries.map((entry, index) => (
            <SwiperSlide key={`${entry.id}-touch-${index}`}>
              <MediaTile
                entry={entry}
                perImageWidth={perImageWidth}
                tileHeight={tileHeight}
                isTouchViewport
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    );
  }

  const stripRef = useRef(null);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const measure = () => {
      if (!stripRef.current) return;
      const totalWidth = stripRef.current.scrollWidth;
      setDistance(totalWidth / 2);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [entries, perImageWidth]);

  const durationSeconds = distance ? Math.max(12, distance / 120) : 0;
  const duplicated = [...entries, ...entries];

  return (
    <div className="relative mt-16 w-full overflow-hidden">
      <div
        ref={stripRef}
        className="media-strip flex"
        style={{
          animationDuration: durationSeconds ? `${durationSeconds}s` : undefined,
          animationPlayState: durationSeconds ? undefined : "paused",
          "--media-distance": `${distance}px`,
        }}
      >
        {duplicated.map((entry, index) => (
          <MediaTile
            key={`${entry.id}-${index}`}
            entry={entry}
            perImageWidth={perImageWidth}
            tileHeight={tileHeight}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-emerald-100/30 via-emerald-50/10 to-transparent dark:from-slate-900/40 dark:via-slate-900/10 dark:to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white/50 via-white/10 to-transparent dark:from-slate-900/40 dark:via-slate-900/10 dark:to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-emerald-100/30 via-emerald-50/10 to-transparent dark:from-slate-900/40 dark:via-slate-900/10 dark:to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white/50 via-white/10 to-transparent dark:from-slate-900/40 dark:via-slate-900/10 dark:to-transparent" aria-hidden />

      <style jsx>{`
        .media-strip {
          animation-name: media-strip-scroll;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .media-strip:hover {
          animation-play-state: paused;
        }
        @keyframes media-strip-scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(calc(-1 * var(--media-distance)));
          }
        }
      `}</style>
    </div>
  );
}

function MediaTile({ entry, perImageWidth, tileHeight, isTouchViewport = false }) {
  const tHome = useTranslations('Home');
  const format = useFormatter();
  const daysLabel =
    entry.daysToArrive != null
      ? entry.daysToArrive === 0
        ? tHome('media.entry.arrival.sameDay')
        : (entry.daysToArrive === 1
            ? tHome('media.entry.arrival.oneDay')
            : tHome('media.entry.arrival.days', { days: entry.daysToArrive }))
      : null;
  const capturedAbsolute = entry.createdAt ? format.dateTime(new Date(entry.createdAt), { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const capturedLabel = capturedAbsolute ? tHome('media.entry.captured', { date: capturedAbsolute }) : null;
  const tRel = useTranslations('Rel');
  const relativeLabel = entry.createdAt ? relativeCompact(entry.createdAt, tRel) : null;

  const CardWrapper = entry.refNum ? Link : "div";
  const cardProps = entry.refNum
    ? {
        href: `/item/${entry.refNum}`,
        target: "_blank",
        rel: "noreferrer",
      }
    : {};

  const baseWidth = Math.min(entry.images.length, 3) * perImageWidth;
  const touchWidth = Math.min(baseWidth, 100);

  return (
    <CardWrapper
      {...cardProps}
      className={`group relative block shrink-0 overflow-hidden rounded-xl xl:rounded-none ${isTouchViewport ? "" : "max-h-[420px]"}`}
      style={isTouchViewport ? undefined : { width: `${baseWidth}vw`, height: tileHeight }}
    >
      <div className={`${isTouchViewport ? "relative" : "absolute inset-0"} flex`} style={isTouchViewport ? { height: tileHeight } : undefined}>
        {entry.images.slice(0, 3).map((imageUrl, idx) => (
          <div
            key={`${entry.id}-img-${idx}`}
            className="relative" style={{ width: `${100 / Math.min(entry.images.length, 3)}%` }}
          >
            <img
              src={proxyImage(imageUrl, 400)}
              alt={entry.itemName}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
            />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/10 dark:bg-black/40" aria-hidden />
          </div>
        ))}
      </div>

      {/* Desktop: overlay hover effect */}
      {!isTouchViewport && (
        <>
          <div className="absolute inset-0 bg-black/0 transition duration-300 group-hover:bg-black/25" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" aria-hidden />
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/40 to-transparent px-6 py-6 text-white opacity-0 translate-y-4 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">{entry.sellerName || tHome('reviews.labels.unknownSeller')}</p>
            <p className="mt-1 text-lg font-semibold">{entry.itemName || tHome('reviews.labels.unknownItem')}</p>
            {entry.text && <p className="mt-3 max-h-28 overflow-hidden text-sm leading-relaxed text-white/85 max-w-xl">{entry.text}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-white/70">
              {entry.rating != null && <span>{tHome('media.entry.rating', { value: entry.rating })}</span>}
              {daysLabel && <span>{daysLabel}</span>}
              {capturedLabel && <span>{capturedLabel}</span>}
              {relativeLabel && <span>{relativeLabel}</span>}
            </div>
          </div>
        </>
      )}

      {/* Mobile/Tablet: content below image */}
      {isTouchViewport && (
        <div className="bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-white/10">
          <div className="px-4 pt-3 pb-2 h-44 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400 font-semibold">{entry.sellerName || tHome('reviews.labels.unknownSeller')}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{entry.itemName || tHome('reviews.labels.unknownItem')}</p>
            {entry.text && (
              <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-white/80">
                {entry.text}
              </p>
            )}
          </div>
          <div className="px-4 pb-3 pt-2 border-t border-slate-200/50 dark:border-white/5 flex flex-wrap items-center gap-2 text-[10px] text-slate-600 dark:text-white/60 font-medium">
            {entry.rating != null && <span className="text-emerald-600 dark:text-emerald-400">{tHome('media.entry.rating', { value: entry.rating })}</span>}
            {daysLabel && <span>{daysLabel}</span>}
            {relativeLabel && <span>{relativeLabel}</span>}
          </div>
        </div>
      )}
    </CardWrapper>
  );
}
