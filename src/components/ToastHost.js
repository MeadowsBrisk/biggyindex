import React from 'react';
import { useAtomValue } from 'jotai';
import { toastAtom } from '@/store/atoms';
import { AnimatePresence, motion } from 'framer-motion';

export default function ToastHost() {
  const toast = useAtomValue(toastAtom);
  const show = !!toast.message;
  return (
    <div className="fixed inset-x-0 pointer-events-none z-[2000] flex justify-center top-3">
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ y: -12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-auto rounded-full px-4 py-2 text-sm font-medium bg-gray-900/90 text-white dark:bg-white/90 dark:text-gray-900 shadow-lg backdrop-blur border border-white/10 dark:border-gray-900/10"
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
