import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAtom } from "jotai";
import { 
  itemsAtom, 
  excludedSellersAtom, 
  includedSellersAtom,
  excludedSellersPinnedAtom,
  includedSellersPinnedAtom 
} from "@/store/atoms";
import cn from "@/app/cn";
import FilterPinButton from "@/components/FilterPinButton";

export default function SellerFilter() {
  const [items] = useAtom(itemsAtom);
  const [excluded, setExcluded] = useAtom(excludedSellersAtom);
  const [included, setIncluded] = useAtom(includedSellersAtom);
  const [excludedPinned, setExcludedPinned] = useAtom(excludedSellersPinnedAtom);
  const [includedPinned, setIncludedPinned] = useAtom(includedSellersPinnedAtom);
  
  const [mode, setMode] = useState("exclude"); // "include" | "exclude"
  const [input, setInput] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, openAbove: false });
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sellers = useMemo(
    () => Array.from(new Set(items.map((i) => i.sellerName).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [items]
  );

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return sellers.filter((s) => s.toLowerCase().includes(q)).slice(0, 10);
  }, [input, sellers]);

  // Calculate dropdown position when suggestions change or window resizes
  useEffect(() => {
    if (suggestions.length > 0 && inputRef.current) {
      const updatePosition = () => {
        const rect = inputRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;
        const dropdownHeight = Math.min(suggestions.length * 42, 200);
        
        // Show above if not enough space below and more space above
        const openAbove = spaceBelow < dropdownHeight + 10 && spaceAbove > spaceBelow;
        
        setDropdownPosition({
          top: openAbove ? rect.top : rect.bottom,
          left: rect.left,
          width: rect.width,
          openAbove
        });
      };
      
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true); // capture phase to catch all scrolls
      
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [suggestions.length]);

  // Close dropdown on click outside
  useEffect(() => {
    if (suggestions.length === 0) return;
    
    const handleClickOutside = (e) => {
      if (
        inputRef.current && 
        !inputRef.current.contains(e.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        setInput("");
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [suggestions.length]);

  const isIncludeMode = mode === "include";
  const activeList = isIncludeMode ? included : excluded;
  const setActiveList = isIncludeMode ? setIncluded : setExcluded;
  const activePinned = isIncludeMode ? includedPinned : excludedPinned;
  const setActivePinned = isIncludeMode ? setIncludedPinned : setExcludedPinned;

  const add = (name) => {
    if (!name) return;
    const lower = name.toLowerCase();
    if (activeList.includes(lower)) return;
    setActiveList([...activeList, lower]);
    setInput("");
  };

  const remove = (lower) => {
    setActiveList(activeList.filter((e) => e !== lower));
  };

  const clearAll = () => {
    setActiveList([]);
  };

  const hasAnyFilters = included.length > 0 || excluded.length > 0;
  const hasCurrentModeFilters = activeList.length > 0;
  const showPin = activePinned || hasAnyFilters;

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-1">
        <button
          type="button"
          onClick={() => setMode("exclude")}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all",
            mode === "exclude"
              ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          )}
        >
          Exclude
          {excluded.length > 0 && (
            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 px-1.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
              {excluded.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setMode("include")}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all",
            mode === "include"
              ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          )}
        >
          Include
          {included.length > 0 && (
            <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              {included.length}
            </span>
          )}
        </button>
      </div>

      {/* Pin button */}
      {showPin && (
        <div className="absolute top-2 right-2 flex h-4 w-5 justify-end">
          <FilterPinButton 
            pinned={activePinned} 
            onToggle={() => setActivePinned(!activePinned)} 
            label={`${mode} sellers`} 
          />
        </div>
      )}

      {/* Input and clear button */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2",
              isIncludeMode
                ? "border-emerald-200 dark:border-emerald-800/50 bg-white dark:bg-gray-900 focus:ring-emerald-500/40"
                : "border-red-200 dark:border-red-800/50 bg-white dark:bg-gray-900 focus:ring-red-500/40"
            )}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                add(input);
              } else if (e.key === "Escape") {
                setInput("");
              }
            }}
            placeholder={`Type to ${mode} seller...`}
          />
          <button
            type="button"
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs font-medium transition-colors",
              isIncludeMode
                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60"
                : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60"
            )}
            onClick={() => add(input)}
            disabled={!input.trim()}
          >
            Add
          </button>

          {/* Suggestions dropdown - rendered via portal outside sidebar */}
        </div>

        {/* Clear button for current mode */}
        {hasCurrentModeFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="shrink-0 rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            title={`Clear all ${mode}d sellers`}
          >
            Clear
          </button>
        )}
      </div>

      {/* Portal dropdown */}
      {mounted && suggestions.length > 0 && createPortal(
        <div 
          ref={dropdownRef}
          className={cn(
            "fixed z-[9999] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden",
            dropdownPosition.openAbove ? "origin-bottom" : "origin-top"
          )}
          style={{
            top: dropdownPosition.openAbove ? 'auto' : `${dropdownPosition.top + 4}px`,
            bottom: dropdownPosition.openAbove ? `${window.innerHeight - dropdownPosition.top + 4}px` : 'auto',
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            maxHeight: '200px'
          }}
        >
          <div className="overflow-y-auto max-h-[200px]">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                onClick={() => add(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Selected sellers chips */}
      {hasCurrentModeFilters && (
        <div className="flex flex-wrap gap-1.5">
          {activeList.map((lower) => (
            <span
              key={lower}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                isIncludeMode
                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
                  : "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200"
              )}
            >
              {sellers.find((s) => s.toLowerCase() === lower) || lower}
              <button
                type="button"
                className="ml-0.5 hover:opacity-70 transition-opacity"
                onClick={() => remove(lower)}
                aria-label={`Remove ${lower}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Empty state hint */}
      {!hasCurrentModeFilters && (
        <p className="text-[11px] text-gray-500 dark:text-gray-500">
          {isIncludeMode 
            ? "Only show items from specific sellers" 
            : "Hide items from specific sellers"}
        </p>
      )}
    </div>
  );
}
