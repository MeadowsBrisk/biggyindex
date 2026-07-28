"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { R2Keys, readR2JSON } from "@/lib/r2";

/**
 * Homepage outage strip.
 *
 * The homepage renders NO SiteHeader, so the Verify popover and the status
 * link are unreachable above the fold — the footer is six sections down.
 * This closes that gap, and ONLY for the down state: when Little Biggy is up
 * (the ~always case) this renders null and costs the hero nothing.
 *
 * CLIENT-ONLY BY NECESSITY. HomePage is `'use cache'` on the `items` profile
 * (revalidate 86400). A nested `'use cache'` on the `status` profile
 * (revalidate 300) would cap the WHOLE homepage at a 5-minute life and
 * multiply Netlify function invocations; `<Suspense>` is banned on this page
 * (see the comment at app/[locale]/page.tsx:129). So: one deferred fetch
 * straight off the public R2 CDN — no API route, no serverless hit.
 *
 * NEVER render a relative timestamp here. There is no cache re-stamp on this
 * page, so "checked X ago" would freeze. Freshness is enforced by refusing to
 * render a blob older than MAX_BLOB_AGE_MS.
 */

const MAX_BLOB_AGE_MS = 30 * 60 * 1000; // trust only a recent check
const FETCH_DELAY_MS = 1200; // defer past LCP (the hero H1)

interface StatusBlob {
  up?: unknown;
  lastCheckedAt?: unknown;
}

export function HeroStatusStrip() {
  const t = useTranslations("littleBiggyStatus.status");
  const tFooter = useTranslations("footer");
  const [down, setDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const blob = await readR2JSON<StatusBlob>(R2Keys.status);
      if (cancelled || !blob) return;
      if (blob.up !== false) return; // only an EXPLICIT down
      const checkedAt = Date.parse(String(blob.lastCheckedAt ?? ""));
      if (!Number.isFinite(checkedAt)) return;
      if (Date.now() - checkedAt > MAX_BLOB_AGE_MS) return; // the checker may be what died
      setDown(true);
    };
    const id = window.setTimeout(check, FETCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);

  const label = t("down");
  const cta = tFooter("statusLink");

  // The live region is ALWAYS mounted (empty, zero-height) so the strip's
  // later appearance is announced. role="status" must live on the wrapper,
  // NOT on the <Link> — it would override the link role.
  //
  // The CTA text is `rose-700 / dark:rose-300`, deliberately one step off the
  // status page's rose-600/400, because it sits on a tinted band (rose-600 on
  // the light tint ≈ 4.6:1; rose-700 ≈ 6.4:1). Do not "fix" it back.
  //
  // ── IN NORMAL FLOW, ON PURPOSE (changed 2026-07-27) ───────────────────
  // This was `absolute inset-x-0 top-0 z-10` inside HeroSection, to guarantee
  // zero layout shift. That is unsatisfiable: HeroSection is
  // `min-h-[100svh] justify-center`, so as soon as its content column is
  // taller than the viewport the column clamps to top:0 and the absolute band
  // sits UNDERNEATH it — both are z-10 and the column is later in the DOM, so
  // the 48px logo mark painted straight over the band's text. Measured
  // overlap: 62px at 360x640/740/800 and 390x844, 44px at 1440x700 — i.e.
  // every phone and any short desktop window, not an edge case.
  //
  // In flow it simply pushes the hero down and can never overlap anything.
  // The "no layout shift" purity was only ever protecting the UP state, and
  // that is untouched: when LB is up this renders an empty zero-height
  // wrapper. When LB is DOWN a 44px shift is the correct, expected behaviour
  // of an outage banner — and the component mounts client-side after a
  // deferred fetch anyway, so its appearance was always going to be a visual
  // change regardless of positioning.
  //
  // `min-h-11` is a FLOOR, not a fixed height — de/el wrap to two lines and
  // the band grows, which is now genuinely harmless.
  return (
    <div role="status" aria-live="polite" className="relative z-10">
      {down && (
        <Link
          href="/littlebiggy-status"
          prefetch={false}
          aria-label={`${label} — ${cta}`}
          style={{ "--mount-delay": "0ms" } as React.CSSProperties}
          className="mount-fade flex min-h-11 items-center gap-2.5 border-b border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-[15px] font-medium leading-snug text-foreground transition-colors hover:bg-rose-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500/50 sm:justify-center sm:px-16"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-rose-500"
          />
          <span className="min-w-0">{label}</span>
          <span aria-hidden="true" className="hidden text-muted sm:inline">
            ·
          </span>
          <span className="hidden shrink-0 items-center gap-1 text-rose-700 dark:text-rose-300 sm:inline-flex">
            {cta}
            <ArrowRight size={14} className="shrink-0" />
          </span>
          <ArrowRight
            size={16}
            aria-hidden="true"
            className="ml-auto shrink-0 text-rose-700 dark:text-rose-300 sm:hidden"
          />
        </Link>
      )}
    </div>
  );
}
