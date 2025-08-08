type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function debugEnabled(namespace?: string): boolean {
  // Prefer DEBUG env (server) or NEXT_PUBLIC_DEBUG (client). Accept comma-separated namespaces or '*' / 'true'.
  const raw = (isBrowser() ? (process.env.NEXT_PUBLIC_DEBUG || (window as any)?.__DEBUG) : process.env.DEBUG) as string | undefined;
  const val = (raw || '').toString().trim();
  if (!val) return false;
  if (val === '*' || val === 'true') return true;
  if (!namespace) return false;
  const parts = val.split(',').map((s) => s.trim());
  return parts.includes(namespace) || parts.includes('all') || parts.includes('app');
}

export function createLogger(namespace: string) {
  const emit = (level: LogLevel, ...args: unknown[]) => {
    const prefix = `[${namespace}]`;
    // eslint-disable-next-line no-console
    (console as any)[level === 'debug' ? 'log' : level](prefix, ...args);
  };
  return {
    debug: (...args: unknown[]) => {
      if (debugEnabled(namespace)) emit('debug', ...args);
    },
    info: (...args: unknown[]) => emit('info', ...args),
    warn: (...args: unknown[]) => emit('warn', ...args),
    error: (...args: unknown[]) => emit('error', ...args),
  };
}


