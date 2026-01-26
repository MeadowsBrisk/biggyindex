"use client";
import React from 'react';
import { useTranslations } from 'next-intl';
import cn from '@/lib/core/cn';
import { ThumbIcon } from '@/components/common/icons';
import { useAtomValue, useSetAtom } from 'jotai';
import { votesAtom, endorseActionAtom, endorsedSetAtom, voteHasVotedAtom, voteLimitReachedAtom } from '@/store/votesAtoms';
import { endorsementBaselinesAtom } from '@/store/votesAtoms';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { selectAtom } from 'jotai/utils';

/**
 * EndorseButton
 * Props: itemId (string|number)
 * - Shows current count from votesAtom
 * - Green when this item endorsed
 * - Faded / disabled when user daily limit reached and not yet endorsed
 */
type Props = { itemId: string | number; onHydrated?: () => void; compact?: boolean };
export default function EndorseButton({ itemId, onHydrated, compact = false }: Props) {
  const id = String(itemId);
  const t = useTranslations('Endorse');
  // Narrow subscriptions to just this item's vote count & baseline
  // selectAtom is appropriate for Map values (votesAtom/baselines are Record<id, number>)
  const voteCountAtom = React.useMemo(() => selectAtom(votesAtom, (v: any) => v[id] || 0), [id]);
  const count = useAtomValue(voteCountAtom);
  // Baseline captured pre-increment; allows us to restore optimistic +1 even if snapshot seeding overwrote count after refresh
  const baselineAtom = React.useMemo(() => selectAtom(endorsementBaselinesAtom, (b: any) => b[id] || 0), [id]);
  const baseline = useAtomValue(baselineAtom);
  // Use shared Set atom directly for O(1) endorsed check (no selectAtom needed for Set)
  const endorsedSet = useAtomValue(endorsedSetAtom);
  const endorsed = endorsedSet.has(id);
  // If endorsed, guarantee UI shows at least baseline+1 (optimistic) without waiting for reconciliation atom
  const displayCount = endorsed ? Math.max(count, baseline + 1) : count;
  const hasVotedToday = useAtomValue(voteHasVotedAtom);
  const limitReached = useAtomValue(voteLimitReachedAtom); // stored flag after server confirms
  const endorse = useSetAtom(endorseActionAtom);
  const disabledForLimit = !endorsed && (hasVotedToday || limitReached);
  const disabled = endorsed || disabledForLimit;

  const tooltip = endorsed
    ? t('already')
    : disabledForLimit
      ? (limitReached ? t('usedToday') : t('onePerDay'))
      : t('cta');

  const onClick = React.useCallback(() => {
    if (disabled) return;
    endorse(id);
  }, [disabled, endorse, id]);

  // Hydration animation: assume not hydrated until we have a non-zero count OR the atom key exists once (count > 0) or after timeout
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => {
    if (count !== 0) {
      setHydrated(true);
    }
  }, [count]);
  React.useEffect(() => {
    const t = setTimeout(() => setHydrated(true), 600); // safety timeout
    return () => clearTimeout(t);
  }, []);
  React.useEffect(() => {
    if (hydrated && typeof onHydrated === 'function') onHydrated();
  }, [hydrated, onHydrated]);

  // Base style (final target)
  const finalClass = cn(
    'peer inline-flex items-center gap-1 rounded-full border text-[11px] font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 select-none',
    compact ? 'h-8 px-3' : 'px-2 py-0.5',
    endorsed
      ? 'bg-emerald-600 text-white border-emerald-700 cursor-default'
      : disabledForLimit
        ? 'bg-white/60 dark:bg-gray-800/40 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-50'
        : 'bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-700'
  );
  const loadingClass = 'bg-white/50 dark:bg-gray-800/30 text-gray-400 border-gray-200 dark:border-gray-700 cursor-wait';

  // Tooltip portal logic
  const btnRef = React.useRef(null);
  const tipRef = React.useRef(null);
  const [showTip, setShowTip] = React.useState(false);
  const [tipStyle, setTipStyle] = React.useState({ top: 0, left: 0, opacity: 0 });
  const updatePos = React.useCallback(() => {
    if (!btnRef.current) return;
    const r = (btnRef.current as any).getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    let left: any;
    let top: any;
    const tipEl: any = tipRef.current;
    const width = tipEl ? tipEl.offsetWidth : 0;
    const height = tipEl ? tipEl.offsetHeight : 0;
    if (width) {
      left = r.right + scrollX - width; // right-align
      const minX = scrollX + 4;
      if (left < minX) left = minX;
    } else {
      left = r.right + scrollX; // provisional
    }
    if (height) {
      top = r.top + scrollY - height - 8; // 8px gap above button
      const minY = scrollY + 4;
      if (top < minY) top = r.bottom + scrollY + 8; // fallback below if no space
    } else {
      top = r.top + scrollY; // provisional until height known
    }
    setTipStyle({ top, left, opacity: 1 });
  }, []);
  React.useEffect(() => {
    if (showTip) {
      // first frame (element may not yet have width)
      updatePos();
      const raf = requestAnimationFrame(() => updatePos()); // re-measure with width
      const onScroll = () => updatePos();
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onScroll);
      };
    }
  }, [showTip, updatePos]);
  const tipNode = showTip && typeof document !== 'undefined'
    ? createPortal(
      <motion.div
        ref={tipRef}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 2 }}
        transition={{ duration: 0.18 }}
        style={{ position: 'absolute', top: tipStyle.top, left: tipStyle.left, pointerEvents: 'none', zIndex: 1000, opacity: tipStyle.opacity }}
        className="relative rounded-md bg-gray-900 text-white text-[10px] px-2 py-1 shadow-lg whitespace-nowrap text-right"
        role="tooltip"
      >
        {tooltip}
        <div className="absolute -bottom-1 right-2 w-2.5 h-2.5 bg-gray-900 rotate-45" />
      </motion.div>, document.body)
    : null;

  return (
    <div className="relative inline-flex">
      <motion.button
        ref={btnRef}
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={tooltip}
        aria-pressed={endorsed}
        aria-busy={!hydrated}
        data-endorsed={endorsed ? 'true' : 'false'}
        data-daily-limit={disabledForLimit ? 'true' : 'false'}
        data-hydrating={!hydrated ? 'true' : 'false'}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        onFocus={() => setShowTip(true)}
        onBlur={() => setShowTip(false)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={cn(finalClass, !hydrated && loadingClass)}
        title={tooltip}
      >
        <ThumbIcon className={cn('w-3.5 h-3.5 transition-colors', endorsed ? 'text-white' : disabledForLimit ? 'text-gray-400 dark:text-gray-500' : 'text-emerald-600 dark:text-emerald-400')} aria-hidden="true" />
        <span
          className="inline-block tabular-nums text-center select-none"
          style={{ width: '2.2ch', minWidth: '2.2ch', opacity: hydrated ? 1 : 0, transition: 'opacity 160ms ease-out' }}
        >{hydrated ? displayCount : '\u00A0'}</span>
      </motion.button>
      {tipNode}
    </div>
  );
}
