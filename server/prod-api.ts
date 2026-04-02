/**
 * Production API для POST /api/tender-search (Gemini).
 * Запуск: npm run start:api
 * Nginx: location /api/ { proxy_pass http://127.0.0.1:3001; }
 */
import express from "express";
import dotenv from "dotenv";
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
    const tenders = await runTenderSearch(query, apiKey, proxyUrl);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json({ tenders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[prod-api] /api/tender-search:", e);
    res.status(500).json({ error: msg });
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
