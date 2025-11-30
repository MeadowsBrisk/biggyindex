"use client";
import { useEffect } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import { hydrateGlobalEndorsedAtom, globalEndorsedAtom, endorsedSetAtom } from '@/store/votesAtoms';

/**
 * Ensures permanent endorsements (endorsedAll) are applied to endorsedSetAtom immediately on mount.
 * Should be mounted once at the app level.
 */
export default function VotesHydrator(): null {
  const runHydrate = useSetAtom(hydrateGlobalEndorsedAtom);
  const globalList = useAtomValue(globalEndorsedAtom);
  const setEndorsedSet = useSetAtom(endorsedSetAtom);
  
  useEffect(() => {
    runHydrate();
  }, [runHydrate]);
  
  useEffect(() => {
    if (Array.isArray(globalList) && globalList.length) {
      setEndorsedSet(new Set(globalList.map(String)));
    }
  }, [globalList, setEndorsedSet]);
  
  return null;
}
