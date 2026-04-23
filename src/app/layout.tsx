import "@/styles/globals.css";

/**
 * Bare root layout — only exists because Next.js requires app/layout.tsx.
 * The real layout lives at app/[locale]/layout.tsx where next-intl
 * provides the locale context.
 *
 * This file must NOT render <html> or <body> — the locale layout does that
 * so it can set `lang` dynamically.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
