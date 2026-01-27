/**
 * Unified Crawler Logger
 * 
 * Standardized logging format:
 *   [stage] EMOJI message key=value (timing)
 * 
 * Emojis:
 *   ✓ Success    ✗ Failure    → Processing
 *   ⚠ Warning    ↻ Retry      📊 Stats
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatTime(): string {
  return new Date().toISOString().substring(11, 23); // HH:mm:ss.sss
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatKv(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return "";
  return Object.entries(data)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

/** Main logger - use `log.sellers.info(...)` etc. */
export const log = {
  // Stage-specific loggers with consistent prefixes
  index: createStageLogger("index"),
  items: createStageLogger("items"),
  sellers: createStageLogger("sellers"),
  pruning: createStageLogger("pruning"),
  translate: createStageLogger("translate"),
  image: createStageLogger("image"),
  pricing: createStageLogger("pricing"),
  cli: createStageLogger("cli"),

  // Generic logging (for shared modules)
  debug: (tag: string, msg: string, data?: Record<string, unknown>) => {
    if (shouldLog("debug")) {
      const kv = formatKv(data);
      console.log(`${formatTime()} [${tag}] ${msg}${kv ? " " + kv : ""}`);
    }
  },
  info: (tag: string, msg: string, data?: Record<string, unknown>) => {
    if (shouldLog("info")) {
      const kv = formatKv(data);
      console.log(`${formatTime()} [${tag}] ${msg}${kv ? " " + kv : ""}`);
    }
  },
  warn: (tag: string, msg: string, data?: Record<string, unknown>) => {
    if (shouldLog("warn")) {
      const kv = formatKv(data);
      console.warn(`${formatTime()} [${tag}] ⚠ ${msg}${kv ? " " + kv : ""}`);
    }
  },
  error: (tag: string, msg: string, data?: Record<string, unknown>) => {
    if (shouldLog("error")) {
      const kv = formatKv(data);
      console.error(`${formatTime()} [${tag}] ✗ ${msg}${kv ? " " + kv : ""}`);
    }
  },
};

interface StageLogger {
  /** Starting an operation: [stage] → message */
  start: (msg: string, data?: Record<string, unknown>) => void;
  /** Success: [stage] ✓ message */
  success: (msg: string, data?: Record<string, unknown>) => void;
  /** Failure: [stage] ✗ message */
  fail: (msg: string, data?: Record<string, unknown>) => void;
  /** Error (alias for fail): [stage] ✗ message */
  error: (msg: string, data?: Record<string, unknown>) => void;
  /** Warning: [stage] ⚠ message */
  warn: (msg: string, data?: Record<string, unknown>) => void;
  /** Skip: [stage] ⏭ message */
  skip: (msg: string, data?: Record<string, unknown>) => void;
  /** Retry: [stage] ↻ message */
  retry: (msg: string, data?: Record<string, unknown>) => void;
  /** Stats/progress: [stage] 📊 message */
  stats: (msg: string, data?: Record<string, unknown>) => void;
  /** Info (no emoji): [stage] message */
  info: (msg: string, data?: Record<string, unknown>) => void;
  /** Debug (only shown with LOG_LEVEL=debug) */
  debug: (msg: string, data?: Record<string, unknown>) => void;
  /** Progress bar style: [stage] 📊 (current/total) pct% */
  progress: (current: number, total: number, extra?: string) => void;
  /** Item/entity result with timing */
  result: (id: string, ok: boolean, durationMs: number, data?: Record<string, unknown>) => void;
  /** Stage banner */
  banner: (title: string) => void;
  /** Stage complete summary */
  complete: (durationMs: number, data?: Record<string, unknown>) => void;
  /** Timing log: [stage:time] ⏱ label dur=Xms Xs key=value */
  time: (label: string, durationMs: number, data?: Record<string, unknown>) => void;
}

function createStageLogger(stage: string): StageLogger {
  const prefix = `[${stage}]`;

  return {
    start: (msg, data) => {
      if (shouldLog("info")) {
        const kv = formatKv(data);
        console.log(`${formatTime()} ${prefix} → ${msg}${kv ? " " + kv : ""}`);
      }
    },
    success: (msg, data) => {
      if (shouldLog("info")) {
        const kv = formatKv(data);
        console.log(`${formatTime()} ${prefix} ✓ ${msg}${kv ? " " + kv : ""}`);
      }
    },
    fail: (msg, data) => {
      if (shouldLog("error")) {
        const kv = formatKv(data);
        console.error(`${formatTime()} ${prefix} ✗ ${msg}${kv ? " " + kv : ""}`);
      }
    },
    error: (msg, data) => {
      if (shouldLog("error")) {
        const kv = formatKv(data);
        console.error(`${formatTime()} ${prefix} ✗ ${msg}${kv ? " " + kv : ""}`);
      }
    },
    warn: (msg, data) => {
      if (shouldLog("warn")) {
        const kv = formatKv(data);
        console.warn(`${formatTime()} ${prefix} ⚠ ${msg}${kv ? " " + kv : ""}`);
      }
    },
    skip: (msg, data) => {
      if (shouldLog("debug")) {
        const kv = formatKv(data);
        console.log(`${formatTime()} ${prefix} ⏭ ${msg}${kv ? " " + kv : ""}`);
      }
    },
    retry: (msg, data) => {
      if (shouldLog("warn")) {
        const kv = formatKv(data);
        console.warn(`${formatTime()} ${prefix} ↻ ${msg}${kv ? " " + kv : ""}`);
      }
    },
    stats: (msg, data) => {
      if (shouldLog("info")) {
        const kv = formatKv(data);
        console.log(`${formatTime()} ${prefix} 📊 ${msg}${kv ? " " + kv : ""}`);
      }
    },
    info: (msg, data) => {
      if (shouldLog("info")) {
        const kv = formatKv(data);
        console.log(`${formatTime()} ${prefix} ${msg}${kv ? " " + kv : ""}`);
      }
    },
    debug: (msg, data) => {
      if (shouldLog("debug")) {
        const kv = formatKv(data);
        console.log(`${formatTime()} ${prefix} ${msg}${kv ? " " + kv : ""}`);
      }
    },
    progress: (current, total, extra) => {
      if (shouldLog("info")) {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        const msg = `(${current}/${total}) ${pct}%${extra ? " " + extra : ""}`;
        console.log(`${formatTime()} ${prefix} 📊 ${msg}`);
      }
    },
    result: (id, ok, durationMs, data) => {
      if (shouldLog("info")) {
        const emoji = ok ? "✓" : "✗";
        const dur = formatDuration(durationMs);
        const kv = formatKv(data);
        console.log(`${formatTime()} ${prefix} ${emoji} ${id} (${dur})${kv ? " " + kv : ""}`);
      }
    },
    banner: (title) => {
      if (shouldLog("info")) {
        const line = "═".repeat(60);
        console.log(`\n${line}`);
        console.log(`${prefix} ${title}`);
        console.log(`${line}\n`);
      }
    },
    complete: (durationMs, data) => {
      if (shouldLog("info")) {
        const dur = formatDuration(durationMs);
        const kv = formatKv(data);
        const line = "─".repeat(60);
        console.log(`\n${line}`);
        console.log(`${formatTime()} ${prefix} ✓ COMPLETE (${dur})${kv ? " " + kv : ""}`);
        console.log(`${line}\n`);
      }
    },
    time: (label, durationMs, data) => {
      if (shouldLog("info")) {
        const dur = formatDuration(durationMs);
        const secs = (durationMs / 1000).toFixed(2);
        const kv = formatKv(data);
        console.log(`${formatTime()} [${stage}:time] ⏱ ${label} dur=${durationMs}ms ${secs}s${kv ? " " + kv : ""}`);
      }
    },
  };
}

/** Timer helper for measuring durations */
export function timer(): { elapsed: () => number; format: () => string } {
  const start = Date.now();
  return {
    elapsed: () => Date.now() - start,
    format: () => formatDuration(Date.now() - start),
  };
}

// Legacy createLogger for backward compatibility
export function createLogger(level: LogLevel = currentLevel) {
  const order: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const threshold = order[level] ?? 1;
  function doLog(l: LogLevel, ...args: unknown[]) {
    if (order[l] >= threshold) {
      console[l === "debug" ? "log" : l](...args);
    }
  }
  return {
    debug: (...a: unknown[]) => doLog("debug", ...a),
    info: (...a: unknown[]) => doLog("info", ...a),
    warn: (...a: unknown[]) => doLog("warn", ...a),
    error: (...a: unknown[]) => doLog("error", ...a),
  } as const;
}
