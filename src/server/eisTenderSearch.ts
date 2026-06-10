import type { Tender, TenderLawFilter } from "../types";

const EIS_SEARCH_URL = "https://zakupki.gov.ru/epz/order/extendedsearch/results.html";
const REQUEST_TIMEOUT_MS = 25_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const DETAIL_ENRICH_LIMIT = 8;
const MAX_RAW_CANDIDATES = 30;

const QUERY_SYNONYMS: Record<string, string[]> = {
  оргтехника: ["мфу", "принтер", "сканер", "картридж", "копировальн", "печат"],
  ноутбук: ["ноутбук", "ноутбуков", "ноутбука", "лэптоп", "портативн", "пэвм"],
  принтер: ["принтер", "принтеров", "печатающ"],
  мфу: ["мфу", "многофункциональн"],
};

const cache = new Map<string, { expiresAt: number; tenders: Tender[] }>();

function lawFilterKey(lawFilter: TenderLawFilter): string {
  return `${lawFilter.law44 ? "44" : ""}${lawFilter.law223 ? "223" : ""}` || "none";
}

function tenderMatchesLawFilter(tender: Tender, lawFilter: TenderLawFilter): boolean {
  if (tender.platform.includes("44-ФЗ")) return lawFilter.law44;
  if (tender.platform.includes("223-ФЗ")) return lawFilter.law223;
  return lawFilter.law44 || lawFilter.law223;
}

function filterTendersByLaw(tenders: Tender[], lawFilter: TenderLawFilter): Tender[] {
  if (lawFilter.law44 && lawFilter.law223) return tenders;
  if (!lawFilter.law44 && !lawFilter.law223) return [];
  return tenders.filter((tender) => tenderMatchesLawFilter(tender, lawFilter));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s.()-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<br\s*\/?\s*>/gi, ", ")
      .replace(/<span[^>]*highlightColor[^>]*>(.*?)<\/span>/gis, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#8381;/g, "₽")
      .replace(/&#034;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
  );
}

function absoluteZakupkiUrl(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return new URL(trimmed, "https://zakupki.gov.ru").toString();
}

function extractFirst(pattern: RegExp, source: string): string {
  const match = pattern.exec(source);
  if (!match) return "";
  const value = match[1] ?? match[2] ?? "";
  return stripTags(value);
}

function inferPlatform(block: string, link: string): string {
  const header = extractFirst(/registry-entry__header-top__title[^>]*>([\s\S]*?)<\/div>/i, block);
  if (header.includes("44-ФЗ")) return "ЕИС · 44-ФЗ";
  if (header.includes("223-ФЗ")) return "ЕИС · 223-ФЗ";
  if (/\/223\//.test(link)) return "ЕИС · 223-ФЗ";
  if (/\/epz\/order\//.test(link)) return "ЕИС";
  return "ЕИС";
}

function extractTenderNumber(link: string, block: string): string {
  const number = extractFirst(/registry-entry__header-mid__number[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i, block);
  return number || link;
}

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

function parseDateToAgeDays(date: string): number | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const ts = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
  if (Number.isNaN(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
}

function freshnessScore(date: string): number {
  const ageDays = parseDateToAgeDays(date);
  if (ageDays == null) return 0;
  if (ageDays <= 3) return 18;
  if (ageDays <= 14) return 12;
  if (ageDays <= 45) return 8;
  if (ageDays <= 120) return 4;
  return 0;
}

function countMatchedConcepts(title: string, query: string): { matched: number; total: number } {
  const normalizedTitle = normalizeText(title);
  const concepts = queryConcepts(query);
  const matched = concepts.filter((variants) => variants.some((term) => includesTermVariant(normalizedTitle, term))).length;
  return { matched, total: concepts.length };
}

function scoreTenderForQuery(tender: Tender, query: string): number {
  const title = normalizeText(tender.title);
  const okpd2 = normalizeText(tender.okpd2 ?? "");
  const normalizedQuery = normalizeText(query);

  let score = 0;

  if (isCodeLikeQuery(query)) {
    if (okpd2.includes(normalizedQuery)) score += 220;
    if (title.includes(normalizedQuery)) score += 180;
    if (title.includes("окпд2") && title.includes(normalizedQuery)) score += 40;
    if (score === 0) score -= 200;
  } else {
    const { matched, total } = countMatchedConcepts(title, query);
    const queryIndex = title.indexOf(normalizedQuery);

    if (queryIndex !== -1) {
      score += 130;
      if (queryIndex === 0) score += 45;
      else if (queryIndex <= 20) score += 20;
    }
    if (total > 0) score += matched * 35;
    if (total === 1 && matched === 1) score += 35;
    if (total >= 2 && matched === total) score += 90;
    if (total >= 2 && matched === total - 1) score += 20;
    if (total >= 2 && matched < total) score -= 55;
    if (matched === 0) score -= 180;
  }

  score += freshnessScore(tender.date);
  if (tender.okpd2?.trim()) score += 10;
  if (tender.restrictions?.trim()) score += 6;
  if (tender.platform.includes("44-ФЗ")) score += 4;
  if (tender.platform.includes("223-ФЗ")) score += 2;

  return score;
}

function passesRelevanceThreshold(tender: Tender, query: string): boolean {
  const score = scoreTenderForQuery(tender, query);
  if (isCodeLikeQuery(query)) return score >= 120;
  const concepts = queryConcepts(query).length;
  if (concepts >= 2) return score >= 50;
  return score >= 30;
}

function parseSearchBlocks(html: string): Tender[] {
  const blocks = [...html.matchAll(/<div class="search-registry-entry-block box-shadow-search-input">([\s\S]*?)<div class="href-block mt-auto d-none">/gi)]
    .map((match) => match[1])
    .filter(Boolean) as string[];

  const out: Tender[] = [];

  for (const block of blocks) {
    const hrefMatch = /registry-entry__header-mid__number[\s\S]*?<a[^>]*href="([^"]+)"/i.exec(block);
    const link = absoluteZakupkiUrl(hrefMatch?.[1] ?? "");
    if (!link) continue;

    const title =
      extractFirst(/<div class="registry-entry__body-title">Объект закупки<\/div>\s*<div class="registry-entry__body-value">([\s\S]*?)<\/div>/i, block) ||
      extractFirst(/<meta[^>]+itemprop="name"[^>]+content="([^"]+)"/i, block);

    const price = extractFirst(/<div class="price-block__value"[^>]*>([\s\S]*?)<\/div>/i, block) || "Не указана";
    const date = extractFirst(/<div class="data-block__title">Размещено<\/div>\s*<div class="data-block__value">([\s\S]*?)<\/div>/i, block) || "Дата не указана";
    const restrictions = extractFirst(/<div class="registry-entry__body-title">Преимущества, требования к участникам<\/div>\s*<div class="registry-entry__body-value">([\s\S]*?)<\/div>/i, block);
    const platform = inferPlatform(block, link);
    const tenderNumber = extractTenderNumber(link, block);

    out.push({
      id: tenderNumber,
      title,
      price,
      restrictions,
      platform,
      date,
      link,
      okpd2: "",
    });
  }

  return out;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; okpd-asissto-bot/1.0; +https://okpd.asissto.ru)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ru,en;q=0.8",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`EIS HTTP ${response.status} for ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractOkpdCodes(detailHtml: string): string[] {
  const codes = new Set<string>();
  for (const match of detailHtml.matchAll(/\b\d{2}\.\d{2}\.\d{2}\.\d{3}\b/g)) {
    codes.add(match[0]);
  }
  return [...codes];
}

function extractOkpdCodesFromText(value: string): string[] {
  const codes = new Set<string>();
  for (const match of value.matchAll(/\b\d{2}\.\d{2}\.\d{2}(?:\.\d{3})?\b/g)) {
    codes.add(match[0]);
  }
  return [...codes];
}

function extract223LotListUrl(detailHtml: string): string {
  const hrefMatch = detailHtml.match(/(?:href|data-url)="([^"]*\/epz\/order\/notice\/notice223\/lot-list\.html\?[^"]+)"/i);
  if (!hrefMatch?.[1]) return "";
  return absoluteZakupkiUrl(hrefMatch[1].replace(/&amp;/g, "&"));
}

async function extract223LotListOkpdCodes(detailHtml: string): Promise<string[]> {
  const lotListUrl = extract223LotListUrl(detailHtml);
  if (!lotListUrl) return [];

  const lotListHtml = await fetchText(lotListUrl);
  const rowMatches = [...lotListHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const codes = new Set<string>();

  for (const row of rowMatches) {
    if (!/lot-info\.html/i.test(row)) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 4) continue;

    for (const code of extractOkpdCodesFromText(stripTags(cells[3]))) {
      codes.add(code);
    }
  }

  if (codes.size > 0) return [...codes];
  return extractOkpdCodes(lotListHtml);
}

function extractNationalRegimeRestrictions(detailHtml: string): string[] {
  const tableMatch = /<div class="tabBoxWrapper tabBoxWrapper__mb24" id="national-regimen-table-pagination-id">([\s\S]*?)<\/table>/i.exec(detailHtml);
  if (!tableMatch) return [];

  const rows = [...tableMatch[1].matchAll(/<tr class="table__row">([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
  const restrictions = new Set<string>();

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*class="table__cell table__cell-body"[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripTags(match[1]));
    if (cells.length >= 2 && cells[1]) {
      restrictions.add(cells[1]);
    }
  }

  return [...restrictions];
}

function extractDetailTitle(detailHtml: string): string {
  return (
    extractFirst(/<div class="registry-entry__body-title">Объект закупки<\/div>\s*<div class="registry-entry__body-value">([\s\S]*?)<\/div>/i, detailHtml) ||
    extractFirst(/<td class="table__cell table__cell-body">\s*(\d{2}\.\d{2}\.\d{2}\.\d{3}(?:-[^<\s]+)?\s+[\s\S]*?)<\/td>/i, detailHtml)
  );
}

async function enrichTenderFromDetail(tender: Tender): Promise<Tender> {
  try {
    const detailHtml = await fetchText(tender.link);
    const title = tender.title || extractDetailTitle(detailHtml);
    let okpdCodes = extractOkpdCodes(detailHtml);
    if (okpdCodes.length === 0 && tender.platform.includes("223-ФЗ")) {
      okpdCodes = await extract223LotListOkpdCodes(detailHtml);
    }
    const restrictionLines = extractNationalRegimeRestrictions(detailHtml);

    return {
      ...tender,
      title: title || tender.title,
      okpd2: okpdCodes.slice(0, 3).join(", ") || tender.okpd2 || "",
      restrictions: restrictionLines.slice(0, 2).join("; ") || tender.restrictions || "",
    };
  } catch {
    return tender;
  }
}

function rankAndFilterTenders(tenders: Tender[], query: string, maxResults: number): Tender[] {
  return tenders
    .filter((tender) => passesRelevanceThreshold(tender, query))
    .sort((a, b) => {
      const scoreDiff = scoreTenderForQuery(b, query) - scoreTenderForQuery(a, query);
      if (scoreDiff !== 0) return scoreDiff;
      return (parseDateToAgeDays(a.date) ?? Number.MAX_SAFE_INTEGER) - (parseDateToAgeDays(b.date) ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, maxResults);
}

function remember(cacheKey: string, tenders: Tender[]): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    tenders,
  });
}

function fromCache(cacheKey: string): Tender[] | null {
  const hit = cache.get(cacheKey);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(cacheKey);
    return null;
  }
  return hit.tenders.map((tender) => ({ ...tender }));
}

export async function searchEisTenders(query: string, maxResults = 8, lawFilter: TenderLawFilter = { law44: true, law223: true }): Promise<Tender[]> {
  const normalizedQuery = normalizeWhitespace(query);
  if (!normalizedQuery) return [];
  if (!lawFilter.law44 && !lawFilter.law223) return [];

  const cacheKey = `${normalizedQuery}::${lawFilterKey(lawFilter)}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached.slice(0, maxResults);

  const searchUrl = `${EIS_SEARCH_URL}?searchString=${encodeURIComponent(normalizedQuery)}`;
  const html = await fetchText(searchUrl);
  const parsed = filterTendersByLaw(parseSearchBlocks(html).slice(0, MAX_RAW_CANDIDATES), lawFilter);
  const ranked = rankAndFilterTenders(parsed, normalizedQuery, maxResults);

  const enriched = await Promise.all(
    ranked.map((tender, index) => (index < DETAIL_ENRICH_LIMIT ? enrichTenderFromDetail(tender) : Promise.resolve(tender)))
  );

  const reranked = rankAndFilterTenders(filterTendersByLaw(enriched, lawFilter), normalizedQuery, maxResults);
  remember(cacheKey, reranked);
  return reranked;
}
