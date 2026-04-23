"use client";

import { motion } from "framer-motion";
import { useSetAtom } from "jotai";
import { ShieldCheck, AlertTriangle, Sparkles } from "lucide-react";
import { sellerModalIdAtom } from "@/store/atoms";
import { SellerAvatarTooltip } from "@/components/SellerAvatarTooltip";
import { getSellerImageUrl } from "@/lib/images";

interface LeaderboardSeller {
  sellerId: string;
  sellerName: string;
  imageUrl?: string;
  score: number;
  positiveCount: number;
  negativeCount: number;
  totalReviews: number;
  lastReviewAt?: string;
  joined?: string;
}

interface SellerTrustBoardProps {
  topSellers: LeaderboardSeller[];
  bottomSellers: LeaderboardSeller[];
  recentlyJoined: LeaderboardSeller[];
}

/* ────────────────────────── helpers ────────────────────────── */

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function positivePercent(pos: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((pos / total) * 100);
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Compact tenure e.g. "3y active", "8mo active". Returns null for < 30 days. */
function formatTenure(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 30) return null;
  if (days < 365) return `${Math.floor(days / 30)}mo active`;
  return `${Math.floor(days / 365)}y active`;
}

/* ────────────────────────── avatar ────────────────────────── */

type Tone = "emerald" | "amber" | "blue";

const TONE_RING: Record<Tone, string> = {
  emerald: "ring-emerald-500/40",
  amber: "ring-amber-500/40",
  blue: "ring-blue-500/40",
};

const TONE_INITIAL_BG: Record<Tone, string> = {
  emerald: "bg-emerald-500/10 text-emerald-500",
  amber: "bg-amber-500/10 text-amber-500",
  blue: "bg-blue-500/10 text-blue-500",
};

function SellerAvatar({
  seller,
  size = 40,
  tone = "emerald",
  ring = false,
}: {
  seller: LeaderboardSeller;
  size?: number;
  tone?: Tone;
  ring?: boolean;
}) {
  const avatarUrl = getSellerImageUrl(seller.imageUrl);
  const ringCls = ring ? `ring-2 ring-offset-2 ring-offset-[var(--card)] ${TONE_RING[tone]}` : "";

  return (
    <SellerAvatarTooltip sellerName={seller.sellerName} imageUrl={avatarUrl}>
      {avatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={avatarUrl}
          alt={seller.sellerName}
          className={`rounded-full object-cover shrink-0 ${ringCls}`}
          style={{ width: size, height: size }}
          loading="lazy"
        />
      ) : (
        <div
          className={`rounded-full flex items-center justify-center font-bold shrink-0 ${TONE_INITIAL_BG[tone]} ${ringCls}`}
          style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
        >
          {getInitials(seller.sellerName)}
        </div>
      )}
    </SellerAvatarTooltip>
  );
}

/* ────────────────────────── row ────────────────────────── */

function MeterBar({ pct, tone }: { pct: number; tone: Tone }) {
  const gradient =
    tone === "emerald"
      ? "bg-gradient-to-r from-emerald-500/70 to-emerald-400"
      : tone === "amber"
        ? "bg-gradient-to-r from-amber-500/70 to-red-400"
        : "bg-gradient-to-r from-blue-500/70 to-blue-400";

  return (
    <div className="relative h-[3px] w-full rounded-full bg-[var(--border)]/60 overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 ${gradient} rounded-full`}
        style={{ width: `${Math.max(3, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function SellerRow({
  seller,
  variant,
  featured,
  onOpen,
}: {
  seller: LeaderboardSeller;
  variant: "top" | "bottom";
  featured?: boolean;
  onOpen: (id: string) => void;
}) {
  const pct = positivePercent(seller.positiveCount, seller.totalReviews);
  const isTop = variant === "top";
  const tone: Tone = isTop ? "emerald" : "amber";
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
    <button
      type="button"
      onClick={() => onOpen(seller.sellerId)}
      className="group w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
    >
      <SellerAvatar
        seller={seller}
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
          {seller.sellerName}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
          <span>{compact(seller.totalReviews)} reviews</span>
          {!isTop && seller.negativeCount > 0 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-red-400/80">
                {compact(seller.negativeCount)} negative
              </span>
            </>
          )}
          {formatTenure(seller.joined) && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>{formatTenure(seller.joined)}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0 w-20">
        <span className={`font-bold tabular-nums ${pctColor} ${featured ? "text-xl" : "text-base"}`}>
          {pct}%
        </span>
        <MeterBar pct={pct} tone={tone} />
      </div>
    </button>
  );
}

/* ────────────────────────── panel ────────────────────────── */

function Panel({
  tone,
  icon,
  title,
  subtitle,
  sellers,
  variant,
  onOpen,
  delay,
}: {
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  sellers: LeaderboardSeller[];
  variant: "top" | "bottom";
  onOpen: (id: string) => void;
  delay: number;
}) {
  const totalReviews = sellers.reduce((sum, s) => sum + s.totalReviews, 0);

  const accentGrad =
    tone === "emerald"
      ? "from-emerald-500/10 via-transparent to-transparent"
      : "from-amber-500/10 via-transparent to-transparent";
  const iconBg =
    tone === "emerald" ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay }}
      className="relative rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
    >
      <div
        className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-b ${accentGrad} pointer-events-none`}
        aria-hidden
      />

      {/* Header */}
      <header className="relative flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]/70">
        <div className={`rounded-xl p-2 ${iconBg}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground leading-tight">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Reviews</p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {compact(totalReviews)}
          </p>
        </div>
      </header>

      {/* Rows */}
      <ul className="relative divide-y divide-[var(--border)]/60">
        {sellers.slice(0, 8).map((seller, i) => (
          <li key={seller.sellerId}>
            <SellerRow
              seller={seller}
              variant={variant}
              featured={i === 0}
              onOpen={onOpen}
            />
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/* ────────────────────────── main ────────────────────────── */

export function SellerTrustBoard({
  topSellers,
  bottomSellers,
  recentlyJoined,
}: SellerTrustBoardProps) {
  const openSeller = useSetAtom(sellerModalIdAtom);

  return (
    <section className="py-20 px-4 bg-[var(--surface)]">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="mb-10 flex items-end justify-between gap-4 flex-wrap"
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary/80 font-semibold mb-2">
              Community Trust
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
              Seller Trust Board
            </h2>
            <p className="text-muted mt-2 max-w-xl">
              Rankings drawn from community reviews. Hover an avatar for a preview, tap to open the
              seller&apos;s full profile.
            </p>
          </div>
        </motion.div>

        {/* Two columns */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel
            tone="emerald"
            icon={<ShieldCheck size={18} />}
            title="Top Rated"
            subtitle="Highest positive-review ratio"
            sellers={topSellers}
            variant="top"
            onOpen={openSeller}
            delay={0.1}
          />
          <Panel
            tone="amber"
            icon={<AlertTriangle size={18} />}
            title="Use Caution"
            subtitle="Elevated negative feedback"
            sellers={bottomSellers}
            variant="bottom"
            onOpen={openSeller}
            delay={0.2}
          />
        </div>

        {/* Recently Joined */}
        {recentlyJoined.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden"
          >
            <header className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]/70">
              <div className="rounded-xl p-2 bg-blue-500/15 text-blue-500">
                <Sparkles size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[15px] font-semibold text-foreground leading-tight">
                  Recently Joined
                </h3>
                <p className="text-xs text-muted-foreground">
                  New sellers — no track record yet
                </p>
              </div>
            </header>
            <div className="px-4 py-4 flex flex-wrap gap-2">
              {recentlyJoined.slice(0, 12).map((seller) => (
                <button
                  key={seller.sellerId}
                  type="button"
                  onClick={() => openSeller(seller.sellerId)}
                  className="group flex items-center gap-2 rounded-full bg-[var(--surface)] border border-[var(--border)] pl-1 pr-3 py-1 transition-all hover:bg-[var(--surface-hover)] hover:border-blue-500/40 hover:shadow-sm"
                >
                  <SellerAvatar seller={seller} size={24} tone="blue" />
                  <span className="text-xs font-medium text-foreground group-hover:text-primary">
                    {seller.sellerName}
                  </span>
                  {seller.joined && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {formatDate(seller.joined)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
