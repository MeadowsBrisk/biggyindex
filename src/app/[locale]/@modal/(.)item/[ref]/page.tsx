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
import { cacheLife } from "next/cache";
import { OverlayBridge } from "./OverlayBridge";

interface ModalItemPageProps {
  params: Promise<{ ref: string }>;
}

async function ModalContent({ params }: ModalItemPageProps) {
  "use cache";
  cacheLife("item-detail");
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
