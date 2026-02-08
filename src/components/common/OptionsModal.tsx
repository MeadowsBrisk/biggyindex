"use client";
import React from 'react';
import { useAtom } from 'jotai';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings } from 'lucide-react';
import cn from '@/lib/core/cn';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useLocale, useForceEnglish } from '@/providers/IntlProvider';
import { useTranslations } from 'next-intl';
import {
  optionsModalOpenAtom,
  highResImagesAtom,
  lbGuideSeenAtom,
} from '@/store/atoms';

export default function OptionsModal(): React.ReactElement {
  const [open, setOpen] = useAtom(optionsModalOpenAtom);
  const [highResImages, setHighResImages] = useAtom(highResImagesAtom);
  const [guideSeen, setGuideSeen] = useAtom(lbGuideSeenAtom);
  // Use the IntlProvider's forceEnglish context (directly affects translations)
  const { forceEnglish, setForceEnglish } = useForceEnglish();
  const { locale } = useLocale();
  
  // Show force English toggle only for non-GB markets
  const isNonGBMarket = locale !== 'en-GB';
  
  let t: any;
  try { t = useTranslations('Options'); } catch { t = (k: string) => k; }
  
  useBodyScrollLock(open);
  
  const handleClearData = () => {
    if (typeof window === 'undefined') return;
    
    const confirmed = window.confirm(t('clearDataConfirm'));
    if (!confirmed) return;
    
    // Clear all localStorage
    try {
      window.localStorage.clear();
    } catch {}
    
    // Reload to reset state
    window.location.reload();
  };
  
  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.div
          key="options-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[150] bg-black/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            key="options-modal"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
            className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2.5">
              <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('title')}</h2>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              aria-label={t('close')}
            >
              ×
            </button>
          </div>
          
          {/* Content */}
          <div className="px-5 py-4 space-y-4">
            {/* High-res images toggle */}
            <label className="flex items-center justify-between gap-3 cursor-pointer group">
              <div className="flex-1">
                <div className="font-medium text-sm text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {t('highResImages')}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('highResImagesDesc')}
                </div>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={highResImages}
                  onChange={(e) => setHighResImages(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={cn(
                  "w-11 h-6 rounded-full transition-colors",
                  "bg-gray-200 dark:bg-gray-700",
                  "peer-checked:bg-blue-500 dark:peer-checked:bg-blue-600",
                  "peer-focus:ring-2 peer-focus:ring-blue-500/40"
                )} />
                <div className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                  "peer-checked:translate-x-5"
                )} />
              </div>
            </label>
            
            {/* Force English toggle (non-GB markets only) */}
            {isNonGBMarket && (
              <label className="flex items-center justify-between gap-3 cursor-pointer group">
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {t('forceEnglish')}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {t('forceEnglishDesc')}
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={forceEnglish}
                    onChange={(e) => setForceEnglish(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={cn(
                    "w-11 h-6 rounded-full transition-colors",
                    "bg-gray-200 dark:bg-gray-700",
                    "peer-checked:bg-blue-500 dark:peer-checked:bg-blue-600",
                    "peer-focus:ring-2 peer-focus:ring-blue-500/40"
                  )} />
                  <div className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                    "peer-checked:translate-x-5"
                  )} />
                </div>
              </label>
            )}
            
            {/* Skip help guides toggle */}
            <label className="flex items-center justify-between gap-3 cursor-pointer group">
              <div className="flex-1">
                <div className="font-medium text-sm text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {t('skipGuides')}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('skipGuidesDesc')}
                </div>
              </div>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={guideSeen}
                  onChange={(e) => setGuideSeen(e.target.checked)}
                  className="sr-only peer"
                />
                <div className={cn(
                  "w-11 h-6 rounded-full transition-colors",
                  "bg-gray-200 dark:bg-gray-700",
                  "peer-checked:bg-blue-500 dark:peer-checked:bg-blue-600",
                  "peer-focus:ring-2 peer-focus:ring-blue-500/40"
                )} />
                <div className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                  "peer-checked:translate-x-5"
                )} />
              </div>
            </label>
            
            {/* Divider */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              {/* Clear data button */}
              <button
                onClick={handleClearData}
                className="w-full px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
              >
                {t('clearData')}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                {t('clearDataHint')}
              </p>
            </div>
          </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
