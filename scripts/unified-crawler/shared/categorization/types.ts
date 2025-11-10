import type { Taxonomy } from './baseTaxonomy';
import { TAXONOMY as TAX } from './baseTaxonomy';

export type Scores = Record<string, number>;
export type SubsByCat = Record<string, Set<string>>;

export interface CatContext {
  name: string;
  description: string;
  base: string;           // lowercased name + description
  text: string;           // padded with spaces for simpler boundary checks
  TAXONOMY: Taxonomy;
  scores: Scores;
  subsByCat: SubsByCat;
  // Helpers
  escapeRegExp: (s: string) => string;
  add: (cat: string, delta: number) => void;
  demote: (cat: string, delta: number) => void;
  set: (cat: string, val: number) => void;
  remove: (cat: string) => void;
  sub: (cat: string, sub: string) => void;
  // Final result (set by precedence rule)
  result: { primary: string | null; subcategories: string[] } | null;
}

export function createContext(name: string, description: string): CatContext {
  const base = `${name || ''} ${description || ''}`.toLowerCase();
  const text = ` ${base} `;
  const scores: Scores = {};
  const subsByCat: SubsByCat = {};
  const escapeRegExp = (str: string) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ctx: CatContext = {
    name,
    description,
    base,
    text,
    TAXONOMY: TAX,
    scores,
    subsByCat,
    escapeRegExp,
    add(cat: string, delta: number) { scores[cat] = (scores[cat] || 0) + (delta || 0); },
    demote(cat: string, delta: number) {
      if (scores[cat] == null) return;
      scores[cat] -= (delta || 0);
      if (scores[cat] <= 0) delete scores[cat];
    },
    set(cat: string, val: number) { scores[cat] = val; },
    remove(cat: string) { delete scores[cat]; },
    sub(cat: string, sub: string) {
      if (!sub) return;
      if (!subsByCat[cat]) subsByCat[cat] = new Set<string>();
      subsByCat[cat].add(sub);
    },
    result: null,
  };
  return ctx;
}

export default CatContext;
