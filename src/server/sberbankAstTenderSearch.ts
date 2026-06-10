import type { Tender, TenderLawFilter } from "../types";

const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

const QUERY_SYNONYMS: Record<string, string[]> = {
  оргтехника: ["мфу", "принтер", "сканер", "картридж", "копировальн", "печат"],
  ноутбук: ["ноутбук", "ноутбуков", "ноутбука", "лэптоп", "портативн", "пэвм"],
  принтер: ["принтер", "принтеров", "печатающ"],
  мфу: ["мфу", "многофункциональн"],
};

const cache = new Map<string, { expiresAt: number; tenders: Tender[] }>();

function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&quot;/g, '"')
      .replace(/&#034;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
  );
}

function normalizeText(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s.()-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function countMatchedConcepts(text: string, query: string): { matched: number; total: number } {
  const normalized = normalizeText(text);
  const concepts = queryConcepts(query);
  const matched = concepts.filter((variants) => variants.some((term) => includesTermVariant(normalized, term))).length;
  return { matched, total: concepts.length };
}

function extractFirst(tag: string, source: string): string {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i").exec(source);
  return decodeXmlEntities(match?.[1] ?? "");
}

function formatPrice(amountRaw: string, currencyRaw: string): string {
  const cleaned = amountRaw.replace(/\s+/g, "").replace(",", ".").trim();
  const amount = Number(cleaned);
  const currency = currencyRaw.trim().toUpperCase();

  if (!Number.isFinite(amount)) return amountRaw.trim() || "Не указана";

  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);

  if (currency === "RUB" || currency === "РУБ") return `${formatted} ₽`;
  return currency ? `${formatted} ${currency}` : formatted;
}

function extractOkpdCodes(value: string): string[] {
  const codes = new Set<string>();
  for (const match of value.matchAll(/\b\d{2}\.\d{2}\.\d{2}(?:\.\d{3})?\b/g)) {
    codes.add(match[0]);
  }
  return [...codes];
}

function extractOkpdCodesFromProductCodes(value: string): string[] {
  const codes = new Set<string>();
  for (const part of value.split(/[,;]+/)) {
    const cleaned = normalizeWhitespace(part);
    const direct = cleaned.match(/\b\d{2}\.\d{2}\.\d{2}(?:\.\d{3})?\b/);
    if (direct?.[0]) {
      codes.add(direct[0]);
      continue;
    }
    const prefix = cleaned.match(/^(\d{2}\.\d{2}\.\d{2}\.\d{3})-/);
    if (prefix?.[1]) codes.add(prefix[1]);
  }
  return [...codes];
}

function chooseDisplayTitle(title: string, productNames: string, query: string): string {
  if (!title) return productNames;
  if (!productNames) return title;
  if (titleMatchesQuery(title, query)) return title;
  if (normalizeText(title).includes(normalizeText(productNames))) return title;
  return `${title} — ${productNames}`;
}

function buildRestrictions(...parts: Array<string | undefined>): string {
  return parts.map((part) => normalizeWhitespace(part ?? "")).filter(Boolean).join("; ");
}

function buildSearchXml44(query: string, size: number): string {
  const escapedQuery = query
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<elasticrequest><personid>0</personid><buid>0</buid><filters><mainSearchBar><value>${escapedQuery}</value><type>phrase_prefix</type><minimum_should_match>100%</minimum_should_match></mainSearchBar></filters><sort><value>default</value><direction></direction></sort><aggregations><empty><filterType>filter_aggregation</filterType><field></field></empty></aggregations><size>${size}</size><from>0</from></elasticrequest>`;
}

function buildSearchXml223(query: string, size: number): string {
  const escapedQuery = query
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const fields = [
    "TradeSectionId",
    "purchAmount",
    "purchCurrency",
    "purchCode",
    "PurchaseTypeName",
    "OrgName",
    "PublicDate",
    "RequestDate",
    "RequestStartDate",
    "AuctionBeginDate",
    "purchName",
    "BidName",
    "BidNo",
    "Bid_Id",
    "SourceHrefTerm",
    "bidHrefTerm",
    "objectHrefTerm",
    "CreateRequestHrefTerm",
    "PurchaseState",
    "RequestCntState",
    "PurchaseId",
    "PurchaseName",
    "CurrentAmount",
    "PurchaseWayTerm",
    "RegionName",
    "RegionNameTerm",
    "PurchaseTypeId",
    "PeculiaritiesInfo",
    "PeculiaritiesInfoList",
    "productCodes",
    "productNames",
    "productDictionary",
    "IsSMPTerm",
  ].map((field) => `<field>${field}</field>`).join("");

  return `<elasticrequest><filters><mainSearchBar><value>${escapedQuery}</value><type>best_fields</type><minimum_should_match>100%</minimum_should_match></mainSearchBar></filters><_source>${fields}</_source><sort><value>default</value><direction></direction></sort><aggs><buckets><field></field><size>200</size><type></type><min_doc_count>0</min_doc_count><include>.*</include></buckets></aggs><size>${size}</size><from>0</from></elasticrequest>`;
}

function parseDateToAgeDays(date: string): number | null {
  const normalized = normalizeWhitespace(date);
  const dotMatch = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(normalized);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalized);
  if (!dotMatch && !isoMatch) return null;

  let dd = "";
  let mm = "";
  let yyyy = "";

  if (dotMatch) {
    [, dd, mm, yyyy] = dotMatch;
  } else if (isoMatch) {
    [, yyyy, mm, dd] = isoMatch;
  }

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

function scoreTenderForQuery(tender: Tender, query: string): number {
  const title = normalizeText(tender.title);
  const okpd2 = normalizeText(tender.okpd2 ?? "");
  const normalizedQuery = normalizeText(query);

  let score = 0;

  if (isCodeLikeQuery(query)) {
    if (okpd2.includes(normalizedQuery)) score += 220;
    if (title.includes(normalizedQuery)) score += 180;
    if (score === 0) score -= 200;
  } else {
    const { matched, total } = countMatchedConcepts(tender.title, query);
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
  if (tender.okpd2?.trim()) score += 12;
  if (tender.restrictions?.trim()) score += 6;
  return score;
}

function passesRelevanceThreshold(tender: Tender, query: string): boolean {
  const score = scoreTenderForQuery(tender, query);
  if (isCodeLikeQuery(query)) return score >= 120;
  const concepts = queryConcepts(query).length;
  if (concepts >= 2) return score >= 50;
  return score >= 30;
}

function parse44Hits(tableXml: string, query: string): Tender[] {
  const hits = [...tableXml.matchAll(/<hits>([\s\S]*?)<\/hits>/g)].map((match) => match[1]);
  const seen = new Set<string>();
  const out: Tender[] = [];

  for (const hit of hits) {
    const titleBase = extractFirst("BidName", hit) || extractFirst("purchName", hit);
    const productNames = extractFirst("productNames", hit);
    const title = chooseDisplayTitle(titleBase, productNames, query);
    const link = extractFirst("objectHrefTerm", hit) || extractFirst("CreateRequestHrefTerm", hit) || extractFirst("OOSHref", hit);
    const price = formatPrice(extractFirst("purchAmount", hit), extractFirst("purchCurrency", hit));
    const date = extractFirst("PublicDate", hit) || extractFirst("RequestStartDate", hit) || extractFirst("EndDate", hit) || "Дата не указана";
    const restrictions = buildRestrictions(
      extractFirst("IsSMPTerm", hit) ? `СМП: ${extractFirst("IsSMPTerm", hit)}` : "",
      extractFirst("AdRequirementEnable", hit) ? `Доп. требования: ${extractFirst("AdRequirementEnable", hit)}` : "",
      extractFirst("PurchaseState", hit)
    );
    const okpdCodes = [
      ...extractOkpdCodes(extractFirst("purchOKDP", hit)),
      ...extractOkpdCodesFromProductCodes(extractFirst("productCodes", hit)),
    ];
    const id = extractFirst("purchID", hit) || extractFirst("PurchID", hit) || `${title}_${link}`;

    const tender: Tender = {
      id,
      title,
      price,
      restrictions,
      link,
      platform: "Сбербанк-АСТ · 44-ФЗ",
      date,
      okpd2: [...new Set(okpdCodes)].slice(0, 3).join(", "),
    };

    if (!title || !link || !passesRelevanceThreshold(tender, query)) continue;

    const dedupeKey = `${normalizeText(title)}|${link}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(tender);
  }

  return out;
}

function parse223Hits(tableXml: string, query: string): Tender[] {
  const hits = [...tableXml.matchAll(/<hits>([\s\S]*?)<\/hits>/g)].map((match) => match[1]);
  const seen = new Set<string>();
  const out: Tender[] = [];

  for (const hit of hits) {
    const titleBase = extractFirst("BidName", hit) || extractFirst("PurchaseName", hit) || extractFirst("purchName", hit);
    const productNames = extractFirst("productNames", hit);
    const title = chooseDisplayTitle(titleBase, productNames, query);
    const link = extractFirst("objectHrefTerm", hit) || extractFirst("bidHrefTerm", hit) || extractFirst("CreateRequestHrefTerm", hit);
    const price = formatPrice(extractFirst("purchAmount", hit) || extractFirst("CurrentAmount", hit), extractFirst("purchCurrency", hit));
    const date =
      extractFirst("PublicDate", hit) ||
      extractFirst("RequestStartDate", hit) ||
      extractFirst("RequestDate", hit) ||
      extractFirst("AuctionBeginDate", hit) ||
      "Дата не указана";
    const okpdCodes = [
      ...extractOkpdCodes(extractFirst("PeculiaritiesInfo", hit)),
      ...extractOkpdCodes(extractFirst("PeculiaritiesInfoList", hit)),
      ...extractOkpdCodesFromProductCodes(extractFirst("productCodes", hit)),
    ];
    const restrictions = buildRestrictions(
      extractFirst("PurchaseState", hit),
      extractFirst("PurchaseTypeName", hit),
      extractFirst("IsSMPTerm", hit) ? `СМП: ${extractFirst("IsSMPTerm", hit)}` : ""
    );
    const id = extractFirst("PurchaseId", hit) || extractFirst("Bid_Id", hit) || `${title}_${link}`;

    const tender: Tender = {
      id,
      title,
      price,
      restrictions,
      link,
      platform: "Сбербанк-АСТ · 223-ФЗ",
      date,
      okpd2: [...new Set(okpdCodes)].slice(0, 3).join(", "),
    };

    if (!title || !link || !passesRelevanceThreshold(tender, query)) continue;

    const dedupeKey = `${normalizeText(title)}|${link}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(tender);
  }

  return out;
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

async function postForm(url: string, referer: string, origin: string, body: URLSearchParams): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; okpd-asissto-bot/1.0; +https://okpd.asissto.ru)",
        accept: "application/json,text/plain,*/*",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        referer,
        origin,
        "x-requested-with": "XMLHttpRequest",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Sberbank-AST HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function searchSber44(query: string, maxResults: number): Promise<Tender[]> {
  const cacheKey = `44::${query}::${maxResults}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached.slice(0, maxResults);

  const body = new URLSearchParams({
    xmlData: buildSearchXml44(query, Math.max(20, maxResults * 2)),
    orgId: "0",
    targetPageCode: "ESPurchaseList",
    PID: "0",
  });

  const raw = await postForm(
    "https://www.sberbank-ast.ru/SearchQuery.aspx?name=Main",
    "https://www.sberbank-ast.ru/purchaseList.aspx",
    "https://www.sberbank-ast.ru",
    body
  ) as { result?: string; data?: string };

  if (raw.result !== "success" || !raw.data) return [];

  const inner = JSON.parse(raw.data) as { tableXml?: string };
  const parsed = parse44Hits(inner.tableXml ?? "", query)
    .sort((a, b) => scoreTenderForQuery(b, query) - scoreTenderForQuery(a, query))
    .slice(0, maxResults);

  remember(cacheKey, parsed);
  return parsed;
}

async function searchSber223(query: string, maxResults: number): Promise<Tender[]> {
  const cacheKey = `223::${query}::${maxResults}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached.slice(0, maxResults);

  const body = new URLSearchParams({
    xmlData: buildSearchXml223(query, Math.max(20, maxResults * 2)),
    orgId: "0",
    buId: "0",
    personId: "0",
    buMainId: "0",
    personMainId: "0",
  });

  const raw = await postForm(
    "https://utp.sberbank-ast.ru/Trade/SearchQuery/BidList",
    "https://utp.sberbank-ast.ru/Trade/List/BidList",
    "https://utp.sberbank-ast.ru",
    body
  ) as { result?: string; data?: { Data?: { tableXml?: string } } };

  const tableXml = raw.result === "success" ? raw.data?.Data?.tableXml ?? "" : "";
  const parsed = parse223Hits(tableXml, query)
    .sort((a, b) => scoreTenderForQuery(b, query) - scoreTenderForQuery(a, query))
    .slice(0, maxResults);

  remember(cacheKey, parsed);
  return parsed;
}

function mergeTenderLists(tenders: Tender[], query: string, maxResults: number): Tender[] {
  const seen = new Set<string>();
  return tenders
    .filter((tender) => {
      const key = `${normalizeText(tender.title)}|${tender.link}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => scoreTenderForQuery(b, query) - scoreTenderForQuery(a, query))
    .slice(0, maxResults);
}

export async function searchSberbankAstTenders(
  query: string,
  maxResults = 8,
  lawFilter: TenderLawFilter = { law44: true, law223: true }
): Promise<Tender[]> {
  const normalizedQuery = normalizeWhitespace(query);
  if (!normalizedQuery) return [];
  if (!lawFilter.law44 && !lawFilter.law223) return [];

  const tasks: Array<Promise<Tender[]>> = [];
  if (lawFilter.law44) tasks.push(searchSber44(normalizedQuery, maxResults));
  if (lawFilter.law223) tasks.push(searchSber223(normalizedQuery, maxResults));

  const settled = await Promise.allSettled(tasks);
  const merged = mergeTenderLists(
    settled.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
    normalizedQuery,
    maxResults
  );

  return merged;
}
