"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useDeferredValue, useEffect } from "react";
import { deferredSearchQueryAtom, searchQueryAtom } from "@/store/atoms";

export function DeferredSearchSync() {
  const searchQuery = useAtomValue(searchQueryAtom);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const setDeferredSearchQuery = useSetAtom(deferredSearchQueryAtom);

  useEffect(() => {
    setDeferredSearchQuery(deferredSearchQuery);
  }, [deferredSearchQuery, setDeferredSearchQuery]);

  return null;
}
