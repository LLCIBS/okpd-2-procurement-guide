import type { Tender } from "../types";

/** Ответ generateContent — достаточно полей для grounding. */
type GenResponseWithGrounding = {
  candidates?: Array<{
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string; domain?: string };
      }>;
    };
  }>;
};

const TRUSTED_HOST_PATTERNS = [
  /(^|\.)zakupki\.gov\.ru$/i,
  /(^|\.)roseltorg\.ru$/i,
  /(^|\.)rts-tender\.ru$/i,
  /(^|\.)sberbank-ast\.ru$/i,
  /(^|\.)zakaz\.rf$/i,
  /(^|\.)etpgpb\.ru$/i,
  /(^|\.)tektorg\.ru$/i,
  /(^|\.)fabrikant\.ru$/i,
  /(^|\.)etprf\.ru$/i,
  /(^|\.)lot-online\.ru$/i,
];

function normalizeHref(u: string): string {
  try {
    const url = new URL(u.trim());
    url.hash = "";
    let s = url.href;
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return u.trim();
  }
}

function isTrustedProcurementUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return TRUSTED_HOST_PATTERNS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

/**
 * Без grounding нельзя жёстко угадывать «правильный» шаблон пути ЕИС — у извещений разные URL.
 * Раньше требовали notice/view/common-info и из‑за этого подменяли рабочие ссылки на поиск.
 * Сейчас: на zakupki.gov.ru подменяем только «голую» главную; любой непустой путь оставляем как у модели.
 */
function looksLikeEisNoticeOrSearchUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/(^|\.)zakupki\.gov\.ru$/i.test(u.hostname)) return false;
    const p = u.pathname;
    if (p === "/" || p === "") return false;
    return true;
  } catch {
    return false;
  }
}

function wordsForMatch(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function scoreTitleOverlap(a: string, b: string): number {
  const wa = wordsForMatch(a);
  const sb = new Set(wordsForMatch(b));
  let s = 0;
  for (const w of wa) {
    if (sb.has(w)) s++;
  }
  return s;
}

export type GroundingSource = { uri: string; title: string };

export function extractGroundingWebSources(response: GenResponseWithGrounding): GroundingSource[] {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const out: GroundingSource[] = [];
  const seen = new Set<string>();
  for (const ch of chunks) {
    const uri = ch.web?.uri?.trim();
    if (!uri) continue;
    const n = normalizeHref(uri);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push({ uri: ch.web!.uri!.trim(), title: (ch.web?.title ?? "").trim() });
  }
  return out;
}

function eisSearchUrl(titleOrQuery: string): string {
  const q = titleOrQuery.trim();
  return `https://zakupki.gov.ru/epz/order/extendedsearch/results.html?searchString=${encodeURIComponent(q)}`;
}

/**
 * Подставляет ссылки из реальных источников поиска (grounding), если JSON модели не совпадает с ними.
 * Каждому тендеру стараемся выдать свой URL из списка источников (без повторов).
 */
export function alignTenderLinksWithGrounding(
  tenders: Tender[],
  response: GenResponseWithGrounding,
  userQuery: string
): { tenders: Tender[]; groundedUriCount: number; replacedCount: number } {
  const sources = extractGroundingWebSources(response);
  const groundedSet = new Set(sources.map((s) => normalizeHref(s.uri)));
  let replacedCount = 0;
  const usedUris = new Set<string>();

  const pickUnused = (predicate: (s: GroundingSource) => boolean): GroundingSource | undefined => {
    for (const s of sources) {
      const n = normalizeHref(s.uri);
      if (usedUris.has(n)) continue;
      if (predicate(s)) return s;
    }
    return undefined;
  };

  const next = tenders.map((t) => {
    const raw = (t.link ?? "").trim();

    if (raw && groundedSet.has(normalizeHref(raw))) {
      usedUris.add(normalizeHref(raw));
      return { ...t, link: raw };
    }

    if (sources.length === 0) {
      if (raw && isTrustedProcurementUrl(raw)) {
        const host = (() => {
          try {
            return new URL(raw).hostname;
          } catch {
            return "";
          }
        })();
        const isZakupki = /(^|\.)zakupki\.gov\.ru$/i.test(host);
        if (isZakupki && !looksLikeEisNoticeOrSearchUrl(raw)) {
          replacedCount++;
          return { ...t, link: eisSearchUrl(t.title || userQuery) };
        }
        return { ...t, link: raw };
      }
      if (raw) replacedCount++;
      return { ...t, link: eisSearchUrl(t.title || userQuery) };
    }

    let best: GroundingSource | undefined;
    let bestScore = -1;
    for (const src of sources) {
      const n = normalizeHref(src.uri);
      if (usedUris.has(n)) continue;
      const sc = scoreTitleOverlap(t.title, src.title);
      if (sc > bestScore) {
        bestScore = sc;
        best = src;
      }
    }

    if (best && bestScore >= 2) {
      if (normalizeHref(best.uri) !== normalizeHref(raw)) replacedCount++;
      usedUris.add(normalizeHref(best.uri));
      return { ...t, link: best.uri };
    }

    const zak = pickUnused((s) => /zakupki\.gov\.ru/i.test(s.uri));
    if (zak) {
      if (normalizeHref(zak.uri) !== normalizeHref(raw)) replacedCount++;
      usedUris.add(normalizeHref(zak.uri));
      return { ...t, link: zak.uri };
    }

    const anyUnused = pickUnused(() => true);
    if (anyUnused) {
      if (normalizeHref(anyUnused.uri) !== normalizeHref(raw)) replacedCount++;
      usedUris.add(normalizeHref(anyUnused.uri));
      return { ...t, link: anyUnused.uri };
    }

    if (raw && isTrustedProcurementUrl(raw)) return { ...t, link: raw };

    if (raw) replacedCount++;
    return { ...t, link: eisSearchUrl(t.title || userQuery) };
  });

  return {
    tenders: next,
    groundedUriCount: sources.length,
    replacedCount,
  };
}
