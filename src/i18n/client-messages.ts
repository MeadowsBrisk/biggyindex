import type { Locale } from "./routing";

/**
 * Top-level message namespaces that CLIENT components actually consume via
 * `useTranslations(...)`. Only these are shipped into the RSC payload / HTML
 * through <NextIntlClientProvider>. Server Components use `getTranslations`
 * (from next-intl/server) and read the FULL catalog via the request config —
 * they do NOT depend on this list.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │  ⚠️  ADDING A `useTranslations("x")` CALL TO A 'use client' COMPONENT?  │
 * │      You MUST add the top-level namespace "x" here, or the string will  │
 * │      render as its raw key in the browser (and log a loud dev error —   │
 * │      see IntlClientProvider's onError guard).                           │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Deliberately EXCLUDED (server-only, verified via grep of useTranslations):
 *   - site      → generateMetadata + home page.tsx (getTranslations)
 *   - footer    → SiteFooter (getTranslations)
 *   - legal     → privacy/terms/cookies pages (getTranslations)   [~5 KB]
 *   - category  → category/[slug]/page.tsx (getTranslations)      [~8 KB]
 *   - sort      → no consumer; client sort UI uses browse.toolbar.sort
 *
 * Keep alphabetical for easy diffing.
 */
export const CLIENT_NAMESPACES = [
  "basket",
  "browse",
  "categories",
  "common",
  "errors",
  "header",
  "home",
  "item",
  "lbGuide",
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

/** Only the namespaces a client component may reference. */
export type ClientMessages = Pick<Messages, ClientNamespace>;

/**
 * Lodash-style pick over top-level keys — no dependency, no deep clone
 * (values are shared by reference; they are never mutated). Silently skips
 * keys absent from the source so a stale namespace name can't crash the app,
 * but the dev guard in IntlClientProvider still surfaces genuine misses.
 */
export function pickMessages(
  messages: Messages,
  namespaces: readonly string[] = CLIENT_NAMESPACES,
): ClientMessages {
  const out: Messages = {};
  for (const ns of namespaces) {
    if (ns in messages) out[ns] = messages[ns];
  }
  return out as ClientMessages;
}

/** Re-export for callers that want a stable signature alongside the locale. */
export type { Locale };
