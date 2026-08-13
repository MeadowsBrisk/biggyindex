import { ArrowRight, Cannabis, ExternalLink, Github } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CATEGORY_SLUGS, slugToCategory } from "@/lib/categories";
import { GITHUB_REPO_URL, VERIFY_LINKS } from "@/lib/verify-links";

/**
 * SiteFooter — distinct from food-agg: gradient top bar, centered layout, cannabis branding.
 */

// Module scope, NOT render scope: under cacheComponents, `new Date()` inside
// an uncached Server Component render is a fatal next-prerender-current-time
// build error (it broke prerendering of the @modal fallback shell). Module
// init runs outside the render clock-check; the value refreshes on every
// deploy/cold start, which is plenty for a copyright year.
const COPYRIGHT_YEAR = new Date().getFullYear();

export async function SiteFooter({
  hideBrowseCta,
  locale,
}: {
  hideBrowseCta?: boolean;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "footer" });
  // Shared with the header's Verify popover so the authenticity links read
  // identically wherever they appear.
  const tVerify = await getTranslations({ locale, namespace: "header.verify" });
  const tCategories = await getTranslations({
    locale,
    namespace: "categories",
  });
  // Indexed lookup into the single canonical link list — the footer renders a
  // hand-ordered subset interleaved with community links, so it can't map the
  // array directly, but hrefs/addresses must never be retyped here.
  const verify = Object.fromEntries(VERIFY_LINKS.map((l) => [l.key, l]));

  return (
    <footer className={`mt-auto${hideBrowseCta ? " pt-12" : ""}`}>
      {/* Gradient accent bar — mirrors header */}
      <div className="h-0.5" style={{ background: "var(--accent-gradient)" }} />

      <div className="bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-12">
          {/* CTA block — hidden on browse pages */}
          <div className="flex flex-col items-center gap-4 mb-10">
            <div className="flex items-center gap-2">
              <Cannabis size={24} className="text-primary" />
              <span className="text-xl font-bold text-foreground">
                Biggy<span className="text-primary">Index</span>
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-foreground text-center">
              {t("ctaTitle")}
            </h3>
            <p className="text-sm text-muted text-center max-w-lg">
              {t("ctaCopy")}
            </p>
            {!hideBrowseCta && (
              <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
                <Link
                  href="/browse"
                  prefetch={false}
                  className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 hover:shadow-lg hover:shadow-primary/25"
                >
                  {t("browseItems")}
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            )}
          </div>

          {/* Category landing pages — sitewide crawlable links */}
          <nav
            aria-label={t("categoriesTitle")}
            className="flex flex-col items-center gap-3 border-t border-border pt-8 mb-8"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("categoriesTitle")}
            </span>
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
              {CATEGORY_SLUGS.map((slug) => {
                const category = slugToCategory(slug);
                if (!category) return null;
                return (
                  <Link
                    key={slug}
                    href={`/category/${slug}`}
                    prefetch={false}
                    className="text-sm text-muted hover:text-primary transition-colors"
                  >
                    {tCategories(category)}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Community + links row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-border pt-8 mb-8">
            {/* Community */}
            <div className="flex flex-col items-center sm:items-start gap-2 max-w-md">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("community")}
              </span>
              {/* flex-wrap + gap-y: this row now carries up to six links and
                  must not overflow at 360px. The two authenticity links
                  (canon borg / Federation mirrors) are duplicated from the
                  header's Verify popover ON PURPOSE — the homepage is
                  hero-led and renders NO SiteHeader, and the header trigger
                  only appears from md up, so the footer is what actually
                  makes them reachable site-wide.

                  The three LB links show their RAW ADDRESSES as the link
                  text (LB operators' request: visible URLs demonstrate
                  legitimacy and help users memorise them). The addresses
                  come from VERIFY_LINKS `display` so every surface shows
                  byte-identical strings; the translated labels survive in
                  the aria-labels. Reddit/Telegram keep their names — they
                  are community links, not authenticity anchors. */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-2">
                {(["littlebiggy", "canonBorg", "mirrors"] as const).map(
                  (key) => (
                    <a
                      key={key}
                      href={verify[key].href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${tVerify(`${key}.label`)} ${tVerify("opensInNewTab")}`}
                      title={tVerify(`${key}.label`)}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {verify[key].display}
                      <ExternalLink size={13} className="text-muted" />
                    </a>
                  ),
                )}
                <a
                  href="https://www.reddit.com/r/LittleBiggy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  Reddit
                  <ExternalLink size={13} className="text-muted" />
                </a>
                {/* Telegram channel — appears once the channel exists and
                    NEXT_PUBLIC_TELEGRAM_CHANNEL_URL is set on the frontend
                    Netlify site (e.g. https://t.me/biggyindex). Inlined at
                    build time, so setting/changing it needs a redeploy. */}
                {process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL && (
                  <a
                    href={process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    Telegram
                    <ExternalLink size={13} className="text-muted" />
                  </a>
                )}
                <Link
                  href="/littlebiggy-status"
                  prefetch={false}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  {t("statusLink")}
                </Link>
              </div>
              <p className="text-xs text-muted text-center sm:text-left">
                {t("communityCopy")}
              </p>
            </div>

            {/* Legal links.
                flex-wrap + gap-x-5: at 360px the German labels ("Über uns",
                "Datenschutz", "Nutzungsbedingungen", "Cookies") measured
                370.6px on one nowrap line, which was the sole cause of
                horizontal page scroll on /de-DE/* on narrow phones. Wrapping
                to two centred lines fixes it; gap-y-2 keeps the second line
                off the first. */}
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm sm:justify-end">
              <Link
                href="/about"
                prefetch={false}
                className="text-muted hover:text-primary transition-colors"
              >
                {t("about")}
              </Link>
              <Link
                href="/privacy"
                prefetch={false}
                className="text-muted hover:text-primary transition-colors"
              >
                {t("privacy")}
              </Link>
              <Link
                href="/terms"
                prefetch={false}
                className="text-muted hover:text-primary transition-colors"
              >
                {t("terms")}
              </Link>
              <Link
                href="/cookies"
                prefetch={false}
                className="text-muted hover:text-primary transition-colors"
              >
                {t("cookies")}
              </Link>
            </nav>
          </div>

          {/* Copyright + source. The GitHub link sits with the copyright
              line, not the community row: it is about THIS site (auditable
              source, AGPL-3.0), not about the LB ecosystem. Icon + one word
              keeps it quiet; the aria-label carries the full meaning. */}
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <p className="text-center">
              {t("copyright", { year: COPYRIGHT_YEAR })}
            </p>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${t("github")} ${tVerify("opensInNewTab")}`}
              title={t("github")}
              className="inline-flex items-center gap-1.5 font-medium text-muted hover:text-primary transition-colors"
            >
              <Github size={14} aria-hidden="true" />
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
