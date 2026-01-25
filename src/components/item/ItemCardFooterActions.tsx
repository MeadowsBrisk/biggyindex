import React from 'react';
import cn from '@/lib/core/cn';
import { relativeCompact } from '@/lib/ui/relativeTimeCompact';
import { formatBritishDateTime } from '@/lib/core/format';
import EndorseButton from '@/components/actions/EndorseButton';
import ReviewStatsBadge from '@/components/reviews/ReviewStatsBadge';
import { useTranslations } from 'next-intl';

export interface ItemCardTimestampProps {
  hasUpdate: boolean;
  showCreated: boolean;
  lua: string | Date | null | undefined;
  lur: string | null | undefined;
  fsa: string | Date | null | undefined;
}

export interface ItemCardFooterActionsProps {
  itemKey: string;
  hasVotedToday: boolean;
  endorsedLocal: boolean;
  reviewStats: { avg?: number | null; days?: number | null; cnt?: number | null } | null | undefined;
  timestamp: ItemCardTimestampProps;
}

/**
 * Renders the right side of the ItemCard footer:
 * - Updated/Created timestamp
 * - Endorse button
 * - Review stats badge
 */
function ItemCardFooterActionsInner({
  itemKey,
  hasVotedToday,
  endorsedLocal,
  reviewStats,
  timestamp,
}: ItemCardFooterActionsProps) {
  const tItem = useTranslations('Item');
  const tRel = useTranslations('Rel');

  const { hasUpdate, showCreated, lua, lur, fsa } = timestamp;

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1">
      {hasUpdate ? (
        <div
          className="text-[10px] leading-none text-gray-400 dark:text-gray-500"
          title={(lua ? ((lur ? `${formatBritishDateTime(lua as any)} (${lur})` : formatBritishDateTime(lua as any))) : '')}
          suppressHydrationWarning
        >
          {tItem('updated', { time: relativeCompact(lua as any, tRel) })}
        </div>
      ) : showCreated ? (
        <div 
          className="text-[10px] leading-none text-gray-400 dark:text-gray-500" 
          title={formatBritishDateTime(fsa as any)} 
          suppressHydrationWarning
        >
          {tItem('created', { time: relativeCompact(fsa as any, tRel) })}
        </div>
      ) : null}
      <div className="flex items-center gap-2 pointer-events-auto mt-1">
        <div className={cn('relative inline-flex', hasVotedToday && !endorsedLocal && 'opacity-100')}>
          <EndorseButton itemId={itemKey} onHydrated={() => {}} />
        </div>
        {reviewStats ? <ReviewStatsBadge reviewStats={reviewStats as any} /> : null}
      </div>
    </div>
  );
}

export const ItemCardFooterActions = React.memo(ItemCardFooterActionsInner);
