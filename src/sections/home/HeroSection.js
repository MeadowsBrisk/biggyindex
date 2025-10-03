"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { fadeInUp } from "@/sections/home/motionPresets";
import cn from "@/app/cn";
import AnimatedLogoHeader from "@/components/AnimatedLogoHeader";
import CategoryTooltip from "@/components/CategoryTooltip";

const numberFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

function formatStat(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return numberFormatter.format(value);
  }
  return fallback;
}

const CATEGORY_EMOJI_MAP = {
  flower: "🌿",
  hash: "🧱",
  hashish: "🧱",
  edibles: "🍬",
  mushrooms: "🍄",
  concentrates: "💧",
  vape: "⚡",
  vapes: "⚡",
  tincture: "🧪",
  psychedelics: "🌌",
  other: "💊",
};

function extractCount(value) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && typeof value.count === "number") return value.count;
  return 0;
}

function getSubcategoryCount(subcategories, target) {
  if (!subcategories || typeof subcategories !== "object") return 0;
  const targetLower = target.toLowerCase();
  for (const [key, value] of Object.entries(subcategories)) {
    if (key.toLowerCase() === targetLower) {
      return extractCount(value);
    }
  }
  return 0;
}

export default function HeroSection({ stats }) {
  const items = formatStat(stats?.items, "800+");
  const sellers = formatStat(stats?.sellers, "180+");
  const rawCategories = Object.entries(stats?.categories || {}).map(([name, info]) => {
    const subcategories = info && typeof info === "object" ? info.subcategories || {} : {};
    return {
      name,
      count: extractCount(info),
      subcategories,
    };
  });

  const psychedelicsEntry = rawCategories.find((c) => c.name.toLowerCase() === "psychedelics");
  const mushroomsCount = psychedelicsEntry ? getSubcategoryCount(psychedelicsEntry.subcategories, "Mushrooms") : 0;
  const psychedelicEdiblesCount = psychedelicsEntry ? getSubcategoryCount(psychedelicsEntry.subcategories, "Edibles") : 0;

  if (psychedelicsEntry) {
    const rawCount = psychedelicsEntry.count;
    const minusMushrooms = Math.max(rawCount - mushroomsCount, 0);
    let adjusted = rawCount - mushroomsCount - psychedelicEdiblesCount;
    if (adjusted <= 0 && minusMushrooms > 0) {
      adjusted = minusMushrooms;
    }
    psychedelicsEntry.count = Math.max(adjusted, 0);
  }

  const highlightedSubcategories = [];
  if (mushroomsCount > 0) {
    highlightedSubcategories.push({ 
      name: "Mushrooms", 
      count: mushroomsCount, 
      parent: "Psychedelics", 
      isSubcategory: true,
      subcategories: {} // No subcategories for this highlighted item
    });
  }

  const combinedCategories = [...rawCategories, ...highlightedSubcategories];

  const desiredOrder = ["Flower", "Hash", "Vapes", "Edibles", "Concentrates", "Mushrooms", "Psychedelics", "Other"];

  const matchByName = (arr, target) => {
    const targetLower = target.toLowerCase();
    return arr.find((entry) => entry.name?.toLowerCase() === targetLower) || null;
  };

  const ordered = desiredOrder
    .map((label) => matchByName(combinedCategories, label))
    .filter((entry) => entry && entry.name !== "Tips" && entry.count > 0);

  const remaining = combinedCategories.filter((entry) => {
    if (!entry || entry.name === "Tips" || entry.count <= 0) return false;
    return !desiredOrder.some((label) => label.toLowerCase() === entry.name.toLowerCase());
  });

  const categories = [...ordered, ...remaining].slice(0, desiredOrder.length);

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-100 via-white to-slate-100 text-slate-900 transition-colors duration-300 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 dark:text-white">
      <motion.div {...fadeInUp({ distance: 20, trigger: "animate" })} className="absolute inset-0">
        <div className="pointer-events-none absolute -left-32 top-24 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl dark:bg-emerald-500/20" />
        <div className="pointer-events-none absolute -right-24 bottom-20 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl dark:bg-blue-500/10" />
      </motion.div>
      <div className="relative mx-auto flex min-h-[70vh] max-w-6xl flex-col justify-center gap-12 px-6 py-16 lg:flex-row lg:items-center lg:py-24">
        <motion.div {...fadeInUp({ distance: 24, trigger: "animate" })} className="mx-auto max-w-2xl text-balance text-center lg:mx-0 lg:max-w-xl lg:text-left">
          <AnimatedLogoHeader className="justify-center text-slate-900 dark:text-white lg:justify-start" />
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:border-white/10 dark:bg-white/5 dark:text-white/80">
            Find what you’re looking for
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl">
            An index for the<br /> <span className="text-emerald-500">420</span> marketplace
          </h1>
          <p className="mt-5 mx-auto max-w-xl text-base text-slate-700 dark:text-white/75 sm:text-lg lg:mx-0">
            Browse LittleBiggy faster with smarter search, tidy categories, and quick stats tailored for UK buyers.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-base font-semibold text-slate-950 shadow-lg shadow-emerald-500/40 transition hover:-translate-y-0.5 hover:bg-emerald-400"
            >
              Browse items
            </Link>
            <Link
              href="#quick-start"
              className={cn(
                "group inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition dark:border-white/20 dark:text-white/80",
                "hover:border-emerald-400/50 hover:text-emerald-600 dark:hover:text-white"
              )}
            >
              How it works
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </motion.div>

        <motion.div
          {...fadeInUp({ distance: 24, delay: 0.1, trigger: "animate" })}
          className="mx-auto w-full max-w-md rounded-3xl border border-white/50 bg-white/80 p-6 shadow-lg shadow-emerald-500/10 backdrop-blur transition-colors duration-300 dark:border-white/15 dark:bg-white/[0.06] lg:mx-0"
        >
          <dl className="space-y-5 text-sm text-slate-600 dark:text-white/65">
            <div className="flex items-center justify-between">
              <span className="uppercase tracking-[0.18em] text-xs text-emerald-600 dark:text-emerald-300">Catalogue size</span>
              <span className="text-2xl font-semibold text-slate-900 dark:text-white">{items}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="uppercase tracking-[0.18em] text-xs text-emerald-600 dark:text-emerald-300">Active sellers</span>
              <span className="text-2xl font-semibold text-slate-900 dark:text-white">{sellers}</span>
            </div>
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">Top categories</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {categories.map(({ name, count, parent, isSubcategory, subcategories }) => {
                  const emoji = CATEGORY_EMOJI_MAP[name.toLowerCase()] || "🔹";
                  const title = isSubcategory && parent ? `${name} listings in ${parent}` : undefined;
                  return (
                    <CategoryTooltip key={name} categoryName={name} subcategories={subcategories}>
                      <span
                        title={title}
                        className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-700 transition hover:bg-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/25 cursor-pointer"
                      >
                        <span className="text-base">{emoji}</span>
                        <span className="uppercase tracking-[0.18em]">{name}</span>
                        <span className="text-xs text-emerald-500/80 dark:text-emerald-200/80">{formatStat(count, "–")}</span>
                      </span>
                    </CategoryTooltip>
                  );
                })}
              </div>
            </div>
          </dl>
        </motion.div>
      </div>
    </section>
  );
}

