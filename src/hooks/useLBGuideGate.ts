import { useAtomValue, useSetAtom } from "jotai";
import { lbGuideSeenAtom, lbGuideModalOpenAtom, lbGuidePendingUrlAtom } from "@/store/atoms";
import { useCallback } from "react";

/**
 * Returns an onClick handler for "View on LittleBiggy" links.
 * On first click (guide not yet seen), intercepts navigation and opens the guide modal.
 * After the guide has been seen, returns undefined (normal <a> behaviour).
 */
export function useLBGuideGate(url: string | null) {
  const seen = useAtomValue(lbGuideSeenAtom);
  const setModalOpen = useSetAtom(lbGuideModalOpenAtom);
  const setPendingUrl = useSetAtom(lbGuidePendingUrlAtom);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (seen || !url) return; // let normal <a> behaviour proceed
      e.preventDefault();
      setPendingUrl(url);
      setModalOpen(true);
    },
    [seen, url, setModalOpen, setPendingUrl]
  );

  // Only attach handler when guide hasn't been seen
  return seen ? undefined : onClick;
}
