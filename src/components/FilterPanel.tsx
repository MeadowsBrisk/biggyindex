"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  activeFiltersCountAtom,
  filterPanelOpenAtom,
  gateCompleteAtom,
} from "@/store/atoms";

const PANEL_WIDTH = 280;
const CLOSE_TRANSITION_MS = 300;

const FilterPanelContent = dynamic(
  () =>
    import("@/components/FilterPanelContent").then(
      (mod) => mod.FilterPanelContent,
    ),
  { ssr: false, loading: () => null },
);

const emptySubscribe = () => () => {};

function useDelayedUnmount(isOpen: boolean, delayMs: number) {
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      return;
    }

    const timeout = window.setTimeout(() => setShouldRender(false), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, isOpen]);

  return shouldRender;
}

export function FilterToggle() {
  const setOpen = useSetAtom(filterPanelOpenAtom);
  const filterCount = useAtomValue(activeFiltersCountAtom);

  return (
    <button
      type="button"
      onClick={() => setOpen((open) => !open)}
      aria-label="Toggle filters"
      data-tour="filter-toggle"
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
        filterCount > 0
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted hover:text-foreground hover:bg-surface-hover"
      }`}
    >
      <SlidersHorizontal size={14} />
      <span className="hidden sm:inline">Filters</span>
      {filterCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
          {filterCount}
        </span>
      )}
    </button>
  );
}

export function FilterPanel() {
  const [open, setOpen] = useAtom(filterPanelOpenAtom);
  const [isMobile, setIsMobile] = useState(false);
  const gateComplete = useAtomValue(gateCompleteAtom);
  const shouldRenderContent = useDelayedUnmount(
    open,
    gateComplete ? CLOSE_TRANSITION_MS : 0,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (open && isMobile) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open, isMobile]);

  useEffect(() => {
    if (!(open && isMobile)) return;
    const main = document.querySelector("main");
    const header = document.querySelector("header");
    const toolbar = document.querySelector('[data-tour="toolbar"]');
    const targets = [main, header, toolbar].filter(Boolean) as HTMLElement[];
    for (const element of targets) element.setAttribute("inert", "");
    return () => {
      for (const element of targets) element.removeAttribute("inert");
    };
  }, [open, isMobile]);

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const closePanel = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) closePanel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closePanel]);

  return (
    <>
      <aside
        className={`hidden md:block shrink-0 self-start sticky overflow-hidden ${
          gateComplete ? "transition-all duration-300 ease-out" : ""
        }`}
        style={{
          width: open ? PANEL_WIDTH : 0,
          top: "var(--toolbar-h, 44px)",
        }}
      >
        <div
          className="border-r border-border bg-background"
          style={{
            width: PANEL_WIDTH,
            height: "calc(100vh - var(--toolbar-h, 44px))",
          }}
        >
          {shouldRenderContent && (
            <FilterPanelContent onClose={() => setOpen(false)} />
          )}
        </div>
      </aside>

      {mounted &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close filters"
              aria-hidden={!open}
              tabIndex={open ? 0 : -1}
              className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden transition-opacity duration-300 ${
                open ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
              onClick={closePanel}
            />
            <aside
              className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-background shadow-2xl md:hidden ${
                gateComplete ? "transition-transform duration-300 ease-out" : ""
              } ${open ? "translate-x-0" : "-translate-x-full"}`}
            >
              {shouldRenderContent && (
                <FilterPanelContent onClose={closePanel} />
              )}
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
