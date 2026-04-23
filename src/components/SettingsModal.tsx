"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Settings, X, Search, EyeOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  settingsModalOpenAtom,
  highResImagesAtom,
  pauseGifsAtom,
  thumbnailAspectAtom,
  accentColorAtom,
  customAccentHexAtom,
  hiddenSellersAtom,
  toggleHiddenSellerAtom,
  availableSellersAtom,
  type AccentColor,
  type ThumbnailAspect,
} from "@/store/atoms";

// ─── Toggle switch ─────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      style={{
        backgroundColor: checked ? "var(--primary)" : "var(--border)",
      }}
    >
      <span
        className="pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform"
        style={{
          transform: checked ? "translateX(20px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

// ─── Color swatches ────────────────────────────────────────────────

const SWATCHES: { key: AccentColor; label: string; color: string }[] = [
  { key: "green", label: "Forest", color: "#16a34a" },
  { key: "blue", label: "Ocean", color: "#2563eb" },
  { key: "purple", label: "Haze", color: "#7c3aed" },
  { key: "amber", label: "Sunset", color: "#d97706" },
  { key: "rose", label: "Cherry", color: "#e11d48" },
];

// ─── Modal ─────────────────────────────────────────────────────────

export function SettingsModal() {
  const [open, setOpen] = useAtom(settingsModalOpenAtom);
  const [highRes, setHighRes] = useAtom(highResImagesAtom);
  const [pauseGifs, setPauseGifs] = useAtom(pauseGifsAtom);
  const [thumbAspect, setThumbAspect] = useAtom(thumbnailAspectAtom);
  const [accent, setAccent] = useAtom(accentColorAtom);
  const [customHex, setCustomHex] = useAtom(customAccentHexAtom);
  const hiddenSellers = useAtomValue(hiddenSellersAtom);
  const toggleHidden = useSetAtom(toggleHiddenSellerAtom);
  const allSellers = useAtomValue(availableSellersAtom);
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const [sellerQuery, setSellerQuery] = useState("");

  // Seller search suggestions (exclude already-hidden)
  const hiddenSet = useMemo(() => new Set(hiddenSellers), [hiddenSellers]);
  const sellerSuggestions = useMemo(() => {
    const q = sellerQuery.toLowerCase().trim();
    if (q.length < 2) return [];
    return allSellers
      .filter((s) => !hiddenSet.has(s.id) && s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [sellerQuery, allSellers, hiddenSet]);

  // Seller name lookup for chips
  const sellerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allSellers) map.set(s.id, s.name);
    return map;
  }, [allSellers]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setOpen(false);
    }, 150);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`modal-backdrop${closing ? " modal-backdrop--closing" : ""}`}
      style={{ zIndex: 150 }}
      onClick={close}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        className={`modal-panel modal-panel--sm${closing ? " modal-panel--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Settings size={18} className="text-muted" />
            <h2 className="text-base font-bold text-foreground">Settings</h2>
          </div>
          <button
            onClick={close}
            className="inline-flex items-center justify-center size-8 rounded-lg bg-surface hover:bg-surface-hover text-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close settings"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-5">
          {/* High-res images toggle */}
          <label className="flex items-center justify-between gap-3 cursor-pointer group">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium group-hover:text-primary transition-colors">
                High-res images
              </div>
              <div className="text-xs text-muted mt-0.5">
                Use full-resolution product images. Uses more data but looks
                sharper.
              </div>
            </div>
            <Toggle checked={highRes} onChange={setHighRes} />
          </label>

          {/* Pause GIFs toggle */}
          <label className="flex items-center justify-between gap-3 cursor-pointer group">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium group-hover:text-primary transition-colors">
                Pause GIFs
              </div>
              <div className="text-xs text-muted mt-0.5">
                Show static thumbnails for animated images. Reduces distraction
                and saves battery.
              </div>
            </div>
            <Toggle checked={pauseGifs} onChange={setPauseGifs} />
          </label>

          {/* Thumbnail aspect ratio */}
          <div>
            <div className="text-sm font-medium mb-1">Thumbnail shape</div>
            <div className="text-xs text-muted mb-2">
              Change the crop ratio of product images on cards.
            </div>
            <div className="flex gap-2">
              {([
                { key: "square", label: "Square", ratio: "1 / 1" },
                { key: "4:3", label: "4:3", ratio: "4 / 3" },
                { key: "3:2", label: "3:2", ratio: "3 / 2" },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setThumbAspect(opt.key)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                    thumbAspect === opt.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-[var(--border)] text-muted hover:text-foreground hover:bg-surface-hover"
                  }`}
                >
                  <div
                    className="rounded-sm bg-current opacity-30"
                    style={{ width: 32, aspectRatio: opt.ratio }}
                  />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Accent color picker */}
          <div>
            <div className="text-sm font-medium mb-2">Accent colour</div>
            <div className="flex items-center gap-2">
              {SWATCHES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setAccent(s.key)}
                  title={s.label}
                  className={`size-7 rounded-full transition-all cursor-pointer ring-offset-2 ring-offset-card ${
                    accent === s.key
                      ? "ring-2 ring-[var(--foreground)] scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: s.color }}
                />
              ))}
              {/* Custom color picker */}
              <label
                title="Custom"
                className={`relative size-7 rounded-full cursor-pointer transition-all ring-offset-2 ring-offset-card overflow-hidden ${
                  accent === "custom"
                    ? "ring-2 ring-[var(--foreground)] scale-110"
                    : "hover:scale-105"
                }`}
                style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
              >
                <input
                  type="color"
                  value={customHex}
                  onChange={(e) => {
                    setCustomHex(e.target.value);
                    setAccent("custom");
                  }}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
            </div>
            <div className="text-[11px] text-muted mt-1.5">
              {accent === "custom"
                ? `Custom ${customHex}`
                : (SWATCHES.find((s) => s.key === accent)?.label ?? "Default")}  
            </div>
          </div>

          {/* Hidden sellers */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <EyeOff size={14} className="text-muted" />
              <div className="text-sm font-medium">Hidden sellers</div>
            </div>
            <div className="text-xs text-muted mb-2">
              Items from hidden sellers won't appear anywhere. This persists
              across sessions and isn't cleared by "Clear filters".
            </div>

            {/* Search input */}
            <div className="relative mb-2">
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="text"
                placeholder="Search sellers to hide…"
                value={sellerQuery}
                onChange={(e) => setSellerQuery(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-surface py-1.5 pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
              />
            </div>

            {/* Suggestions dropdown */}
            {sellerSuggestions.length > 0 && (
              <div className="mb-2 max-h-32 overflow-y-auto rounded-md border border-[var(--border)] bg-surface">
                {sellerSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      toggleHidden(s.id);
                      setSellerQuery("");
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-xs text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer"
                  >
                    <EyeOff size={11} className="shrink-0 opacity-50" />
                    <span className="truncate flex-1 text-left">{s.name}</span>
                    <span className="opacity-50 text-[10px]">{s.count} items</span>
                  </button>
                ))}
              </div>
            )}

            {/* Hidden seller chips */}
            {hiddenSellers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {hiddenSellers.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleHidden(id)}
                    className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-0.5 text-xs text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer"
                    title={`Click to unhide ${sellerNameMap.get(id) ?? id}`}
                  >
                    <span className="truncate max-w-28">
                      {sellerNameMap.get(id) ?? `#${id}`}
                    </span>
                    <X size={11} className="shrink-0 opacity-60" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-muted italic">
                No sellers hidden
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Accent sync (always mounted in layout) ────────────────────────

/** Lighten a hex color by mixing with white */
function lighten(hex: string, amount: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Shift hue slightly for gradient variety */
function shiftHue(hex: string, degrees: number): string {
  let r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  let g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  let b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  h = ((h * 360 + degrees) % 360) / 360;
  const hue2rgb = (p: number, q: number, t: number) => {
    const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  r = hue2rgb(p, q, h + 1 / 3);
  g = hue2rgb(p, q, h);
  b = hue2rgb(p, q, h - 1 / 3);
  return `#${[r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
}

function applyCustomAccent(hex: string, isDark: boolean) {
  const html = document.documentElement;
  const primary = isDark ? lighten(hex, 0.35) : hex;
  const accent = isDark ? lighten(hex, 0.5) : lighten(hex, 0.15);
  const mid = shiftHue(hex, 30);
  const end = shiftHue(hex, 60);
  const gradient = isDark
    ? `linear-gradient(135deg, ${lighten(hex, 0.35)} 0%, ${lighten(mid, 0.3)} 50%, ${lighten(end, 0.3)} 100%)`
    : `linear-gradient(135deg, ${hex} 0%, ${mid} 50%, ${end} 100%)`;

  html.style.setProperty("--primary", primary);
  html.style.setProperty("--accent", accent);
  html.style.setProperty("--accent-gradient", gradient);
  html.style.setProperty("--primary-foreground", isDark ? "#0a0a0a" : "#ffffff");
}

function clearCustomAccent() {
  const html = document.documentElement;
  html.style.removeProperty("--primary");
  html.style.removeProperty("--accent");
  html.style.removeProperty("--accent-gradient");
  html.style.removeProperty("--primary-foreground");
}

/** Sync pauseGifs atom → data-pause-gifs DOM attribute (for CSS-level control) */
export function PauseGifsSync() {
  const pauseGifs = useAtomValue(pauseGifsAtom);

  useEffect(() => {
    if (pauseGifs) {
      document.documentElement.setAttribute("data-pause-gifs", "true");
    } else {
      document.documentElement.removeAttribute("data-pause-gifs");
    }
  }, [pauseGifs]);

  return null;
}

export function AccentSync() {
  const accent = useAtomValue(accentColorAtom);
  const customHex = useAtomValue(customAccentHexAtom);

  useEffect(() => {
    const html = document.documentElement;
    if (accent === "custom") {
      html.removeAttribute("data-accent");
      const isDark = html.getAttribute("data-theme") === "dark";
      applyCustomAccent(customHex, isDark);
    } else {
      clearCustomAccent();
      if (accent === "green") {
        html.removeAttribute("data-accent");
      } else {
        html.setAttribute("data-accent", accent);
      }
    }
  }, [accent, customHex]);

  // Re-apply when theme changes (light/dark affects the derived colors)
  useEffect(() => {
    if (accent !== "custom") return;
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      applyCustomAccent(customHex, isDark);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [accent, customHex]);

  return null;
}
