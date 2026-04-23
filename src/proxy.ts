/**
 * Next.js 16 Proxy — locale + market detection.
 *
 * Uses next-intl's middleware under the hood for:
 * - Domain-based locale routing (de.biggyindex.com → de-DE)
 * - Locale prefix handling (as-needed — no /en-GB in URLs)
 * - Setting `mkt` cookie for downstream server components
 *
 * In dev (localhost), defaults to en-GB / GB market.
 */
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all paths except API routes, static files, and Next.js internals
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
