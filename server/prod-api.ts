/**
 * Production API для POST /api/tender-search (Gemini).
 * Запуск: npm run start:api
 * Nginx: location /api/ { proxy_pass http://127.0.0.1:3001; }
 */
import express from "express";
import dotenv from "dotenv";
import { isGeminiRateLimitError, isGeminiUnavailableError } from "../src/lib/geminiRetry";
import { resolveGeminiProxyUrl } from "../src/server/geminiProxy";
import { runTenderSearch } from "../src/server/tenderSearchApi";

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

const env = process.env as Record<string, string>;
const apiKey = env.GEMINI_API_KEY ?? "";
let proxyUrl: string | undefined;
try {
  proxyUrl = resolveGeminiProxyUrl(env);
} catch (e) {
  console.error("[prod-api] ошибка разбора GEMINI_PROXY / прокси-URL:", e);
}

app.post("/api/tender-search", async (req, res) => {
  try {
    const query =
      typeof req.body === "object" && req.body !== null && "query" in req.body
        ? String((req.body as { query?: unknown }).query ?? "")
        : "";
    const lawFilter =
      typeof req.body === "object" && req.body !== null && "lawFilter" in req.body && typeof (req.body as { lawFilter?: unknown }).lawFilter === "object"
        ? {
            law44: Boolean((req.body as { lawFilter?: { law44?: unknown } }).lawFilter?.law44),
            law223: Boolean((req.body as { lawFilter?: { law223?: unknown } }).lawFilter?.law223),
          }
        : undefined;
    const tenders = await runTenderSearch(query, apiKey, lawFilter, proxyUrl);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json({ tenders });
  } catch (e) {
    console.error("[prod-api] /api/tender-search:", e);

    if (isGeminiUnavailableError(e)) {
      res.status(503).json({
        error: "AI-поиск закупок временно перегружен. Я автоматически попробовал резервную модель, но сейчас Google всё ещё отвечает нестабильно. Повторите запрос через 10–30 секунд.",
      });
      return;
    }

    const msg = e instanceof Error ? e.message : String(e);
    if (/fetch failed|timeout|timed out|ECONNRESET|UND_ERR/i.test(msg)) {
      res.status(503).json({
        error: "AI-поиск закупок временно недоступен из-за сбоя соединения с провайдером. Попробуйте повторить запрос через 10–30 секунд.",
      });
      return;
    }

    if (isGeminiRateLimitError(e)) {
      res.status(429).json({
        error: "AI-поиск закупок временно упёрся в лимит провайдера. Попробуйте повторить запрос чуть позже.",
      });
      return;
    }

    res.status(500).json({ error: msg || "Не удалось выполнить AI-поиск закупок. Попробуйте позже." });
  }
});

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "127.0.0.1";

app.listen(port, host, () => {
  console.log(`[prod-api] http://${host}:${port} — POST /api/tender-search`);
  if (!apiKey) {
    console.warn("[prod-api] GEMINI_API_KEY не задан — закупки работать не будут");
  }
});
