"use client";
import React from 'react';
import { useRouter } from 'next/router';
import FlagGB from '@/components/common/flags/FlagGB';
import FlagDE from '@/components/common/flags/FlagDE';
import FlagFR from '@/components/common/flags/FlagFR';
import FlagIT from '@/components/common/flags/FlagIT';
import FlagPT from '@/components/common/flags/FlagPT';
import { useDisplayCurrency, useLocale } from '@/providers/IntlProvider';
import { getMarketFromHost, getMarketFromPath, isHostBasedEnv, getLocaleForMarket } from '@/lib/market/market';
import { hostForLocale } from '@/lib/market/routing';

interface Market {
  code: string;
  Flag: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  currency: string;
  currencySymbol: string;
}

// Market configuration with flags and labels
const MARKETS: Market[] = [
  { code: 'GB', Flag: FlagGB, label: 'English', path: '/', currency: 'GBP', currencySymbol: '£' },
  { code: 'DE', Flag: FlagDE, label: 'Deutsch', path: '/de', currency: 'EUR', currencySymbol: '€' },
  { code: 'FR', Flag: FlagFR, label: 'Français', path: '/fr', currency: 'EUR', currencySymbol: '€' },
  { code: 'IT', Flag: FlagIT, label: 'Italiano', path: '/it', currency: 'EUR', currencySymbol: '€' },
  { code: 'PT', Flag: FlagPT, label: 'Português', path: '/pt', currency: 'EUR', currencySymbol: '€' },
];

/**
 * Combined locale and currency selector.
 * Handles market switching across subdomains or path prefixes.
 */
export default function LocaleSelector() {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const { currency, setCurrency } = useDisplayCurrency();
  const { locale } = useLocale();
  
  const pathname = typeof router?.asPath === 'string' ? router.asPath : (typeof router?.pathname === 'string' ? router.pathname : '/');

  // Derive current market from host when on biggyindex.com domains; otherwise from path.
  const currentMarket = React.useMemo(() => {
    try {
      const host = typeof window !== 'undefined' ? (window.location?.hostname || '') : '';
      if (isHostBasedEnv(host)) return getMarketFromHost(host);
    } catch {}
    // Path-based fallback (localhost/dev or previews)
    const m = getMarketFromPath(pathname || '/');
    return m;
  }, [pathname]);

  const currentMarketData = MARKETS.find(m => m.code === currentMarket) || MARKETS[0];
  const CurrentFlag = currentMarketData.Flag;
  
  const localeCurrency = React.useMemo(() => {
    const l = (locale || 'en-GB').toLowerCase();
    if (l.startsWith('de') || l.startsWith('fr') || l.startsWith('it') || l.startsWith('pt')) return 'EUR';
    return 'GBP';
  }, [locale]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleMarketChange = (marketCode: string) => {
    if (marketCode === currentMarket) return;
    
    const market = MARKETS.find(m => m.code === marketCode);
    if (!market) return;
    
    const ref = typeof router.query?.ref === 'string' ? router.query.ref : null;
    const query = ref ? { ref } : undefined;

    // If host-based environment, switch origins (e.g., de.biggyindex.com -> pt.biggyindex.com)
    try {
      const host = typeof window !== 'undefined' ? (window.location?.hostname || '') : '';
      if (isHostBasedEnv(host)) {
        const targetLocale = getLocaleForMarket(marketCode as any);
        const origin = hostForLocale(targetLocale);
        const url = origin + (ref ? `/?ref=${encodeURIComponent(ref)}` : '/');
        // Use full navigation across origin
        if (typeof window !== 'undefined') {
          window.location.assign(url);
        } else {
          router.push(url).catch(() => {});
        }
        setIsOpen(false);
        return;
      }
    } catch {}

    // Path-based navigation (localhost/dev)
    router.push({ pathname: market.path, query }, undefined, { shallow: true, scroll: false }).catch(() => {});
    setIsOpen(false);
  };

  const toggleCurrency = () => {
    const newCurrency = currency === 'USD' ? localeCurrency : 'USD';
    setCurrency(newCurrency as any);
  };

  const displayCurrency = currency === 'USD' ? '$ USD' : (localeCurrency === 'EUR' ? '€ EUR' : '£ GBP');

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border shadow-sm bg-white dark:bg-[#0f1725] backdrop-blur-sm border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-[#141d30] transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 dark:focus:ring-offset-gray-950"
        aria-label={`${currentMarketData.label}, ${displayCurrency}`}
        aria-expanded={isOpen}
      >
        <CurrentFlag className="w-4 h-4 rounded-sm flex-shrink-0" />
        <span className="text-[10px] lg:text-[13px] font-semibold text-gray-800 dark:text-gray-100">
          {displayCurrency}
        </span>
        <svg 
          className={`w-2.5 h-2.5 text-gray-600 dark:text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 z-50 min-w-[220px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
          {/* Markets section */}
          <div className="py-1">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Market
            </div>
            {MARKETS.map((market) => {
              const isActive = market.code === currentMarket;
              const MarketFlag = market.Flag;
              return (
                <button
                  key={market.code}
                  type="button"
                  onClick={() => handleMarketChange(market.code)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <MarketFlag className="w-6 h-6 rounded-sm flex-shrink-0" />
                  <span className="flex-1 text-left">{market.label}</span>
                  {isActive && (
                    <svg 
                      className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" 
                      fill="currentColor" 
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700" />

          {/* Currency section */}
          <div className="py-1">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Currency
            </div>
            <button
              type="button"
              onClick={toggleCurrency}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="flex-1 text-left">
                {currency === 'USD' 
                  ? `Switch to ${localeCurrency === 'EUR' ? '€ EUR' : '£ GBP'}`
                  : 'Switch to $ USD'
                }
              </span>
              <svg 
                className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
