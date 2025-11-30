import type { Variants, Transition, Easing } from "framer-motion";

const DEFAULT_EASE: Easing = [0.25, 0.6, 0.3, 1];

type Trigger = "animate" | "view";

interface BaseMotionOptions {
  duration?: number;
  delay?: number;
  trigger?: Trigger;
  once?: boolean;
  viewportAmount?: number;
}

interface MotionOptionsWithDistance extends BaseMotionOptions {
  distance?: number;
}

interface MotionPreset {
  initial: { opacity: number; y?: number };
  transition: Transition;
  animate?: { opacity: number; y?: number };
  whileInView?: { opacity: number; y?: number };
  viewport?: { once?: boolean; amount?: number };
}

/**
 * Shared fade-in helper for Framer Motion components.
 */
export function fadeIn(options: BaseMotionOptions = {}): MotionPreset {
  const {
    duration = 0.6,
    delay = 0,
    trigger = "animate",
    once = true,
    viewportAmount = 0.5,
  } = options;

  const preset: MotionPreset = {
    initial: { opacity: 0 },
    transition: { duration, delay, ease: DEFAULT_EASE, type: "tween" },
  };

  const targetKey = trigger === "view" ? "whileInView" : "animate";
  preset[targetKey] = { opacity: 1 };

  if (trigger === "view") {
    preset.viewport = once
      ? { once: true, amount: viewportAmount }
      : { amount: viewportAmount };
  }

  return preset;
}

/**
 * Shared fade-in + translate-up helper for Framer Motion components.
 */
export function fadeInUp(options: MotionOptionsWithDistance = {}): MotionPreset {
  const {
    distance = 24,
    duration = 0.6,
    delay = 0,
    trigger = "animate",
    once = true,
    viewportAmount = 0.5,
  } = options;

  const preset: MotionPreset = {
    initial: { opacity: 0, y: distance },
    transition: { duration, delay, ease: DEFAULT_EASE, type: "tween" },
  };

  const targetKey = trigger === "view" ? "whileInView" : "animate";
  preset[targetKey] = { opacity: 1, y: 0 };

  if (trigger === "view") {
    preset.viewport = once
      ? { once: true, amount: viewportAmount }
      : { amount: viewportAmount };
  }

  return preset;
}
