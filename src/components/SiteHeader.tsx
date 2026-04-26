"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  Cannabis,
  ChevronDown,
  Menu,
  Settings,
  ShoppingCart,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { CountryFlag } from "@/components/icons/CountryFlag";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CATEGORIES, MARKETS } from "@/lib/constants";
import {
  basketCountAtom,
  basketOpenAtom,
  categoryAtom,
  type DisplayCurrency,
  displayCurrencyAtom,
  marketAtom,
  mobileMenuOpenAtom,
  settingsModalOpenAtom,
  subcategoryAtom,
} from "@/store/atoms";

const CURRENCY_OPTIONS: { key: DisplayCurrency; label: string }[] = [
  { key: "GBP", label: "£ GBP" },
  { key: "USD", label: "$ USD" },
];

/**
 * SiteHeader — scrolls naturally with the page (not sticky).
 * Distinct from food-agg: gradient accent bar, bold logo with glow, market flag.
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
            <MarketDropdown />
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

function MarketDropdown() {
  const [market, setMarket] = useAtom(marketAtom);
  const [displayCurrency, setDisplayCurrency] = useAtom(displayCurrencyAtom);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tMarketMenu = useTranslations("header.marketMenu");
  const tMarkets = useTranslations("markets");

  const currentMarket = MARKETS.find((m) => m.code === market) ?? MARKETS[0];

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

  const handleMarketSelect = useCallback(
    (code: string) => {
      setMarket(code);
      setOpen(false);
    },
    [setMarket],
  );

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
            <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted">
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

          {/* Currency selector */}
          <div className="p-1.5">
            <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted">
              {tMarketMenu("displayPricesIn")}
            </div>
            <div className="flex gap-1 px-1 pb-1">
              {CURRENCY_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDisplayCurrency(opt.key)}
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
        </div>
      )}
    </div>
  );
}

function MobileMenuButton() {
  const [open, setOpen] = useAtom(mobileMenuOpenAtom);
  const tMobileMenu = useTranslations("header.mobileMenu");
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="sm:hidden rounded-lg p-2 text-muted transition-colors hover:bg-surface-hover cursor-pointer"
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

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      setOpen(false);
    }
  }, [pathname, setOpen]);

  if (!open) return null;

  const links = [
    { href: "/browse", label: tNav("browse") },
    { href: "/sellers", label: tNav("sellers") },
    { href: "/reviews", label: tNav("reviews") },
  ];

  return (
    <div className="sm:hidden border-b border-[var(--border)] bg-[var(--background)]">
      <nav className="flex flex-col px-4 py-2 gap-0.5">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            prefetch={false}
            className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              pathname === link.href
                ? "text-primary bg-primary/10"
                : "text-muted hover:text-foreground hover:bg-[var(--surface-hover)]"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
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
