/**
 * Intercepting route — bridges App Router navigation to the Jotai-driven
 * ItemDetailOverlay. Clicking an item card (`<Link href="/item/123">`) renders
 * this instead of the full page: it sets `expandedRefNumAtom` so the overlay
 * opens with animations, and renders nothing itself (the overlay lives in
 * layout.tsx).
 *
 * Deliberately NO `"use cache"` / cacheLife. Intercepting routes are only hit
 * via client-side navigation, never by bots, so ISR caching just wastes write
 * units — and under cacheComponents, caching this page pulls the prerenderer
 * into the surrounding layout, whose client-only nuqs + Jotai providers read
 * uncached request state, raising the "Uncached data outside Suspense"
 * blocking-route error.
 */

import { OverlayBridge } from "./OverlayBridge";

interface ModalItemPageProps {
  params: Promise<{ ref: string }>;
}

export default async function ModalItemPage({ params }: ModalItemPageProps) {
  const { ref } = await params;
  return <OverlayBridge refNum={ref} />;
}
