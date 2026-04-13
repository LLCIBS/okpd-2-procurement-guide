import type { IncomingMessage } from "node:http";
import { GoogleGenAI, Type } from "@google/genai";
import type { Tender } from "../types";
import { withGemini429Retry } from "../lib/geminiRetry";
import { alignTenderLinksWithGrounding } from "./tenderLinkAlign";
import { maskProxyForLog, withGeminiProxy } from "./geminiProxy";

const MODEL = "gemini-3-flash-preview";

function log(phase: string, detail?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  if (detail && Object.keys(detail).length > 0) {
    console.log(`[tender-search ${ts}] ${phase}`, detail);
  } else {
    console.log(`[tender-search ${ts}] ${phase}`);
  }
}

export async function readJsonBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function runTenderSearch(
  query: string,
  apiKey: string,
  proxyUrl?: string | null
): Promise<Tender[]> {
  if (!query.trim()) {
    log("пропуск: пустой запрос");
    return [];
  }

  if (!apiKey) {
    log("ошибка: GEMINI_API_KEY не задан в .env — проверьте файл окружения");
    throw new Error("GEMINI_API_KEY не настроен на сервере разработки");
  }

  const proxy = proxyUrl?.trim() || undefined;
  if (proxy) {
    log("используется HTTP(S)-прокси для исходящих запросов к Gemini (и для инструмента поиска)", {
      proxy: maskProxyForLog(proxy),
    });
  } else {
    log("прокси не задан — трафик к Gemini идёт с IP этой машины (HTTPS_PROXY/GEMINI_PROXY_URL/GEMINI_PROXY)");
  }

  log("старт запроса к Gemini", { model: MODEL, queryPreview: query.slice(0, 120) });

  return withGeminiProxy(proxy, async () => {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Найди актуальные закупки (тендеры) по запросу: "${query}".
      Ориентируйся на официальный ЕИС (zakupki.gov.ru) и крупные ЭТП (Сбербанк-АСТ, РТС-тендер, Росэлторг и т.д.).

      Для КАЖДОЙ позиции в JSON:
      - title: полное наименование из извещения (как в источнике).
      - price: начальная (максимальная) цена контракта строкой.
      - restrictions: кратко про СМП/СОНО, ПП 616/1236, ПП 878/102 если указано.
      - platform: название ЭТП или «ЕИС».
      - date: дата из извещения если есть.
      - link: ТОЛЬКО URL, который реально относится к ЭТОЙ же закупке, что и title — возьми его из результатов поиска (страница извещения/лота), не сочиняй и не смешивай чужие ссылки.
      - id: уникальный id строки (например хэш от title+link).
      - okpd2: код или коды ОКПД 2 из извещения/документации по объекту закупки (формат вида 01.11.11.110), через запятую если несколько; если в источнике нет — пустая строка "".

      Не включай закупки, если название не соответствует запросу "${query}".

      Верни ТОЛЬКО JSON-массив объектов с полями: id, title, price, restrictions, link, platform, date, okpd2.`;

    const t0 = Date.now();
    log("вызов ai.models.generateContent (инструмент googleSearch может занимать 30–120 с)");

    const response = await withGemini429Retry(
      () =>
        ai.models.generateContent({
          model: MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  price: { type: Type.STRING },
                  restrictions: { type: Type.STRING },
                  link: { type: Type.STRING },
                  platform: { type: Type.STRING },
                  date: { type: Type.STRING },
                  okpd2: { type: Type.STRING },
                },
                required: ["id", "title", "price", "restrictions", "link", "platform"],
              },
            },
          },
        }),
      {
        onRetry: ({ retryNumber, waitMs }) =>
          log("429 от Gemini, повтор", { retryNumber, waitMs }),
      }
    );

    const ms = Date.now() - t0;
    const raw = response.text ?? "";
    log("ответ модели получен", {
      durationMs: ms,
      responseChars: raw.length,
    });

    let data: Tender[];
    try {
      data = JSON.parse(raw || "[]") as Tender[];
    } catch (e) {
      log("ошибка разбора JSON ответа", {
        message: e instanceof Error ? e.message : String(e),
        rawPreview: raw.slice(0, 500),
      });
      throw new Error("Модель вернула невалидный JSON");
    }

    const list = Array.isArray(data) ? data : [];
    const aligned = alignTenderLinksWithGrounding(list, response, query.trim());
    log("готово", {
      tendersCount: aligned.tenders.length,
      groundingWebSources: aligned.groundedUriCount,
      linksAdjusted: aligned.replacedCount,
    });
    return aligned.tenders;
  });
}
