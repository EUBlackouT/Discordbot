type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = (process.env.LOG_LEVEL ?? 'info') as LogLevel;

function formatMeta(meta: unknown): string {
  if (meta instanceof Error) {
    return JSON.stringify({ name: meta.name, message: meta.message, stack: meta.stack });
  }
  if (typeof meta === 'object' && meta !== null) return JSON.stringify(meta);
  return String(meta);
}

function log(level: LogLevel, message: string, meta?: unknown): void {
  if (levels[level] < levels[currentLevel]) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (meta !== undefined) {
    console.log(prefix, message, formatMeta(meta));
  } else {
    console.log(prefix, message);
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
  info: (msg: string, meta?: unknown) => log('info', msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
};
