import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import cn from "@/app/cn";
import { createPortal } from "react-dom";

// Lightweight, memoized loader for sellers.json -> Map by lowercase name
let __sellersMapPromise = null;
let __sellersMap = null; // Map<string, seller>

async function loadSellersMap() {
  if (__sellersMap) return __sellersMap;
  if (!__sellersMapPromise) {
    __sellersMapPromise = (async () => {
      try {
        // Prefer API (Netlify Blobs-backed), then fall back to static public file
        let list = [];
        try {
          const resApi = await fetch("/api/index/sellers", { cache: "no-store" });
          if (resApi && resApi.ok) {
            const data = await resApi.json();
            if (Array.isArray(data?.sellers)) list = data.sellers;
          }
        } catch {}
        if (!Array.isArray(list) || list.length === 0) {
          try {
            const resPub = await fetch("/sellers.json", { cache: "force-cache" });
            if (resPub && resPub.ok) {
              const json = await resPub.json();
              list = Array.isArray(json) ? json : (Array.isArray(json?.sellers) ? json.sellers : []);
            }
          } catch {}
        }
        const map = new Map();
        for (const s of list || []) {
          if (s && typeof s.name === "string") map.set(s.name.toLowerCase(), s);
        }
        __sellersMap = map;
        return map;
      } catch {
        __sellersMap = new Map();
        return __sellersMap;
      }
    })();
  }
  return __sellersMapPromise;
}

function useSellerByName(name) {
  const [seller, setSeller] = React.useState(() => {
    if (__sellersMap && name) return __sellersMap.get(String(name).toLowerCase()) || null;
    return null;
  });
  React.useEffect(() => {
    let mounted = true;
    if (!name) return;
    const lower = String(name).toLowerCase();
    (async () => {
      const map = await loadSellersMap();
      if (!mounted) return;
      setSeller(map.get(lower) || null);
    })();
    return () => {
      mounted = false;
    };
  }, [name]);
  return seller;
}

function getRatingColorClasses() {
  // Consistent emerald scheme for cohesion
  return {
    pill: "bg-emerald-600 text-white",
    bar: "bg-emerald-600",
    iconWrap: "bg-emerald-100 dark:bg-emerald-900/30",
    icon: "text-emerald-700 dark:text-emerald-300",
  };
}

function PersonIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor" focusable="false">
      <path d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 12c5.523 0 10 3.134 10 7v1H2v-1c0-3.866 4.477-7 10-7Z" />
    </svg>
  );
}

function OnlineDot({ online }) {
  if (online !== "today") return null;
  return (
    <span className="ml-0.5 relative inline-flex" title="online today" aria-label="online today">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-600 ring-2 ring-white dark:ring-gray-900 shadow-sm" />
    </span>
  );
}

export default function SellerInfoBadge({ sellerName, sellerUrl, sellerOnline }) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const tipRef = React.useRef(null);
  const closeTimer = React.useRef(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }, [cancelClose]);
  const show = React.useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);
  const hide = React.useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);
  const toggle = React.useCallback(() => {
    cancelClose();
    setOpen((v) => !v);
  }, [cancelClose]);

  const seller = useSellerByName(sellerName);
  const rating = seller?.averageRating;
  const colors = getRatingColorClasses();

  const itemsCount = seller?.itemsCount;
  const reviewsCount = seller?.numberOfReviews;
  const avgDays = seller?.averageDaysToArrive;
  const storeUrl = seller?.url || sellerUrl;

  const fmtInt = React.useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }), []);

  // Positioning for portal tooltip (avoid clipping by card overflow)
  const [style, setStyle] = React.useState({ top: 0, left: 0, opacity: 0 });
  const [caret, setCaret] = React.useState({ left: 0, side: 'bottom' });
  const updatePos = React.useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const tipEl = tipRef.current;
    const width = tipEl ? tipEl.offsetWidth : 0;
    const height = tipEl ? tipEl.offsetHeight : 0;
    const gap = 8;
    let left = r.right + scrollX - width; // right-align by default
    let top = r.top + scrollY - height - gap; // prefer above
    let side = 'bottom';
    const minLeft = scrollX + 8;
    const maxLeft = scrollX + window.innerWidth - width - 8;
    if (isFinite(minLeft) && isFinite(maxLeft)) left = Math.min(Math.max(left, minLeft), maxLeft);
    if (top < scrollY + 8) {
      // not enough space above, place below
      top = r.bottom + scrollY + gap;
      side = 'top';
    }
    // caret horizontally: align to trigger center, clamped to panel width
    const centerX = r.left + r.width / 2 + scrollX;
    let caretLeft = centerX - left; // relative to panel left
    const caretMargin = 10; // clamp margin inside panel
    if (width) caretLeft = Math.min(Math.max(caretLeft, caretMargin), width - caretMargin);
    setStyle({ top, left, opacity: 1 });
    setCaret({ left: caretLeft, side });
  }, []);
  React.useEffect(() => {
    if (!open) return;
    updatePos();
    const raf = requestAnimationFrame(() => updatePos());
    const onScroll = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    const onDocDown = (e) => {
      const t = e.target;
      if (!t) return;
      const inBtn = btnRef.current && btnRef.current.contains(t);
      const inTip = tipRef.current && tipRef.current.contains(t);
      if (!inBtn && !inTip) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('mousedown', onDocDown);
    };
  }, [open, updatePos]);
  React.useEffect(() => () => cancelClose(), [cancelClose]);

  const panel = open && typeof document !== 'undefined'
    ? createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              ref={tipRef}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 2 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              style={{ position: 'absolute', top: style.top, left: style.left, zIndex: 1000, opacity: style.opacity }}
              className="relative"
              role="dialog"
              aria-label="Seller snapshot"
            >
              <div onMouseEnter={show} onMouseLeave={hide} className="relative rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 bg-gradient-to-b from-emerald-50/70 to-transparent dark:from-emerald-900/15 shadow-lg p-2.5 w-56 text-[12px] leading-tight">
                <div className="absolute inset-x-0 top-0 h-0.5 bg-emerald-400/70 dark:bg-emerald-500/50 rounded-t-md" />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className={cn("rounded-[4px] p-1 shrink-0", colors.iconWrap)}>
                      <PersonIcon className={cn("w-3.5 h-3.5", colors.icon)} />
                    </div>
                    <div className="truncate text-[12px] font-semibold text-gray-900 dark:text-gray-100 max-w-[9rem]">{sellerName || 'Seller'}</div>
                  </div>
                  <div className={cn("px-1.5 py-0.5 rounded text-[11px] font-semibold", colors.pill)}>
                    {typeof rating === 'number' ? rating.toFixed(1) : '—'}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Items for sale</div>
                    <div className="text-[12px] font-medium text-gray-900 dark:text-gray-100">{typeof itemsCount === 'number' ? fmtInt.format(itemsCount) : '—'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Reviews</div>
                    <div className="text-[12px] font-medium text-gray-900 dark:text-gray-100">{typeof reviewsCount === 'number' ? fmtInt.format(reviewsCount) : '—'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Avg arrival</div>
                    {(() => {
                      if (typeof avgDays === 'number') {
                        const d = Math.round(avgDays);
                        return <div className="text-[12px] font-medium text-gray-900 dark:text-gray-100">{d} day{d === 1 ? '' : 's'}</div>;
                      }
                      return <div className="text-[12px] font-medium text-gray-900 dark:text-gray-100">—</div>;
                    })()}
                  </div>
                </div>
                {storeUrl ? (
                  <div className="mt-2 text-right">
                    <a
                      href={storeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pointer-events-auto group/button inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-wide bg-emerald-500/90 hover:bg-emerald-500 text-white rounded-full px-3 py-1.5 shadow-md shadow-emerald-600/25 hover:shadow-emerald-600/35 transition-all backdrop-blur-md focus:outline-none focus-visible:ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-900 ring-emerald-300"
                    >
                      <span>biggy store</span>
                      <span className="inline-block text-base leading-none translate-x-0 transition-transform duration-300 ease-out group-hover/button:translate-x-1">→</span>
                    </a>
                  </div>
                ) : null}
                {/* caret arrow */}
                <div
                  className={cn(
                    'absolute w-2.5 h-2.5 bg-white dark:bg-gray-900 rotate-45',
                    caret.side === 'bottom' ? 'border-b border-r border-gray-200 dark:border-gray-700 -bottom-1' : 'border-t border-l border-gray-200 dark:border-gray-700 -top-1'
                  )}
                  style={{ left: Math.max(6, caret.left - 5) }}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )
    : null;

  return (
  <div className="relative inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
    onFocus={show}
    onMouseEnter={show}
    onMouseLeave={hide}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          // Subtle trigger badge
          "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200 select-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40",
        )}
      >
        <span className="truncate max-w-[140px]">{sellerName || "Unknown"}</span>
        <OnlineDot online={seller?.online || sellerOnline} />
      </button>
      {panel}
    </div>
  );
}
