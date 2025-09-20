import { useAtom } from "jotai";
import { sortKeyAtom, sortDirAtom, pauseGifsAtom } from "@/store/atoms";
import { thumbnailAspectAtom } from "@/store/atoms"; // added
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";

export default function SortControls({ stack = false }) {
  const [key, setKey] = useAtom(sortKeyAtom);
  const [dir, setDir] = useAtom(sortDirAtom);
  const [pauseGifs, setPauseGifs] = useAtom(pauseGifsAtom);
  const [thumbAspect, setThumbAspect] = useAtom(thumbnailAspectAtom); // new
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [openAspect, setOpenAspect] = useState(false); // dropdown state
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const aspectBtnRef = useRef(null); // new
  const aspectListRef = useRef(null); // new

  const sortOptions = [
    { value: 'hotness', label: 'Hotness/Bigg (Default)' },
    { value: 'endorsements', label: 'Endorsements' },
    { value: 'lastUpdated', label: 'Recently Updated' },
    { value: 'firstSeen', label: 'First Seen (Newest)' },
    { value: 'reviewsCount', label: 'Reviews: Count' },
    { value: 'reviewsRating', label: 'Reviews: Rating' },
    { value: 'name', label: 'Name' },
    { value: 'price', label: 'Price' },
    { value: 'arrival', label: 'Avg Arrival (Days)' }
  ];

  const aspectOptions = [
    { value: 'landscape', label: 'Wide 16:10' },
    { value: 'standard', label: 'Square 1:1' },
    { value: 'portrait', label: 'Tall 2:3' }
  ];

  // Sync active index when key changes
  useEffect(() => {
    const idx = sortOptions.findIndex(o => o.value === key);
    if (idx >= 0) setActiveIndex(idx);
  }, [key]);

  // Outside click to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (buttonRef.current && buttonRef.current.contains(e.target)) return;
      if (listRef.current && listRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  // Outside click to close for aspect ratio dropdown
  useEffect(() => {
    if (!openAspect) return;
    const handler = (e) => {
      if (buttonRef.current && buttonRef.current.contains(e.target)) return;
      if (listRef.current && listRef.current.contains(e.target)) return;
      if (aspectBtnRef.current && aspectBtnRef.current.contains(e.target)) return;
      if (aspectListRef.current && aspectListRef.current.contains(e.target)) return;
      setOpenAspect(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [openAspect]);

  const onSelectKey = (newKey) => {
    if (newKey === key) { setOpen(false); return; }
    setKey(newKey);
    if (newKey === 'arrival') setDir('asc');
    else if (newKey === 'price') setDir('asc');
    else if (newKey === 'firstSeen') setDir('desc');
    else setDir('desc');
    setOpen(false);
    // return focus to button for accessibility
    requestAnimationFrame(() => { buttonRef.current?.focus(); });
  };

  const onSelectAspect = (val) => { setThumbAspect(val); setOpenAspect(false); };

  const onButtonKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActiveIndex(i => (i + 1) % sortOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActiveIndex(i => (i - 1 + sortOptions.length) % sortOptions.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) setOpen(true); else onSelectKey(sortOptions[activeIndex].value);
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); }
    } else if (e.key === 'Home') {
      if (open) { e.preventDefault(); setActiveIndex(0); }
    } else if (e.key === 'End') {
      if (open) { e.preventDefault(); setActiveIndex(sortOptions.length - 1); }
    }
  };

  const toggleDir = () => setDir(d => d === 'asc' ? 'desc' : 'asc');
  const toggleGifs = () => setPauseGifs(p => !p);

  const baseRing = "focus:outline-none focus:ring-2 focus:ring-blue-500/50";
  const surface = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700";
  const text = "text-gray-800 dark:text-gray-100";
  const interactive = "transition-colors duration-150 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm hover:ring-1 hover:ring-blue-500/20";

  const labels = {
    hotness: 'Hotness', endorsements: 'Endorsements', lastUpdated: 'Recently Updated', firstSeen: 'First Seen', reviewsCount: 'Reviews Count', reviewsRating: 'Reviews Rating', name: 'Name', price: 'Price', arrival: 'Avg Arrival'
  };

  const dirIcon = (
    <svg viewBox="0 0 20 20" className={`w-4 h-4 transition-transform duration-200 ${dir === 'asc' ? '' : 'rotate-180'}`} fill="currentColor">
      <path d="M10 6l-4 6h8l-4-6z" />
    </svg>
  );

  const gifIcon = pauseGifs ? (
    <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="currentColor" fill="none" strokeWidth="1.8"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" className="w-4 h-4" stroke="currentColor" fill="currentColor"><path d="M7 5v14l12-7L7 5z" /></svg>
  );

  const currentLabel = sortOptions.find(o => o.value === key)?.label || key;

  // NOTE: keep previously declared variables; below we insert early mobile-return block.
  if (stack) {
    return (
      <motion.div className="flex flex-col gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.28, ease: 'easeOut' }}>
        <span className="sr-only" id="sort-label">Sort by</span>
        {/* Top row: sort key + direction (aspect dropdown removed for mobile) */}
        <div className="flex items-stretch gap-2">
          <div className="flex-1 relative">
            <button
              type="button"
              ref={buttonRef}
              aria-labelledby="sort-label"
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-controls="sort-menu"
              onClick={() => setOpen(o => !o)}
              onKeyDown={onButtonKeyDown}
              className={`inline-flex items-center justify-between gap-2 w-full pr-2 pl-2 h-9 rounded-md ${surface} ${text} text-xs font-medium ${baseRing} ${interactive}`}
            >
              <span className="truncate text-left flex-1">{currentLabel}</span>
              <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}><path d="M5.8 7.3l4.2 4.2 4.2-4.2 1.1 1.1-5.3 5.3-5.3-5.3z" /></svg>
            </button>
            {open && (
              <ul
                id="sort-menu"
                role="listbox"
                ref={listRef}
                tabIndex={-1}
                aria-activedescendant={`sort-opt-${sortOptions[activeIndex].value}`}
                className="absolute z-40 mt-1 w-full max-h-64 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg focus:outline-none"
              >
                {sortOptions.map((o, idx) => {
                  const selected = o.value === key;
                  const active = idx === activeIndex;
                  return (
                    <li
                      key={o.value}
                      id={`sort-opt-${o.value}`}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => onSelectKey(o.value)}
                      className={`cursor-pointer px-2 py-1.5 text-xs flex items-center gap-2 ${active ? 'bg-blue-50 dark:bg-gray-700 text-blue-700 dark:text-blue-200' : selected ? 'bg-gray-100 dark:bg-gray-700/60 text-gray-800 dark:text-gray-100' : 'text-gray-700 dark:text-gray-200'}`}
                    >
                      {selected && (
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"><path d="M7.667 13.233l-3.2-3.2 1.06-1.06 2.14 2.133 5.3-5.3 1.06 1.06-6.36 6.367z" /></svg>
                      )}
                      <span className="truncate">{o.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={toggleDir}
            aria-label={`Toggle sort direction (currently ${dir === 'asc' ? 'ascending' : 'descending'})`}
            title={dir === 'asc' ? 'Ascending (click for descending)' : 'Descending (click for ascending)'}
            className={`inline-flex items-center justify-center w-10 h-9 rounded-md ${surface} ${text} ${baseRing} ${interactive}`}
          >
            {dirIcon}
          </button>
        </div>
        {/* Bottom row: GIF toggle + aspect cycle button */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={toggleGifs}
            className={`inline-flex items-center gap-1 px-2 h-7 rounded-md ${surface} ${text} text-[11px] font-medium ${baseRing} ${interactive}`}
            aria-pressed={pauseGifs}
            title={pauseGifs ? 'GIFs paused – click to play' : 'Play GIFs – click to pause'}
          >
            {gifIcon}
            <span className="sr-only">{pauseGifs ? 'GIFs paused' : 'Play GIFs'}</span>
            <span aria-hidden="true">{pauseGifs ? 'Paused' : 'GIFs'}</span>
          </button>
          <button
            type="button"
            onClick={() => setThumbAspect(a => a === 'landscape' ? 'standard' : a === 'standard' ? 'portrait' : 'landscape')}
            className={`inline-flex items-center gap-1 px-2 h-7 rounded-md ${surface} ${text} text-[11px] font-medium ${baseRing} ${interactive}`}
            title="Cycle thumbnail shape"
          >
            {thumbAspect === 'landscape' ? 'Wide' : thumbAspect === 'portrait' ? 'Tall' : 'Square'}
          </button>
        </div>
        <span className="sr-only">Sorting by {labels[key] || key} in {dir === 'asc' ? 'ascending' : 'descending'} order.</span>
      </motion.div>
    );
  }
  // ...existing desktop return block remains unchanged below...
  // (Original non-stack return preserved)
  return (
    <motion.div className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.28, ease: 'easeOut' }}>
      <span className="sr-only" id="sort-label">Sort by</span>
      <div className="flex items-center gap-2">
        {/* Aspect dropdown desktop */}
        <div className="relative">
          <button
            type="button"
            ref={aspectBtnRef}
            aria-haspopup="listbox"
            aria-expanded={openAspect}
            onClick={() => setOpenAspect(o => !o)}
            className={`inline-flex items-center justify-between gap-1 px-2 h-9 rounded-md ${surface} ${text} text-xs font-medium ${baseRing} ${interactive} w-[5.2rem]`}
            title="Thumbnail shape"
          >
            <span className="truncate">{thumbAspect === 'landscape' ? 'Wide' : thumbAspect === 'portrait' ? 'Tall' : 'Square'}</span>
            <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${openAspect ? 'rotate-180' : ''}`}><path d="M5.8 7.3l4.2 4.2 4.2-4.2 1.1 1.1-5.3 5.3-5.3-5.3z" /></svg>
          </button>
          {openAspect && (
            <ul
              ref={aspectListRef}
              role="listbox"
              className="absolute z-40 mt-1 w-full max-h-48 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg focus:outline-none"
            >
              {aspectOptions.map(opt => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={thumbAspect === opt.value}
                  onClick={() => onSelectAspect(opt.value)}
                  className={`cursor-pointer px-2 py-1.5 text-xs flex items-center gap-2 ${thumbAspect === opt.value ? 'bg-blue-50 dark:bg-gray-700 text-blue-700 dark:text-blue-200' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60'}`}
                >
                  <span className="truncate">{opt.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={toggleGifs}
          className={`inline-flex items-center gap-1 px-2 h-9 rounded-md ${surface} ${text} text-xs font-medium ${baseRing} ${interactive}`}
          aria-pressed={pauseGifs}
          title={pauseGifs ? 'GIFs paused – click to play' : 'Play GIFs – click to pause'}>
          {gifIcon}
          <span className="hidden sm:inline">{pauseGifs ? 'Paused' : 'GIFs'}</span>
          <span className="sm:hidden">GIF</span>
        </button>
        <div className="relative">
          <button
            type="button"
            ref={buttonRef}
            aria-labelledby="sort-label"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls="sort-menu"
            onClick={() => setOpen(o => !o)}
            onKeyDown={onButtonKeyDown}
            className={`inline-flex items-center justify-between gap-2 w-full min-w-[9.5rem] pr-2 pl-2 h-9 rounded-md ${surface} ${text} text-xs font-medium ${baseRing} ${interactive}`}
          >
            <span className="truncate text-left flex-1">{currentLabel}</span>
            <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}><path d="M5.8 7.3l4.2 4.2 4.2-4.2 1.1 1.1-5.3 5.3-5.3-5.3z" /></svg>
          </button>
          {open && (
            <ul
              id="sort-menu"
              role="listbox"
              ref={listRef}
              tabIndex={-1}
              aria-activedescendant={`sort-opt-${sortOptions[activeIndex].value}`}
              className="absolute z-40 mt-1 w-full max-h-64 overflow-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg focus:outline-none"
            >
              {sortOptions.map((o, idx) => {
                const selected = o.value === key;
                const active = idx === activeIndex;
                return (
                  <li
                    key={o.value}
                    id={`sort-opt-${o.value}`}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onClick={() => onSelectKey(o.value)}
                    className={`cursor-pointer px-2 py-1.5 text-xs flex items-center gap-2 ${active ? 'bg-blue-50 dark:bg-gray-700 text-blue-700 dark:text-blue-200' : selected ? 'bg-gray-100 dark:bg-gray-700/60 text-gray-800 dark:text-gray-100' : 'text-gray-700 dark:text-gray-200'}`}
                  >
                    {selected && (
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"><path d="M7.667 13.233l-3.2-3.2 1.06-1.06 2.14 2.133 5.3-5.3 1.06 1.06-6.36 6.367z" /></svg>
                    )}
                    <span className="truncate">{o.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <button type="button" onClick={toggleDir}
          aria-label={`Toggle sort direction (currently ${dir === 'asc' ? 'ascending' : 'descending'})`}
          title={dir === 'asc' ? 'Ascending (click for descending)' : 'Descending (click for ascending)'}
          className={`inline-flex items-center justify-center w-9 h-9 rounded-md ${surface} ${text} ${baseRing} ${interactive}`}
        >
          {dirIcon}
        </button>
      </div>
      <span className="sr-only">Sorting by {labels[key] || key} in {dir === 'asc' ? 'ascending' : 'descending'} order.</span>
    </motion.div>
  );
}
