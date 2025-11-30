"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useAtom, type PrimitiveAtom } from "jotai";
import type { ReactNode } from "react";

interface AccordionProps {
  title: string;
  children: ReactNode;
  badge?: number | string | null;
  storageAtom: PrimitiveAtom<boolean>;
}

export default function Accordion({ title, children, badge = null, storageAtom }: AccordionProps) {
  const [isOpen, setIsOpen] = useAtom(storageAtom);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/40"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
            {title}
          </h3>
          <AnimatePresence>
            {badge && !isOpen && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-blue-600 text-[9px] font-semibold text-white"
              >
                {badge}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <motion.svg
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="w-4 h-4 text-gray-400 dark:text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>
      
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
