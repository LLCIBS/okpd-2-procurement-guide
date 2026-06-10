/**
 * Retry с экспоненциальным backoff при 429 (quota / rate limit) от Gemini API.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Распознаёт ответы Google с кодом 429 и связанные обёртки SDK. */
function hasGeminiStatus(error: unknown, code: number, textStatus: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current != null; depth++) {
    if (typeof current === "object") {
      const e = current as Record<string, unknown>;
      if (e.status === code || e.code === code || e.status === textStatus) return true;
      const nested = e.error;
      if (nested && typeof nested === "object") {
        const n = nested as Record<string, unknown>;
        if (n.code === code || n.status === textStatus) return true;
      }
      if ("cause" in e && e.cause != null) {
        current = e.cause;
        continue;
      }
    }
    break;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return new RegExp(`\\b${code}\\b|${textStatus}`, "i").test(msg);
}

export function isGeminiRateLimitError(error: unknown): boolean {
  return hasGeminiStatus(error, 429, "RESOURCE_EXHAUSTED");
}

export function isGeminiUnavailableError(error: unknown): boolean {
  return hasGeminiStatus(error, 503, "UNAVAILABLE");
}

export type Gemini429RetryOptions = {
  /** Число попыток (первая + повторы). По умолчанию 5. */
  maxAttempts?: number;
  /** Перед паузой перед следующей попыткой (retryNumber: 1 — первый повтор). */
  onRetry?: (info: { retryNumber: number; waitMs: number; error: unknown }) => void;
};

/**
 * Выполняет fn с повторами при 429: задержка 2^attempt сек + jitter [0, 1) с,
 * как в типичном production-паттерне (первая пауза ~1 с после первой ошибки).
 */
export async function withGemini429Retry<T>(
  fn: () => Promise<T>,
  options?: Gemini429RetryOptions
): Promise<T> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 5);
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!isGeminiRateLimitError(e) || attempt === maxAttempts - 1) {
        throw e;
      }
      const waitMs = Math.floor(2 ** attempt * 1000 + Math.random() * 1000);
      options?.onRetry?.({ retryNumber: attempt + 1, waitMs, error: e });
      await sleep(waitMs);
    }
  }

  throw lastError;
}
