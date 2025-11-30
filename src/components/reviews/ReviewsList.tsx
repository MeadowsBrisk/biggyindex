"use client";
import React from 'react';
import cn from '@/lib/core/cn';
import { panelClassForReviewScore } from '@/theme/reviewScoreColors';
import { decodeEntities } from '@/lib/core/format';
import { proxyImage } from '@/lib/ui/images';
import { useTranslations, useFormatter } from 'next-intl';

export type ReviewSegment = { type: 'text' | 'image'; value?: string; url?: string };
export type Review = {
  id?: string | number;
  rating?: number | null;
  daysToArrive?: number | null;
  created?: number | null; // seconds or ms epoch
  segments?: ReviewSegment[];
  item?: any;
};

// Helper to merge consecutive text segments and keep images separately
function extractReviewContent(review: Review) {
  const textSegments: string[] = [];
  const images: string[] = [];
  if (Array.isArray(review.segments)) {
    for (const seg of review.segments) {
      if (!seg) continue;
      if (seg.type === 'text' && typeof seg.value === 'string') {
        textSegments.push(seg.value);
      } else if (seg.type === 'image' && (seg as any).url) {
        images.push((seg as any).url);
      }
    }
  }
  // Join without stripping intentional double newlines (already preserved as '\n\n')
  // Decode HTML entities once after concatenation so we preserve any cross-segment boundaries.
  const raw = textSegments.join('');
  const text = decodeEntities(raw);
  return { text, images };
}

function linkify(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s)]+)([),.]?)/gi;
  const parts: React.ReactNode[] = [];
  let last = 0; let m: RegExpExecArray | null;
  while ((m = urlRegex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const url = m[1]; const trailing = m[2] || '';
    parts.push(<a key={parts.length+url} href={url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-blue-600 dark:hover:text-blue-400">{url}</a>);
    if (trailing) parts.push(trailing);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

function renderParagraphs(text: string): React.ReactNode {
  // Split on two-or-more newlines to form paragraphs
  const rawParas = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
  if (!rawParas.length) return null;
  return rawParas.map((p,i) => {
    // Within paragraph, keep single newlines as spaces to avoid awkward line breaks from original editor
    const inline = p.replace(/\n+/g,' ').replace(/\s{2,}/g,' ');
    return <p key={i} className="mb-2 text-[13px] leading-snug">{linkify(inline)}</p>;
  });
}

export const REVIEWS_DISPLAY_LIMIT = 100;

export type ReviewsListProps = {
  reviews: Review[];
  fullTimeAgo?: boolean;
  max?: number;
  onImageClick?: (src: string, images: string[], index: number) => void;
  renderItemLink?: (r: Review) => React.ReactNode;
};

export default function ReviewsList({ reviews, fullTimeAgo, max=REVIEWS_DISPLAY_LIMIT, onImageClick, renderItemLink }: ReviewsListProps) {
  const t = useTranslations('Reviews');
  const fmt = useFormatter();
  if (!Array.isArray(reviews) || !reviews.length) return null;
  return (
    <ul className="space-y-2 text-sm pr-1 group">
      {reviews.slice(0, max).map((r) => {
        const scoreRaw = typeof r.rating === 'number' ? r.rating : null;
        const colorKey = scoreRaw != null ? Math.min(10, Math.max(1, Math.round(scoreRaw))) : null;
        const panelClass = panelClassForReviewScore(colorKey as any);
        const displayScore = scoreRaw != null ? (Number.isInteger(scoreRaw) ? scoreRaw : (scoreRaw as number).toFixed(1)) : '?';
        const arrival = (r.daysToArrive != null && (r.daysToArrive as number) >= 0)
          ? t('arrival', { days: r.daysToArrive as number })
          : null;
        // Compute localized time-ago; accept seconds or milliseconds epoch
        const createdMs = typeof r.created === 'number' ? (r.created > 1e12 ? r.created : (r.created as number) * 1000) : null;
        const timeStr = createdMs ? fmt.relativeTime(new Date(createdMs), { now: new Date() }) : '';
        const { text, images } = extractReviewContent(r);
        const hasText = text.trim().length > 0;
        return (
          <li key={(r.id as any) || r.created as any}
              className={
                'relative rounded-md border backdrop-blur-sm transition-colors transition-opacity duration-200 group-hover:opacity-90 hover:opacity-100 ' +
                (hasText ? panelClass + ' p-3 shadow-sm hover:shadow' : 'border-dashed ' + panelClass + ' px-2 py-1 text-xs font-medium')
              }>
            <div className={"flex items-start justify-between gap-3 " + (hasText ? 'mb-1' : 'mb-0 items-center') }>
              <div className={"flex gap-2 min-w-0 items-center"}>
                <span className="font-bold text-lg leading-none tabular-nums">{displayScore}</span>
                {arrival && (
                  <span className={hasText ? 'text-[11px] font-medium opacity-75 truncate' : 'text-[10px] font-normal opacity-70'}>{t('took', { arrival })}</span>
                )}
              </div>
              <span className="text-[10px] opacity-70 shrink-0 whitespace-nowrap">{timeStr}</span>
            </div>
            {renderItemLink && (r as any).item && (
              <div className="mb-1 text-[11px] opacity-75">
                {renderItemLink(r)}
              </div>
            )}
            {hasText && (
              <div className="mb-2 [&>*:last-child]:mb-0">
                {renderParagraphs(text) || null}
              </div>
            )}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((src, idx) => (
                  <button key={idx+src} type="button" onClick={() => onImageClick && onImageClick(src, images, idx)}
                          className="group/img relative w-20 h-20 rounded-md overflow-hidden border border-gray-300/60 dark:border-gray-700/70 bg-gray-100 dark:bg-gray-800 hover:ring-2 hover:ring-blue-400/60 focus:outline-none focus-visible:ring-2 ring-blue-500">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={proxyImage(src, 160)} alt={t('reviewImageAlt')} className="object-cover w-full h-full transition-transform duration-300 group-hover/img:scale-110" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
