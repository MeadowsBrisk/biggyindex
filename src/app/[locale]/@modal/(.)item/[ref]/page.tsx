/**
 * Intercepting route — bridges Next.js App Router navigation
 * to the Jotai-driven ItemDetailOverlay.
 *
 * When the user clicks an item card (`<Link href="/item/123">`),
 * this intercepting route renders instead of the full page.
 * It sets `expandedRefNumAtom` so the overlay opens with animations,
 * then renders nothing itself (the overlay lives in layout.tsx).
 */

import { Suspense } from "react";
import { OverlayBridge } from "./OverlayBridge";

// Intercepting routes are inherently request-scoped (they depend on
// client navigation state and render into a parallel slot alongside
// the root layout, which contains client-only Jotai/nuqs providers).
// Opt out of prerendering so Next.js 16's blocking-route check doesn't
// flag the layout's uncached client data as a static-render problem.
export const dynamic = "force-dynamic";

interface ModalItemPageProps {
  params: Promise<{ ref: string }>;
}

async function ModalContent({ params }: ModalItemPageProps) {
  const { ref } = await params;
  return <OverlayBridge refNum={ref} />;
}

export default function ModalItemPage(props: ModalItemPageProps) {
  return (
    <Suspense>
      <ModalContent params={props.params} />
    </Suspense>
  );
}
