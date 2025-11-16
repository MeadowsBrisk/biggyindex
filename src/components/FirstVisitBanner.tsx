import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAtom } from 'jotai';
import { firstVisitBannerDismissedAtom } from '@/store/atoms';
import { useLocale } from '@/providers/IntlProvider';
import { hostForLocale } from '@/lib/routing';
import { X, Sparkles } from 'lucide-react';

export default function FirstVisitBanner() {
  const t = useTranslations('FirstVisitBanner');
  const { locale } = useLocale();
  const [isDismissed, setIsDismissed] = useAtom(firstVisitBannerDismissedAtom);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Small delay to ensure page has loaded before showing
    if (!isDismissed) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        setIsAnimating(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isDismissed]);

  const handleDismiss = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setIsVisible(false);
      setIsDismissed(true);
    }, 300); // Match animation duration
  };

  const handleReadMore = () => {
    const origin = hostForLocale(locale);
    const homeUrl = `${origin}/home`;
    window.location.href = homeUrl;
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[9999] flex justify-center px-4 pb-6 transition-all duration-300 ease-out pointer-events-none ${
        isAnimating ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      }`}
    >
      <div className="w-full max-w-xl pointer-events-auto">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl transition-colors duration-300 dark:border-slate-700/50 dark:bg-slate-800/95 backdrop-blur-xl">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-blue-500/5 dark:from-emerald-500/10 dark:to-blue-500/10" aria-hidden />
          
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700/50 dark:hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-800"
            aria-label={t('close')}
            title={t('close')}
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative px-6 py-5 sm:px-8 sm:py-6">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className="flex-shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-2.5 text-white shadow-lg shadow-emerald-500/30">
                <Sparkles className="h-5 w-5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pr-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1.5">
                  {t('title')}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('description').split('New to the marketplace?')[0]}
                  <br />
                  {t('description').includes('New to the marketplace?') && (
                    <span className="mt-1 inline-block">New to the marketplace?</span>
                  )}
                </p>
              </div>
            </div>

            {/* Action button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleReadMore}
                className="group inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/30 transition-all hover:bg-emerald-600 hover:shadow-lg hover:shadow-emerald-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-800"
              >
                {t('button')}
                <span aria-hidden className="text-base transition-transform group-hover:translate-x-0.5">→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
