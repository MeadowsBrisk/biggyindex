import "@/styles/globals.css";

import type { Metadata } from "next";
import { SITE_ICONS } from "@/lib/seo/metadata";

/**
 * Bare root layout — only exists because Next.js requires app/layout.tsx.
 * The real layout lives at app/[locale]/layout.tsx where next-intl
 * provides the locale context.
 *
 * This file must NOT render <html> or <body> — the locale layout does that
 * so it can set `lang` dynamically.
 */

/**
 * Icons only. Declared at the root so pages rendered OUTSIDE the locale tree
 * — notably the root `not-found.tsx` — still get the right favicon; the
 * locale layout re-declares the same set for everything under [locale].
 */
export const metadata: Metadata = {
  icons: SITE_ICONS,
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
