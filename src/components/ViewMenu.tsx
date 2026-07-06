"use client";

import { useAtom } from "jotai";
import {
  Check,
  Columns2,
  LayoutGrid,
  Rows3,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cn";
import {
  mobileGridColsAtom,
  viewLayoutAtom,
  viewModeAtom,
} from "@/store/atoms";

/**
 * ViewMenu — mobile-only consolidated "View" control.
 *
 * Replaces the three inline toolbar toggles (grid/list flip, 1/2 per row,
 * comfortable/compact) with a single labelled pill that opens an anchored
 * dropdown. Selecting an option updates the atom instantly (live preview
 * behind the panel) and the popover stays open so several settings can be
 * adjusted in one pass — dismiss by tapping away, Escape, or scrolling.
 *
 * The panel portals to <body> (like Tooltip) so it escapes the sticky
 * toolbar's backdrop-blur/stacking context and can't be clipped. It is
 * anchored below-right of the trigger via getBoundingClientRect so a fixed
 * ~220px width never spills off the right edge on a ~360px phone.
 */
export function ViewMenu() {
  const t = useTranslations("browse.toolbar.view");
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const [layout, setLayout] = useAtom(viewLayoutAtom);
  const [cols, setCols] = useAtom(mobileGridColsAtom);
  const [mode, setMode] = useAtom(viewModeAtom);
  const [, startTransition] = useTransition();

  // Position the panel below-right of the trigger. Right-anchoring (distance
  // from the viewport's right edge) keeps a fixed-width panel on-screen.
  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
  }, [open, reposition]);

  // Outside click (mousedown so it fires before other controls resolve).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Escape closes and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Close on scroll — an anchored fixed panel would otherwise detach from the
  // trigger. Capture phase catches scrolls on any ancestor/container.
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("scroll", handler, true);
    return () => window.removeEventListener("scroll", handler, true);
  }, [open]);

  // Focus the first menu row on open.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('[role="menuitemradio"]')
        ?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const showPerRow = layout === "grid";
  const showCardSize = layout === "grid" && cols === 1;

  return (
    <div className="sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer",
          open
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted hover:text-foreground hover:bg-surface-hover",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={t("trigger")}
      >
        <SlidersHorizontal size={14} />
        <span>{t("trigger")}</span>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="menu"
            aria-label={t("trigger")}
            className="view-menu-pop fixed z-[110] w-[220px] rounded-xl border border-border bg-card p-2 shadow-xl"
            style={{ top: coords.top, right: coords.right }}
            onKeyDown={handleArrowNav}
          >
            {/* Layout — always shown */}
            <Section label={t("layoutSection")}>
              <OptionRow
                active={layout === "grid"}
                icon={<LayoutGrid size={14} />}
                label={t("grid")}
                onSelect={() => startTransition(() => setLayout("grid"))}
              />
              <OptionRow
                active={layout === "list"}
                icon={<Rows3 size={14} />}
                label={t("list")}
                onSelect={() => startTransition(() => setLayout("list"))}
              />
            </Section>

            {/* Per row — grid only */}
            {showPerRow && (
              <>
                <Divider />
                <Section label={t("perRowSection")}>
                  <OptionRow
                    active={cols === 1}
                    icon={<Square size={14} />}
                    label={t("onePerRow")}
                    onSelect={() => startTransition(() => setCols(1))}
                  />
                  <OptionRow
                    active={cols === 2}
                    icon={<Columns2 size={14} />}
                    label={t("twoPerRow")}
                    onSelect={() => startTransition(() => setCols(2))}
                  />
                </Section>
              </>
            )}

            {/* Card size — grid + 1-per-row only */}
            {showCardSize && (
              <>
                <Divider />
                <Section label={t("cardSizeSection")}>
                  <OptionRow
                    active={mode === "comfortable"}
                    icon={<LayoutGrid size={14} />}
                    label={t("comfortable")}
                    onSelect={() => setMode("comfortable")}
                  />
                  <OptionRow
                    active={mode === "compact"}
                    icon={<Rows3 size={14} />}
                    label={t("compact")}
                    onSelect={() => setMode("compact")}
                  />
                </Section>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Roving arrow-key navigation between the menu's radio rows. */
function handleArrowNav(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const rows = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
  );
  if (rows.length === 0) return;
  const idx = rows.indexOf(document.activeElement as HTMLElement);
  e.preventDefault();
  const delta = e.key === "ArrowDown" ? 1 : -1;
  const next = (idx + delta + rows.length) % rows.length;
  rows[next]?.focus();
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-1 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-border" />;
}

function OptionRow({
  active,
  icon,
  label,
  onSelect,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onSelect}
      className={cx(
        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors cursor-pointer",
        active
          ? "bg-primary/10 text-primary"
          : "text-foreground hover:bg-surface-hover",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {active && <Check size={14} className="shrink-0" />}
    </button>
  );
}
