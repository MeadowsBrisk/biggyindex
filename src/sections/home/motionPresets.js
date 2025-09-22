const DEFAULT_EASE = [0.25, 0.6, 0.3, 1];

/**
 * @typedef {"animate" | "view"} Trigger
 * @typedef {object} BaseMotionOptions
 * @property {number} [duration]
 * @property {number} [delay]
 * @property {Trigger} [trigger]
 * @property {boolean} [once]
 * @property {number} [viewportAmount]
 * @typedef {BaseMotionOptions & { distance?: number }} MotionOptionsWithDistance
 */

/**
 * Shared fade-in helper for Framer Motion components.
 * @param {BaseMotionOptions} [options]
 */
export function fadeIn(options = {}) {
  const {
    duration = 0.6,
    delay = 0,
    trigger = "animate",
    once = true,
    viewportAmount = 0.5,
  } = options;

  const preset = {
    initial: { opacity: 0 },
    transition: { duration, delay, ease: DEFAULT_EASE, type: "tween" },
  };

  const targetKey = trigger === "view" ? "whileInView" : "animate";
  preset[targetKey] = trigger === "view" ? { opacity: 1 } : { opacity: 1 };

  if (trigger === "view") {
    preset.viewport = once
      ? { once: true, amount: viewportAmount }
      : { amount: viewportAmount };
  }

  return preset;
}

/**
 * Shared fade-in + translate-up helper for Framer Motion components.
 * @param {MotionOptionsWithDistance} [options]
 */
export function fadeInUp(options = {}) {
  const {
    distance = 24,
    duration = 0.6,
    delay = 0,
    trigger = "animate",
    once = true,
    viewportAmount = 0.5,
  } = options;

  const preset = {
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

