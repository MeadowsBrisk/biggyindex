import { ArrowRight, Cannabis, ExternalLink, Github } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CATEGORY_SLUGS, slugToCategory } from "@/lib/categories";
import { GITHUB_REPO_URL, VERIFY_LINKS } from "@/lib/verify-links";

/**
 * SiteFooter — gradient top bar, centered layout, cannabis branding.
 */

// Module scope, NOT render scope: under cacheComponents, `new Date()` inside
// an uncached Server Component render is a fatal next-prerender-current-time
// build error. Module init runs outside the render clock-check, and the value
// refreshes on every deploy/cold start — plenty for a copyright year.
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
  // Indexed lookup into the canonical link list. The footer renders a
  // hand-ordered subset interleaved with community links so it can't map the
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

          {/* Official links + Community + Legal row.
              Three groups: below md they stack centred (gap-8 = 32px between
              groups); from md they sit side by side. The authenticity links
              duplicate the header's Verify popover ON PURPOSE — the homepage
              is hero-led and renders no SiteHeader, so the footer is what
              makes them reachable site-wide.

              Spacing rhythm inside each group (matches the verify popover):
                eyebrow → first row   mb-3   (12px)
                official rows         gap-2  (8px between two-line rows)
                label → URL           mt-0.5 (2px)
                community links       gap-x-4 gap-y-2 */}
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8 md:gap-6 border-t border-border pt-8 mb-8">
            {/* Official Little Biggy links — the same two-line
                label-over-address rows as the header popover / status card,
                so a raw URL is never shown without its meaning attached.
                Addresses come from VERIFY_LINKS `display`; labels reuse
                header.verify.* keys so wording stays in sync everywhere. */}
            <div className="flex flex-col items-center md:items-start">
              <span className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {tVerify("heading")}
              </span>
              <div className="flex flex-col items-center md:items-start gap-2">
                {(["littlebiggy", "canonBorg", "mirrors"] as const).map(
                  (key) => (
                    <a
                      key={key}
                      href={verify[key].href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${tVerify(`${key}.label`)} — ${tVerify(`${key}.description`)} ${tVerify("opensInNewTab")}`}
                      title={tVerify(`${key}.description`)}
                      className="group flex flex-col items-center md:items-start"
                    >
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {tVerify(`${key}.label`)}
                        <ExternalLink size={13} className="text-muted" />
                      </span>
                      <span className="mt-0.5 text-xs text-muted">
                        {verify[key].display}
                      </span>
                    </a>
                  ),
                )}
              </div>
            </div>

            {/* Community */}
            <div className="flex flex-col items-center md:items-start gap-2 max-w-md">
              <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("community")}
              </span>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2">
                <a
                  href="https://www.reddit.com/r/LittleBiggy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  Reddit
                  <ExternalLink size={13} className="text-muted" />
                </a>
                {/* Telegram channel — rendered only when
                    NEXT_PUBLIC_TELEGRAM_CHANNEL_URL is set in the frontend
                    site's env. Inlined at build time, so setting or changing
                    it needs a redeploy. */}
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
              <p className="text-xs text-muted text-center md:text-left">
                {t("communityCopy")}
              </p>
            </div>

            {/* Legal links. Keep flex-wrap + gap-x-5: the longest translated
                labels exceed 360px on one nowrap line, which forces
                horizontal page scroll on narrow phones. gap-y-2 keeps the
                wrapped second line off the first. */}
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm md:justify-end">
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

          {/* Copyright + source. The GitHub link belongs on the copyright
              line, not the community row: it is about this site's own
              auditable source (AGPL-3.0), not the LB ecosystem. Icon + one
              word keeps it quiet; the aria-label carries the full meaning. */}
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
