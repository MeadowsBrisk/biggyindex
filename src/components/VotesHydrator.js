import { useEffect } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import { hydrateGlobalEndorsedAtom, globalEndorsedAtom, endorsedSetAtom } from '@/store/votesAtoms';

// Ensures permanent endorsements (endorsedAll) are applied to endorsedSetAtom immediately on mount
export default function VotesHydrator() {
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

