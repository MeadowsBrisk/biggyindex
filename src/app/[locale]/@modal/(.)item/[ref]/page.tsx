/**
 * Intercepting route — bridges Next.js App Router navigation
 * to the Jotai-driven ItemDetailOverlay.
 *
 * When the user clicks an item card (`<Link href="/item/123">`),
 * this intercepting route renders instead of the full page.
 * It sets `expandedRefNumAtom` so the overlay opens with animations,
 * then renders nothing itself (the overlay lives in layout.tsx).
 *
 * NOTE (matches food-agg): No `"use cache"` / cacheLife here.
 * Intercepting routes are only hit via client-side navigation (never
 * by bots), so ISR caching just wastes write units. More importantly,
 * under Next.js 16 cacheComponents, caching this page forces the
 * prerenderer into the surrounding layout (which holds client-only
 * nuqs + Jotai providers reading uncached request state), triggering
 * the "Uncached data outside Suspense" blocking-route error.
 */

import { OverlayBridge } from "./OverlayBridge";

interface ModalItemPageProps {
  params: Promise<{ ref: string }>;
}

export default async function ModalItemPage({ params }: ModalItemPageProps) {
  const { ref } = await params;
  return <OverlayBridge refNum={ref} />;
}
