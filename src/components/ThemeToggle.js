"use client";
import React from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "framer-motion";
import { darkModeAtom } from "@/store/atoms";
import cn from "@/app/cn";

export default function ThemeToggle() {
  const [darkMode, setDarkMode] = useAtom(darkModeAtom);

  const handleToggle = () => {
    setDarkMode((v) => !v);
  };

  const containerVariants = {
    hover: { scale: 1.05, transition: { type: "spring", stiffness: 400, damping: 15 } },
    tap: { scale: 0.95, transition: { type: "spring", stiffness: 600, damping: 25 } },
  };
  const iconVariants = {
    initial: { rotate: -90, scale: 0 },
    animate: { rotate: 0, scale: 1, transition: { type: "spring", stiffness: 600, damping: 25 } },
    exit: { rotate: 90, scale: 0, transition: { duration: 0.2, ease: "easeInOut" } },
  };
  const textVariants = {
    initial: { opacity: 0, y: 5 },
    animate: { opacity: 1, y: 0, transition: { delay: 0.1, duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, y: -5, transition: { duration: 0.2, ease: "easeIn" } },
  };

  return (
    <motion.button
      className={cn(
        "fixed right-4 bottom-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full border shadow-lg transition focus:outline-none backdrop-blur-sm",
        "bg-white dark:bg-gray-800",
        "border-gray-300 dark:border-gray-700",
        "text-gray-800 dark:text-gray-100"
      )}
      onClick={handleToggle}
      variants={containerVariants}
      whileHover="hover"
      whileTap="tap"
      aria-pressed={darkMode}
      type="button"
      title="Toggle dark mode"
    >
      <span className="sr-only">Toggle dark mode</span>
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
          {darkMode ? "Dark" : "Light"}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}


