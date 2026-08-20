import type { Locale } from "./routing";

/**
 * Top-level message namespaces that CLIENT components consume via
 * `useTranslations(...)`. Only these are shipped into the RSC payload / HTML
 * through <NextIntlClientProvider>. Server Components use `getTranslations`
 * (from next-intl/server) and read the FULL catalog via the request config —
 * they do NOT depend on this list.
 *
 * ADDING A `useTranslations("x")` CALL TO A 'use client' COMPONENT? You MUST add
 * the top-level namespace "x" here, or the string renders as its raw key in the
 * browser (IntlClientProvider's onError guard logs it loudly in dev).
 *
 * Deliberately EXCLUDED as server-only:
 *   - site      → generateMetadata + home page.tsx (getTranslations)
 *   - legal     → privacy/terms/cookies pages (getTranslations) — large
 *                 namespace, never promote to the client list
 *   - category  → category/[slug]/page.tsx (getTranslations) — large
 *                 namespace, never promote to the client list
 *   - sort      → no consumer; client sort UI uses browse.toolbar.sort
 *
 * DOTTED PATHS ARE SUPPORTED. An entry may be a top-level namespace ("home") or
 * a dotted sub-path ("footer.statusLink"). A dotted entry ships ONLY that
 * subtree, rebuilt at the same shape, so `useTranslations("footer")` +
 * `t("statusLink")` still resolves. Use it when a client component needs one leaf
 * of an otherwise server-only namespace — shipping the whole namespace to every
 * page just to satisfy one string is pure payload waste.
 *
 * The status surfaces are that case: <HeroStatusStrip> reads
 * `littleBiggyStatus.status.down` + `footer.statusLink`, and <StatusRelativeTime>
 * needs runtime ICU pluralisation of `littleBiggyStatus.status.lastChecked*`
 * (the count advances on the client, so it cannot be pre-resolved server-side).
 * Both reuse the existing copy rather than forking it into `home`.
 *
 * Keep alphabetical for easy diffing.
 */
export const CLIENT_NAMESPACES = [
  "basket",
  "browse",
  "categories",
  "common",
  "errors",
  "footer.statusLink",
  "header",
  "home",
  "item",
  "lbGuide",
  "littleBiggyStatus.status",
  "markets",
  "nav",
  "reviews",
  "seller",
  "settings",
  "suggest",
] as const;

export type ClientNamespace = (typeof CLIENT_NAMESPACES)[number];

/** The full generated catalog shape (values are nested message trees). */
export type Messages = Record<string, unknown>;

/**
 * The subset shipped to the client. Deliberately the loose catalog shape:
 * entries may be dotted sub-paths, so the result is a partial tree rather
 * than a `Pick` over top-level keys.
 */
export type ClientMessages = Messages;

/**
 * Pick a subset of the catalog by namespace or dotted sub-path.
 *
 * - `"home"`              → ships the whole `home` namespace.
 * - `"footer.statusLink"` → ships `{ footer: { statusLink } }` only.
 *
 * No deep clone — picked values are shared by reference and must never be
 * mutated. Missing paths are skipped silently so a stale entry can't crash the
 * app; the dev guard in IntlClientProvider still surfaces genuine misses loudly.
 *
 * Sub-paths of the SAME namespace merge rather than overwrite, so
 * ["a.b", "a.c"] yields { a: { b, c } }. Listing a bare namespace alongside a
 * sub-path of it (["a", "a.b"]) is redundant — last write wins — so don't.
 */
export function pickMessages(
  messages: Messages,
  namespaces: readonly string[] = CLIENT_NAMESPACES,
): ClientMessages {
  const out: Messages = {};

  for (const ns of namespaces) {
    if (!ns.includes(".")) {
      if (ns in messages) out[ns] = messages[ns];
      continue;
    }

    const parts = ns.split(".");

    // Walk the source to the requested leaf/subtree.
    let src: unknown = messages;
    for (const part of parts) {
      if (typeof src !== "object" || src === null || !(part in src)) {
        src = undefined;
        break;
      }
      src = (src as Record<string, unknown>)[part];
    }
    if (src === undefined) continue;

    // Rebuild the same shape in the output, merging with anything already
    // placed there by a sibling sub-path.
    let target = out;
    for (const part of parts.slice(0, -1)) {
      const existing = target[part];
      if (typeof existing !== "object" || existing === null) {
        target[part] = {};
      }
      target = target[part] as Messages;
    }
    target[parts[parts.length - 1]] = src;
  }

  return out;
}

/** Re-export for callers that want a stable signature alongside the locale. */
export type { Locale };
