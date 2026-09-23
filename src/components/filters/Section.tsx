"use client";

import { useAtom } from "jotai";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { sectionOpenAtom } from "@/store/atoms";

export function Section({
  title,
  children,
  defaultOpen = true,
  storageKey,
  activeCount,
  trailing,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  storageKey: string;
  activeCount?: number;
  trailing?: ReactNode;
}) {
  const [sections, setSections] = useAtom(sectionOpenAtom);
  const open = sections[storageKey] ?? defaultOpen;

  const toggle = () => {
    setSections((prev) => ({ ...prev, [storageKey]: !open }));
  };

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex h-8 w-full items-center justify-between text-xs font-medium uppercase tracking-wider text-muted">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex h-full flex-1 items-center justify-between cursor-pointer transition-colors hover:text-foreground"
        >
          <span className="flex items-center gap-1.5">
            {title}
            {!open && activeCount != null && activeCount > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground normal-case tracking-normal">
                {activeCount}
              </span>
            )}
          </span>
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
        {trailing && <span className="ml-1 flex items-center">{trailing}</span>}
      </div>
      <div
        inert={!open}
        className={`relative overflow-hidden transition-all duration-200 ${
          open ? "max-h-500 opacity-100 pt-1 pb-3" : "max-h-0 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
