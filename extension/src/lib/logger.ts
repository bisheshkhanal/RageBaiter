/**
 * Logger utility with leveled logging for the RageBaiter extension.
 *
 * Debug and info levels are gated behind development mode or DEBUG_MODE setting.
 * Warn and error levels always output.
 *
 * In production builds (import.meta.env.PROD):
 * - debug/info: no output (unless DEBUG_MODE is enabled in chrome.storage.local)
 * - warn/error: console output
 *
 * In development builds:
 * - All levels output to console
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const DEBUG_MODE_STORAGE_KEY = "DEBUG_MODE";

/**
 * Check if debug mode is enabled via chrome.storage.local
 */
async function isDebugModeEnabled(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return false;
  }

  try {
    const result = await chrome.storage.local.get(DEBUG_MODE_STORAGE_KEY);
    return Boolean(result[DEBUG_MODE_STORAGE_KEY]);
  } catch {
    return false;
  }
}

/**
 * Determine if a log level should produce output
 */
function shouldLog(level: LogLevel, debugModeEnabled: boolean): boolean {
  const isProd = (import.meta as unknown as { env: { PROD?: boolean } }).env.PROD ?? false;

  // In production, only warn and error output unless debug mode is enabled
  if (isProd && !debugModeEnabled) {
    return level === "warn" || level === "error";
  }

  // In development or debug mode, all levels output
  return true;
}

/**
 * Format log arguments for console output
 */
function formatLogArgs(level: LogLevel, msg: string, ...args: unknown[]): unknown[] {
  const prefix = `[RageBaiter][${level.toUpperCase()}]`;
  return [prefix, msg, ...args];
}

/**
 * Send a log message to the debug panel (if running in a context where chrome.runtime is available)
 */
function sendToDebugPanel(level: LogLevel, msg: string, ...args: unknown[]): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }

  // Only send debug and info messages to the debug panel
  if (level === "warn" || level === "error") {
    return;
  }

  // Send via window.postMessage for sidepanel/debug panel consumption
  if (typeof window !== "undefined") {
    const debugMessage = {
      source: "ragebaiter-logger",
      type: "LOG",
      level,
      message: msg,
      args,
      timestamp: Date.now(),
    };

    window.postMessage(debugMessage, window.location.origin);
  }
}

/**
 * Cache for debug mode state to avoid repeated storage reads
 */
let debugModeCache: boolean | null = null;

/**
 * Get the cached debug mode state or fetch it if not cached
 */
async function getDebugModeState(): Promise<boolean> {
  if (debugModeCache === null) {
    debugModeCache = await isDebugModeEnabled();
  }
  return debugModeCache;
}

/**
 * Clear the debug mode cache (useful after settings changes)
 */
export function clearDebugModeCache(): void {
  debugModeCache = null;
}

/**
 * Main logger object with leveled logging methods
 */
export const logger = {
  /**
   * Debug level - gated by development mode or DEBUG_MODE setting
   */
  async debug(msg: string, ...args: unknown[]): Promise<void> {
    const debugMode = await getDebugModeState();

    if (!shouldLog("debug", debugMode)) {
      return;
    }

    const formattedArgs = formatLogArgs("debug", msg, ...args);
    console.debug(...formattedArgs);
    sendToDebugPanel("debug", msg, ...args);
  },

  /**
   * Info level - gated by development mode or DEBUG_MODE setting
   */
  async info(msg: string, ...args: unknown[]): Promise<void> {
    const debugMode = await getDebugModeState();

    if (!shouldLog("info", debugMode)) {
      return;
    }

    const formattedArgs = formatLogArgs("info", msg, ...args);
    console.log(...formattedArgs);
    sendToDebugPanel("info", msg, ...args);
  },

  /**
   * Warn level - always outputs
   */
  warn(msg: string, ...args: unknown[]): void {
    const formattedArgs = formatLogArgs("warn", msg, ...args);
    console.warn(...formattedArgs);
  },

  /**
   * Error level - always outputs
   */
  error(msg: string, ...args: unknown[]): void {
    const formattedArgs = formatLogArgs("error", msg, ...args);
    console.error(...formattedArgs);
  },
};
