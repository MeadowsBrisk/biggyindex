/**
 * Next.js 16 Proxy — locale + market detection, plus v1 legacy redirects.
 *
 * Uses next-intl's middleware under the hood for:
 * - Domain-based locale routing (de.biggyindex.com → de-DE)
 * - Locale prefix handling (as-needed — no /en-GB in URLs)
 * - Setting `mkt` cookie for downstream server components
 *
 * In dev (localhost), defaults to en-GB / GB market.
 *
 * LEGACY REDIRECTS LIVE HERE, not (only) in netlify.toml or next.config:
 * on Netlify this middleware runs as an edge function BEFORE both
 * netlify.toml [[redirects]] and next.config redirects(), so it is the only
 * layer guaranteed to see the original v1 path — verified in production
 * where /home reached the origin as /en-GB/home and every lower-layer rule
 * missed. netlify.toml + next.config keep mirror rules for portability and
 * for dotted paths (/sitemap-*.xml) that the matcher below skips.
 */
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

/** v1 page renames (host-relative — each market redirects its own). */
const PAGE_RENAMES: Record<string, string> = {
  "/home": "/",
  "/latest-reviews": "/reviews",
};

/** v1 localized detail paths → v2 routes. */
const ITEM_PREFIXES = [
  "/produit/",
  "/produkt/",
  "/prodotto/",
  "/produto/",
  "/producto/",
];
const SELLER_PREFIXES = [
  "/vendeur/",
  "/verkaeufer/",
  "/venditore/",
  "/vendedor/",
];

/** v1 apex locale-prefix paths (/de/home, /it, …) → market subdomains. */
const LOCALE_PREFIX_HOSTS: Record<string, string> = {
  de: "de.biggyindex.com",
  fr: "fr.biggyindex.com",
  pt: "pt.biggyindex.com",
  it: "it.biggyindex.com",
  es: "es.biggyindex.com",
};

function legacyRedirect(request: NextRequest): NextResponse | null {
  const { pathname, search } = request.nextUrl;

  // Legacy v1 domain (lbindex.vip) → canonical apex. Runs FIRST so the alias
  // never serves duplicate 200s — the canonical tag only mitigates, a 301 is
  // the correct fix. Read the real Host header (nextUrl.host can be the
  // deployment host on the edge), lowercase it and strip any port. localhost/
  // dev and every *.biggyindex.com host fall through untouched; the GB_HOSTS
  // mapping stays in place so requests still reaching the app on that host
  // during DNS propagation resolve as GB.
  const requestHost = (request.headers.get("host") ?? "")
    .toLowerCase()
    .split(":")[0];
  if (requestHost === "lbindex.vip" || requestHost === "www.lbindex.vip") {
    return NextResponse.redirect(
      `https://biggyindex.com${pathname}${search}`,
      301,
    );
  }

  const rename = PAGE_RENAMES[pathname];
  if (rename) {
    return NextResponse.redirect(new URL(rename + search, request.url), 301);
  }

  for (const prefix of ITEM_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const ref = pathname.slice(prefix.length);
      if (ref && !ref.includes("/")) {
        return NextResponse.redirect(
          new URL(`/item/${ref}${search}`, request.url),
          301,
        );
      }
    }
  }

  for (const prefix of SELLER_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      const id = pathname.slice(prefix.length);
      if (id && !id.includes("/")) {
        return NextResponse.redirect(
          new URL(`/seller/${id}${search}`, request.url),
          301,
        );
      }
    }
  }

  // /de, /de/home, /de/anything → https://de.biggyindex.com/… (v1 served
  // locale-prefixed paths on the apex; v2 is subdomain-only). The bare
  // two-letter prefix can never collide with v2 locale codes (/de-DE) or
  // any v2 top-level route. /xx/home collapses to / in one hop.
  const seg = pathname.split("/")[1];
  const host = seg ? LOCALE_PREFIX_HOSTS[seg] : undefined;
  if (host) {
    const rest = pathname.slice(seg.length + 1) || "/";
    const path = rest === "/home" ? "/" : rest;
    return NextResponse.redirect(`https://${host}${path}${search}`, 301);
  }

  return null;
}

export default function proxy(request: NextRequest) {
  return legacyRedirect(request) ?? intlMiddleware(request);
}

export const config = {
  // Match all paths except API routes, static files, and Next.js internals
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
