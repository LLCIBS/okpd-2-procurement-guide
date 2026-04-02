import { getGlobalDispatcher, ProxyAgent, setGlobalDispatcher } from "undici";

/**
 * Порядок приоритета:
 * - GEMINI_PROXY_URL — полный URL, например http://user:pass@host:port
 * - HTTPS_PROXY / HTTP_PROXY — стандартные переменные
 * - GEMINI_PROXY — строка host:port:user:pass (IPv4/hostname без «:» в host)
 */
export function resolveGeminiProxyUrl(env: Record<string, string>): string | undefined {
  const direct =
    env.GEMINI_PROXY_URL?.trim() ||
    env.HTTPS_PROXY?.trim() ||
    env.HTTP_PROXY?.trim();
  if (direct) {
    return ensureHttpScheme(direct);
  }
  const raw = env.GEMINI_PROXY?.trim();
  if (!raw) return undefined;
  return parseColonSeparatedProxy(raw);
}

function ensureHttpScheme(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `http://${url}`;
}

/**
 * Формат host:port:user:pass.
 * Для IPv4 адрес вида 1.2.3.4:port:user:pass — при split(':') получается 7 частей, поэтому сначала IPv4-регекс.
 */
function parseColonSeparatedProxy(raw: string): string {
  const ipv4 = raw.match(
    /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5}):([^:]+):(.+)$/
  );
  if (ipv4) {
    const [, host, port, user, pass] = ipv4;
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(pass);
    return `http://${u}:${p}@${host}:${port}`;
  }

  const parts = raw.split(":");
  if (parts.length < 4) {
    throw new Error(
      "GEMINI_PROXY: ожидается host:port:user:pass (для IPv4 используйте формат a.b.c.d:port:user:pass или GEMINI_PROXY_URL)"
    );
  }
  const pass = parts.pop()!;
  const user = parts.pop()!;
  const port = parts.pop()!;
  const host = parts.join(":");
  if (!/^\d{2,5}$/.test(port)) {
    throw new Error("GEMINI_PROXY: неверный порт");
  }
  const u = encodeURIComponent(user);
  const p = encodeURIComponent(pass);
  return `http://${u}:${p}@${host}:${port}`;
}

/** Сериализация вызовов: глобальный dispatcher один на процесс — без очереди возможны гонки. */
let mutex = Promise.resolve();

/**
 * Выполняет fn с HTTP(S)-прокси для всего исходящего fetch (undici) в процессе Node.
 * Используется только вокруг вызовов @google/genai на dev-сервере.
 */
export function withGeminiProxy<T>(proxyUrl: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!proxyUrl) {
    return fn();
  }

  const run = async (): Promise<T> => {
    const agent = new ProxyAgent(proxyUrl);
    const prev = getGlobalDispatcher();
    setGlobalDispatcher(agent);
    try {
      return await fn();
    } finally {
      setGlobalDispatcher(prev);
    }
  };

  const p = mutex.then(run, run);
  mutex = p.then(
    () => undefined,
    () => undefined
  );
  return p;
}

export function maskProxyForLog(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl);
    if (u.username) u.username = "***";
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "[proxy]";
  }
}
