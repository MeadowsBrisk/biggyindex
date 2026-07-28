"use client";

import { ChevronDown, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { VERIFY_LINKS } from "@/lib/verify-links";

/**
 * Verification links — LittleBiggy's canonical / authenticity pages.
 *
 * This is a user-protection affordance, not a promo badge: phishing clones of
 * LittleBiggy are a real risk, so these are the pages a user checks to confirm
 * they're in the real ecosystem (PGP-signed announcements, verified mirror
 * domains, the onion address) and to find the marketplace when it's down.
 * Our own /littlebiggy-status uptime page belongs in the same cluster.
 *
 * Two presentations, one link list:
 *  • <VerifyDropdown>    — desktop (>= sm) popover in the header control cluster
 *  • <MobileVerifyLinks> — a section inside the mobile hamburger drawer
 *
 * The list itself lives in `@/lib/verify-links` (a plain, non-client module)
 * so the Server-Component <VerifyCard> on /littlebiggy-status renders the very
 * same four entries without this file's client graph.
 */

/**
 * Desktop popover.
 *
 * Spacing rhythm (deliberate — no 0px gaps):
 *   panel padding      p-1.5           (6px)
 *   section label      px-2 pt-1 mb-1  (4px gap down to the first row)
 *   rows list          gap-0.5         (2px between rows)
 *   row padding        px-2 py-2       (8/8px) → 54.5px tall (two-line label)
 *   icon → text gap    gap-2.5    (10px)
 *   label → desc gap   mt-0.5     (2px)
 */
export function VerifyDropdown() {
  const t = useTranslations("header.verify");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click (mirrors <MarketDropdown>).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
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
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-hover cursor-pointer"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("trigger")}
        title={t("trigger")}
      >
        <ShieldCheck size={18} className="text-muted" />
        {/* Text only from `xl`. Between md and xl the header row is already
            tight (the /browse category nav alone overflows it at 1024px), so
            the control degrades to icon + chevron; the accessible name comes
            from aria-label/title either way. */}
        <span className="hidden xl:inline whitespace-nowrap text-xs text-muted">
          {t("trigger")}
        </span>
        <ChevronDown
          size={12}
          className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("heading")}
          className="absolute right-0 top-full mt-1 z-[100] w-64 rounded-xl border border-[var(--border)] bg-card shadow-xl"
        >
          <div className="p-1.5">
            {/* `mb-1` (not py-1) so the label→first-row separation is a real
                measurable 4px gap rather than collapsed padding. */}
            <div className="px-2 pt-1 mb-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted">
              {t("heading")}
            </div>
            <div className="flex flex-col gap-0.5">
              {VERIFY_LINKS.map(({ key, href, external, Icon }) => {
                const label = t(`${key}.label`);
                const description = t(`${key}.description`);
                const body = (
                  <>
                    <Icon size={16} className="mt-0.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {label}
                        </span>
                        {external && (
                          <ExternalLink
                            size={11}
                            className="shrink-0 text-muted"
                          />
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted">
                        {description}
                      </span>
                    </span>
                  </>
                );
                const className =
                  "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left text-muted transition-colors hover:bg-surface-hover hover:text-foreground";

                if (!external) {
                  return (
                    <Link
                      key={key}
                      role="menuitem"
                      href={href}
                      prefetch={false}
                      onClick={close}
                      className={className}
                    >
                      {body}
                    </Link>
                  );
                }

                return (
                  <a
                    key={key}
                    role="menuitem"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={close}
                    aria-label={`${label} ${t("opensInNewTab")}`}
                    className={className}
                  >
                    {body}
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Mobile drawer section.
 *
 * Spacing rhythm: the section itself is one child of the drawer's `gap-7`
 * (28px) column, so it is separated from the nav/market blocks by 28px.
 * Inside: eyebrow `px-3 mb-2` (8px to the first row), rows `gap-1` (4px),
 * each row `px-3 py-2.5` with `min-h-12` (48px floor; they measure 58px with
 * the two-line label) for a comfortable tap target.
 *
 * Rows are BORDERLESS and sit directly on `--background` — the same primitive
 * as the drawer's nav rows and the desktop popover's rows. Borders mark
 * containers, never list rows (a bordered row on `bg-surface` re-created a
 * "card stack" reading that made this list look like a different species from
 * the nav above it).
 */
export function MobileVerifyLinks({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("header.verify");

  return (
    <nav aria-labelledby="menu-verify-heading">
      {/* `mb-2` (not pb-2) so the eyebrow→first-row gap is a real 8px gap. */}
      <h2
        id="menu-verify-heading"
        className="mb-2 px-3 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted"
      >
        {t("heading")}
      </h2>

      <div className="flex flex-col gap-1">
        {VERIFY_LINKS.map(({ key, href, external, Icon }) => {
          const label = t(`${key}.label`);
          const description = t(`${key}.description`);
          const body = (
            <>
              <Icon size={18} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-medium leading-5 text-foreground">
                    {label}
                  </span>
                  {external && (
                    <ExternalLink
                      size={12}
                      aria-hidden="true"
                      className="shrink-0 text-muted"
                    />
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted">
                  {description}
                </span>
              </span>
            </>
          );
          const className =
            "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]";

          if (!external) {
            return (
              <Link
                key={key}
                href={href}
                prefetch={false}
                onClick={onNavigate}
                className={className}
              >
                {body}
              </Link>
            );
          }

          return (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onNavigate}
              aria-label={`${label} ${t("opensInNewTab")}`}
              className={className}
            >
              {body}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
