import { R2_DATA_PUBLIC_URL } from "@/lib/constants";
import { decodeEntities } from "@/lib/format";
import { R2Keys } from "@/lib/r2";
import type {
  SearchIndex,
  SearchIndexCategory,
  SearchIndexItem,
  SearchIndexSeller,
} from "@/lib/types";

function dataBase(): string {
  const base = process.env.NEXT_PUBLIC_HOME_DATA_URL || R2_DATA_PUBLIC_URL;
  const trimmed = base.replace(/\/+$/, "");
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

let cached: SearchIndex | null = null;
let cachedMarket = "";
let inflight: Promise<SearchIndex | null> | null = null;

/** Fetch the market's search index once per session; concurrent callers share the request. */
export function loadSearchIndex(market: string): Promise<SearchIndex | null> {
  const mkt = market.toLowerCase();
  if (cached && cachedMarket === mkt) return Promise.resolve(cached);
  if (inflight && cachedMarket === mkt) return inflight;
  cachedMarket = mkt;
  cached = null;
  inflight = fetch(`${dataBase()}/${R2Keys.searchIndex(mkt)}`, {
    cache: "force-cache",
  })
    .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : null))
    .then((idx) => {
      if (idx && Array.isArray(idx.i)) cached = idx;
      inflight = null;
      return cached;
    })
    .catch(() => {
      inflight = null;
      return null;
    });
  return inflight;
}

export function peekSearchIndex(market: string): SearchIndex | null {
  return cachedMarket === market.toLowerCase() ? cached : null;
}

export interface SearchResults {
  items: SearchIndexItem[];
  sellers: SearchIndexSeller[];
  categories: SearchIndexCategory[];
}

interface Lowered<T> {
  v: T;
  nl: string;
  hay: string;
}

interface LoweredCorpus {
  index: SearchIndex;
  items: Lowered<SearchIndexItem>[];
  sellers: Lowered<SearchIndexSeller>[];
  categories: Lowered<SearchIndexCategory>[];
}

let loweredCache: LoweredCorpus | null = null;

function getLowered(index: SearchIndex): LoweredCorpus {
  if (loweredCache && loweredCache.index === index) return loweredCache;
  const items = index.i.map((it) => ({
    v: it,
    nl: decodeEntities(it.n).toLowerCase(),
    hay: [
      decodeEntities(it.n),
      it.s,
      it.c,
      ...(it.sc ?? []),
      ...(it.st ?? []),
      ...(it.a ?? []),
    ]
      .join(" ")
      .toLowerCase(),
  }));
  const sellers = (index.s ?? []).map((s) => ({
    v: s,
    nl: s.n.toLowerCase(),
    hay: s.n.toLowerCase(),
  }));
  const categories = (index.c ?? []).map((c) => ({
    v: c,
    nl: c.n.toLowerCase(),
    hay: c.n.toLowerCase(),
  }));
  loweredCache = { index, items, sellers, categories };
  return loweredCache;
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter((t) => t.length >= 2);
}

function rank<T>(rows: Lowered<T>[], tokens: string[], cap: number): T[] {
  const scored: {
    v: T;
    allInName: boolean;
    anyPrefix: boolean;
    inName: number;
    ord: number;
  }[] = [];
  rows.forEach((row, ord) => {
    if (!tokens.every((t) => row.hay.includes(t))) return;
    let inName = 0;
    let anyPrefix = false;
    for (const t of tokens) {
      if (row.nl.includes(t)) inName++;
      if (row.nl.startsWith(t)) anyPrefix = true;
    }
    scored.push({
      v: row.v,
      allInName: inName === tokens.length,
      anyPrefix,
      inName,
      ord,
    });
  });
  scored.sort(
    (a, b) =>
      Number(b.allInName) - Number(a.allInName) ||
      Number(b.anyPrefix) - Number(a.anyPrefix) ||
      b.inName - a.inName ||
      a.ord - b.ord,
  );
  return scored.slice(0, cap).map((x) => x.v);
}

/** Every query word (2+ chars) must match somewhere; name matches rank first. Null under 2 chars. */
export function searchAll(
  index: SearchIndex | null,
  q: string,
): SearchResults | null {
  const s = q.trim().toLowerCase();
  if (!index || s.length < 2) return null;
  const tokens = tokenize(s);
  if (tokens.length === 0) return { items: [], sellers: [], categories: [] };
  const corpus = getLowered(index);
  const categories = corpus.categories
    .filter((row) => tokens.every((t) => row.hay.includes(t)))
    .sort((a, b) => {
      const ap = a.nl.startsWith(tokens[0]) ? 0 : 1;
      const bp = b.nl.startsWith(tokens[0]) ? 0 : 1;
      return ap - bp || b.v.cnt - a.v.cnt;
    })
    .slice(0, 6)
    .map((row) => row.v);
  return {
    items: rank(corpus.items, tokens, 5),
    sellers: rank(corpus.sellers, tokens, 3),
    categories,
  };
}
