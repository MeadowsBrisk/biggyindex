import { useMemo, useState } from "react";
import { useAtom } from "jotai";
import { itemsAtom, includedSellersAtom, includedSellersPinnedAtom } from "@/store/atoms";
import cn from "@/app/cn";
import FilterPinButton from "@/components/FilterPinButton";

export default function SellerIncludeInput() {
  const [items] = useAtom(itemsAtom);
  const [included, setIncluded] = useAtom(includedSellersAtom);
  const [pinned, setPinned] = useAtom(includedSellersPinnedAtom);
  const [input, setInput] = useState("");

  const sellers = useMemo(() => Array.from(new Set(items.map((i) => i.sellerName).filter(Boolean))).sort((a,b)=>a.localeCompare(b)), [items]);
  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return sellers.filter((s) => s.toLowerCase().includes(q)).slice(0, 10);
  }, [input, sellers]);

  const add = (name) => {
    if (!name) return;
    const lower = name.toLowerCase();
    if (included.includes(lower)) return;
    setIncluded([...included, lower]);
    setInput("");
  };
  const remove = (lower) => setIncluded(included.filter((e) => e !== lower));

  const showPin = pinned || included.length > 0;

  return (
    <div>
      {showPin && (
        <div className="absolute top-2 right-2 flex h-4 w-5 justify-end">
          <FilterPinButton pinned={pinned} onToggle={() => setPinned(!pinned)} label="include sellers" />
        </div>
      )}
      <div className="flex gap-2 mb-2 relative">
        <input
          className={cn("w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2")}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type seller name..."
        />
        <button
          className="px-3 py-2 rounded-md bg-black/10 dark:bg-white/10"
          onClick={() => add(input)}
        >
          Add
        </button>
        {suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow">
            {suggestions.map((s) => (
              <button key={s} className="block w-full text-left px-3 py-2 hover:bg-black/5 dark:hover:bg-white/10" onClick={() => add(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {included.map((lower) => (
          <span key={lower} className="inline-flex items-center gap-1 rounded-full bg-black/10 dark:bg-white/10 px-2 py-1 text-xs">
            {sellers.find((s) => s.toLowerCase() === lower) || lower}
            <button className="ml-1 hover:opacity-80" onClick={() => remove(lower)}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}


