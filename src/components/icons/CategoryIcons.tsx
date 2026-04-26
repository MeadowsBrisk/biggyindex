/**
 * Category icons — single source of truth for every category taxonomy badge.
 *
 * Each entry pairs a lucide icon with a tone class used by consumers
 * (hero pills, filter chips, detail chrome). Swap to custom SVGs by replacing
 * the `icon` component here — no consumer changes required.
 */

import type { LucideIcon } from "lucide-react";
import {
  Box,
  Cigarette,
  Cookie,
  Droplet,
  FlaskConical,
  FlaskRound,
  Leaf,
  Package,
  Sparkles,
  Sprout,
  Wind,
} from "lucide-react";

export type CategoryName =
  | "Flower"
  | "Shake"
  | "Hash"
  | "Concentrates"
  | "Vapes"
  | "PreRolls"
  | "Edibles"
  | "Tincture"
  | "Psychedelics"
  | "Distillate"
  | "Other";

interface CategoryMeta {
  icon: LucideIcon;
  label: string;
  /** CSS color — reads a theme token so consumers stay theme-aware. */
  color: string;
  /** Tailwind bg tint for pill backgrounds */
  tintClass: string;
}

export const CATEGORY_META: Record<CategoryName, CategoryMeta> = {
  Flower: {
    icon: Sprout,
    label: "Flower",
    color: "var(--primary)",
    tintClass: "bg-primary/10 text-primary",
  },
  Shake: {
    icon: Leaf,
    label: "Shake",
    color: "var(--primary)",
    tintClass: "bg-primary/10 text-primary",
  },
  Hash: {
    icon: Box,
    label: "Hash",
    color: "#a16207",
    tintClass: "bg-amber-700/10 text-amber-700 dark:text-amber-400",
  },
  Concentrates: {
    icon: Droplet,
    label: "Concentrates",
    color: "#0ea5e9",
    tintClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  Vapes: {
    icon: Wind,
    label: "Vapes",
    color: "#6366f1",
    tintClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
  PreRolls: {
    icon: Cigarette,
    label: "Pre-Rolls",
    color: "#ef4444",
    tintClass: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  Edibles: {
    icon: Cookie,
    label: "Edibles",
    color: "#d97706",
    tintClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  Tincture: {
    icon: FlaskConical,
    label: "Tincture",
    color: "#14b8a6",
    tintClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
  Psychedelics: {
    icon: Sparkles,
    label: "Psychedelics",
    color: "#a855f7",
    tintClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  Distillate: {
    icon: FlaskRound,
    label: "Distillate",
    color: "#f59e0b",
    tintClass: "bg-amber-400/10 text-amber-600 dark:text-amber-400",
  },
  Other: {
    icon: Package,
    label: "Other",
    color: "var(--muted-foreground)",
    tintClass: "bg-muted/20 text-muted-foreground",
  },
};

/** Lookup with a safe fallback to "Other". */
export function getCategoryMeta(name: string): CategoryMeta {
  return CATEGORY_META[name as CategoryName] ?? CATEGORY_META.Other;
}

/** Pretty label ("PreRolls" → "Pre-Rolls"). */
export function categoryLabel(name: string): string {
  return getCategoryMeta(name).label;
}
