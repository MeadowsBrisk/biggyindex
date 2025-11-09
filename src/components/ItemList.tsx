import React from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { sortedItemsAtom, favouritesOnlyAtom, categoryAtom } from '@/store/atoms';
import ItemCard from './ItemCard';
import { useScreenSize } from '@/hooks/useScreenSize';

// Persist across re-renders/category changes
let __initialBatchPlayed = false;

export default function ItemList(): React.ReactElement {
  const [items] = useAtom<any[]>(sortedItemsAtom as any);
  const favouritesOnly = useAtomValue<boolean>(favouritesOnlyAtom as any);
  const { isTablet, isSmallDesktop, isMediumDesktop, isUltrawide, isSuperwide } = useScreenSize();
  const category = useAtomValue<string>(categoryAtom as any);

  let cols = 1;
  if (isSuperwide) cols = 6;
  else if (isUltrawide) cols = 5;
  else if (isMediumDesktop) cols = 4;
  else if (isSmallDesktop) cols = 3;
  else if (isTablet) cols = 2;

  const staticRows = 3;
  const firstNoAnimCount = cols * staticRows;
  const baseBatch = cols * 2;
  const [renderCount, setRenderCount] = React.useState<number>(() => Math.min(items.length, firstNoAnimCount + baseBatch));
  const itemsLenRef = React.useRef<number>(items.length);
  const colsRef = React.useRef<number>(cols);

  React.useEffect(() => {
    if (items.length !== itemsLenRef.current || cols !== colsRef.current) {
      itemsLenRef.current = items.length;
      colsRef.current = cols;
      setRenderCount(Math.min(items.length, firstNoAnimCount + baseBatch));
    }
  }, [items.length, cols, firstNoAnimCount, baseBatch]);

  React.useEffect(() => {
    if (renderCount >= items.length) return;
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      const next = Math.min(items.length, renderCount + baseBatch);
      if (next !== renderCount) setRenderCount(next);
      if (next < items.length) queue();
    };
    const queue = () => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(schedule, { timeout: 120 });
      } else {
        setTimeout(schedule, 40);
      }
    };
    queue();
    return () => { cancelled = true; };
  }, [renderCount, items.length, baseBatch]);

  React.useEffect(() => {
    if (!__initialBatchPlayed && items.length > 0) {
      // Mark after first paint of initial dataset so future category changes skip stagger
      const t = requestAnimationFrame(() => { __initialBatchPlayed = true; });
      return () => cancelAnimationFrame(t);
    }
  }, [items.length]);

  const isEmpty = !items || items.length === 0;

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {isEmpty && (
        <div className="col-span-full text-black/60 dark:text-white/60">No items match your filters.</div>
      )}
      {!isEmpty && items.slice(0, renderCount).map((item: any, idx: number) => {
        const colIndex = idx % cols;
        const initialAppear = !__initialBatchPlayed && idx < firstNoAnimCount;
        const perCol = 50; // faster initial stagger (only first load)
        const staggerDelay = initialAppear ? colIndex * perCol : 0;
        return (
          <ItemCard
            key={item.id}
            item={item}
            initialAppear={initialAppear}
            staggerDelay={staggerDelay}
            colIndex={colIndex}
            cols={cols}
          />
        );
      })}
    </div>
  );
}
