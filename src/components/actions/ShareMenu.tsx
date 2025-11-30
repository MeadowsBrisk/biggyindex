"use client";
import React, { useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { buildItemUrl, buildSellerUrl, hostForLocale } from '@/lib/market/routing';

type Props = { url: string; title?: string; onClose: () => void };
export default function ShareMenu({ url, title = 'Item', onClose }: Props) {
  const t = useTranslations('Share');
  const locale = useLocale();
  // If passed an absolute URL that contains /item/ or /seller/ we attempt to localize the path segment if a locale-specific alias exists.
  const localizeEntityUrl = (raw: string): string => {
    if (!raw || typeof raw !== 'string') return raw;
    try {
      const u = new URL(raw);
      // Accept our domains (including locale subdomains)
      if (!/(^|\.)biggyindex\.com$/i.test(u.hostname)) return raw; // Only rewrite our domain(s)
      const path = u.pathname;
      // Match both generic and any legacy localized segments
      const refMatch = path.match(/^\/(item|produit|produkt|prodotto|produto)\/(.+)$/);
      const sellerMatch = path.match(/^\/(seller|vendeur|verkaeufer|venditore|vendedor)\/(.+)$/);
      if (refMatch) return buildItemUrl(refMatch[2], locale);
      if (sellerMatch) return buildSellerUrl(sellerMatch[2], locale);
      return raw;
    } catch { return raw; }
  };
  const localizedUrl = localizeEntityUrl(url);
  const safeUrl = typeof localizedUrl === 'string' ? localizedUrl : '';
  const urlEnc = encodeURIComponent(safeUrl);
  const titleEnc = encodeURIComponent(title);
  const textEnc = encodeURIComponent(`${title} ${safeUrl}`.trim());

  const copy = useCallback(async () => {
    const text = safeUrl;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
    } catch {}
    onClose && onClose();
  }, [safeUrl, onClose]);

  const doNativeShare = useCallback(async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url: safeUrl });
      }
    } catch {}
    onClose && onClose();
  }, [title, safeUrl, onClose]);

  const stop = (e: React.SyntheticEvent) => {
    if (!e) return;
    e.stopPropagation && e.stopPropagation();
    if (e.nativeEvent) {
      if (typeof e.nativeEvent.stopImmediatePropagation === 'function') e.nativeEvent.stopImmediatePropagation();
      if (typeof e.nativeEvent.stopPropagation === 'function') e.nativeEvent.stopPropagation();
    }
  };

  return (
    <div
      className="absolute right-0 mt-1 z-20 min-w-[240px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-2"
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      role="menu"
      aria-label={t('menuAria', { default: 'Share menu' })}
    >
      <button
        type="button"
        onClick={copy}
        className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800"
      >{t('copyLink')}</button>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button
          type="button"
          onClick={doNativeShare}
          className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800"
        >{t('nativeShare')}</button>
      )}
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
      <div className="grid grid-cols-2 gap-1 px-1 pb-1">
        <a href={`https://twitter.com/intent/tweet?url=${urlEnc}&text=${titleEnc}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">{t('postX')}</a>
        <a href={`https://www.reddit.com/submit?url=${urlEnc}&title=${titleEnc}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">{t('reddit')}</a>
        <a href={`https://wa.me/?text=${textEnc}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">{t('whatsApp')}</a>
        <a href={`https://t.me/share/url?url=${urlEnc}&text=${titleEnc}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">{t('telegram')}</a>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${urlEnc}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">{t('facebook')}</a>
        <a href={`mailto:?subject=${titleEnc}&body=${textEnc}`} className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">{t('email')}</a>
      </div>
    </div>
  );
}
