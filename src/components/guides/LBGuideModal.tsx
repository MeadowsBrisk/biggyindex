import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { lbGuideSeenAtom, lbGuideModalOpenAtom, lbGuidePendingUrlAtom, lbGuidePendingMetaAtom } from "@/store/atoms";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { EMBASSY_LINKS } from "@/lib/market/embassyLinks";
import { useLocale } from "@/providers/IntlProvider";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { trackOutboundClick } from "@/lib/tracking/outbound";

const STEPS = ["country", "buy", "account", "checkout"] as const;

const STEP_ICONS: Record<string, React.ReactNode> = {
  country: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A8.966 8.966 0 013 12c0-1.97.633-3.793 1.708-5.273" />
    </svg>
  ),
  buy: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
    </svg>
  ),
  account: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  checkout: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export default function LBGuideModal() {
  const [isOpen, setIsOpen] = useAtom(lbGuideModalOpenAtom);
  const [seen, setSeen] = useAtom(lbGuideSeenAtom);
  const [pendingUrl, setPendingUrl] = useAtom(lbGuidePendingUrlAtom);
  const [pendingMeta, setPendingMeta] = useAtom(lbGuidePendingMetaAtom);
  const [dontShow, setDontShow] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { locale } = useLocale();
  const localePrefix = (locale || "en-GB").split("-")[0].toLowerCase();
  const embassyUrl = EMBASSY_LINKS[localePrefix];

  const t = useTranslations("LBGuide");

  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while modal is open
  useBodyScrollLock(isOpen);

  const handleContinue = useCallback(() => {
    if (dontShow) setSeen(true);
    setIsOpen(false);
    if (pendingUrl) {
      // Track the outbound click that was intercepted by the guide
      // Market is auto-detected by trackOutboundClick
      trackOutboundClick({
        id: pendingMeta?.id || extractIdFromUrl(pendingUrl),
        type: 'item',
        url: pendingUrl,
        name: pendingMeta?.name,
        category: pendingMeta?.category,
      });
      window.open(pendingUrl, "_blank", "noopener,noreferrer");
      setPendingUrl(null);
      setPendingMeta(null);
    }
  }, [dontShow, pendingUrl, pendingMeta, setSeen, setIsOpen, setPendingUrl, setPendingMeta]);

  const handleBackdropClick = useCallback(() => {
    setIsOpen(false);
    setPendingUrl(null);
    setPendingMeta(null);
  }, [setIsOpen, setPendingUrl, setPendingMeta]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { handleBackdropClick(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, handleBackdropClick]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleBackdropClick}
          />

          {/* Modal */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("title")}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleBackdropClick}
          >
            <motion.div
              className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700/50 overflow-hidden"
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              transition={{ duration: 0.25, ease: [.22, 1, .36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 pt-6 pb-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {t("title")}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t("subtitle")}
                </p>
              </div>

              {/* Steps */}
              <div className="px-6 py-4 space-y-3">
                {STEPS.map((step, i) => (
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08, duration: 0.3 }}
                    className="flex gap-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4 border border-gray-100 dark:border-gray-700/40"
                  >
                    <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                      {STEP_ICONS[step]}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {t(`steps.${step}.title`)}
                      </h3>
                      <p className="mt-0.5 text-[13px] leading-snug text-gray-600 dark:text-gray-400">
                        {t(`steps.${step}.text`)}
                      </p>
                    </div>
                  </motion.div>
                ))}

                {/* Embassy guide link for non-English locales */}
                {embassyUrl && (
                  <motion.a
                    href={embassyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + STEPS.length * 0.08, duration: 0.3 }}
                    className="flex gap-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-4 border border-emerald-200/60 dark:border-emerald-700/40 hover:border-emerald-300 dark:hover:border-emerald-600 transition-colors group/guide"
                  >
                    <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                        {t("guideLink.title")}
                      </h3>
                      <p className="mt-0.5 text-[13px] leading-snug text-emerald-700/80 dark:text-emerald-400/70">
                        {t("guideLink.text")}
                        <span className="inline-block ml-1 transition-transform group-hover/guide:translate-x-1" aria-hidden>→</span>
                      </p>
                    </div>
                  </motion.a>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 pt-2 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleContinue}
                  className="w-full h-11 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm tracking-wide transition-colors shadow-md shadow-emerald-600/20 focus:outline-none focus-visible:ring-2 ring-emerald-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900"
                >
                  {t("continueBtn")} <span className="ml-1">→</span>
                </button>

                <label className="flex items-center justify-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dontShow}
                    onChange={(e) => setDontShow(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-emerald-500 focus:ring-emerald-400 focus:ring-offset-0"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {t("dontShowAgain")}
                  </span>
                </label>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** Extract item refNum, seller id, or short link code from a LittleBiggy URL */
function extractIdFromUrl(url: string): string {
  try {
    const m = url.match(/\/item\/([^/]+)/);
    if (m) return m[1];
    const s = url.match(/\/seller\/([^/]+)/);
    if (s) return s[1];
    const l = url.match(/\/link\/([^/?#]+)/);
    if (l) return `link:${l[1]}`;
  } catch {}
  return 'unknown';
}
