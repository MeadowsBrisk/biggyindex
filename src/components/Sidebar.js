import SearchBar from "@/components/SearchBar";
import CategoryFilter from "@/components/CategoryFilter";
import PriceRange from "@/components/filters/PriceRange";
import SellerFilter from "@/components/filters/SellerFilter";
import SortControls from "@/components/filters/SortControls";
import InfoButton from "@/components/InfoButton";
import Accordion from "@/components/filters/Accordion";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNarrowLayout } from "@/hooks/useNarrowLayout";
import { useAtom, useAtomValue } from "jotai";
import { 
  activeFiltersCountAtom, 
  resetFiltersAtom, 
  sellerAnalyticsOpenAtom, 
  latestReviewsModalOpenAtom,
  includedSellersAtom,
  excludedSellersAtom,
  priceRangeAtom,
  priceAccordionOpenAtom,
  sellersAccordionOpenAtom
} from "@/store/atoms";

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: 'easeOut' } }
};

function Section({ title, children }) {
  return (
    <motion.section
      variants={itemVariants}
      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-sm relative"
    >
      {title && <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">{title}</h3>}
      {children}
    </motion.section>
  );
}

export default function Sidebar() {
  const { narrow } = useNarrowLayout();
  const mobile = narrow;
  const [open, setOpen] = useState(false);
  const [activeCount] = useAtom(activeFiltersCountAtom);
  const [, resetFilters] = useAtom(resetFiltersAtom);
  const [, setAnalyticsOpen] = useAtom(sellerAnalyticsOpenAtom);
  const [, setReviewsOpen] = useAtom(latestReviewsModalOpenAtom);
  
  // Track individual filter states for badges
  const includedSellers = useAtomValue(includedSellersAtom);
  const excludedSellers = useAtomValue(excludedSellersAtom);
  const priceRange = useAtomValue(priceRangeAtom);
  
  const sellerFilterCount = useMemo(() => {
    return (includedSellers?.length || 0) + (excludedSellers?.length || 0);
  }, [includedSellers, excludedSellers]);
  
  const priceFilterActive = useMemo(() => {
    const { min, max } = priceRange || {};
    return (min != null && min > 0) || (max != null && max < Infinity);
  }, [priceRange]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const resetDisabled = activeCount === 0;
  const ResetButton = (
    <button
      type="button"
      onClick={() => { if (!resetDisabled) resetFilters(); }}
      disabled={resetDisabled}
      className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Reset{activeCount > 0 && <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-semibold text-white">{activeCount}</span>}
    </button>
  );

  // Desktop layout (Sort hidden per requirement)
  if (!mobile) {
    return (
      <motion.aside
        initial="hidden"
        animate="show"
        variants={containerVariants}
        className="w-full sm:w-73 shrink-0 space-y-4 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1"
      >
        <div className="flex items-center justify-between" key="sidebar-head">
          <motion.h2 variants={itemVariants} className="text-sm font-semibold tracking-wide text-gray-700 dark:text-gray-200">Filters</motion.h2>
          <motion.div variants={itemVariants}>{ResetButton}</motion.div>
        </div>
        <Section title="Search"><SearchBar /></Section>
        <Section title="Category"><CategoryFilter /></Section>
        <motion.div variants={itemVariants}>
          <Accordion title="Price" storageAtom={priceAccordionOpenAtom}>
            <PriceRange />
          </Accordion>
        </motion.div>
        <motion.div variants={itemVariants}>
          <Accordion title="Sellers" badge={sellerFilterCount || null} storageAtom={sellersAccordionOpenAtom}>
            <SellerFilter />
          </Accordion>
        </motion.div>
        <div className="flex gap-2">
          <motion.button
            variants={itemVariants}
            type="button"
            onClick={() => setAnalyticsOpen(true)}
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-1 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            All Sellers
          </motion.button>
          <motion.button
            variants={itemVariants}
            type="button"
            onClick={() => setReviewsOpen(true)}
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-1 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            Reviews
          </motion.button>
        </div>
        <InfoButton />
      </motion.aside>
    );
  }

  // Mobile drawer (Sort at top, visible here)
  return (
    <div className="relative">
      {!open && (
        <button
          type="button"
          aria-label="Open filters"
          className="fixed left-0 top-17 bottom-0 z-30 w-10 max-w-10 bg-transparent focus:outline-none bg-green"
          onClick={() => setOpen(true)}
        >
          <span className="sr-only">Open filters</span>
        </button>
      )}
      <motion.button
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        aria-label={open ? 'Close filters' : 'Open filters'}
        onClick={() => setOpen(o => !o)}
        className="sticky left-2 top-4 z-40 inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/90 text-sm shadow backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
      >
        <span className="relative inline-block leading-none">
          <span aria-hidden="true" className="block translate-y-[1px]">☰</span>
          {activeCount > 0 && (
            <span className="absolute -top-2 -right-2 inline-flex h-3 min-w-3 items-center justify-center rounded-full bg-blue-600 px-[3px] text-[8px] font-semibold leading-none text-white shadow">
              {activeCount}
            </span>
          )}
        </span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/30 dark:bg-black/40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="fixed inset-y-0 left-0 z-50 w-80 max-w-[90%] overflow-y-auto border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 pb-[30px] xl:pb-4 space-y-4 shadow-lg"
              onClick={(e) => e.stopPropagation()}
           >
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-sm">Filters</div>
                <div className="flex items-center gap-2">{ResetButton}<button onClick={() => setOpen(false)} aria-label="Close filters" className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">×</button></div>
              </div>
              <motion.div initial="hidden" animate="show" variants={containerVariants} className="space-y-4">
                <Section title="Sort"><SortControls stack /></Section>
                <Section title="Search"><SearchBar /></Section>
                <Section title="Category"><CategoryFilter /></Section>
                <motion.div variants={itemVariants}>
                  <Accordion title="Price" storageAtom={priceAccordionOpenAtom}>
                    <PriceRange />
                  </Accordion>
                </motion.div>
                <motion.div variants={itemVariants}>
                  <Accordion title="Sellers" badge={sellerFilterCount || null} storageAtom={sellersAccordionOpenAtom}>
                    <SellerFilter />
                  </Accordion>
                </motion.div>
                <div className="flex gap-2">
                  <motion.button
                    variants={itemVariants}
                    type="button"
                    onClick={() => { setAnalyticsOpen(true); setOpen(false); }}
                    className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-1 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    All Sellers
                  </motion.button>
                  <motion.button
                    variants={itemVariants}
                    type="button"
                    onClick={() => { setReviewsOpen(true); setOpen(false); }}
                    className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-1 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    Reviews
                  </motion.button>
                </div>
                <InfoButton />
              </motion.div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
