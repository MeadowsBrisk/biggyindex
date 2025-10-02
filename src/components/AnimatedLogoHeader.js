import React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion, useAnimation } from 'framer-motion';

const TITLE = 'Biggy Index';

// Wrapper simple fade/slide in
const wrapperVariants = {
  hidden: { opacity: 0, y: 6 },
  show: (r) => r ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25,0.6,0.3,1] } }
};

// Brace animation: start overlapped (x=0) then move outward to final offset; no overshoot, no blur
// Closer final distance (±9px) for tighter logo footprint
const braceVariants = {
  hidden: (c) => ({ opacity: 0, x: 0, rotate: c.side === 'left' ? -8 : 8, scale: 0.92 }),
  show: (c) => c.reduce ? {
    opacity: 1,
    x: c.side === 'left' ? -9 : 9,
    rotate: 0,
    scale: 1
  } : {
    opacity: 1,
    x: c.side === 'left' ? -9 : 9,
    rotate: 0,
    scale: 1,
    transition: { duration: 0.55, ease: [0.25,0.6,0.3,1] }
  }
};

const titleContainer = {
  hidden: {},
  show: (r) => r ? { transition: { staggerChildren: 0 } } : { transition: { staggerChildren: 0.045, delayChildren: 0.18 } }
};

const charVariant = {
  hidden: { y: '0.55em', opacity: 0, rotateX: -80 },
  show: (r) => r ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, rotateX: 0, transition: { duration: 0.42, ease: 'easeOut' } }
};

export default function AnimatedLogoHeader({ className = '', rightSlot = null }) {
  const reduce = useReducedMotion();
  const braceControls = useAnimation();
  React.useEffect(() => {
    // Compute total time for title letters to finish before starting braces
    if (reduce) {
      // Start immediately without delay for reduced motion users
      braceControls.start((custom) => ({
        opacity: 1,
        x: custom.side === 'left' ? -9 : 9,
        rotate: 0,
        scale: 1
      }));
      return;
    }
    const letters = TITLE.length; // includes spaces; OK for timing
    const delayChildren = 0.18; // matches titleContainer variant
    const stagger = 0.045;      // matches titleContainer variant
    const charDur = 0.42;       // matches charVariant duration
    const lastStart = delayChildren + (letters - 1) * stagger;
    const total = lastStart + charDur; // seconds
    const t = setTimeout(() => {
      braceControls.start('show');
    }, total * 1000);
    return () => clearTimeout(t);
  }, [reduce, braceControls]);
  return (
  <header className={`flex items-center gap-3 mb-6 ${className}`}>
      <Link href="/home" className="relative inline-flex h-10 w-7 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 rounded-md" aria-label="Go to homepage">
        <motion.div
          className="relative flex h-full w-full items-center justify-center select-none top-[-3px]"
          variants={wrapperVariants}
          initial="hidden"
          animate="show"
          custom={reduce}
        >
          <motion.span
            className="text-[1.9em] text-gray-900 dark:text-gray-100"
            variants={braceVariants}
            custom={{ side: 'left', reduce }}
            initial="hidden"
            animate={braceControls}
            style={{ fontWeight: 600, position: 'absolute' }}
          >{'{'}</motion.span>
          <motion.span
            className="text-[1.9em] text-gray-900 dark:text-gray-100"
            variants={braceVariants}
            custom={{ side: 'right', reduce }}
            initial="hidden"
            animate={braceControls}
            style={{ fontWeight: 600, position: 'absolute' }}
          >{'}'}</motion.span>
        </motion.div>
      </Link>
  <motion.h1
        className="text-2xl font-heading font-semibold tracking-tight text-gray-900 dark:text-gray-100 leading-none select-none"
        initial="hidden"
        animate="show"
        custom={reduce}
        variants={titleContainer}
        aria-label={TITLE}
      >
        {TITLE.split('').map((ch, idx) => (
          <motion.span
            key={idx + ch}
            className="inline-block will-change-transform"
            variants={charVariant}
            custom={reduce}
            style={{ perspective: '600px' }}
            aria-hidden="true"
          >
            {ch === ' ' ? '\u00A0' : ch}
          </motion.span>
        ))}
      </motion.h1>
      {rightSlot && (
        <div className="ml-auto flex items-center">
          {rightSlot}
        </div>
      )}
    </header>
  );
}
