"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { relativeAge } from "@/lib/relative-age";

/**
 * Client leaf that turns an ISO stamp into "Last checked 7 minutes ago".
 *
 * WHY A CLIENT LEAF: /littlebiggy-status renders inside `"use cache"`, so any
 * `Date.now()` read during the server render is FROZEN into the cached HTML
 * and only re-stamps when the cache revalidates. The fix is to keep the cached
 * render deterministic and compute the human string on the client — the same
 * `relativeAge(iso, clientNow)` + `clientNow` effect trio the item cards use
 * (see ItemGrid.tsx ~328–343 → ItemCard/ItemRow/ReviewCard).
 */

interface Props {
  iso: string;
  /**
   * Deterministic pre-formatted absolute string, built SERVER-side with the
   * page's existing formatTime() (UTC, no Date.now()). Rendered on the server
   * AND on the first client render, so hydration is byte-identical. It is a
   * prop rather than re-formatted here so there is no chance of an Intl
   * locale-data difference between runtimes.
   */
  absoluteLabel: string;
  keyPrefix: "lastChecked" | "lastOutage";
  className?: string;
}

export function StatusRelativeTime({
  iso,
  absoluteLabel,
  keyPrefix,
  className,
}: Props) {
  const t = useTranslations("littleBiggyStatus.status");
  const [clientNow, setClientNow] = useState<number | null>(null);

  // Mirrors ItemGrid.tsx ~328–343 exactly: stamp on mount, refresh on a slow
  // interval so "7 minutes ago" advances for a user sitting on the page, and
  // re-stamp on tab return.
  useEffect(() => {
    setClientNow(Date.now());
    const interval = window.setInterval(() => setClientNow(Date.now()), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") setClientNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const age = relativeAge(iso, clientNow);

  // age === null on: first render (clientNow null), a pre-2025-09-01 stamp
  // (FIRST_CRAWL_TS guard), or a future timestamp (ms < 0 guard — client clock
  // behind the server). All three fall back to absoluteLabel, never to an
  // empty node. "months" also falls back: a months-old check means the crawler
  // is dead and an absolute date is the honest thing to show.
  //
  // NO `suppressHydrationWarning` here, and none may be added: server and
  // first client render both emit `absoluteLabel`, so they are byte-identical
  // by construction. A React warning would mean a non-deterministic
  // `absoluteLabel` — that is the bug, not something to paper over.
  const label =
    !age || age.unit === "months"
      ? absoluteLabel
      : age.unit === "minutes"
        ? age.count < 1
          ? t(`${keyPrefix}JustNow`)
          : t(`${keyPrefix}Minutes`, { count: age.count })
        : age.unit === "hours"
          ? t(`${keyPrefix}Hours`, { count: age.count })
          : t(`${keyPrefix}Days`, { count: age.count });

  return (
    <time dateTime={iso} className={className}>
      {label}
    </time>
  );
}
