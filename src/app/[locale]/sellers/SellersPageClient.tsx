"use client";

import { useState, useMemo, useEffect } from "react";
import { useSetAtom } from "jotai";
import {
  Shield,
  AlertTriangle,
  Star,
  Truck,
  Package,
  ChevronUp,
  ChevronDown,
  Search,
  Circle,
} from "lucide-react";
import { sellerModalIdAtom } from "@/store/atoms";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { getSellerImageUrl } from "@/lib/images";
import type { Seller } from "@/lib/types";

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

function formatDate(iso: string, now: number): string {
  const d = new Date(iso);
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/* ---------- Leaderboard card ---------- */
function LeaderboardCard({
  title,
  subtitle,
  icon,
  entries,
  variant,
  now,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  entries: LeaderboardEntry[];
  variant: "top" | "bottom";
  now: number;
}) {
  const openSeller = useSetAtom(sellerModalIdAtom);
  const isTop = variant === "top";

  return (
    <div
      className={`rounded-xl border bg-[var(--card)] overflow-hidden ${
        isTop ? "border-primary/20" : "border-amber-500/20"
      }`}
    >
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
        {icon}
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-[10px] text-muted">{subtitle}</p>
        </div>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {entries.map((e, i) => {
          const pct =
            e.total > 0 ? Math.round((e.positive / e.total) * 100) : 0;
          return (
            <button
              key={e.sellerId}
              type="button"
              onClick={() => openSeller(e.sellerId)}
              className="flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-[var(--surface-hover)] transition-colors"
            >
              <span
                className={`w-5 text-center text-xs font-bold tabular-nums ${
                  isTop ? "text-primary" : "text-amber-400"
                }`}
              >
                {i + 1}
              </span>

              {/* Avatar */}
              {(() => {
                const lbAvatarUrl = getSellerImageUrl(e.imageUrl);
                return (
              <SellerAvatarTooltip sellerName={e.sellerName} imageUrl={lbAvatarUrl}>
                {lbAvatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={lbAvatarUrl}
                    alt={e.sellerName}
                    className="w-8 h-8 rounded-full object-cover border border-[var(--border)] shrink-0"
                  />
                ) : (
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      isTop
                        ? "bg-primary/10 text-primary"
                        : "bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    {getInitials(e.sellerName)}
                  </div>
                )}
              </SellerAvatarTooltip>
                );
              })()}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {e.sellerName}
                </p>
                <p className="text-[10px] text-muted">
                  {e.total} reviews
                  {e.lastReviewAt && ` - ${formatDate(e.lastReviewAt, now)}`}
                </p>
              </div>

              {/* Score as colored percentage */}
              <span
                className={`text-sm font-semibold tabular-nums ${
                  pct >= 90
                    ? "text-primary"
                    : pct >= 70
                      ? "text-foreground"
                      : pct >= 50
                        ? "text-amber-400"
                        : "text-red-400"
                }`}
              >
                {pct}%
              </span>
            </button>
          );
        })}
      </div>
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
  const openSeller = useSetAtom(sellerModalIdAtom);
  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), []);
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
            (analyticsMap[String(a.id)]?.totalReviews ?? a.numberOfReviews ?? 0) -
            (analyticsMap[String(b.id)]?.totalReviews ?? b.numberOfReviews ?? 0);
          break;
        case "reported":
          cmp = (a.numberOfReviews ?? 0) - (b.numberOfReviews ?? 0);
          break;
        case "rating":
          cmp = (a.averageRating ?? 0) - (b.averageRating ?? 0);
          break;
        case "delivery":
          cmp =
            (a.averageDaysToArrive ?? 99) - (b.averageDaysToArrive ?? 99);
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
      <h1 className="text-3xl font-bold text-foreground mb-1">Sellers</h1>
      <p className="text-muted text-sm mb-8">
        {sellers.length} active sellers on Little Biggy
      </p>

      {/* Leaderboard */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Trust Leaderboard
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
                {tab === "all" ? "All time" : "This week"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <LeaderboardCard
            title="Top Rated"
            subtitle="Highest positive review %"
            icon={<Shield size={16} className="text-primary" />}
            entries={leaderboard.top}
            variant="top"
            now={now}
          />
          <LeaderboardCard
            title="Use Caution"
            subtitle="Lower scores - check reviews first"
            icon={<AlertTriangle size={16} className="text-amber-400" />}
            entries={leaderboard.bottom}
            variant="bottom"
            now={now}
          />
        </div>
      </div>

      {/* All sellers */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            All Sellers
          </h2>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="text"
              placeholder="Search..."
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
            <SortHeader label="Seller" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="Total" sortKey="reported" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
            <SortHeader label="Seen" sortKey="reviews" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
            <SortHeader label="Positive" sortKey="positive" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
            <SortHeader label="Negs" sortKey="negatives" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
            <SortHeader label="10/10" sortKey="perfect" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
            <SortHeader label="Rating" sortKey="rating" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
            <SortHeader label="Days" sortKey="delivery" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
            <SortHeader label="Items" sortKey="items" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
          </div>

          {/* Rows */}
          <div className="divide-y divide-[var(--border)]">
            {filtered.map((seller) => {
              const isOnline =
                seller.online === "today" || seller.online === "online";
              const a = analyticsMap[String(seller.id)];
              const reviewsShown = a?.totalReviews ?? seller.numberOfReviews ?? 0;
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
                    <SellerAvatarTooltip sellerName={seller.name} imageUrl={avatarUrl}>
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
                    title="Total reviews reported by Little Biggy"
                  >
                    {(seller.numberOfReviews ?? 0).toLocaleString()}
                  </span>

                  {/* Seen — reviews actually seen by our indexer */}
                  <span
                    className="text-sm text-muted tabular-nums text-right"
                    title="Reviews ingested by the BiggyIndex crawler"
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
          <p className="text-center text-muted py-8">No sellers found</p>
        )}
      </div>
    </div>
  );
}
