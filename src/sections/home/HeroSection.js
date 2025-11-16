"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { fadeInUp } from "@/sections/home/motionPresets";
import cn from "@/app/cn";
import AnimatedLogoHeader from "@/components/AnimatedLogoHeader";
import CategoryTooltip from "@/components/CategoryTooltip";
import { useTranslations, useFormatter } from 'next-intl';
import { useLocale } from '@/providers/IntlProvider';
import { catKeyForManifest, subKeyForManifest, translateSubLabel, safeTranslate } from '@/lib/taxonomyLabels';
import { isHostBasedEnv } from '@/lib/market';


function formatStatNumber(format, value, fallback) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : null;
  if (n != null && n > 0) return format.number(n, { maximumFractionDigits: 0 });
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
  const tHome = useTranslations('Home');
  const tCats = useTranslations('Categories');
  const format = useFormatter();
  const { locale } = useLocale();
  const items = formatStatNumber(format, stats?.items, "800+");
  const sellers = formatStatNumber(format, stats?.sellers, "180+");
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

  // Precompute translated category/subcategory labels once (avoid hook usage inside loops and ensure DE translations load)
  const translatedCategories = categories.map(entry => {
    if (!entry) return entry;
    const parentKey = catKeyForManifest(entry.parent || entry.name);
    const isSub = entry.isSubcategory;
    const displayName = isSub
      ? translateSubLabel(tCats, catKeyForManifest(entry.parent || ''), subKeyForManifest(entry.name)) || entry.name
      : (safeTranslate(tCats, catKeyForManifest(entry.name)) || entry.name);
    return { ...entry, _displayName: displayName };
  });

  // Only add path prefix if NOT on subdomain-based environment (localhost, previews)
  const isSubdomainEnv = typeof window !== 'undefined' && isHostBasedEnv(window.location?.hostname);
  const listPrefix = isSubdomainEnv ? '' : (
    (locale || 'en-GB').toLowerCase().startsWith('de') ? '/de'
    : (locale || 'en-GB').toLowerCase().startsWith('fr') ? '/fr'
    : (locale || 'en-GB').toLowerCase().startsWith('pt') ? '/pt'
    : (locale || 'en-GB').toLowerCase().startsWith('it') ? '/it'
    : ''
  );

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
            {tHome('hero.badge')}
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl">
            {tHome.rich('hero.title', {
              accent: (chunks) => <span className="text-emerald-500">{chunks}</span>
            })}
          </h1>
          <p className="mt-5 mx-auto max-w-xl text-base text-slate-700 dark:text-white/75 sm:text-lg lg:mx-0">
            {tHome('hero.subtitle')}
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
            <Link
              href={`${listPrefix || '/'}`}
              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-base font-semibold text-slate-950 shadow-lg shadow-emerald-500/40 transition hover:-translate-y-0.5 hover:bg-emerald-400"
            >
              {tHome('hero.cta.browse')}
            </Link>
            <Link
              href="#quick-start"
              className={cn(
                "group inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition dark:border-white/20 dark:text-white/80",
                "hover:border-emerald-400/50 hover:text-emerald-600 dark:hover:text-white"
              )}
            >
              {tHome('hero.cta.how')}
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
              <span className="uppercase tracking-[0.18em] text-xs text-emerald-600 dark:text-emerald-300">{tHome('hero.stats.catalogueSize')}</span>
              <span className="text-2xl font-semibold text-slate-900 dark:text-white">{items}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="uppercase tracking-[0.18em] text-xs text-emerald-600 dark:text-emerald-300">{tHome('hero.stats.activeSellers')}</span>
              <span className="text-2xl font-semibold text-slate-900 dark:text-white">{sellers}</span>
            </div>
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">{tHome('hero.stats.topCategories')}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {translatedCategories.map(({ name, count, parent, isSubcategory, subcategories, _displayName }) => {
                  const emoji = CATEGORY_EMOJI_MAP[name.toLowerCase()] || "🔹";
                  const parentKey = parent ? catKeyForManifest(parent) : null;
                  const displayName = _displayName;
                  const parentLabel = parentKey ? (safeTranslate(tCats, parentKey) || parent) : parent;
                  const title = isSubcategory && parentLabel ? tHome('hero.tooltip.inParent', { name: displayName, parent: parentLabel }) : undefined;
                  return (
                    <CategoryTooltip key={name} categoryName={name} subcategories={subcategories}>
                      <span
                        title={title}
                        className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-700 transition hover:bg-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/25 cursor-pointer"
                      >
                        <span className="text-base">{emoji}</span>
                        <span className="uppercase tracking-[0.18em]">{displayName}</span>
                        <span className="text-xs text-emerald-500/80 dark:text-emerald-200/80">{formatStatNumber(format, count, "–")}</span>
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

