"use client";

import { motion } from "framer-motion";
import { ArrowRight, Cannabis } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCategoryMeta } from "@/components/icons/CategoryIcons";
import { CountryFlag } from "@/components/icons/CountryFlag";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MARKETS } from "@/lib/constants";

interface CategoryStat {
  name: string;
  count: number;
  emoji?: string;
}

interface HeroSectionProps {
  totalItems: number;
  totalSellers: number;
  categoryCounts: CategoryStat[];
}

export function HeroSection({
  totalItems,
  totalSellers,
  categoryCounts,
}: HeroSectionProps) {
  const [scrolledPast, setScrolledPast] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolledPast(window.scrollY > 100);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden">
      {/* Theme-aware background */}
      <div className="absolute inset-0 bg-background" />

      {/* Subtle radial primary glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />

      {/* Floating theme toggle - top right */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-4 w-full max-w-5xl mx-auto">
        {/* Logo mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-8"
        >
          <div className="relative">
            <Cannabis size={48} className="text-primary" />
            <div className="absolute inset-0 blur-xl opacity-40 bg-primary rounded-full" />
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground text-center tracking-tight leading-tight"
        >
          An index for the
          <br />
          <span className="text-primary">420 marketplace</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-6 text-lg sm:text-xl text-muted text-center max-w-2xl"
        >
          Faster search, cleaner categories, and at-a-glance seller trust for
          the Little Biggy marketplace.
        </motion.p>

        {/* Live stats - items and sellers only */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-6 flex items-center gap-6 text-sm text-muted"
        >
          <span>
            <span className="text-foreground font-semibold">
              {totalItems.toLocaleString()}
            </span>{" "}
            items indexed
          </span>
          <span className="w-px h-4 bg-[var(--border)]" />
          <span>
            <span className="text-foreground font-semibold">
              {totalSellers}
            </span>{" "}
            active sellers
          </span>
        </motion.div>

        {/* Category grid — responsive, icon-led, no emojis */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-10 w-full max-w-4xl"
        >
          <div className="flex flex-wrap justify-center gap-2">
            {categoryCounts.map((cat) => {
              const meta = getCategoryMeta(cat.name);
              const Icon = meta.icon;
              return (
                <Link
                  key={cat.name}
                  href={`/browse?cat=${encodeURIComponent(cat.name)}`}
                  prefetch={false}
                  className="group flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-medium text-foreground transition-all hover:border-primary/40 hover:bg-[var(--surface-hover)] hover:-translate-y-0.5 min-w-[10rem] basis-[calc(50%-0.25rem)] sm:basis-[calc(33.333%-0.375rem)] md:basis-[calc(25%-0.375rem)] lg:basis-[12rem] lg:flex-none"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.tintClass}`}
                  >
                    <Icon size={16} strokeWidth={2.25} />
                  </span>
                  <span className="flex-1 truncate text-left">
                    {meta.label}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground group-hover:text-primary transition-colors">
                    {cat.count}
                  </span>
                </Link>
              );
            })}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12"
        >
          <Link
            href="/browse"
            prefetch={false}
            className="group inline-flex items-center gap-3 rounded-full bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground transition-all hover:brightness-110 hover:shadow-lg hover:shadow-primary/25"
          >
            Browse Marketplace
            <ArrowRight
              size={20}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>
        </motion.div>

        {/* Market flag strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.75 }}
          className="mt-16 flex items-center gap-4"
        >
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Markets
          </span>
          <div className="flex items-center gap-3">
            {MARKETS.map((m) => (
              <Link
                key={m.code}
                href={m.code === "GB" ? "/" : `/${m.code.toLowerCase()}`}
                prefetch={false}
                className={`flex items-center gap-1.5 transition-colors ${
                  m.code === "GB"
                    ? "text-foreground ring-1 ring-primary/40 rounded-full px-2 py-0.5"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={m.name}
              >
                <CountryFlag code={m.code} size={20} />
                <span className="text-xs font-medium hidden sm:inline">
                  {m.code}
                </span>
              </Link>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator - fades out on scroll */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: scrolledPast ? 0 : 1 }}
        transition={{ duration: 0.4 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{
            duration: 2,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
          className="w-5 h-8 rounded-full border-2 border-[var(--border)] flex justify-center pt-1.5"
        >
          <div className="w-1 h-2 rounded-full bg-muted-foreground" />
        </motion.div>
      </motion.div>
    </section>
  );
}
