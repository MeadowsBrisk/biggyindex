// Minimal leveled logger (stub)
export type LogLevel = "debug" | "info" | "warn" | "error";

export function createLogger(level: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info") {
  const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  const threshold = order[level] ?? 20;
  function log(l: LogLevel, ...args: unknown[]) {
    if (order[l] >= threshold) {
      // eslint-disable-next-line no-console
      console[l === "debug" ? "log" : l](...args);
    }
  }
  return {
    debug: (...a: unknown[]) => log("debug", ...a),
    info: (...a: unknown[]) => log("info", ...a),
    warn: (...a: unknown[]) => log("warn", ...a),
    error: (...a: unknown[]) => log("error", ...a),
  } as const;
}
