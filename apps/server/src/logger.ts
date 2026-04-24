import type { Config } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const order: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(cfgLevel: LogLevel, msgLevel: LogLevel): boolean {
  return order[msgLevel] >= order[cfgLevel];
}

export function createLogger(config: Pick<Config, "LOG_LEVEL">) {
  const cfgLevel = config.LOG_LEVEL;

  function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
    if (!shouldLog(cfgLevel, level)) return;
    const line = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...meta,
    };
    const text = JSON.stringify(line);
    if (level === "error") console.error(text);
    else if (level === "warn") console.warn(text);
    else console.log(text);
  }

  return {
    debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
