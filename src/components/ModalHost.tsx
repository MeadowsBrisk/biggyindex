"use client";

import { useAtomValue } from "jotai";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ItemDetailOverlay } from "@/components/ItemDetailOverlay";
import { SellerModal } from "@/components/SellerModal";
import {
  basketOpenAtom,
  expandedRefNumAtom,
  lbGuideModalOpenAtom,
  photoReviewModalAtom,
  sellerModalIdAtom,
  settingsModalOpenAtom,
} from "@/store/atoms";

const PhotoReviewModal = dynamic(
  () =>
    import("@/components/home/PhotoReviewModal").then(
      (mod) => mod.PhotoReviewModal,
    ),
  { ssr: false, loading: () => null },
);

const Basket = dynamic(
  () => import("@/components/Basket").then((mod) => mod.Basket),
  { ssr: false, loading: () => null },
);

const SettingsModal = dynamic(
  () => import("@/components/SettingsModal").then((mod) => mod.SettingsModal),
  { ssr: false, loading: () => null },
);

const LBGuideModal = dynamic(
  () => import("@/components/LBGuideModal").then((mod) => mod.LBGuideModal),
  { ssr: false, loading: () => null },
);

function useHasOpened(isOpen: boolean) {
  const [hasOpened, setHasOpened] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  return hasOpened;
}

export function ModalHost() {
  const itemRefNum = useAtomValue(expandedRefNumAtom);
  const photoReview = useAtomValue(photoReviewModalAtom);
  const basketOpen = useAtomValue(basketOpenAtom);
  const settingsOpen = useAtomValue(settingsModalOpenAtom);
  const sellerId = useAtomValue(sellerModalIdAtom);
  const lbGuideOpen = useAtomValue(lbGuideModalOpenAtom);

  const itemHasOpened = useHasOpened(itemRefNum != null);
  const photoReviewHasOpened = useHasOpened(photoReview != null);
  const basketHasOpened = useHasOpened(basketOpen);
  const settingsHasOpened = useHasOpened(settingsOpen);
  const sellerHasOpened = useHasOpened(sellerId != null);
  const lbGuideHasOpened = useHasOpened(lbGuideOpen);

  return (
    <>
      {itemHasOpened && <ItemDetailOverlay />}
      {photoReviewHasOpened && <PhotoReviewModal />}
      {basketHasOpened && <Basket />}
      {settingsHasOpened && <SettingsModal />}
      {sellerHasOpened && <SellerModal />}
      {lbGuideHasOpened && <LBGuideModal />}
    </>
  );
}
