import { ArrowRight, Cannabis, ExternalLink } from "lucide-react";
import Link from "next/link";

/**
 * SiteFooter — distinct from food-agg: gradient top bar, centered layout, cannabis branding.
 */
export function SiteFooter({
  hideBrowseCta,
}: {
  hideBrowseCta?: boolean;
} = {}) {
  const year = new Date().getFullYear();

  return (
    <footer className={`mt-auto${hideBrowseCta ? " pt-12" : ""}`}>
      {/* Gradient accent bar — mirrors header */}
      <div
        className="h-[2px]"
        style={{ background: "var(--accent-gradient)" }}
      />

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
              Find what you're looking for.
            </h3>
            <p className="text-sm text-muted text-center max-w-lg">
              Explore thousands of listings from Little Biggy sellers - a
              marketplace built on the principle of do no harm.
            </p>
            {!hideBrowseCta && (
              <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
                <Link
                  href="/browse"
                  prefetch={false}
                  className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 hover:shadow-lg hover:shadow-primary/25"
                >
                  Browse items
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            )}
          </div>

          {/* Community + links row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-[var(--border)] pt-8 mb-8">
            {/* Community */}
            <div className="flex flex-col items-center sm:items-start gap-2 max-w-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Community
              </span>
              <div className="flex items-center gap-4">
                <a
                  href="https://littlebiggy.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  Little Biggy
                  <ExternalLink size={13} className="text-muted" />
                </a>
                <a
                  href="https://www.reddit.com/r/LittleBiggy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  Reddit
                  <ExternalLink size={13} className="text-muted" />
                </a>
              </div>
              <p className="text-xs text-muted text-center sm:text-left">
                Join the conversation. Share experiences, ask questions, or
                check seller reputations.
              </p>
            </div>

            {/* Legal links */}
            <nav className="flex gap-6 text-sm">
              <Link
                href="/privacy"
                prefetch={false}
                className="text-muted hover:text-primary transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                prefetch={false}
                className="text-muted hover:text-primary transition-colors"
              >
                Terms
              </Link>
              <Link
                href="/cookies"
                prefetch={false}
                className="text-muted hover:text-primary transition-colors"
              >
                Cookies
              </Link>
            </nav>
          </div>

          {/* Copyright */}
          <p className="text-center text-xs text-muted-foreground">
            &copy; {year} Biggy Index. Prices shown may vary - always check the
            store for the latest pricing.
          </p>
        </div>
      </div>
    </footer>
  );
}
