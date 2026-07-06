import { parseAsArrayOf, parseAsInteger, parseAsString } from "nuqs";
import type { SortDir, SortKey } from "@/lib/types";

export const DEFAULT_SORT_KEY: SortKey = "hottest";
export const DEFAULT_SORT_DIR: SortDir = "desc";
export const DEFAULT_CATEGORY = "All";

export const VALID_SORT_KEYS = new Set<string>([
  "hottest",
  "newest",
  "updated",
  "price",
  "ppg",
  "shuffle",
]);

export const browseUrlParsers = {
  sort: parseAsString,
  dir: parseAsString,
  q: parseAsString,
  cat: parseAsString,
  sub: parseAsArrayOf(parseAsString, ","),
  sellers: parseAsArrayOf(parseAsString, ","),
  pmin: parseAsInteger,
  pmax: parseAsInteger,
};

export interface BrowseUrlState {
  sort?: string | null;
  dir?: string | null;
  q?: string | null;
  cat?: string | null;
  sub?: string[] | null;
  sellers?: string[] | null;
  pmin?: number | null;
  pmax?: number | null;
}

export interface ParsedBrowseUrlFilters {
  sortKey?: SortKey;
  sortDir?: SortDir;
  search?: string;
  category?: string;
  subcategories?: string[];
  sellers?: string[];
  priceRange?: { min: number; max: number };
}

export interface InitialBrowseFilters {
  search: string;
  category: string;
  subcategories: string[];
  sellers: string[];
}

function compactList(values: string[] | null | undefined): string[] {
  return (values ?? []).filter(Boolean);
}

function parseCsvParam(value: string | null): string[] | undefined {
  if (value == null) return undefined;
  return value.split(",").filter(Boolean);
}

function parseIntegerParam(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function isSortKey(value: string | null | undefined): value is SortKey {
  return !!value && VALID_SORT_KEYS.has(value);
}

export function isSortDir(value: string | null | undefined): value is SortDir {
  return value === "asc" || value === "desc";
}

export function readBrowseUrlState(
  urlState: BrowseUrlState,
): ParsedBrowseUrlFilters {
  const parsed: ParsedBrowseUrlFilters = {};

  if (isSortKey(urlState.sort)) parsed.sortKey = urlState.sort;
  if (isSortDir(urlState.dir)) parsed.sortDir = urlState.dir;
  if (urlState.q != null) parsed.search = urlState.q;
  if (urlState.cat != null) parsed.category = urlState.cat;

  const subcategories = compactList(urlState.sub);
  if (urlState.sub != null && subcategories.length > 0) {
    parsed.subcategories = subcategories;
  }

  const sellers = compactList(urlState.sellers);
  if (urlState.sellers != null && sellers.length > 0) {
    parsed.sellers = sellers;
  }

  if (urlState.pmin != null || urlState.pmax != null) {
    parsed.priceRange = {
      min: urlState.pmin ?? 0,
      max: urlState.pmax ?? Infinity,
    };
  }

  return parsed;
}

export function parseBrowseUrlFilters(
  search: string | URLSearchParams,
): ParsedBrowseUrlFilters {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  return readBrowseUrlState({
    sort: params.get("sort"),
    dir: params.get("dir"),
    q: params.has("q") ? params.get("q") : undefined,
    cat: params.has("cat") ? params.get("cat") : undefined,
    sub: parseCsvParam(params.get("sub")),
    sellers: parseCsvParam(params.get("sellers")),
    pmin: parseIntegerParam(params.get("pmin")),
    pmax: parseIntegerParam(params.get("pmax")),
  });
}

export function getInitialBrowseFilters(
  search: string | URLSearchParams,
  routeCategory?: string | null,
): InitialBrowseFilters {
  const parsed = parseBrowseUrlFilters(search);
  return {
    search: parsed.search ?? "",
    category: routeCategory ?? parsed.category ?? DEFAULT_CATEGORY,
    subcategories: parsed.subcategories ?? [],
    sellers: parsed.sellers ?? [],
  };
}

export function buildBrowseUrlState({
  sortKey,
  sortDir,
  search,
  category,
  subcategories,
  sellers,
  priceRange,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  search: string;
  category: string;
  subcategories: string[];
  sellers: string[];
  priceRange: { min: number; max: number };
}): Required<BrowseUrlState> {
  return {
    sort: sortKey !== DEFAULT_SORT_KEY ? sortKey : null,
    dir: sortDir !== DEFAULT_SORT_DIR ? sortDir : null,
    q: search || null,
    cat: category !== DEFAULT_CATEGORY ? category : null,
    sub: subcategories.length > 0 ? subcategories : null,
    sellers: sellers.length > 0 ? sellers : null,
    pmin: priceRange.min > 0 ? priceRange.min : null,
    pmax: priceRange.max < Infinity ? priceRange.max : null,
  };
}
