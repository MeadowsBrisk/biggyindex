"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { FilterPanelContent } from "@/components/FilterPanelContent";
import {
  activeFiltersCountAtom,
  filterPanelOpenAtom,
  filterPanelSettledAtom,
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

function useHydratedTransitionReady(isReady: boolean) {
  const [transitionReady, setTransitionReady] = useState(false);

  useEffect(() => {
    if (!isReady) {
      setTransitionReady(false);
      return;
    }

    const id = window.requestAnimationFrame(() => setTransitionReady(true));
    return () => window.cancelAnimationFrame(id);
  }, [isReady]);

  return transitionReady;
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
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
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
  const setFilterPanelSettled = useSetAtom(filterPanelSettledAtom);
  const t = useTranslations("browse.filters");
  const previousPanelOpenRef = useRef<boolean | null>(null);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const panelOpen = mounted && open;
  const transitionReady = useHydratedTransitionReady(mounted && gateComplete);
  const shouldRenderContent = useDelayedUnmount(
    panelOpen,
    transitionReady ? CLOSE_TRANSITION_MS : 0,
  );

  useEffect(() => {
    if (!mounted) return;

    const previousPanelOpen = previousPanelOpenRef.current;
    previousPanelOpenRef.current = panelOpen;

    if (previousPanelOpen === null || previousPanelOpen === panelOpen) {
      setFilterPanelSettled(true);
      return;
    }

    setFilterPanelSettled(false);
    const id = window.setTimeout(
      () => setFilterPanelSettled(true),
      transitionReady ? CLOSE_TRANSITION_MS : 0,
    );
    return () => window.clearTimeout(id);
  }, [mounted, panelOpen, transitionReady, setFilterPanelSettled]);

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
