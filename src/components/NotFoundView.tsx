/**
 * Shared chrome for the per-type 404 boundaries (item / seller / category /
 * generic). Rendered by the `not-found.tsx` files under `[locale]`, so it sits
 * INSIDE the locale layout — it inherits `<html>`/`<body>`, the theme boot
 * script, and the next-intl request context for free. The locale is read from
 * that context via `getLocale()` (not-found boundaries never receive params).
 *
 * SEO: Next automatically stamps `<meta name="robots" content="noindex">` on
 * every not-found render; the explicit tag here is a belt-and-suspenders
 * guarantee for the soft-404 (streamed 200) cases so these recovery pages can
 * never leak into the index. A duplicate identical noindex is harmless.
 */

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CATEGORY_SLUGS, slugToCategory } from "@/lib/categories";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export async function NotFoundView({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <>
      <meta name="robots" content="noindex" />
      <SiteHeader />
      <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-1 flex-col items-center justify-center gap-5 px-4 py-16 text-center sm:py-24">
        <span
          className="bg-clip-text text-6xl font-black leading-none tracking-tight text-transparent sm:text-7xl"
          style={{ backgroundImage: "var(--accent-gradient)" }}
          aria-hidden="true"
        >
          404
        </span>
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          {description}
        </p>
        {children && (
          <div className="mt-2 flex flex-col items-center gap-4">
            {children}
          </div>
        )}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

/** Solid accent pill — the primary recovery action on a 404. */
export function NotFoundPrimaryLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 hover:shadow-lg hover:shadow-primary/25"
    >
      {children}
      <ArrowRight
        size={16}
        className="transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/** Outlined secondary action. */
export function NotFoundSecondaryLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
    >
      {children}
    </Link>
  );
}

/**
 * The full row of real category landing-page links — the recovery surface for
 * the category 404 (and a bonus row on the item 404). Uses the same slug map
 * the footer/breadcrumbs use, so it can never drift from the routes that exist.
 */
export async function NotFoundCategoryRow() {
  const tCategories = await getTranslations("categories");

  return (
    <nav className="flex max-w-lg flex-wrap items-center justify-center gap-2">
      {CATEGORY_SLUGS.map((slug) => {
        const category = slugToCategory(slug);
        if (!category) return null;
        return (
          <Link
            key={slug}
            href={`/category/${slug}`}
            prefetch={false}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary/40 hover:text-primary"
          >
            {tCategories(category)}
          </Link>
        );
      })}
    </nav>
  );
}
