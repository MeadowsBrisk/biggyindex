"use client";
import React, { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { darkModeAtom } from "@/store/atoms";
import cn from "@/app/cn";
import { useTranslations } from "next-intl";

export default function FixedControls() {
  const [darkMode, setDarkMode] = useAtom(darkModeAtom);
  const t = useTranslations('Theme');
  const [showBackToTop, setShowBackToTop] = useState(false);

  const handleToggle = () => {
    setDarkMode((v) => !v);
  };

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 200);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const iconVariants = {
    initial: { rotate: -90, scale: 0 },
    animate: { rotate: 0, scale: 1, transition: { type: "spring", stiffness: 600, damping: 25 } },
    exit: { rotate: 90, scale: 0, transition: { duration: 0.2, ease: "easeInOut" } },
  } as any;
  const textVariants = {
    initial: { opacity: 0, y: 5 },
    animate: { opacity: 1, y: 0, transition: { delay: 0.1, duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, y: -5, transition: { duration: 0.2, ease: "easeIn" } },
  } as any;

  const buttonBaseClass = cn(
    "flex items-center justify-center rounded-full border shadow-lg transition-all focus:outline-none backdrop-blur-sm",
    "bg-white dark:bg-gray-800",
    "border-gray-300 dark:border-gray-700",
    "text-gray-800 dark:text-gray-100",
    "hover:shadow-xl hover:bg-gray-50 dark:hover:bg-[#141d30]"
  );

  return (
    <div className="fixed right-4 bottom-4 z-50 flex items-center gap-3">
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(buttonBaseClass, "w-10 h-10 group relative")}
            onClick={scrollToTop}
            aria-label="Back to top"
            type="button"
          >
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="w-5 h-5"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Back to top
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <button
        className={cn(buttonBaseClass, "gap-2 px-4 py-2")}
        onClick={handleToggle}
        aria-pressed={darkMode}
        aria-label={t('toggleTitle')}
        type="button"
        title={t('toggleTitle')}
      >
        <span className="sr-only">{t('toggleSr')}</span>
        <span className="inline-block w-5 h-5">
          <AnimatePresence mode="wait">
            {darkMode ? (
              <motion.div key="moon" variants={iconVariants} initial="initial" animate="animate" exit="exit">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" /></svg>
              </motion.div>
            ) : (
              <motion.div key="sun" variants={iconVariants} initial="initial" animate="animate" exit="exit">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.07l-.71.71M21 12h-1M4 12H3m16.66 5.66l-.71-.71M4.05 4.93l-.71-.71" />
                  <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth={2} />
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </span>
        <AnimatePresence mode="wait">
          <motion.span key={darkMode ? "dark" : "light"} className="text-xs font-medium" variants={textVariants} initial="initial" animate="animate" exit="exit">
            {darkMode ? t('dark') : t('light')}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  );
}
