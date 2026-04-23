"use client";

import { motion } from "framer-motion";
import { useSetAtom } from "jotai";
import {
  Shield,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  UserPlus,
} from "lucide-react";
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function SellerAvatar({
  seller,
  size = 32,
  tone = "primary",
}: {
  seller: LeaderboardSeller;
  size?: number;
  tone?: "primary" | "amber" | "blue";
}) {
  const avatarUrl = getSellerImageUrl(seller.imageUrl);
  const initialBg =
    tone === "amber"
      ? "bg-amber-500/15 text-amber-400"
      : tone === "blue"
        ? "bg-blue-500/15 text-blue-400"
        : "bg-primary/15 text-primary";

  return (
    <SellerAvatarTooltip sellerName={seller.sellerName} imageUrl={avatarUrl}>
      {avatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={avatarUrl}
          alt={seller.sellerName}
          className="rounded-full object-cover border border-[var(--border)] shrink-0"
          style={{ width: size, height: size }}
          loading="lazy"
        />
      ) : (
        <div
          className={`rounded-full flex items-center justify-center font-bold shrink-0 ${initialBg}`}
          style={{
            width: size,
            height: size,
            fontSize: Math.max(9, Math.round(size * 0.34)),
          }}
        >
          {getInitials(seller.sellerName)}
        </div>
      )}
    </SellerAvatarTooltip>
  );
}

function SellerRow({
  seller,
  rank,
  variant,
  onOpen,
}: {
  seller: LeaderboardSeller;
  rank: number;
  variant: "top" | "bottom";
  onOpen: (id: string) => void;
}) {
  const pct = positivePercent(seller.positiveCount, seller.totalReviews);
  const isTop = variant === "top";

  return (
    <button
      type="button"
      onClick={() => onOpen(seller.sellerId)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-[var(--surface-hover)] transition-colors group"
    >
      {/* Rank */}
      <span
        className={`w-6 text-center text-xs font-bold ${
          isTop ? "text-primary" : "text-amber-400"
        }`}
      >
        {rank}
      </span>

      <SellerAvatar seller={seller} tone={isTop ? "primary" : "amber"} />

      {/* Name + review count */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {seller.sellerName}
        </p>
        <p className="text-[11px] text-muted">
          {seller.totalReviews} review{seller.totalReviews !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Positive % */}
      <div className="flex items-center gap-1.5">
        {isTop ? (
          <ThumbsUp size={12} className="text-primary" />
        ) : (
          <ThumbsDown size={12} className="text-amber-400" />
        )}
        <span
          className={`text-sm font-semibold tabular-nums ${
            isTop
              ? pct >= 80
                ? "text-primary"
                : "text-primary/70"
              : pct <= 50
                ? "text-red-400"
                : "text-amber-400"
          }`}
        >
          {pct}%
        </span>
      </div>

      {/* Last review */}
      <span className="text-[11px] text-muted-foreground w-16 text-right hidden sm:block">
        {seller.lastReviewAt ? formatDate(seller.lastReviewAt) : "—"}
      </span>
    </button>
  );
}

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
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
            Seller Trust Board
          </h2>
          <p className="text-muted mb-10">
            Community-driven seller ratings to help you shop with confidence.
          </p>
        </motion.div>

        {/* Two columns */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top Rated */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl border border-primary/20 bg-[var(--card)] overflow-hidden"
          >
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border)]">
              <div className="rounded-full bg-primary/15 p-2">
                <Shield size={18} className="text-primary" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Top Rated
                </h3>
                <p className="text-xs text-muted">
                  Highest community trust scores
                </p>
              </div>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {topSellers.slice(0, 8).map((seller, i) => (
                <SellerRow
                  key={seller.sellerId}
                  seller={seller}
                  rank={i + 1}
                  variant="top"
                  onOpen={openSeller}
                />
              ))}
            </div>
          </motion.div>

          {/* Use Caution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="rounded-2xl border border-amber-500/20 bg-[var(--card)] overflow-hidden"
          >
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[var(--border)]">
              <div className="rounded-full bg-amber-500/15 p-2">
                <AlertTriangle size={18} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Use Caution
                </h3>
                <p className="text-xs text-muted">
                  Lower ratings - proceed carefully
                </p>
              </div>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {bottomSellers.slice(0, 8).map((seller, i) => (
                <SellerRow
                  key={seller.sellerId}
                  seller={seller}
                  rank={i + 1}
                  variant="bottom"
                  onOpen={openSeller}
                />
              ))}
            </div>
          </motion.div>
        </div>

        {/* Recently Joined strip */}
        {recentlyJoined.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <UserPlus size={16} className="text-blue-400" />
              <h3 className="text-sm font-semibold text-foreground">
                Recently Joined
              </h3>
              <span className="text-xs text-muted">
                New sellers - no track record yet
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentlyJoined.slice(0, 8).map((seller) => (
                <button
                  key={seller.sellerId}
                  type="button"
                  onClick={() => openSeller(seller.sellerId)}
                  className="flex items-center gap-2 rounded-full bg-[var(--surface)] border border-[var(--border)] pl-1 pr-3 py-1 hover:bg-[var(--surface-hover)] hover:border-primary/30 transition-colors"
                >
                  <SellerAvatar seller={seller} size={22} tone="blue" />
                  <span className="text-xs font-medium text-foreground">
                    {seller.sellerName}
                  </span>
                  {seller.joined && (
                    <span className="text-[10px] text-muted-foreground">
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
