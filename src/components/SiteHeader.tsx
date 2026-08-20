"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  Cannabis,
  ChevronDown,
  Compass,
  Menu,
  Settings,
  ShoppingCart,
  Star,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { CountryFlag } from "@/components/icons/CountryFlag";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileVerifyLinks, VerifyDropdown } from "@/components/VerifyLinks";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { CATEGORIES, MARKETS } from "@/lib/constants";
import {
  ENGLISH_MARKETS,
  isHostBasedEnv,
  type MarketCode,
  marketToHost,
  marketToLocale,
} from "@/lib/market/market";
import {
  basketCountAtom,
  basketOpenAtom,
  categoryAtom,
  type DisplayCurrency,
  displayCurrencyAtom,
  displayCurrencyOverrideAtom,
  forceEnglishAtom,
  marketAtom,
  mobileMenuOpenAtom,
  settingsModalOpenAtom,
  subcategoryAtom,
} from "@/store/atoms";

/** All currencies the dropdown can offer, with display labels. */
const CURRENCY_LABELS: Record<DisplayCurrency, string> = {
  GBP: "£ GBP",
  EUR: "€ EUR",
  USD: "$ USD",
  CZK: "Kč CZK",
  PLN: "zł PLN",
};

/** Map a market code to its native currency for the dropdown header. */
function nativeCurrencyForMarket(market: string): DisplayCurrency {
  if (market === "GB") return "GBP";
  if (market === "CZ") return "CZK";
  if (market === "PL") return "PLN";
  return "EUR"; // IE, DE, FR, PT, IT, ES, GR
}

/**
 * Currency options for a market's dropdown: native currency first (the
 * visual default), then GBP and USD as alternatives, deduped.
 */
function currencyOptionsFor(
  market: string,
): Array<{ key: DisplayCurrency; label: string }> {
  const native = nativeCurrencyForMarket(market);
  const seen = new Set<DisplayCurrency>();
  const out: Array<{ key: DisplayCurrency; label: string }> = [];
  for (const key of [native, "GBP" as const, "USD" as const]) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: CURRENCY_LABELS[key] });
  }
  return out;
}

/**
 * SiteHeader — scrolls naturally with the page (not sticky).
 * Gradient accent bar, bold logo with glow, market flag.
 */
export function SiteHeader() {
  const [category, setCategory] = useAtom(categoryAtom);
  const setSubcategory = useSetAtom(subcategoryAtom);
  const pathname = usePathname();
  const isBrowse = pathname === "/browse";
  const tNav = useTranslations("nav");
  const tCategories = useTranslations("categories");

  const handleCategoryClick = (cat: string) => {
    setCategory(cat);
    setSubcategory([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header data-tour="header">
      {/* Gradient accent bar — BiggyIndex signature */}
      <div
        className="h-[3px]"
        style={{ background: "var(--accent-gradient)" }}
      />

      <div className="border-b border-[var(--border)] bg-[var(--background)]">
        <div className="mx-auto flex h-14 items-center justify-between px-4">
          {/* Logo — bold with subtle green glow */}
          <div className="flex items-center gap-4">
            <Link
              href="/"
              prefetch={false}
              className="group flex items-center gap-2.5"
            >
              <BrandLogo />
            </Link>

            {/* Core nav links — always visible */}
            <nav className="hidden sm:flex items-center gap-0.5">
              <HeaderNavLink href="/browse" active={isBrowse}>
                {tNav("browse")}
              </HeaderNavLink>
              <HeaderNavLink href="/sellers" active={pathname === "/sellers"}>
                {tNav("sellers")}
              </HeaderNavLink>
              <HeaderNavLink href="/reviews" active={pathname === "/reviews"}>
                {tNav("reviews")}
              </HeaderNavLink>
            </nav>
          </div>

          {/* Desktop category nav — only show on browse page */}
          {isBrowse && (
            <nav className="hidden items-center gap-0.5 lg:flex">
              <HeaderNavLink
                active={category === "All"}
                onClick={() => handleCategoryClick("All")}
              >
                {tCategories("all")}
              </HeaderNavLink>
              {CATEGORIES.slice(0, 8).map((cat) => (
                <HeaderNavLink
                  key={cat}
                  active={category === cat}
                  onClick={() => handleCategoryClick(cat)}
                >
                  {tCategories(cat)}
                </HeaderNavLink>
              ))}
            </nav>
          )}

          {/* Right side: basket + market/currency dropdown + settings + theme toggle + mobile menu */}
          <div className="flex items-center gap-2">
            <BasketButton />
            {/* Verification links (canonical LB pages + our status page).
                `md` and up, not `sm`: at 640px the longest translated nav
                labels already fill the bar, so anything extra at `sm`
                overflows the header. Below `md` the drawer carries the list. */}
            <span className="hidden md:block">
              <VerifyDropdown />
            </span>
            {/* Market/locale flag dropdown — desktop only; on mobile it lives
                in the hamburger drawer (see <MobileNav>) to save header space. */}
            <span className="hidden sm:block">
              <MarketDropdown />
            </span>
            <SettingsButton />
            <ThemeToggle />
            <MobileMenuButton />
          </div>
        </div>
      </div>

      {/* Mobile nav drawer */}
      <MobileNav />
    </header>
  );
}

/**
 * Brand logo (icon + wordmark). Shared by the site header and the mobile
 * drawer's top bar so the two are pixel-identical. Callers must wrap it in a
 * `group` element — the icon's hover rotate keys off that group.
 */
function BrandLogo() {
  return (
    <>
      <div className="relative">
        <Cannabis
          size={26}
          className="text-primary transition-transform group-hover:rotate-12"
        />
        <div className="absolute inset-0 blur-md opacity-30 bg-primary rounded-full" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold tracking-tight text-foreground">
          Biggy
        </span>
        <span className="text-xl font-bold tracking-tight text-primary">
          Index
        </span>
      </div>
    </>
  );
}

function SettingsButton() {
  const setOpen = useSetAtom(settingsModalOpenAtom);
  const tNav = useTranslations("nav");
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-hover cursor-pointer"
      aria-label={tNav("settings")}
    >
      <Settings size={18} />
    </button>
  );
}

function BasketButton() {
  const count = useAtomValue(basketCountAtom);
  const setOpen = useSetAtom(basketOpenAtom);
  const tBasket = useTranslations("header.basket");
  // Defer rendering until client mount to avoid hydration mismatch
  // (atomWithStorage reads localStorage which differs from SSR default)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || count === 0) return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="relative inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1.5 text-sm font-semibold text-foreground transition-all hover:bg-surface cursor-pointer"
      aria-label={tBasket("items", { count })}
    >
      <ShoppingCart size={15} />
      <span className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
        {count}
      </span>
    </button>
  );
}

/**
 * Shared market-switch navigation: given a market code, navigate to the
 * equivalent URL on that market's origin (production) or locale path prefix
 * (dev). Does NOT write `marketAtom` — the atom is hydrated per-origin on
 * load (see <MarketHydrate>). Used by both the desktop dropdown and the
 * mobile drawer so the routing logic lives in one place.
 */
function useMarketSelect(currentMarket: string, onNavigate?: () => void) {
  return useCallback(
    (code: string) => {
      onNavigate?.();
      // Already on the picked market — nothing to do.
      if (code === currentMarket) return;

      // In production each market is its own subdomain (see `domains` in
      // src/i18n/routing.ts and `marketToHost`). Flipping the atom alone
      // can't change the SSR-rendered data — proxy.ts pins the locale per
      // request from the host — so a real navigation is required.
      if (typeof window === "undefined") return;
      const path = window.location.pathname;
      const search = window.location.search;
      const hash = window.location.hash;

      if (isHostBasedEnv(window.location.hostname)) {
        // Cross-origin → full page load. Preserve path + query + hash so
        // the user lands on the equivalent URL on the new market's host.
        const targetHost = marketToHost(code as MarketCode);
        window.location.assign(`https://${targetHost}${path}${search}${hash}`);
        return;
      }

      // Dev / staging fallback: routing.ts disables domains outside
      // production, so locales live under path prefixes. Strip any
      // existing locale prefix and replace it with the target one.
      const targetLocale = marketToLocale(code as MarketCode);
      const stripped = path.replace(
        /^\/(en-GB|en-IE|de-DE|fr-FR|pt-PT|it-IT|es-ES|el-GR|cs-CZ|pl-PL)(?=\/|$)/,
        "",
      );
      const nextPath =
        targetLocale === "en-GB"
          ? stripped || "/"
          : `/${targetLocale}${stripped || ""}`;
      window.location.assign(`${nextPath}${search}${hash}`);
    },
    [currentMarket, onNavigate],
  );
}

function MarketDropdown() {
  const market = useAtomValue(marketAtom);
  // Effective (derived) currency highlights the active button; the override
  // atom persists an explicit pick. Reading the derived atom means an unset
  // override still highlights the market's native currency.
  const displayCurrency = useAtomValue(displayCurrencyAtom);
  const setDisplayCurrencyOverride = useSetAtom(displayCurrencyOverrideAtom);
  const [forceEnglish, setForceEnglish] = useAtom(forceEnglishAtom);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tMarketMenu = useTranslations("header.marketMenu");
  const tMarkets = useTranslations("markets");

  const currentMarket = MARKETS.find((m) => m.code === market) ?? MARKETS[0];
  const currencyOptions = currencyOptionsFor(market);
  const showLanguageToggle = !(ENGLISH_MARKETS as readonly string[]).includes(
    market,
  );

  // Close on outside click
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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const closeMenu = useCallback(() => setOpen(false), []);
  const handleMarketSelect = useMarketSelect(market, closeMenu);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-hover cursor-pointer"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <CountryFlag code={currentMarket.code} size={18} />
        <span className="hidden sm:inline text-xs text-muted">
          {currentMarket.code}
        </span>
        <ChevronDown
          size={12}
          className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-[100] w-56 rounded-xl border border-[var(--border)] bg-card shadow-xl">
          {/* Market list */}
          <div className="p-1.5">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted">
              {tMarketMenu("market")}
            </div>
            {MARKETS.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => handleMarketSelect(m.code)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors cursor-pointer ${
                  market === m.code
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                <CountryFlag code={m.code} size={18} />
                <span className="flex-1 text-left">{tMarkets(m.code)}</span>
                <span className="text-xs opacity-60">
                  {m.currencySymbol} {m.currency}
                </span>
              </button>
            ))}
          </div>

          {/* Currency divider */}
          <div className="mx-2 border-t border-[var(--border)]" />

          {/* Currency selector — options are derived per-market so the
              local currency is always offered alongside GBP and USD. */}
          <div className="p-1.5">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted">
              {tMarketMenu("displayPricesIn")}
            </div>
            <div className="flex gap-1 px-1 pb-1">
              {currencyOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDisplayCurrencyOverride(opt.key)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    displayCurrency === opt.key
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-surface border border-[var(--border)] text-muted hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="px-2 text-[10px] text-muted">
              {tMarketMenu("approximateWhenConverted")}
            </div>
          </div>

          {/* Language toggle — non-English markets only. Flips the UI to the
              English source copy; persists per-origin via forceEnglishAtom. */}
          {showLanguageToggle && (
            <>
              <div className="mx-2 border-t border-[var(--border)]" />
              <div className="p-1.5">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted">
                  {tMarketMenu("language")}
                </div>
                <div className="flex gap-1 px-1 pb-1">
                  <button
                    type="button"
                    onClick={() => setForceEnglish(false)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      !forceEnglish
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "bg-surface border border-[var(--border)] text-muted hover:text-foreground"
                    }`}
                  >
                    {tMarkets(market)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForceEnglish(true)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      forceEnglish
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "bg-surface border border-[var(--border)] text-muted hover:text-foreground"
                    }`}
                  >
                    {tMarketMenu("english")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MobileMenuButton() {
  const [open, setOpen] = useAtom(mobileMenuOpenAtom);
  const tMobileMenu = useTranslations("header.mobileMenu");
  // `after:-inset-[5px]` grows the hit area from 34px to 44px without moving
  // any computed box. The drawer's close button uses the identical trick so
  // the X lands exactly where the hamburger was.
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="relative sm:hidden rounded-lg p-2 text-muted transition-colors hover:bg-surface-hover cursor-pointer after:absolute after:-inset-[5px] after:content-['']"
      aria-label={open ? tMobileMenu("close") : tMobileMenu("open")}
    >
      {open ? <X size={18} /> : <Menu size={18} />}
    </button>
  );
}

function MobileNav() {
  const [open, setOpen] = useAtom(mobileMenuOpenAtom);
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const tNav = useTranslations("nav");
  const tMobileMenu = useTranslations("header.mobileMenu");
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Animated dismiss: play the fade-out, then unmount. Mirrors SettingsModal.
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setOpen(false);
    }, 180);
  }, [setOpen]);

  // Safety net only: SiteHeader remounts per route, so the ref re-inits and
  // this comparison rarely fires. Nav-link taps close the drawer directly —
  // do not rely on this instead.
  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      setClosing(false);
      setOpen(false);
    }
  }, [pathname, setOpen]);

  // Escape closes (with the exit animation).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, close]);

  // Lock the page behind the full-screen overlay.
  useBodyScrollLock(open);

  // Move focus into the dialog on open (matches SettingsModal).
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  // Icons already spoken for elsewhere in the UI: `Store` (LittleBiggy verify
  // row), `LayoutGrid` (Toolbar grid view), `Heart` (bookmarks).
  const links = [
    { href: "/browse", label: tNav("browse"), Icon: Compass },
    { href: "/sellers", label: tNav("sellers"), Icon: Users },
    { href: "/reviews", label: tNav("reviews"), Icon: Star },
  ];

  return (
    <div
      ref={panelRef}
      className={`menu-modal sm:hidden${closing ? " menu-modal--closing" : ""}`}
      style={{ zIndex: 150 }}
      role="dialog"
      aria-modal="true"
      aria-label={tMobileMenu("label")}
      tabIndex={-1}
    >
      {/* Gradient accent bar — the drawer is a fixed overlay at top:0, so it
          must replicate the header's 3px bar or its logo and bottom border sit
          3px above the header's. */}
      <div
        className="h-[3px] shrink-0"
        style={{ background: "var(--accent-gradient)" }}
      />
      {/* Top bar — mirrors the site header (height, padding, shared logo) so the
          close button lands exactly where the hamburger was. */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <Link
          href="/"
          prefetch={false}
          onClick={() => setOpen(false)}
          className="group flex items-center gap-2.5"
        >
          <BrandLogo />
        </Link>
        {/* `after:-inset-[5px]` → 44px hit area with zero layout change, so the
            X stays pixel-aligned with the hamburger it replaced. */}
        <button
          type="button"
          onClick={close}
          className="relative rounded-lg p-2 text-muted transition-colors hover:bg-surface-hover cursor-pointer after:absolute after:-inset-[5px] after:content-['']"
          aria-label={tMobileMenu("close")}
        >
          <X size={18} />
        </button>
      </div>

      {/* Body — one list, one row primitive, labelled groups. Keep it
          top-anchored and full-bleed (`px-1`, no `max-w-sm`, no
          `justify-center`): vertical centring makes the top gap depend on
          content height, and a centred fixed-width column pushes row icons out
          of line with the top bar's logo. As written, every row icon sits
          16px (4px column pad + 12px row pad) from the viewport edge. */}
      <div className="menu-modal-body flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full flex-col gap-7 px-1 pt-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
          <nav aria-labelledby="menu-nav-heading">
            {/* `mb-2` (not pb-2) so the eyebrow→first-row gap is a real 8px. */}
            <h2
              id="menu-nav-heading"
              className="mb-2 px-3 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted"
            >
              {tMobileMenu("label")}
            </h2>
            <div className="flex flex-col gap-1">
              {links.map(({ href, label, Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    prefetch={false}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]"
                    }`}
                  >
                    {/* Gradient rail — the drawer's answer to HeaderNavLink's
                        active underline, and a required non-colour cue:
                        text-primary alone is only ~3.3:1 on light. */}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full"
                        style={{ background: "var(--accent-gradient)" }}
                      />
                    )}
                    <Icon
                      size={18}
                      className={
                        active ? "shrink-0 text-primary" : "shrink-0 text-muted"
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-base font-semibold leading-6">
                      {label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Verification links — canonical LittleBiggy pages plus our status
              page; same list as the desktop <VerifyDropdown>. Sits in the
              drawer's gap-7 rhythm, so 28px clear of its neighbours. No
              divider rule: the eyebrow headings carry the grouping. */}
          <MobileVerifyLinks onNavigate={() => setOpen(false)} />

          {/* Market / language switcher — collapsed behind a single trigger so
              the drawer isn't dominated by the market list. Renders its own
              `gap-7` wrapper so Market and Language sit on the same 28px
              rhythm as the groups above. */}
          <MobileMarketSwitch onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </div>
  );
}

/**
 * Market + language switcher for the mobile drawer. Shares the market
 * navigation and `forceEnglishAtom` logic with the desktop <MarketDropdown>;
 * currency picking stays desktop-only to keep the drawer compact.
 *
 * The market list is collapsed behind a trigger showing the current market so
 * the drawer isn't dominated by the full market list. The 2-button language
 * toggle (non-English markets only) stays visible below.
 */
function MobileMarketSwitch({ onNavigate }: { onNavigate: () => void }) {
  const market = useAtomValue(marketAtom);
  const [forceEnglish, setForceEnglish] = useAtom(forceEnglishAtom);
  const tMarketMenu = useTranslations("header.marketMenu");
  const tMarkets = useTranslations("markets");
  const [expanded, setExpanded] = useState(false);

  const handleMarketSelect = useMarketSelect(market, onNavigate);
  const showLanguageToggle = !(ENGLISH_MARKETS as readonly string[]).includes(
    market,
  );
  const current = MARKETS.find((m) => m.code === market) ?? MARKETS[0];

  return (
    // Market and Language are two sibling groups on the drawer's 28px rhythm.
    <div className="flex flex-col gap-7">
      {/* biome-ignore lint/a11y/useSemanticElements: <fieldset> carries UA
          border/padding/margin that would break the drawer's gap-only rhythm,
          and these are labelled groups of links/buttons, not form controls. */}
      <div role="group" aria-labelledby="menu-market-heading">
        <h2
          id="menu-market-heading"
          className="mb-2 px-3 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted"
        >
          {tMarketMenu("market")}
        </h2>

        {/* Collapsed trigger — current market; tap to reveal the full list.
            Borderless, like every other list row in the drawer. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-foreground transition-colors hover:bg-[var(--surface-hover)] active:bg-[var(--surface-hover)]"
        >
          <CountryFlag code={current.code} size={18} />
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-5">
            {tMarkets(current.code)}
          </span>
          <span className="shrink-0 text-[11px] leading-4 text-muted">
            {current.currencySymbol} {current.currency}
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        {/* Expanded market list. */}
        {expanded && (
          <div className="menu-reveal mt-1 flex flex-col gap-1">
            {MARKETS.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => handleMarketSelect(m.code)}
                aria-current={market === m.code ? "true" : undefined}
                className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                  market === m.code
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:bg-[var(--surface-hover)] hover:text-foreground"
                }`}
              >
                <CountryFlag code={m.code} size={18} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-5">
                  {tMarkets(m.code)}
                </span>
                <span className="shrink-0 text-[11px] leading-4 opacity-70">
                  {m.currencySymbol} {m.currency}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Language toggle — non-English markets only, matching the desktop
          dropdown; persists per-origin via forceEnglishAtom. It is a control,
          not a list, so the container carries the single border and the
          segments carry none. */}
      {showLanguageToggle && (
        // biome-ignore lint/a11y/useSemanticElements: see the Market group above.
        <div role="group" aria-labelledby="menu-language-heading">
          <h2
            id="menu-language-heading"
            className="mb-2 px-3 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-muted"
          >
            {tMarketMenu("language")}
          </h2>
          {/* `mx-1` lines the control's outer edge up with the row hover
              fills, not with the 16px text inset. */}
          <div className="mx-1 flex gap-1 rounded-xl border border-[var(--border)] bg-surface p-1">
            <button
              type="button"
              onClick={() => setForceEnglish(false)}
              aria-pressed={!forceEnglish}
              className={`min-h-11 flex-1 cursor-pointer truncate rounded-lg px-3 text-[13px] font-medium transition-colors ${
                !forceEnglish
                  ? "bg-primary/15 text-primary"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {tMarkets(market)}
            </button>
            <button
              type="button"
              onClick={() => setForceEnglish(true)}
              aria-pressed={forceEnglish}
              className={`min-h-11 flex-1 cursor-pointer truncate rounded-lg px-3 text-[13px] font-medium transition-colors ${
                forceEnglish
                  ? "bg-primary/15 text-primary"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {tMarketMenu("english")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderNavLink({
  active,
  onClick,
  href,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const className = `relative rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer ${
    active ? "text-primary" : "text-muted hover:text-foreground"
  }`;

  if (href) {
    return (
      <Link href={href} prefetch={false} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
      {active && (
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-4/5 rounded-full"
          style={{ background: "var(--accent-gradient)" }}
        />
      )}
    </button>
  );
}
