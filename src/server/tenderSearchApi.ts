import type { IncomingMessage } from "node:http";
import { GoogleGenAI } from "@google/genai";
import type { Tender } from "../types";
import { withGemini429Retry, isGeminiRateLimitError, isGeminiUnavailableError } from "../lib/geminiRetry";
import { searchEisTenders } from "./eisTenderSearch";
import { alignTenderLinksWithGrounding } from "./tenderLinkAlign";
import { maskProxyForLog, withGeminiProxy } from "./geminiProxy";

const MODELS = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "gemini-2.5-flash,gemini-2.5-flash-lite")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

function normalizeJsonResponse(raw: string): string {
  const text = raw.trim();
  if (!text) return "[]";

  if (text.startsWith("```")) {
    const unfenced = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (unfenced) return unfenced;
  }

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }

  return text;
}

function log(phase: string, detail?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  if (detail && Object.keys(detail).length > 0) {
    console.log(`[tender-search ${ts}] ${phase}`, detail);
  } else {
    console.log(`[tender-search ${ts}] ${phase}`);
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_TENDER_TERMS = new Set([
  "закупка",
  "заявка",
  "запрос",
  "котировок",
  "котировка",
  "тендер",
  "поставка",
  "товаров",
  "товара",
  "услуг",
  "услуги",
  "работ",
  "работы",
  "электронной",
  "форме",
  "нужд",
  "для",
  "оказание",
  "оказания",
  "выполнение",
  "приобретение",
]);

const QUERY_SYNONYMS: Record<string, string[]> = {
  оргтехника: ["мфу", "принтер", "сканер", "картридж", "копировальн", "печат"],
  ноутбук: ["ноутбук", "лэптоп", "портативн", "пэвм"],
};

function queryTerms(query: string): string[] {
  return normalizeText(query)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function queryConcepts(query: string): string[][] {
  return queryTerms(query).map((term) => [term, ...(QUERY_SYNONYMS[term] ?? [])]);
}

function includesTermVariant(text: string, term: string): boolean {
  if (text.includes(term)) return true;
  if (term.length >= 6 && text.includes(term.slice(0, -1))) return true;
  if (term.length >= 7 && text.includes(term.slice(0, -2))) return true;
  return false;
}

function isCodeLikeQuery(query: string): boolean {
  return /^[\d.\s-]+$/.test(query.trim()) && /\d/.test(query);
}

function titleMatchesQuery(title: string, query: string): boolean {
  const normalizedTitle = normalizeText(title);
  const normalizedQuery = normalizeText(query);
  if (!normalizedTitle || !normalizedQuery) return false;

  if (normalizedTitle.includes(normalizedQuery)) return true;

  const concepts = queryConcepts(query);
  if (concepts.length === 0) return true;

  const matchedConcepts = concepts.filter((variants) => variants.some((term) => includesTermVariant(normalizedTitle, term))).length;

  if (concepts.length === 1) return matchedConcepts === 1;
  if (concepts.length <= 3) return matchedConcepts === concepts.length;
  return matchedConcepts >= Math.max(2, concepts.length - 1);
}

function tenderMatchesQuery(tender: Tender, query: string): boolean {
  const title = String(tender.title ?? "");
  const okpd2 = String(tender.okpd2 ?? "");

  if (isCodeLikeQuery(query)) {
    const normalizedQuery = normalizeText(query);
    return normalizeText(title).includes(normalizedQuery) || normalizeText(okpd2).includes(normalizedQuery);
  }

  return titleMatchesQuery(title, query);
}

function isLowSignalTitle(title: string): boolean {
  if (/\.\.\.|…/.test(title)) return true;

  const terms = normalizeText(title)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  const meaningful = terms.filter(
    (term) =>
      term.length >= 4 &&
      !GENERIC_TENDER_TERMS.has(term) &&
      !/^\d+[\d./-]*$/.test(term)
  );

  return meaningful.length === 0;
}

function sanitizeTender(tender: Tender, query: string, strictMatch = true): Tender | null {
  const title = String(tender.title ?? "").trim().replace(/\s+/g, " ");
  if (!title || isLowSignalTitle(title)) return null;
  if (strictMatch && !tenderMatchesQuery(tender, query)) return null;

  const platform = String(tender.platform ?? "").trim() || "ЕИС";
  const link = String(tender.link ?? "").trim();
  if (!link) return null;

  const price = String(tender.price ?? "").trim() || "Не указана";
  const restrictions = String(tender.restrictions ?? "").trim();
  const date = String(tender.date ?? "").trim() || "Дата не указана";
  const okpd2 = String(tender.okpd2 ?? "").trim();
  const idBase = String(tender.id ?? "").trim() || `${title}_${link}`;

  return {
    id: idBase,
    title,
    price,
    restrictions,
    platform,
    date,
    link,
    okpd2,
  };
}

function sanitizeTenderList(tenders: Tender[], query: string, strictMatch = true): Tender[] {
  const seen = new Set<string>();
  const out: Tender[] = [];

  for (const tender of tenders) {
    const cleaned = sanitizeTender(tender, query, strictMatch);
    if (!cleaned) continue;

    const dedupeKey = `${normalizeText(cleaned.title)}|${cleaned.link}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(cleaned);
  }

  return out.slice(0, 8);
}

function mergeTenderLists(primary: Tender[], secondary: Tender[], query: string): Tender[] {
  return sanitizeTenderList([...primary, ...secondary], query, false).slice(0, 8);
}

async function runGeminiTenderSearch(
  query: string,
  apiKey: string,
  proxyUrl?: string | null
): Promise<Tender[]> {
  if (!apiKey) {
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

  log("старт запроса к Gemini", { models: MODELS, queryPreview: query.slice(0, 120) });

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

      Жёсткие правила качества:
      - не добавляй позиции, если в названии нет самого запроса "${query}" или его явной словоформы;
      - не добавляй смежные или слишком общие закупки вроде просто "оборудование", если из названия не видно связь с запросом;
      - не добавляй обрезанные названия с многоточием, заглушки, служебные строки и очевидно нерелевантные позиции;
      - если точных результатов мало, лучше верни меньше позиций или пустой массив, чем нерелевантные закупки;
      - верни не более 8 позиций.

      Используй web search и верни ТОЛЬКО чистый JSON-массив без markdown, пояснений и префиксов.

      Верни ТОЛЬКО JSON-массив объектов с полями: id, title, price, restrictions, link, platform, date, okpd2.`;

    let lastError: unknown;

    for (let index = 0; index < MODELS.length; index++) {
      const model = MODELS[index]!;
      const t0 = Date.now();
      log("вызов ai.models.generateContent (инструмент googleSearch может занимать 30–120 с)", {
        model,
        modelAttempt: index + 1,
        totalModels: MODELS.length,
      });

      try {
        const response = await withGemini429Retry(
          () =>
            ai.models.generateContent({
              model,
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              config: {
                tools: [{ googleSearch: {} }],
                temperature: 0.1,
              },
            }),
          {
            onRetry: ({ retryNumber, waitMs }) =>
              log("429 от Gemini, повтор", { model, retryNumber, waitMs }),
          }
        );

        const ms = Date.now() - t0;
        const raw = response.text ?? "";
        const normalized = normalizeJsonResponse(raw);
        log("ответ модели получен", {
          model,
          durationMs: ms,
          responseChars: raw.length,
          normalizedChars: normalized.length,
        });

        let data: Tender[];
        try {
          data = JSON.parse(normalized || "[]") as Tender[];
        } catch (e) {
          log("ошибка разбора JSON ответа", {
            model,
            message: e instanceof Error ? e.message : String(e),
            rawPreview: raw.slice(0, 500),
            normalizedPreview: normalized.slice(0, 500),
          });
          throw new Error(`Модель ${model} вернула невалидный JSON`);
        }

        const list = Array.isArray(data) ? data : [];
        const aligned = alignTenderLinksWithGrounding(list, response, query.trim());
        const cleaned = sanitizeTenderList(aligned.tenders, query.trim(), true);
        const loose = cleaned.length === 0 ? sanitizeTenderList(aligned.tenders, query.trim(), false) : cleaned;
        const shouldFallbackOnEmpty = loose.length === 0 && index < MODELS.length - 1;
        log("готово", {
          model,
          rawTendersCount: list.length,
          alignedTendersCount: aligned.tenders.length,
          cleanedTendersCount: cleaned.length,
          fallbackLooseCount: loose.length,
          groundingWebSources: aligned.groundedUriCount,
          linksAdjusted: aligned.replacedCount,
          shouldFallbackOnEmpty,
        });

        if (shouldFallbackOnEmpty) {
          log("переключение на следующую модель из-за пустого результата", {
            failedModel: model,
            nextModel: MODELS[index + 1],
          });
          continue;
        }

        return loose;
      } catch (e) {
        lastError = e;
        const canFallback = index < MODELS.length - 1;
        const fallbackReason =
          isGeminiUnavailableError(e) ||
          isGeminiRateLimitError(e) ||
          (e instanceof Error && /invalid json/i.test(e.message));

        log("ошибка модели", {
          model,
          canFallback,
          message: e instanceof Error ? e.message : String(e),
        });

        if (canFallback && fallbackReason) {
          log("переключение на следующую модель", { failedModel: model, nextModel: MODELS[index + 1] });
          continue;
        }

        throw e;
      }
    }

    throw lastError ?? new Error("Не удалось получить ответ ни от одной модели Gemini");
  });
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
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    log("пропуск: пустой запрос");
    return [];
  }

  let eisTenders: Tender[] = [];
  let strictEisCount = 0;
  try {
    const rawEis = await searchEisTenders(trimmedQuery, 8);
    const strictEis = sanitizeTenderList(rawEis, trimmedQuery, true);
    strictEisCount = strictEis.length;
    eisTenders = strictEis.length > 0 ? strictEis : sanitizeTenderList(rawEis, trimmedQuery, false);
    log("результат детерминированного поиска ЕИС", {
      queryPreview: trimmedQuery.slice(0, 120),
      rawEisCount: rawEis.length,
      strictEisCount: strictEis.length,
      eisCount: eisTenders.length,
    });
  } catch (e) {
    log("ошибка детерминированного поиска ЕИС", {
      queryPreview: trimmedQuery.slice(0, 120),
      message: e instanceof Error ? e.message : String(e),
    });
  }

  const conceptCount = queryConcepts(trimmedQuery).length;
  const shouldReturnEisOnly =
    isCodeLikeQuery(trimmedQuery)
      ? eisTenders.length > 0
      : conceptCount >= 2
        ? strictEisCount > 0
        : eisTenders.length >= 3;
  if (shouldReturnEisOnly) {
    log("возврат результатов без Gemini — хватило официальных источников", {
      eisCount: eisTenders.length,
      codeLikeQuery: isCodeLikeQuery(trimmedQuery),
    });
    return eisTenders;
  }

  if (!apiKey) {
    if (eisTenders.length > 0) {
      log("Gemini не настроен, возвращаем только результаты ЕИС", { eisCount: eisTenders.length });
      return eisTenders;
    }

    log("ошибка: GEMINI_API_KEY не задан и ЕИС не дал результатов");
    throw new Error("GEMINI_API_KEY не настроен на сервере разработки");
  }

  try {
    const geminiTenders = await runGeminiTenderSearch(trimmedQuery, apiKey, proxyUrl);
    const merged = mergeTenderLists(eisTenders, geminiTenders, trimmedQuery);
    log("гибридный результат поиска", {
      eisCount: eisTenders.length,
      geminiCount: geminiTenders.length,
      mergedCount: merged.length,
    });
    return merged;
  } catch (e) {
    if (eisTenders.length > 0) {
      log("Gemini недоступен, возвращаем деградированный результат из ЕИС", {
        eisCount: eisTenders.length,
        message: e instanceof Error ? e.message : String(e),
      });
      return eisTenders;
    }

    throw e;
  }
}
