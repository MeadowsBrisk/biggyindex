import React, { useCallback } from 'react';

export default function ShareMenu({ url, title = 'Item', onClose }) {
  const safeUrl = typeof url === 'string' ? url : '';
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

  const stop = (e) => {
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
      aria-label="Share menu"
    >
      <button
        type="button"
        onClick={copy}
        className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800"
      >Copy link</button>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button
          type="button"
          onClick={doNativeShare}
          className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800"
        >Share…</button>
      )}
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
      <div className="grid grid-cols-2 gap-1 px-1 pb-1">
        <a href={`https://twitter.com/intent/tweet?url=${urlEnc}&text=${titleEnc}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">Post on X</a>
        <a href={`https://www.reddit.com/submit?url=${urlEnc}&title=${titleEnc}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">Reddit</a>
        <a href={`https://wa.me/?text=${textEnc}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">WhatsApp</a>
        <a href={`https://t.me/share/url?url=${urlEnc}&text=${titleEnc}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">Telegram</a>
        <a href={`https://www.facebook.com/sharer/sharer.php?u=${urlEnc}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">Facebook</a>
        <a href={`mailto:?subject=${titleEnc}&body=${textEnc}`} className="px-3 py-2 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800">Email</a>
      </div>
    </div>
  );
}
