import { useAtom } from "jotai";
import { priceRangeAtom, activePriceBoundsAtom, priceRangeUserSetAtom } from "@/store/atoms";
import cn from "@/app/cn";
import * as Slider from "@radix-ui/react-slider";
import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { displayCurrencyAtom, exchangeRatesAtom } from '@/store/atoms';
import { currencySymbol } from '@/lib/priceDisplay';

export default function PriceRange() {
  const [activeBounds] = useAtom(activePriceBoundsAtom);
  const [range, setRange] = useAtom(priceRangeAtom);
  const [userSet, setUserSet] = useAtom(priceRangeUserSetAtom);
  const displayCurrency = useAtomValue(displayCurrencyAtom);
  const rates = useAtomValue(exchangeRatesAtom);
  const usdRate = (rates && typeof rates['USD'] === 'number' && rates['USD'] > 0) ? rates['USD'] : null;
  const isUSD = displayCurrency === 'USD' && !!usdRate;
  const activeMin = activeBounds.min ?? 0;
  const activeMax = activeBounds.max ?? 0;
  const first = useRef(true);

  const clamp = (val, lo, hi) => {
    if (val == null || val === '') return lo;
    const n = Number(val);
    if (!Number.isFinite(n)) return lo;
    return Math.min(Math.max(n, lo), hi);
  };

  // Commit helper. Only set userSet when invoked by user (isUser=true)
  const commit = useCallback((minVal, maxVal, isUser = false) => {
    if (minVal > maxVal) [minVal, maxVal] = [maxVal, minVal];
    minVal = clamp(minVal, activeMin, activeMax);
    maxVal = clamp(maxVal, activeMin, activeMax);
    setRange(prev => (prev.min === minVal && prev.max === maxVal) ? prev : { min: minVal, max: maxVal });
    const nowFull = minVal === activeMin && maxVal === activeMax;
    if (isUser) {
      setUserSet(!nowFull);
    } else if (nowFull) {
      // Auto sync reaching full should clear flag
      if (userSet) setUserSet(false);
    }
  }, [setRange, setUserSet, activeMin, activeMax, userSet]);

  // Re-sync when active bounds change (category/subcategory changed)
  useEffect(() => {
    const curMin = Number.isFinite(range.min) ? range.min : activeMin;
    const curMax = Number.isFinite(range.max) ? range.max : activeMax;
    let nm = curMin < activeMin ? activeMin : curMin;
    let xM = curMax > activeMax ? activeMax : curMax;
    if (nm > xM) {
      nm = activeMin; xM = activeMax;
    }
    if (first.current && (range.max === Infinity || range.min === 0 || range.min == null || range.max == null)) {
      first.current = false;
      commit(activeMin, activeMax, false); // initial sync, not user
      return;
    }
    first.current = false;
    if (nm !== curMin || xM !== curMax) {
      commit(nm, xM, false); // auto clamp, not user
    } else {
      // Even if no change, ensure flag cleared if at full
      if (nm === activeMin && xM === activeMax && userSet) setUserSet(false);
    }
  }, [activeMin, activeMax, commit, range.min, range.max, userSet, setUserSet]);

  const displayedMin = Number.isFinite(range.min) ? clamp(range.min, activeMin, activeMax) : activeMin;
  const displayedMax = Number.isFinite(range.max) ? clamp(range.max, activeMin, activeMax) : activeMax;
  const toView = (gbp) => {
    const n = Number(gbp);
    if (!Number.isFinite(n)) return 0;
    return isUSD ? Math.round(n * usdRate) : n;
  };
  const toGBP = (viewVal) => {
    const n = Number(viewVal);
    if (!Number.isFinite(n)) return 0;
    return isUSD ? (n / usdRate) : n;
  };
  const activeMinView = toView(activeMin);
  const activeMaxView = toView(activeMax);
  const displayedMinView = toView(displayedMin);
  const displayedMaxView = toView(displayedMax);
  const full = displayedMin === activeMin && displayedMax === activeMax;
  const showReset = userSet && !full; // only if user actually narrowed
  const singleBand = activeMin === activeMax;

  // User interactions set isUser=true
  const onSlider = (vals) => {
    const [vMinView, vMaxView] = vals;
    const vMin = toGBP(vMinView);
    const vMax = toGBP(vMaxView);
    commit(vMin, vMax, true);
  };
  const onMin = (val) => {
    const v = toGBP(val);
    commit(clamp(v, activeMin, activeMax), displayedMax, true);
  };
  const onMax = (val) => {
    const v = toGBP(val);
    commit(displayedMin, clamp(v, activeMin, activeMax), true);
  };

  const sym = currencySymbol(displayCurrency);

  return (
    <div className="space-y-2">
      <div className="flex items-center text-[11px] font-medium text-gray-600 dark:text-gray-400">
        <span>{sym}{displayedMinView}</span>
        <span className="px-1 opacity-50">–</span>
        <span>{sym}{displayedMaxView}</span>
        {showReset && (
          <button
            type="button"
            onClick={() => commit(activeMin, activeMax, true)}
            className="ml-auto text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
          >Reset</button>
        )}
      </div>
      {singleBand ? (
        <div className="text-[11px] text-gray-500 dark:text-gray-500">Fixed price</div>
      ) : (
        <div className="pt-1">
          <Slider.Root
            className="relative flex h-4 w-full touch-none select-none items-center"
            min={activeMinView}
            max={activeMaxView}
            step={1}
            value={[displayedMinView, displayedMaxView]}
            onValueChange={onSlider}
            aria-label="Price range"
          >
            <Slider.Track className="relative h-1 w-full grow rounded bg-gray-200 dark:bg-gray-700">
              <Slider.Range className="absolute h-full rounded bg-blue-600" />
            </Slider.Track>
            <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-white dark:bg-gray-200 border border-black/20 shadow focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
            <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-white dark:bg-gray-200 border border-black/20 shadow focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          </Slider.Root>
        </div>
      )}
      <div className="flex items-end justify-between gap-3 pt-1">
        <div className="flex-1 min-w-0">
      <label htmlFor="price-min" className="block mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Min</label>
          <input
            id="price-min"
            type="number"
            className={cn("w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500/40")}
            min={activeMinView}
            max={activeMaxView}
            value={displayedMinView}
            onChange={(e) => onMin(e.target.value)}
          />
        </div>
        <div className="pb-[5px] select-none text-[10px] font-medium uppercase tracking-wide text-gray-400">to</div>
        <div className="flex-1 min-w-0 text-right">
          <label htmlFor="price-max" className="block mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Max</label>
          <input
            id="price-max"
            type="number"
            className={cn("w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-[11px] text-right focus:outline-none focus:ring-2 focus:ring-blue-500/40")}
            min={activeMinView}
            max={activeMaxView}
            value={displayedMaxView}
            onChange={(e) => onMax(e.target.value)}
          />
        </div>
      </div>
    <div className="text-[10px] text-gray-400 dark:text-gray-500">Bounds {sym}{activeMinView} – {sym}{activeMaxView}</div>
    </div>
  );
}
