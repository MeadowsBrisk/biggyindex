"use client";
import { useAtom } from "jotai";
import { introSeenAtom } from "@/store/atoms";
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import LeafIcon from "@/components/icons/LeafIcon";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

/**
 * First-visit intro splash.
 *
 * Uses `introSeenAtom` (localStorage) so it only fires once per device.
 */

/* ── Sizing ───────────────────────────────────────────────────── *
 * Everything scales from ONE value: SCALE (0–100).
 * The container uses a vmin-based font-size so the whole thing
 * looks identical at every viewport size, just bigger/smaller.
 * Ratios control bracket vs leaf proportions — change those
 * to tweak relative sizes without breaking responsiveness.       */
const SCALE        = 10;    // overall size (vmin units — try 20–40)
const LEAF_RATIO   = 0.45; // leaf width as fraction of bracket font-size
const LEAF_NUDGE   = 0.25;  // leaf vertical nudge as fraction of bracket size (+ = down)

/* ── Timing (seconds) ────────────────────────────────────────── */
const FADE_IN    = 0.3;   // brackets fade in
const SPREAD     = 0.4;  // brackets spread apart
const LEAF_DELAY = 0.1;  // leaf starts fading in partway through spread
const LEAF_FADE  = 0.35; // leaf fade-in duration
const HOLD       = 1.0;  // hold { * } visible
const EXIT       = 0.5;  // everything fades out

// Total time before exit starts
const TOTAL = FADE_IN + SPREAD + HOLD;

export default function IntroSplash() {
  // Read localStorage synchronously on first render so returning users
  // never see even a single frame of the splash.
  const [alreadySeen] = useState(() => {
    if (typeof window === 'undefined') return true; // SSR — skip
    try {
      const raw = localStorage.getItem('introSeen');
      return raw === 'true' || raw === '"true"';
    } catch {
      return false;
    }
  });

  const [seen, setSeen] = useAtom(introSeenAtom);
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);   // brackets spread?
  const [done, setDone] = useState(false);   // trigger exit
  const [visible, setVisible] = useState(true);

  const shouldShow = !alreadySeen && !seen;

  useBodyScrollLock(shouldShow && visible);

  // Timeline
  useEffect(() => {
    if (!shouldShow) return;
    if (reduce) { setSeen(true); setVisible(false); return; }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // After brackets fade in → spread open
    timers.push(setTimeout(() => setOpen(true), FADE_IN * 1000));

    // After hold → fade everything out
    timers.push(setTimeout(() => setDone(true), TOTAL * 1000));

    // After exit animation finishes → unmount
    timers.push(setTimeout(() => {
      setVisible(false);
      setSeen(true);
    }, (TOTAL + EXIT) * 1000));

    return () => timers.forEach(clearTimeout);
  }, [shouldShow, reduce, setSeen]);

  if (!shouldShow || !visible) return null;

  return (
    <AnimatePresence>
      {!done ? (
        <motion.div
          key="intro-splash"
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-white dark:bg-gray-950"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: EXIT, ease: 'easeInOut' }}
        >
          <div className="relative flex items-center justify-center"
               style={{ fontSize: `${SCALE}vmin` }}>
            {/* Left { */}
            <motion.span
              className="text-gray-900 dark:text-gray-100 select-none"
              style={{ fontSize: '1em', lineHeight: 1 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ opacity: { duration: 0.25 } }}
            >
              {'{'}
            </motion.span>

            {/* Invisible spacer that expands to push brackets apart */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: open ? `${LEAF_RATIO}em` : 0 }}
              transition={{ width: { duration: SPREAD, ease: [0.25, 0.6, 0.3, 1] } }}
              style={{ flexShrink: 0 }}
            />

            {/* Leaf — absolutely positioned so it doesn't affect bracket spacing */}
            <motion.div
              className="absolute flex items-center justify-center text-gray-900 dark:text-gray-100"
              style={{ width: `${LEAF_RATIO}em`, marginTop: `${LEAF_NUDGE}em` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: open ? 1 : 0 }}
              transition={{ opacity: { duration: LEAF_FADE, delay: LEAF_DELAY } }}
            >
              <LeafIcon className="w-full h-auto" />
            </motion.div>

            {/* Right } */}
            <motion.span
              className="text-gray-900 dark:text-gray-100 select-none"
              style={{ fontSize: '1em', lineHeight: 1 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ opacity: { duration: 0.25 } }}
            >
              {'}'}
            </motion.span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
