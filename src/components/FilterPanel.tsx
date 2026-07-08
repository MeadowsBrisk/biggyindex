"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { FilterPanelContent } from "@/components/FilterPanelContent";
import {
  activeFiltersCountAtom,
  filterPanelOpenAtom,
  gateCompleteAtom,
} from "@/store/atoms";

const PANEL_WIDTH = 280;
const CLOSE_TRANSITION_MS = 300;

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

/**
 * One-frame transition suppressor — prevents the panel from animating on
 * its very first paint (e.g. when navigating from `/` to `/browse`, where
 * `gateComplete` is already true but atomWithStorage may still flip
 * `filterPanelOpenAtom` from its SSR `false` to the persisted user value).
 */
function useMountSettled() {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    // Two RAFs: one for atomWithStorage to hydrate, one to commit the snap,
    // then transitions are safe to enable.
    const id1 = window.requestAnimationFrame(() => {
      const id2 = window.requestAnimationFrame(() => setSettled(true));
      return () => window.cancelAnimationFrame(id2);
    });
    return () => window.cancelAnimationFrame(id1);
  }, []);
  return settled;
}

export function FilterToggle() {
  const setOpen = useSetAtom(filterPanelOpenAtom);
  const filterCount = useAtomValue(activeFiltersCountAtom);
  const t = useTranslations("browse.filters");

  return (
    <button
      type="button"
      onClick={() => setOpen((open) => !open)}
      aria-label={t("toggle")}
      data-tour="filter-toggle"
      className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors cursor-pointer sm:h-auto sm:px-3 sm:py-1.5 sm:text-sm ${
        filterCount > 0
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted hover:text-foreground hover:bg-surface-hover"
      }`}
    >
      <SlidersHorizontal size={14} />
      <span className="hidden sm:inline">{t("label")}</span>
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
  const t = useTranslations("browse.filters");
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const panelOpen = mounted && open;
  // Transitions are safe to enable once both the global hydration gate has
  // completed AND this component has had two frames to absorb its initial
  // atomWithStorage snap. The mount flag matters when navigating to /browse
  // from another route where gateComplete is already true.
  const mountSettled = useMountSettled();
  const transitionReady = mounted && gateComplete && mountSettled;
  const shouldRenderContent = useDelayedUnmount(
    panelOpen,
    transitionReady ? CLOSE_TRANSITION_MS : 0,
  );

  // Hand-off from the pre-paint sidebar placeholder. The layout's boot
  // script stamps html.bi-panel-open on hard loads when the user left the
  // panel open (localStorage.filterPanelOpen), which reveals the SSR'd
  // 280px skeleton column below — so returning users see a stable sidebar
  // slot from first paint instead of the panel popping in at hydration.
  // Once `mounted` flips true the real <aside> takes its hydrated width in
  // the SAME render, and this layout effect removes the class in the same
  // commit (before paint): skeleton → panel swaps with zero width change.
  // Removing the class is also what stops stale CSS from fighting a later
  // manual close, and clears any class stamped on non-browse hard loads.
  useLayoutEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.remove("bi-panel-open");
  }, [mounted]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (panelOpen && isMobile) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [panelOpen, isMobile]);

  useEffect(() => {
    if (!(panelOpen && isMobile)) return;
    const main = document.querySelector("main");
    const header = document.querySelector("header");
    const toolbar = document.querySelector('[data-tour="toolbar"]');
    const targets = [main, header, toolbar].filter(Boolean) as HTMLElement[];
    for (const element of targets) element.setAttribute("inert", "");
    return () => {
      for (const element of targets) element.removeAttribute("inert");
    };
  }, [panelOpen, isMobile]);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && panelOpen) closePanel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panelOpen, closePanel]);

  return (
    <>
      {/* Mobile: invisible left-edge tap zone that opens the filter drawer,
          with a subtle indicator bar. Mirrors Roast Radar — gives phones a
          thumb-reachable strip on the screen edge to open filters without
          reaching for the toolbar button. Only when the drawer is closed; sits
          just below the sticky toolbar (var(--toolbar-h)). w-7 (28px): 16px
          proved too thin to hit reliably with a thumb; the visible affordance
          stays the thin indicator, and the content column's own left gutter
          keeps the extra hit area off any controls. */}
      {mounted && isMobile && !open && (
        <button
          type="button"
          aria-label={t("toggle")}
          className="group fixed left-0 bottom-0 z-30 w-7 focus:outline-none md:hidden"
          style={{ top: "var(--toolbar-h, 44px)" }}
          onClick={() => setOpen(true)}
        >
          <span className="sr-only">{t("toggle")}</span>
          <span
            className="absolute inset-y-0 left-0 w-[3px] rounded-r-full transition-all group-hover:w-1 group-active:opacity-[0.6]"
            style={{
              background:
                "linear-gradient(to bottom, transparent, color-mix(in srgb, var(--primary) 25%, transparent) 50%, transparent)",
            }}
          />
        </button>
      )}

      {/* Pre-paint sidebar placeholder — SSR'd hidden, revealed only while
          html.bi-panel-open is set (boot script, persisted open state; CSS
          in styles/elements/sidebar.css, md+ only). Sits in the same flex
          slot as the <aside> below with the same width/sticky metrics, so
          the grid column never shifts during the skeleton→panel hand-off
          (the layout effect above removes the class in the commit where the
          aside first gets its real width). Shimmer bars roughly follow
          FilterPanelContent's rhythm: search box, then accordion sections. */}
      <div
        aria-hidden="true"
        className="bi-panel-placeholder shrink-0 self-start sticky overflow-hidden"
        style={{ width: PANEL_WIDTH, top: "var(--toolbar-h, 44px)" }}
      >
        <div
          className="border-r border-border bg-background"
          style={{
            width: PANEL_WIDTH,
            height: "calc(100vh - var(--toolbar-h, 44px))",
          }}
        >
          <div className="animate-pulse px-4 pt-2 lg:pl-0">
            <div className="h-10 rounded-lg bg-surface" />
            <div className="mt-5 space-y-2 border-b border-border pb-4">
              <div className="h-3 w-24 rounded bg-surface" />
              <div className="h-7 rounded-md bg-surface" />
              <div className="h-7 rounded-md bg-surface" />
              <div className="h-7 w-4/5 rounded-md bg-surface" />
            </div>
            <div className="mt-4 space-y-2 border-b border-border pb-4">
              <div className="h-3 w-16 rounded bg-surface" />
              <div className="h-7 rounded-md bg-surface" />
              <div className="h-7 w-3/4 rounded-md bg-surface" />
            </div>
            <div className="mt-4 space-y-2 border-b border-border pb-4">
              <div className="h-3 w-20 rounded bg-surface" />
              <div className="h-7 rounded-md bg-surface" />
              <div className="h-7 rounded-md bg-surface" />
              <div className="h-7 w-2/3 rounded-md bg-surface" />
            </div>
            <div className="mt-4 space-y-2">
              <div className="h-3 w-24 rounded bg-surface" />
              <div className="h-7 rounded-md bg-surface" />
              <div className="h-7 w-4/5 rounded-md bg-surface" />
            </div>
          </div>
        </div>
      </div>

      <aside
        className={`hidden md:block shrink-0 self-start sticky overflow-hidden ${
          transitionReady ? "transition-all duration-300 ease-out" : ""
        }`}
        style={{
          width: panelOpen ? PANEL_WIDTH : 0,
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
          {(panelOpen || shouldRenderContent) && (
            <div
              className={`h-full transition-[opacity,transform] duration-200 ease-out ${
                panelOpen
                  ? "translate-x-0 opacity-100"
                  : "-translate-x-1 opacity-0"
              }`}
            >
              <FilterPanelContent onClose={() => setOpen(false)} />
            </div>
          )}
        </div>
      </aside>

      {mounted &&
        createPortal(
          <>
            <button
              type="button"
              aria-label={t("close")}
              aria-hidden={!panelOpen}
              tabIndex={panelOpen ? 0 : -1}
              className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden transition-opacity duration-300 ${
                panelOpen ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
              onClick={closePanel}
            />
            <aside
              className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-background shadow-2xl md:hidden ${
                transitionReady
                  ? "transition-transform duration-300 ease-out"
                  : ""
              } ${panelOpen ? "translate-x-0" : "-translate-x-full"}`}
            >
              {(panelOpen || shouldRenderContent) && (
                <div
                  className={`h-full transition-opacity duration-200 ease-out ${
                    panelOpen ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <FilterPanelContent onClose={closePanel} />
                </div>
              )}
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
