"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { type MouseEvent as ReactMouseEvent, useCallback } from "react";
import {
  type OutboundEvent,
  trackOutboundClick,
} from "@/lib/tracking/outbound";
import {
  lbGuideModalOpenAtom,
  lbGuidePendingLinkAtom,
  lbGuideSeenAtom,
} from "@/store/atoms";

export type LittleBiggyClickEvent = Omit<OutboundEvent, "ts">;

export function useLBGuideGate(event: LittleBiggyClickEvent | null) {
  const seen = useAtomValue(lbGuideSeenAtom);
  const setModalOpen = useSetAtom(lbGuideModalOpenAtom);
  const setPendingLink = useSetAtom(lbGuidePendingLinkAtom);

  return useCallback(
    (clickEvent: ReactMouseEvent<HTMLAnchorElement>) => {
      if (!event?.url) return;

      if (!seen) {
        clickEvent.preventDefault();
        setPendingLink({ url: event.url, event });
        setModalOpen(true);
        return;
      }

      trackOutboundClick(event);
    },
    [event, seen, setModalOpen, setPendingLink],
  );
}
