"use client";

import { useSetAtom } from "jotai";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Circle,
  Package,
  Search,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { getSellerImageUrl } from "@/lib/images";
import type { Seller } from "@/lib/types";
import { sellerModalIdAtom } from "@/store/atoms";

interface LeaderboardEntry {
  sellerId: string;
  sellerName: string;
  imageUrl?: string;
  url?: string;
  score: number;
  positive: number;
  negative: number;
  total: number;
  lastReviewAt: string;
}

interface LeaderboardPeriod {
  top: LeaderboardEntry[];
  bottom: LeaderboardEntry[];
}

interface LifetimeStats {
  totalReviews: number;
  positiveCount: number;
  negativeCount: number;
  perfectScoreCount: number;
  avgRating: number;
  avgDaysToArrive?: number;
}

interface Props {
  sellers: Seller[];
  analyticsMap: Record<string, LifetimeStats>;
  leaderboardAllTime: LeaderboardPeriod;
  leaderboardWeekly: LeaderboardPeriod;
  generatedAt?: string;
}

type SortKey =
  | "name"
  | "reviews"
  | "reported"
  | "rating"
  | "delivery"
  | "items"
  | "positive"
  | "negatives"
  | "perfect";
type SortDir = "asc" | "desc";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/* ---------- Leaderboard card (matches home SellerTrustBoard design) ---------- */

type Tone = "emerald" | "amber";

const TONE_RING: Record<Tone, string> = {
  emerald: "ring-emerald-500/40",
  amber: "ring-amber-500/40",
};

const TONE_INITIAL_BG: Record<Tone, string> = {
  emerald: "bg-emerald-500/10 text-emerald-500",
  amber: "bg-amber-500/10 text-amber-500",
};

function LbAvatar({
  entry,
  tone,
  size = 36,
  ring = false,
}: {
  entry: LeaderboardEntry;
  tone: Tone;
  size?: number;
  ring?: boolean;
}) {
  const avatarUrl = getSellerImageUrl(entry.imageUrl);
  const ringCls = ring
    ? `ring-2 ring-offset-2 ring-offset-[var(--card)] ${TONE_RING[tone]}`
    : "";
  return (
    <SellerAvatarTooltip sellerName={entry.sellerName} imageUrl={avatarUrl}>
      {avatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={avatarUrl}
          alt={entry.sellerName}
          className={`rounded-full object-cover shrink-0 ${ringCls}`}
          style={{ width: size, height: size }}
          loading="lazy"
        />
      ) : (
        <div
          className={`rounded-full flex items-center justify-center font-bold shrink-0 ${TONE_INITIAL_BG[tone]} ${ringCls}`}
          style={{
            width: size,
            height: size,
            fontSize: Math.max(10, Math.round(size * 0.36)),
          }}
        >
          {getInitials(entry.sellerName)}
        </div>
      )}
    </SellerAvatarTooltip>
  );
}

function LbMeterBar({ pct, tone }: { pct: number; tone: Tone }) {
  const gradient =
    tone === "emerald"
      ? "bg-gradient-to-r from-emerald-500/70 to-emerald-400"
      : "bg-gradient-to-r from-amber-500/70 to-red-400";
  return (
    <div className="relative h-[3px] w-full rounded-full bg-[var(--border)]/60 overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 ${gradient} rounded-full`}
        style={{ width: `${Math.max(3, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function LeaderboardCard({
  title,
  subtitle,
  icon,
  entries,
  variant,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  entries: LeaderboardEntry[];
  variant: "top" | "bottom";
}) {
  const t = useTranslations("seller.page.leaderboard");
  const openSeller = useSetAtom(sellerModalIdAtom);
  const isTop = variant === "top";
  const tone: Tone = isTop ? "emerald" : "amber";
  const totalReviews = entries.reduce((sum, e) => sum + e.total, 0);

  const accentGrad =
    tone === "emerald"
      ? "from-emerald-500/10 via-transparent to-transparent"
      : "from-amber-500/10 via-transparent to-transparent";
  const iconBg =
    tone === "emerald"
      ? "bg-emerald-500/15 text-emerald-500"
      : "bg-amber-500/15 text-amber-500";

  return (
    <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div
        className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${accentGrad} pointer-events-none`}
        aria-hidden
      />

      <header className="relative flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]/70">
        <div className={`rounded-xl p-2 ${iconBg}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground leading-tight">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {t("reviews")}
          </p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {compact(totalReviews)}
          </p>
        </div>
      </header>

      <ul className="relative divide-y divide-[var(--border)]/60">
        {entries.map((e, i) => {
          const pct =
            e.total > 0 ? Math.round((e.positive / e.total) * 100) : 0;
          const featured = i === 0;
          const pctColor = isTop
            ? pct >= 90
              ? "text-emerald-500"
              : pct >= 75
                ? "text-emerald-400"
                : "text-foreground/70"
            : pct <= 50
              ? "text-red-400"
              : "text-amber-500";

          return (
            <li key={e.sellerId}>
              <button
                type="button"
                onClick={() => openSeller(e.sellerId)}
                className="group w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
              >
                <LbAvatar
                  entry={e}
                  tone={tone}
                  size={featured ? 48 : 36}
                  ring={featured}
                />

                <div className="flex-1 min-w-0">
                  <p
                    className={`truncate font-medium text-foreground transition-colors group-hover:text-primary ${
                      featured ? "text-[15px]" : "text-sm"
                    }`}
                  >
                    {e.sellerName}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                    <span>{t("reviewCount", { count: e.total })}</span>
                    {!isTop && e.negative > 0 && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-red-400/80">
                          {t("negativeCount", { count: e.negative })}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0 w-20">
                  <span
                    className={`font-bold tabular-nums ${pctColor} ${
                      featured ? "text-xl" : "text-base"
                    }`}
                  >
                    {pct}%
                  </span>
                  <LbMeterBar pct={pct} tone={tone} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- Sort header ---------- */
function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = currentSort === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      {label}
      {active &&
        (currentDir === "asc" ? (
          <ChevronUp size={12} />
        ) : (
          <ChevronDown size={12} />
        ))}
    </button>
  );
}

/* ---------- Main component ---------- */
export function SellersPageClient({
  sellers,
  analyticsMap,
  leaderboardAllTime,
  leaderboardWeekly,
  generatedAt,
}: Props) {
  const t = useTranslations("seller.page");
  const openSeller = useSetAtom(sellerModalIdAtom);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("reviews");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [leaderboardTab, setLeaderboardTab] = useState<"all" | "week">("all");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filtered = useMemo(() => {
    let list = [...sellers];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    const positiveRate = (id: number | string) => {
      const a = analyticsMap[String(id)];
      if (!a || a.totalReviews <= 0) return -1;
      return (a.positiveCount / a.totalReviews) * 100;
    };
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "reviews":
          cmp =
            (analyticsMap[String(a.id)]?.totalReviews ??
              a.numberOfReviews ??
              0) -
            (analyticsMap[String(b.id)]?.totalReviews ??
              b.numberOfReviews ??
              0);
          break;
        case "reported":
          cmp = (a.numberOfReviews ?? 0) - (b.numberOfReviews ?? 0);
          break;
        case "rating":
          cmp = (a.averageRating ?? 0) - (b.averageRating ?? 0);
          break;
        case "delivery":
          cmp = (a.averageDaysToArrive ?? 99) - (b.averageDaysToArrive ?? 99);
          break;
        case "items":
          cmp = (a.itemsCount ?? 0) - (b.itemsCount ?? 0);
          break;
        case "positive":
          cmp = positiveRate(a.id) - positiveRate(b.id);
          break;
        case "negatives":
          cmp =
            (analyticsMap[String(a.id)]?.negativeCount ?? 0) -
            (analyticsMap[String(b.id)]?.negativeCount ?? 0);
          break;
        case "perfect":
          cmp =
            (analyticsMap[String(a.id)]?.perfectScoreCount ?? 0) -
            (analyticsMap[String(b.id)]?.perfectScoreCount ?? 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [sellers, analyticsMap, search, sortKey, sortDir]);

  const leaderboard =
    leaderboardTab === "all" ? leaderboardAllTime : leaderboardWeekly;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-foreground mb-1">{t("title")}</h1>
      <p className="text-muted text-sm mb-8">
        {t("activeSellers", { count: sellers.length })}
      </p>

      {/* Leaderboard */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {t("leaderboard.title")}
          </h2>
          <div className="flex gap-0.5 rounded-lg bg-[var(--surface)] p-0.5">
            {(["all", "week"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setLeaderboardTab(tab)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  leaderboardTab === tab
                    ? "bg-primary/15 text-primary"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {tab === "all"
                  ? t("leaderboard.allTime")
                  : t("leaderboard.thisWeek")}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <LeaderboardCard
            title={t("leaderboard.topRated")}
            subtitle={t("leaderboard.topRatedSubtitle")}
            icon={<ShieldCheck size={18} />}
            entries={leaderboard.top}
            variant="top"
          />
          <LeaderboardCard
            title={t("leaderboard.useCaution")}
            subtitle={t("leaderboard.useCautionSubtitle")}
            icon={<AlertTriangle size={18} />}
            entries={leaderboard.bottom}
            variant="bottom"
          />
        </div>
      </div>

      {/* All sellers */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {t("allSellers")}
          </h2>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              placeholder={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-primary/40 w-48"
            />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          {/* Table — horizontal scroll only on truly narrow viewports.
              Columns: Seller | Total | Seen | Positive% | Negs | 10/10 | Rating | Delivery | Items */}
          <div className="overflow-x-auto">
            <div className="min-w-[44rem]">
              {/* Table header */}
              <div className="grid grid-cols-[minmax(10rem,1fr)_60px_56px_64px_48px_48px_56px_60px_48px] gap-1.5 px-3 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]">
                <SortHeader
                  label={t("table.seller")}
                  sortKey="name"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label={t("table.total")}
                  sortKey="reported"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
                <SortHeader
                  label={t("table.seen")}
                  sortKey="reviews"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
                <SortHeader
                  label={t("table.positive")}
                  sortKey="positive"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
                <SortHeader
                  label={t("table.negatives")}
                  sortKey="negatives"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
                <SortHeader
                  label={t("table.perfect")}
                  sortKey="perfect"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
                <SortHeader
                  label={t("table.rating")}
                  sortKey="rating"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
                <SortHeader
                  label={t("table.days")}
                  sortKey="delivery"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
                <SortHeader
                  label={t("table.items")}
                  sortKey="items"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={handleSort}
                  className="justify-end"
                />
              </div>

              {/* Rows */}
              <div className="divide-y divide-[var(--border)]">
                {filtered.map((seller) => {
                  const isOnline =
                    seller.online === "today" || seller.online === "online";
                  const a = analyticsMap[String(seller.id)];
                  const reviewsShown =
                    a?.totalReviews ?? seller.numberOfReviews ?? 0;
                  const posPct =
                    a && a.totalReviews > 0
                      ? (a.positiveCount / a.totalReviews) * 100
                      : null;
                  const posClass =
                    posPct == null
                      ? "text-muted"
                      : posPct >= 95
                        ? "bg-primary/15 text-primary"
                        : posPct >= 85
                          ? "bg-blue-500/15 text-blue-400"
                          : posPct >= 70
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-red-500/15 text-red-400";
                  return (
                    <button
                      key={seller.id}
                      type="button"
                      onClick={() => openSeller(String(seller.id))}
                      className="grid grid-cols-[minmax(10rem,1fr)_60px_56px_64px_48px_48px_56px_60px_48px] gap-1.5 px-3 py-3 w-full text-left hover:bg-[var(--surface-hover)] transition-colors items-center"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {(() => {
                          const avatarUrl = getSellerImageUrl(seller.imageUrl);
                          return (
                            <SellerAvatarTooltip
                              sellerName={seller.name}
                              imageUrl={avatarUrl}
                            >
                              <div className="relative shrink-0">
                                {avatarUrl ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={avatarUrl}
                                    alt={seller.name}
                                    className="w-8 h-8 rounded-full object-cover border border-[var(--border)]"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">
                                    {getInitials(seller.name)}
                                  </div>
                                )}
                                {isOnline && (
                                  <Circle
                                    size={8}
                                    className="absolute -bottom-0.5 -right-0.5 fill-emerald-500 text-emerald-500"
                                  />
                                )}
                              </div>
                            </SellerAvatarTooltip>
                          );
                        })()}
                        <p className="text-sm font-medium text-foreground truncate">
                          {seller.name}
                        </p>
                      </div>

                      {/* Total — LB-reported lifetime reviews */}
                      <span
                        className="text-sm text-foreground font-medium tabular-nums text-right"
                        title={t("table.totalTitle")}
                      >
                        {(seller.numberOfReviews ?? 0).toLocaleString()}
                      </span>

                      {/* Seen — reviews actually seen by our indexer */}
                      <span
                        className="text-sm text-muted tabular-nums text-right"
                        title={t("table.seenTitle")}
                      >
                        {reviewsShown.toLocaleString()}
                      </span>

                      <span
                        className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums justify-self-end ${posClass}`}
                      >
                        {posPct != null ? `${posPct.toFixed(1)}%` : "—"}
                      </span>

                      <span
                        className={`text-sm tabular-nums text-right ${
                          (a?.negativeCount ?? 0) > 0
                            ? "text-red-400 font-medium"
                            : "text-muted"
                        }`}
                      >
                        {a?.negativeCount ?? 0}
                      </span>

                      <span
                        className={`text-sm tabular-nums text-right ${
                          (a?.perfectScoreCount ?? 0) > 0
                            ? "text-primary font-medium"
                            : "text-muted"
                        }`}
                      >
                        {a?.perfectScoreCount ?? 0}
                      </span>

                      <div className="flex items-center gap-1 justify-end">
                        <Star
                          size={12}
                          className={
                            (seller.averageRating ?? 0) >= 8
                              ? "fill-amber-400 text-amber-400"
                              : "fill-none text-muted"
                          }
                        />
                        <span className="text-sm text-foreground tabular-nums">
                          {seller.averageRating != null
                            ? seller.averageRating.toFixed(1)
                            : "-"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 justify-end">
                        <Truck size={11} className="text-muted" />
                        <span className="text-sm text-foreground tabular-nums">
                          {seller.averageDaysToArrive != null
                            ? `${seller.averageDaysToArrive.toFixed(1)}d`
                            : "-"}
                        </span>
                      </div>

                      <span className="text-sm text-foreground tabular-nums text-right">
                        {seller.itemsCount ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-muted py-8">{t("noSellersFound")}</p>
        )}
      </div>
    </div>
  );
}
