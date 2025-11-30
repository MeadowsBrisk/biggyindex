'use client';

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useReducer, useState } from "react";
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";

import { fadeInUp } from "@/sections/home/motionPresets";
import { formatBritishDateTime } from "@/lib/format";
import { relativeCompact } from "@/lib/relativeTimeCompact";
import { useTranslations, useFormatter } from 'next-intl';
import { proxyImage } from "@/lib/images";
import cn from "@/app/cn";
import SellerAvatarTooltip from "@/components/SellerAvatarTooltip";
import FilterPinButton from "@/components/FilterPinButton";

function formatScorePercent(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  const percent = score * 100;
  return `${Math.round(percent * 10) / 10}%`;
}

function titleCaseWords(str) {
  if (!str) return "";
  return String(str)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getInitials(name) {
  if (!name) return "?";
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "?";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function normalizeLeaderboardEntry(entry, index) {
  if (!entry || typeof entry !== "object") return null;
  const sellerName = entry.sellerName || "Unknown seller";
  const identifier = entry.sellerId ? `seller-${entry.sellerId}` : entry.url || `leaderboard-${index}`;
  const lastReviewRaw = entry.lastReviewAt;
  let lastReviewIso = null;
  if (typeof lastReviewRaw === "number" && Number.isFinite(lastReviewRaw)) {
    const ms = lastReviewRaw > 1e12 ? lastReviewRaw : lastReviewRaw * 1000;
    const derived = new Date(ms);
    if (!Number.isNaN(derived.getTime())) lastReviewIso = derived.toISOString();
  } else if (lastReviewRaw) {
    const derived = new Date(lastReviewRaw);
    if (!Number.isNaN(derived.getTime())) lastReviewIso = derived.toISOString();
  }

  // Format joined label if available (handles ISO or strings like "feb 2025")
  const toMonthIndex = (m) => {
    const map = { jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11 };
    const key = String(m || "").trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  };
  const formatJoinedLabel = (val) => {
    if (!val) return null;
    // Try ISO first
    const dIso = new Date(val);
    if (!Number.isNaN(dIso.getTime())) {
      try {
        const dtf = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
        const label = dtf.format(dIso);
        return `Joined ${label}`;
      } catch {}
    }
    // Try "mon yyyy" pattern
    const s = String(val).trim().toLowerCase().replace(/[,]+/g, " ");
    const m = s.match(/([a-z]{3,9})\s+(\d{4})/i);
    if (m) {
      const mi = toMonthIndex(m[1]);
      const year = Number.parseInt(m[2], 10);
      if (Number.isFinite(mi) && Number.isFinite(year)) {
        const d = new Date(Date.UTC(year, mi, 1));
        try {
          const dtf = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
          const label = dtf.format(d);
          return `Joined ${label}`;
        } catch {}
      }
    }
    // Fallback best-effort capitalization
    const pretty = String(val)
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return `Joined ${pretty}`;
  };
  const joinedRaw = entry.joinedAt || null;
  const joinedLabel = formatJoinedLabel(joinedRaw);
  // Try to compute a normalized ISO for joinedAt so UI can localize month/year
  let joinedAtIso = null;
  if (joinedRaw) {
    const d = new Date(joinedRaw);
    if (!Number.isNaN(d.getTime())) joinedAtIso = d.toISOString();
  }

  return {
    id: identifier,
    sellerId: entry.sellerId ?? null,
    rank: index + 1,
    sellerName,
    imageUrl: entry.imageUrl || null,
    url: entry.url || null,
    positive: Number.isFinite(entry.positive) ? entry.positive : null,
    negative: Number.isFinite(entry.negative) ? entry.negative : null,
    total: Number.isFinite(entry.total) ? entry.total : null,
    score: typeof entry.score === "number" && Number.isFinite(entry.score) ? entry.score : null,
    lastReviewAt: lastReviewIso,
    joinedLabel,
    joinedAtIso,
  };
}

const leaderboardVariantStyles = {
  top: {
    container: "border-emerald-200/60 bg-white/95 shadow-emerald-500/10 dark:border-emerald-400/25 dark:bg-white/[0.06] dark:shadow-emerald-500/10",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    rank: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    score: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    link: "hover:text-emerald-600 focus-visible:ring-emerald-500 dark:hover:text-emerald-300",
  },
  bottom: {
    container: "border-rose-200/60 bg-white/95 shadow-rose-500/10 dark:border-rose-400/25 dark:bg-white/[0.06] dark:shadow-rose-500/10",
    badge: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    rank: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    score: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    link: "hover:text-rose-600 focus-visible:ring-rose-500 dark:hover:text-rose-300",
  },
};

function LeaderboardPanel({ variant, title, subtitle, items, emptyMessage, mounted, meta }) {
  const tRel = useTranslations('Rel');
  const tHome = useTranslations('Home');
  const format = useFormatter();
  const styles = leaderboardVariantStyles[variant] || leaderboardVariantStyles.top;
  const list = Array.isArray(items) ? items : [];

  return (
    <div
      className={cn(
        "h-full rounded-3xl border p-4 sm:p-6 shadow-xl transition-colors duration-300",
        styles.container
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]", styles.badge)}>
            {variant === "bottom" ? tHome('leaderboard.badges.caution') : tHome('leaderboard.badges.leaders')}
          </span>
          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h4>
        </div>
        {subtitle && <p className="text-sm text-slate-600 dark:text-white/70">{subtitle}</p>}
      </div>

      {list.length ? (
        <ol className="mt-6 space-y-4">
          {list.map((entry) => {
            const scoreLabel = formatScorePercent(entry.score);
            const lastAbsolute = entry.lastReviewAt ? format.dateTime(new Date(entry.lastReviewAt), { dateStyle: 'medium', timeStyle: 'short' }) : null;
            const lastRelative = mounted && entry.lastReviewAt ? relativeCompact(entry.lastReviewAt, tRel) : null;
            const initials = getInitials(entry.sellerName);

            // Get overall average rating from sellers index
            const avg = (() => {
              const byId = meta.avgRatingById;
              const byName = meta.avgRatingByName;
              const id = entry.sellerId;
              let val = null;
              if (byId && id != null) {
                val = byId.get(id) ?? byId.get(Number(id)) ?? null;
              }
              if (val == null && byName && entry.sellerName) {
                const key = String(entry.sellerName).trim().toLowerCase();
                val = byName.get(key) ?? null;
              }
              return val;
            })();
            const avgLabel = Number.isFinite(avg) ? `${(Math.round(avg * 10) / 10).toFixed(1)}/10` : null;

            return (
              <li
                key={entry.id}
                className="relative rounded-2xl border border-slate-200/70 bg-white/80 p-3 sm:p-4 shadow-sm transition-colors duration-200 dark:border-white/10 dark:bg-white/[0.05] dark:shadow-black/30"
              >
                {/* Rating badges - top right on mobile */}
                <div className="absolute right-3 top-3 sm:hidden flex flex-col items-end gap-0.5">
                  {avgLabel && (
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold shadow-sm shadow-slate-900/5 dark:shadow-black/30", styles.score)} title={tHome('leaderboard.entry.avgTooltip')}>
                      {tHome('leaderboard.entry.avg', { value: avgLabel.replace('/10','') })}
                    </span>
                  )}
                  {scoreLabel && (
                    <span className="text-[9px] font-medium text-slate-500 dark:text-white/60" title={tHome('leaderboard.entry.scoreTooltip')}>
                      {tHome('leaderboard.entry.score', { percent: scoreLabel })}
                    </span>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-2">
                    <div className={cn("flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", styles.rank)}>
                      #{entry.rank}
                    </div>
                    {entry.imageUrl ? (
                      <SellerAvatarTooltip sellerName={entry.sellerName} sellerImageUrl={entry.imageUrl}>
                        <div className="relative h-10 w-10 sm:h-12 sm:w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 dark:border-white/15 dark:bg-white/10">
                          <img
                            src={proxyImage(entry.imageUrl, 96)}
                            alt={`${entry.sellerName} avatar`}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      </SellerAvatarTooltip>
                    ) : (
                      <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-100 text-xs font-semibold uppercase text-slate-500 dark:border-white/15 dark:bg-white/10 dark:text-white/70">
                        {initials}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pr-10 sm:pr-0">
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        {entry.sellerId ? (
                          <Link
                            href={`/seller/${entry.sellerId}`}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              "text-sm font-semibold text-slate-900 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-white",
                              styles.link
                            )}
                          >
                            {entry.sellerName}
                          </Link>
                        ) : entry.url ? (
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "text-sm font-semibold text-slate-900 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-white",
                              styles.link
                            )}
                          >
                            {entry.sellerName}
                          </a>
                        ) : (
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">{entry.sellerName}</span>
                        )}
                        {entry.total != null && (
                          <p className="text-[11px] text-slate-500 dark:text-white/60">{entry.total} reviews sampled</p>
                        )}
                      </div>
                      {/* Desktop rating badges */}
                      <div className="hidden sm:flex flex-col items-end gap-1">
                        {avgLabel && (
                          <span className={cn("rounded-full px-3 py-1 text-sm font-bold shadow-sm shadow-slate-900/5 dark:shadow-black/30", styles.score)} title={tHome('leaderboard.entry.avgTooltip')}>
                            {tHome('leaderboard.entry.avg', { value: avgLabel.replace('/10','') })}
                          </span>
                        )}
                        {scoreLabel && (
                          <span className="text-[10px] font-medium text-slate-500 dark:text-white/60" title={tHome('leaderboard.entry.scoreTooltip')}>
                            {tHome('leaderboard.entry.score', { percent: scoreLabel })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 sm:mt-3 flex flex-wrap items-center gap-x-2.5 sm:gap-x-4 gap-y-0.5 sm:gap-y-1 text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-white/60">
                      {entry.positive != null && (
                        <span className="text-emerald-600 dark:text-emerald-300">{tHome('leaderboard.entry.positive', { count: entry.positive })}</span>
                      )}
                      {Number.isFinite(entry.negative) ? (
                        <span className="text-rose-500 dark:text-rose-300">
                          {entry.negative > 0 ? tHome('leaderboard.entry.negative', { count: entry.negative }) : tHome('leaderboard.entry.negativeZero')}
                        </span>
                      ) : (
                        <span className="text-rose-500 dark:text-rose-300">{tHome('leaderboard.entry.negativeZero')}</span>
                      )}
                      {entry.total != null && <span>{tHome('leaderboard.entry.total', { count: entry.total })}</span>}
                      {entry.total != null && (
                        <span>{tHome('leaderboard.entry.reviewsSampled', { count: entry.total })}</span>
                      )}
                      {entry.lastReviewAt && (
                        <span className="w-full sm:w-auto">
                          {tHome('leaderboard.entry.lastReview')}
                          <span suppressHydrationWarning> {lastRelative || ""}</span>
                          {lastAbsolute && (
                            <span className="ml-1 text-[9px] sm:text-[10px] text-slate-400 dark:text-white/50">({lastAbsolute})</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200/70 bg-white/60 p-6 text-sm text-slate-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/60">
          {emptyMessage || tHome('leaderboard.emptyDefault')}
        </div>
      )}
    </div>
  );
}

export default function SellerLeaderboardSection({ leaderboard, sellersIndex }) {
  const tRel = useTranslations('Rel');
  const tHome = useTranslations('Home');
  const format = useFormatter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Accordion + pin state (persisted)
  const pinnedAtom = useMemo(() => atomWithStorage('homeLeaderboardPinned', false), []);
  const expandedAtom = useMemo(() => atomWithStorage('homeLeaderboardExpanded', false), []);
  const [pinned, setPinned] = useAtom(pinnedAtom);
  const [expanded, setExpanded] = useAtom(expandedAtom);
  useEffect(() => { if (pinned) setExpanded(true); }, [pinned, setExpanded]);

  const normalized = useMemo(() => {
    if (!leaderboard || typeof leaderboard !== "object") return null;
    // Support both new aggregated payload shape { generatedAt, week: { top,bottom }, all: { ... } }
    // and legacy shape { top,bottom, recent? }.
    const variant = (leaderboard && (leaderboard.week || leaderboard.all)) ? (leaderboard.week || leaderboard.all) : leaderboard;
    const topRaw = Array.isArray(variant.top) ? variant.top.slice(0, 8) : [];
    const bottomRaw = Array.isArray(variant.bottom) ? variant.bottom.slice(0, 8) : [];
    const recentRaw = Array.isArray(variant.recent) ? variant.recent.slice(0, 12) : [];
    const top = topRaw.map((entry, idx) => normalizeLeaderboardEntry(entry, idx)).filter(Boolean);
    const bottom = bottomRaw.map((entry, idx) => normalizeLeaderboardEntry(entry, idx)).filter(Boolean);
    const recent = recentRaw.map((entry, idx) => normalizeLeaderboardEntry(entry, idx)).filter(Boolean);
    if (!top.length && !bottom.length) return null;

    const generatedAt = (leaderboard.generatedAt || variant.generatedAt)
      ? (() => {
          const d = new Date(leaderboard.generatedAt || variant.generatedAt);
          return Number.isNaN(d.getTime()) ? null : d.toISOString();
        })()
      : null;

    const method = (() => {
      if (leaderboard && typeof leaderboard === 'object') {
        if (leaderboard.week) return { type: 'week' };
        if (leaderboard.all) return { type: 'all' };
        if (leaderboard.method && typeof leaderboard.method === 'object') return leaderboard.method;
      }
      return null;
    })();

    // Build lookups for averageRating from sellers index
    const avgRatingById = new Map(
      Array.isArray(sellersIndex)
        ? sellersIndex.map((s) => [s.id, Number.isFinite(s.averageRating) ? s.averageRating : null])
        : []
    );
    const avgRatingByName = new Map(
      Array.isArray(sellersIndex)
        ? sellersIndex
            .filter((s) => s && typeof s.name === 'string')
            .map((s) => [s.name.trim().toLowerCase(), Number.isFinite(s.averageRating) ? s.averageRating : null])
        : []
    );

    return { top, bottom, recent, generatedAt, method, avgRatingById, avgRatingByName };
  }, [leaderboard, sellersIndex]);

  const meta = useMemo(() => {
    if (!normalized) return null;
  const { top, bottom, recent, generatedAt, method, avgRatingById, avgRatingByName } = normalized;
    const methodBits = [];
    // if (method?.type) methodBits.push(titleCaseWords(method.type));
    // Display current aggregation window label
    methodBits.push(tHome('leaderboard.methodWindow'));
    const methodLabel = methodBits.length ? methodBits.join(" • ") : null;
    const generatedLabel = generatedAt ? format.dateTime(new Date(generatedAt), { dateStyle: 'medium', timeStyle: 'short' }) : null;

    return { top, bottom, recent, generatedAt, methodLabel, generatedLabel, avgRatingById, avgRatingByName };
  }, [normalized, tHome, format]);

  const hasLeaderboard = Boolean(meta && (meta.top.length || meta.bottom.length));

  const [, forceTick] = useReducer((tick) => tick + 1, 0);

  useEffect(() => {
    if (!hasLeaderboard) return undefined;
    const interval = window.setInterval(() => {
      forceTick();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [forceTick, hasLeaderboard]);

  // Compute the header's relative timestamp after mount to avoid SSR mismatch
  const [generatedRelative, setGeneratedRelative] = useState(null);
  useEffect(() => {
    if (!mounted || !meta?.generatedAt) return;
    const update = () => setGeneratedRelative(relativeCompact(meta.generatedAt, tRel));
    update();
    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, [mounted, meta?.generatedAt, tRel]);

  if (!hasLeaderboard || !meta) {
    return null;
  }

  return (
    <section className="bg-gradient-to-b from-slate-100 via-slate-50 to-white py-24 transition-colors duration-300 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white/90 shadow-xl dark:border-white/10 dark:bg-white/[0.06]">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-3 p-4 sm:p-6 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                <Trophy className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-white/60">{tHome('leaderboard.header.label')}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{tHome('leaderboard.header.title')}</h2>
                {meta.generatedLabel && (
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/60">
                    {tHome('leaderboard.header.updated', { date: meta.generatedLabel })}
                    <span className="ml-2 text-[10px] text-slate-400 dark:text-white/55" suppressHydrationWarning>
                      {generatedRelative ? `(${generatedRelative})` : ""}
                    </span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {expanded && (
                <FilterPinButton pinned={pinned} onToggle={() => setPinned((v)=>!v)} label={tHome('leaderboard.header.pinLabel')} />
              )}
              <svg viewBox="0 0 24 24" className={cn("h-5 w-5 transition-transform", expanded ? "rotate-180" : "rotate-0")} aria-hidden="true">
                <path fill="currentColor" d="M12 15.5 5.5 9l1.4-1.4L12 12.7l5.1-5.1L18.5 9z"/>
              </svg>
            </div>
          </button>

          <motion.div
            initial={false}
            animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-4 sm:px-6 sm:pb-6">
              <div className="grid gap-6 pt-2 lg:grid-cols-2">
                <LeaderboardPanel
                  variant="top"
                  title={tHome('leaderboard.top.title')}
                  subtitle={tHome('leaderboard.top.subtitle')}
                  items={meta.top}
                  mounted={mounted}
                  meta={meta}
                  emptyMessage={tHome('leaderboard.top.empty')}
                />
                <LeaderboardPanel
                  variant="bottom"
                  title={tHome('leaderboard.bottom.title')}
                  subtitle={tHome('leaderboard.bottom.subtitle')}
                  items={meta.bottom}
                  mounted={mounted}
                  meta={meta}
                  emptyMessage={tHome('leaderboard.bottom.empty')}
                />
              </div>

              {Array.isArray(meta.recent) && meta.recent.length > 0 && (
                <div className="mt-8">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{tHome('leaderboard.newSellers.title')}</h3>
                    <span className="rounded-full bg-slate-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-white/70">{tHome('leaderboard.newSellers.badge', { count: 12 })}</span>
                  </div>
                  <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {meta.recent.map((entry) => {
                      const initials = getInitials(entry.sellerName);
                      const avg = (() => {
                        const byId = meta.avgRatingById;
                        const byName = meta.avgRatingByName;
                        const id = entry.sellerId;
                        let val = null;
                        if (byId && id != null) {
                          val = byId.get(id) ?? byId.get(Number(id)) ?? null;
                        }
                        if (val == null && byName && entry.sellerName) {
                          const key = String(entry.sellerName).trim().toLowerCase();
                          val = byName.get(key) ?? null;
                        }
                        return val;
                      })();
                      const avgLabel = Number.isFinite(avg) ? `Avg ${(Math.round(avg * 10) / 10).toFixed(1)}/10` : null;
                      return (
                        <li key={entry.id} className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.05] dark:shadow-black/30">
                          {entry.imageUrl ? (
                            <SellerAvatarTooltip sellerName={entry.sellerName} sellerImageUrl={entry.imageUrl}>
                              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100 dark:border-white/15 dark:bg-white/10">
                                <img src={proxyImage(entry.imageUrl, 80)} alt={`${entry.sellerName} avatar`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                              </div>
                            </SellerAvatarTooltip>
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-100 text-[10px] font-semibold uppercase text-slate-500 dark:border-white/15 dark:bg-white/10 dark:text-white/70">
                              {initials}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              {entry.sellerId ? (
                                <Link href={`/seller/${entry.sellerId}`} target="_blank" rel="noreferrer" className="truncate text-sm font-semibold text-slate-900 transition hover:text-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-white">
                                  {entry.sellerName}
                                </Link>
                              ) : entry.url ? (
                                <a href={entry.url} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-semibold text-slate-900 transition hover:text-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-white">
                                  {entry.sellerName}
                                </a>
                              ) : (
                                <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{entry.sellerName}</span>
                              )}
                              {avgLabel ? (
                                <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-white/70">{tHome('leaderboard.entry.avg', { value: avgLabel.replace('/10','') })}</span>
                              ) : Number.isFinite(entry.total) ? (
                                <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-white/70">{tHome('leaderboard.entry.reviews', { count: entry.total })}</span>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-slate-500 dark:text-white/60">
                              {(entry.joinedAtIso || entry.joinedLabel) && (
                                <span className="text-slate-500 dark:text-white/70">
                                  {entry.joinedAtIso
                                    ? tHome('leaderboard.entry.joined', { date: format.dateTime(new Date(entry.joinedAtIso), { month: 'short', year: 'numeric' }) })
                                    : entry.joinedLabel}
                                </span>
                              )}
                              {Number.isFinite(entry.positive) && <span className="text-emerald-600 dark:text-emerald-300">+{entry.positive}</span>}
                              {Number.isFinite(entry.negative) && <span className="text-rose-500 dark:text-rose-300">-{entry.negative}</span>}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
