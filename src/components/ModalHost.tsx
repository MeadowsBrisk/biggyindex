"use client";

import { useAtomValue } from "jotai";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  basketOpenAtom,
  expandedRefNumAtom,
  photoReviewModalAtom,
  sellerModalIdAtom,
  settingsModalOpenAtom,
} from "@/store/atoms";

const ItemDetailOverlay = dynamic(
  () =>
    import("@/components/ItemDetailOverlay").then(
      (mod) => mod.ItemDetailOverlay,
    ),
  { ssr: false, loading: () => null },
);

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

const SellerModal = dynamic(
  () => import("@/components/SellerModal").then((mod) => mod.SellerModal),
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

  const itemHasOpened = useHasOpened(itemRefNum != null);
  const photoReviewHasOpened = useHasOpened(photoReview != null);
  const basketHasOpened = useHasOpened(basketOpen);
  const settingsHasOpened = useHasOpened(settingsOpen);
  const sellerHasOpened = useHasOpened(sellerId != null);

  return (
    <>
      {itemHasOpened && <ItemDetailOverlay />}
      {photoReviewHasOpened && <PhotoReviewModal />}
      {basketHasOpened && <Basket />}
      {settingsHasOpened && <SettingsModal />}
      {sellerHasOpened && <SellerModal />}
    </>
  );
}
