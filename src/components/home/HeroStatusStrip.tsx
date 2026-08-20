"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { R2Keys, readR2JSON } from "@/lib/r2";

/**
 * Homepage outage strip.
 *
 * The homepage renders no SiteHeader, so the Verify popover and the status
 * link are unreachable above the fold. This closes that gap, and only for the
 * down state: when the marketplace is up this renders null and costs the hero
 * nothing.
 *
 * CLIENT-ONLY BY NECESSITY. The homepage is `'use cache'` on the long-lived
 * `items` profile. Nesting the short-lived `status` profile would cap the
 * whole homepage at that shorter life and multiply function invocations, and
 * `<Suspense>` must not be used on this page (see app/[locale]/page.tsx). Hence
 * one deferred fetch straight off the public R2 CDN — no API route.
 *
 * NEVER render a relative timestamp here: nothing re-stamps this page, so
 * "checked X ago" would freeze. Freshness is enforced instead by refusing to
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
  // The CTA text is `rose-700 / dark:rose-300`, one step off the status
  // page's rose-600/400, because it sits on a tinted band (rose-600 on the
  // light tint is ~4.6:1; rose-700 is ~6.4:1). Do not "fix" it back.
  //
  // KEEP THIS IN NORMAL FLOW. Absolutely positioning it inside HeroSection to
  // avoid layout shift does not work: HeroSection is `min-h-[100svh]
  // justify-center`, so once its content column is taller than the viewport
  // the column clamps to top:0 and paints straight over the band's text. In
  // flow the band simply pushes the hero down and can never overlap. The up
  // state stays shift-free either way — it renders an empty zero-height
  // wrapper — and a shift when the site is down is correct banner behaviour.
  //
  // `min-h-11` is a FLOOR, not a fixed height: locales that wrap to two lines
  // grow the band, which is fine.
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
