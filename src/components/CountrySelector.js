import React from 'react';
import { useRouter } from 'next/router';
import { isHostBasedEnv } from '@/lib/market';
import FlagGB from '@/components/flags/FlagGB';
import FlagDE from '@/components/flags/FlagDE';
import FlagFR from '@/components/flags/FlagFR';
import FlagPT from '@/components/flags/FlagPT';
import FlagIT from '@/components/flags/FlagIT';

// Market configuration with flags and labels
const MARKETS = [
  { code: 'GB', Flag: FlagGB, label: 'United Kingdom', path: '/' },
  { code: 'DE', Flag: FlagDE, label: 'Germany', path: '/de' },
  { code: 'FR', Flag: FlagFR, label: 'France', path: '/fr' },
  { code: 'PT', Flag: FlagPT, label: 'Portugal', path: '/pt' },
  { code: 'IT', Flag: FlagIT, label: 'Italy', path: '/it' },
];

// Sleek market selector with country flags
export default function CountrySelector() {
  const router = useRouter();
  const pathname = typeof router?.pathname === 'string' ? router.pathname : '/';
  
  const currentMarket = React.useMemo(() => {
    if (pathname === '/de' || pathname.startsWith('/de/')) return 'DE';
    if (pathname === '/fr' || pathname.startsWith('/fr/')) return 'FR';
    if (pathname === '/pt' || pathname.startsWith('/pt/')) return 'PT';
    if (pathname === '/it' || pathname.startsWith('/it/')) return 'IT';
    return 'GB';
  }, [pathname]);

  const currentMarketData = MARKETS.find(m => m.code === currentMarket) || MARKETS[0];

  const handleChange = (marketCode) => {
    if (marketCode === currentMarket) return;
    
    const market = MARKETS.find(m => m.code === marketCode);
    if (!market) return;
    const ref = typeof router.query?.ref === 'string' ? router.query.ref : null;

    // If we're on the production domain(s), switch via subdomain to avoid locale path prefixes
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      if (isHostBasedEnv(host)) {
        const proto = typeof window !== 'undefined' ? window.location.protocol : 'https:';
        const destHost = market.code === 'GB' ? 'biggyindex.com' : `${market.code.toLowerCase()}.biggyindex.com`;
        const qp = ref ? `?ref=${encodeURIComponent(ref)}` : '';
        const url = `${proto}//${destHost}/home${qp}`;
        window.location.assign(url);
        return;
      }
    } catch {}

    // Localhost/dev: keep path-based navigation
    const query = ref ? { ref } : undefined;
    router.push({ pathname: market.path, query }, undefined, { shallow: true, scroll: false }).catch(() => {});
  };

  const CurrentFlag = currentMarketData.Flag;

  return (
    <div className="relative group">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-full border shadow-sm bg-white/85 dark:bg-gray-900/85 backdrop-blur border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-900 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 dark:focus:ring-offset-gray-950"
        aria-label={`Current market: ${currentMarketData.label}`}
        title={currentMarketData.label}
      >
        <CurrentFlag className="w-5 h-5 rounded-sm" />
        <svg 
          className="w-3 h-3 text-gray-600 dark:text-gray-400 transition-transform duration-200 group-hover:translate-y-0.5" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      <div className="absolute right-0 mt-1 z-50 min-w-[180px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-200 overflow-hidden">
        <div className="py-1">
          {MARKETS.map((market) => {
            const isActive = market.code === currentMarket;
            const MarketFlag = market.Flag;
            return (
              <button
                key={market.code}
                type="button"
                onClick={() => handleChange(market.code)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                aria-current={isActive ? 'true' : undefined}
              >
                <MarketFlag className="w-6 h-6 rounded-sm" />
                <span className="flex-1 text-left">{market.label}</span>
                {isActive && (
                  <svg 
                    className="w-4 h-4 text-emerald-600 dark:text-emerald-400" 
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
      </div>
    </div>
  );
}
