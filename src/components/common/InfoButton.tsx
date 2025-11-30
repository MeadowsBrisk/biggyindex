"use client";
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import cn from '@/lib/core/cn';
import { useNarrowLayout } from '@/hooks/useNarrowLayout';

interface InfoButtonProps {
  content?: React.ReactNode;
}

/**
 * Tiny fixed informational button (10x10px visual) bottom-left with hover / focus bubble.
 * Content can be edited by adjusting the bubbleContent variable or passing children in future.
 */
export default function InfoButton({ content }: InfoButtonProps) {
  const { narrow } = useNarrowLayout();
  
  // Config constants for quick adjustment
  const INFO_BUTTON_POSITION_FIXED = 'fixed bottom-[30px] left-[30px] xl:bottom-[10px] xl:left-[10px] z-[120]';
  const INFO_BUTTON_POSITION_INLINE = 'relative ml-4 mt-7 xl:mt-0 w-full flex justify-start z-[20]';
  const positionClass = narrow ? INFO_BUTTON_POSITION_INLINE : INFO_BUTTON_POSITION_FIXED;
  const INFO_BUTTON_SIZE_CLASSES = [
    'w-3 h-3 text-[10px]', // mobile / default
    'md:w-[10px] md:h-[10px] md:text-[9px]' // desktop
  ].join(' ');

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAppreciation, setShowAppreciation] = useState(false); // controls toast visibility
  const [appreciationShown, setAppreciationShown] = useState(false); // has toast ever been shown
  const appreciationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const BTC_ADDRESS = 'bc1q0g4lsefl830fs9clv8xuayule8upemw5qa8xgf';

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(BTC_ADDRESS);
      } else {
        // Fallback: create temporary input
        const temp = document.createElement('input');
        temp.value = BTC_ADDRESS;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopied(false), 2000);

      if (!appreciationShown) {
        setShowAppreciation(true);
        setAppreciationShown(true);
        if (appreciationTimeoutRef.current) clearTimeout(appreciationTimeoutRef.current);
        appreciationTimeoutRef.current = setTimeout(() => setShowAppreciation(false), 2200);
      }
    } catch (e) {
      console.warn('Copy failed', e);
    }
  };

  React.useEffect(() => () => {
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    if (appreciationTimeoutRef.current) clearTimeout(appreciationTimeoutRef.current);
  }, []);

  const bubbleContent = content || (
    <div className="relative space-y-3">
      {/* Decorative jar icon in top-right */}
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="absolute top-2 right-2 text-emerald-500/70 dark:text-emerald-400/70 drop-shadow-sm pointer-events-none"
      >
        <path
          fill="currentColor"
          d="M8 3h8a1 1 0 0 1 1 1v1.05A5.5 5.5 0 0 1 20 10v6.5A4.5 4.5 0 0 1 15.5 21h-7A4.5 4.5 0 0 1 4 16.5V10a5.5 5.5 0 0 1 3-4.95V4a1 1 0 0 1 1-1Zm1 2v.17a5.5 5.5 0 0 1 6 0V5H9Zm3 3.5A3.5 3.5 0 0 0 8.5 12v1.25c0 .414.336.75.75.75h.5a.75.75 0 0 0 0-1.5H10v-.5a2 2 0 0 1 4 0c0 .92-.615 1.417-1.659 1.94l-.153.077C11.216 14.63 10 15.246 10 17a.75.75 0 0 0 1.5 0c0-.92.615-1.417 1.659-1.94l.153-.077C13.784 14.37 15 13.754 15 12a3.5 3.5 0 0 0-3-3.465V10a.75.75 0 0 1-1.5 0V8.535A3.5 3.5 0 0 0 12 8.5Z"
        />
      </svg>
      <div className="space-y-2 pr-10 leading-snug">
        <h2 className="font-semibold text-[12px] tracking-wide text-gray-900 dark:text-gray-100 uppercase">Tip Jar</h2>
        <p className="text-[11px] text-gray-600 dark:text-gray-300">
          Feel free to <a className="underline decoration-dotted underline-offset-2 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors" href="mailto:brisk-meadow@proton.me">Contact</a> me if you have suggestions or bugs to report.
        </p>
        <p className="text-[11px] text-gray-600 dark:text-gray-300">
          If you want to help with keeping this running, encourage further development, or just to say thanks:
        </p>
      </div>
      <div className="space-y-1">
        {/* Address input */}
        <div className="flex items-stretch rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800 focus-within:ring-2 focus-within:ring-emerald-400/50">
          <span
            className="flex items-center pl-2 pr-1 text-[9px] font-mono tracking-wide uppercase text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 select-none"
            aria-hidden="true"
          >
            BTC
          </span>
          <input
            id="btc-address"
            readOnly
            value={BTC_ADDRESS}
            title="Bitcoin (BTC) donation address"
            onClick={(e) => { (e.currentTarget as HTMLInputElement).select(); handleCopy(); }}
            className="w-full bg-transparent px-2 py-1.5 text-[11px] font-mono tracking-tight text-gray-800 dark:text-gray-200 outline-none selection:bg-emerald-300/60"
            aria-label="Bitcoin donation address"
          />
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? 'Copied address' : 'Copy bitcoin address'}
            className={cn(
              'px-2 flex items-center gap-1 text-[11px] font-medium border-l border-gray-200 dark:border-gray-700',
              'text-gray-600 dark:text-gray-300 hover:text-emerald-700 dark:hover:text-emerald-300',
              'transition-colors'
            )}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? <span className="text-emerald-600 dark:text-emerald-400">Copied</span> : 'Copy'}
          </button>
        </div>
      </div>
      <div aria-live="polite" className="sr-only">{copied && 'Bitcoin address copied to clipboard'}</div>
    </div>
  );

  return (
    <div className={positionClass}>
      <div className={cn('relative group', narrow && 'pr-1')} onMouseEnter={show} onMouseLeave={hide}>
        {/* Button */}
        <motion.button
          type="button"
          aria-label="Site info"
          onFocus={show}
          onBlur={hide}
          onClick={() => setOpen(o => !o)}
          whileHover={{ scale: 1.15 }}
          whileFocus={{ scale: 1.15 }}
          whileTap={{ scale: 1.15 }}
          transition={{ duration: 0.3, ease: [0.22, 0.7, 0.3, 1] }}
          className={cn(
            'relative flex items-center justify-center rounded-full font-semibold select-none',
            INFO_BUTTON_SIZE_CLASSES,
            'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-100 shadow-sm ring-1 ring-gray-300 dark:ring-gray-600',
            'transition-[background-color,color,box-shadow] duration-300 ease-out',
            'hover:bg-emerald-200/80 dark:hover:bg-emerald-600/70 hover:text-gray-900 dark:hover:text-white',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60'
          )}
          style={{ willChange: 'transform' }}
        >
          i
        </motion.button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="absolute bottom-full mb-2 left-0 origin-bottom-left"
            >
              <div className="relative w-[260px] max-w-[80vw] rounded-lg border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-3 shadow-lg text-[11px] leading-relaxed text-gray-800 dark:text-gray-200">
                {bubbleContent}
                {/* Appreciation toast (wide layout only; narrow uses centered overlay) */}
                {!narrow && (
                  <AnimatePresence>
                    {showAppreciation && (
                      <motion.div
                        key="copied-toast-inline"
                        initial={{ opacity: 0, y: 6, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.92 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[calc(100%+10px)]"
                        role="status"
                        aria-live="polite"
                      >
                        <div className="rounded-full text-[40px] px-3 py-1 font-medium tracking-wide text-white">🍻</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
                <div className="absolute -bottom-1 left-[6px] w-2.5 h-2.5 bg-white dark:bg-gray-900 border-b border-r border-gray-200 dark:border-gray-700 rotate-45" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Centered appreciation overlay for narrow layout; independent of tooltip open state */}
      <AnimatePresence>
        {narrow && showAppreciation && (
          <motion.div
            key="copied-toast-centered"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-0 z-[300] pointer-events-none flex items-center justify-center"
            role="status"
            aria-live="polite"
          >
            <div className="rounded-full text-[200px] md:text-[80px] xl:text-[64px] px-5 py-3 font-medium tracking-wide text-white">
              🍻
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
