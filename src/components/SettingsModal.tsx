"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { EyeOff, Search, Settings, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ENGLISH_MARKETS } from "@/lib/market/market";
import {
  type AccentColor,
  accentColorAtom,
  availableSellersAtom,
  customAccentHexAtom,
  forceEnglishAtom,
  hiddenSellersAtom,
  highResImagesAtom,
  lbGuideSeenAtom,
  marketAtom,
  pauseGifsAtom,
  settingsModalOpenAtom,
  thumbnailAspectAtom,
  toggleHiddenSellerAtom,
} from "@/store/atoms";

// ─── Toggle switch ─────────────────────────────────────────────────

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
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

const SWATCHES: { key: AccentColor; labelKey: string; color: string }[] = [
  { key: "green", labelKey: "forest", color: "#16a34a" },
  { key: "blue", labelKey: "ocean", color: "#2563eb" },
  { key: "purple", labelKey: "haze", color: "#7c3aed" },
  { key: "amber", labelKey: "sunset", color: "#d97706" },
  { key: "rose", labelKey: "cherry", color: "#e11d48" },
];

// ─── Modal ─────────────────────────────────────────────────────────

export function SettingsModal() {
  const t = useTranslations("settings.modal");
  const [open, setOpen] = useAtom(settingsModalOpenAtom);
  const [highRes, setHighRes] = useAtom(highResImagesAtom);
  const [pauseGifs, setPauseGifs] = useAtom(pauseGifsAtom);
  const [forceEnglish, setForceEnglish] = useAtom(forceEnglishAtom);
  const market = useAtomValue(marketAtom);
  const showLanguageToggle = !(ENGLISH_MARKETS as readonly string[]).includes(
    market,
  );
  const [guideSeen, setGuideSeen] = useAtom(lbGuideSeenAtom);
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

  const selectedAccentLabel = useMemo(() => {
    if (accent === "custom")
      return t("swatches.customValue", { value: customHex });
    const swatch = SWATCHES.find((s) => s.key === accent);
    return swatch ? t(`swatches.${swatch.labelKey}`) : t("swatches.default");
  }, [accent, customHex, t]);

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
    >
      <button
        type="button"
        aria-label={t("close")}
        className="absolute inset-0 cursor-default"
        onClick={close}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("label")}
        tabIndex={-1}
        className={`modal-panel modal-panel--sm z-10${closing ? " modal-panel--closing" : ""}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Settings size={18} className="text-muted" />
            <h2 className="text-base font-bold text-foreground">
              {t("label")}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="inline-flex items-center justify-center size-8 rounded-lg bg-surface hover:bg-surface-hover text-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label={t("close")}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-5">
          {/* High-res images toggle */}
          <div className="flex items-center justify-between gap-3 group">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium group-hover:text-primary transition-colors">
                {t("highResImages")}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {t("highResDescription")}
              </div>
            </div>
            <Toggle
              label={t("highResImages")}
              checked={highRes}
              onChange={setHighRes}
            />
          </div>

          {/* Pause GIFs toggle */}
          <div className="flex items-center justify-between gap-3 group">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium group-hover:text-primary transition-colors">
                {t("pauseGifs")}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {t("pauseGifsDescription")}
              </div>
            </div>
            <Toggle
              label={t("pauseGifs")}
              checked={pauseGifs}
              onChange={setPauseGifs}
            />
          </div>

          {/* Show in English toggle — only on non-English markets. Same
              underlying atom as the dropdown toggle and the inline
              ShowOriginalToggle on item overlays. Persists per-origin. */}
          {showLanguageToggle && (
            <div className="flex items-center justify-between gap-3 group">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium group-hover:text-primary transition-colors">
                  {t("showInEnglish")}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {t("showInEnglishDescription")}
                </div>
              </div>
              <Toggle
                label={t("showInEnglish")}
                checked={forceEnglish}
                onChange={setForceEnglish}
              />
            </div>
          )}

          {/* Help guides toggle */}
          <div className="flex items-center justify-between gap-3 group">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium group-hover:text-primary transition-colors">
                {t("skipGuides")}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {t("skipGuidesDesc")}
              </div>
            </div>
            <Toggle
              label={t("skipGuides")}
              checked={guideSeen}
              onChange={setGuideSeen}
            />
          </div>

          {/* Thumbnail aspect ratio */}
          <div>
            <div className="text-sm font-medium mb-1">
              {t("thumbnailShape")}
            </div>
            <div className="text-xs text-muted mb-2">
              {t("thumbnailDescription")}
            </div>
            <div className="flex gap-2">
              {(
                [
                  { key: "square", label: t("aspect.square"), ratio: "1 / 1" },
                  { key: "4:3", label: t("aspect.fourThree"), ratio: "4 / 3" },
                  { key: "3:2", label: t("aspect.threeTwo"), ratio: "3 / 2" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setThumbAspect(opt.key)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${
                    thumbAspect === opt.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted hover:text-foreground hover:bg-surface-hover"
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
            <div className="text-sm font-medium mb-2">{t("accentColour")}</div>
            <div className="flex items-center gap-2">
              {SWATCHES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setAccent(s.key)}
                  title={t(`swatches.${s.labelKey}`)}
                  className={`size-7 rounded-full transition-all cursor-pointer ring-offset-2 ring-offset-card ${
                    accent === s.key
                      ? "ring-2 ring-foreground scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: s.color }}
                />
              ))}
              {/* Custom color picker */}
              <label
                title={t("swatches.custom")}
                className={`relative size-7 rounded-full cursor-pointer transition-all ring-offset-2 ring-offset-card overflow-hidden ${
                  accent === "custom"
                    ? "ring-2 ring-foreground scale-110"
                    : "hover:scale-105"
                }`}
                style={{
                  background:
                    "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
                }}
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
              {selectedAccentLabel}
            </div>
          </div>

          {/* Hidden sellers */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <EyeOff size={14} className="text-muted" />
              <div className="text-sm font-medium">{t("hiddenSellers")}</div>
            </div>
            <div className="text-xs text-muted mb-2">
              {t("hiddenDescription")}
            </div>

            {/* Search input */}
            <div className="relative mb-2">
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="text"
                placeholder={t("searchSellers")}
                value={sellerQuery}
                onChange={(e) => setSellerQuery(e.target.value)}
                className="w-full rounded-md border border-border bg-surface py-1.5 pl-7 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors"
              />
            </div>

            {/* Suggestions dropdown */}
            {sellerSuggestions.length > 0 && (
              <div className="mb-2 max-h-32 overflow-y-auto rounded-md border border-border bg-surface">
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
                    <span className="opacity-50 text-[10px]">
                      {t("sellerItemCount", { count: s.count })}
                    </span>
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
                    title={t("unhideSeller", {
                      seller: sellerNameMap.get(id) ?? id,
                    })}
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
                {t("noSellersHidden")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
