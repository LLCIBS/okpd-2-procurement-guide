import React, { useState, useEffect, useRef, useCallback } from "react";
import { ExternalLink, Loader2, Search as SearchIcon, TrendingUp, AlertCircle, DollarSign, ShieldAlert, Hash } from "lucide-react";
import { Tender } from "../types";
import { motion, AnimatePresence } from "motion/react";

/** Пауза после последнего символа — один запрос к API, не на каждую букву. */
const DEBOUNCE_MS = 1000;

interface TenderSearchProps {
  query: string;
  /** Увеличивается при Enter в поле поиска — мгновенный запрос без ожидания debounce. */
  searchKick?: number;
}

export function TenderSearch({ query, searchKick = 0 }: TenderSearchProps) {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingPause, setAwaitingPause] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastKickHandledRef = useRef(searchKick);

  const fetchTenders = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/tender-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const payload = (await res.json()) as { tenders?: Tender[]; error?: string };

      if (!res.ok) {
        const fallbackMessage =
          res.status === 503
            ? "AI-поиск закупок сейчас перегружен. Уже пробуем резервную модель, но Google отвечает нестабильно. Повторите запрос через 10–30 секунд."
            : res.status === 429
              ? "AI-поиск закупок временно упёрся в лимит провайдера. Попробуйте ещё раз чуть позже."
              : res.status >= 500
                ? "Не удалось получить актуальные закупки. Попробуйте повторить запрос немного позже."
                : `Ошибка поиска (${res.status})`;
        setError(payload.error?.trim() || fallbackMessage);
        setTenders([]);
        return;
      }

      setTenders(payload.tenders ?? []);
    } catch (err) {
      console.error("Tender Search Error:", err);
      setError("Не удалось связаться с сервисом поиска закупок. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceTimerRef.current);
    if (query.trim().length < 3) {
      setAwaitingPause(false);
      setTenders([]);
      setError(null);
      return;
    }

    setAwaitingPause(true);
    debounceTimerRef.current = setTimeout(() => {
      setAwaitingPause(false);
      void fetchTenders(query);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(debounceTimerRef.current);
    };
  }, [query, fetchTenders]);

  useEffect(() => {
    if (searchKick === lastKickHandledRef.current) return;
    lastKickHandledRef.current = searchKick;
    clearTimeout(debounceTimerRef.current);
    setAwaitingPause(false);
    const trimmed = query.trim();
    if (trimmed.length >= 3) {
      void fetchTenders(trimmed);
    }
  }, [searchKick, query, fetchTenders]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-bold text-slate-900">Актуальные закупки в ЕИС</h3>
        </div>
        <button 
          onClick={() => void fetchTenders(query)}
          disabled={isLoading || query.trim().length < 3}
          className="text-xs font-bold text-blue-600 hover:text-blue-700 uppercase tracking-wider flex items-center gap-1 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <SearchIcon className="h-3 w-3" />}
          Обновить
        </button>
      </div>

      {awaitingPause && !isLoading && query.trim().length >= 3 && (
        <p className="text-xs text-slate-500 text-center">
          Поиск закупок начнётся через ~1 с после окончания ввода или сразу по клавише Enter
        </p>
      )}

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12 space-y-4 bg-white rounded-2xl border border-slate-100"
          >
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            <p className="text-sm text-slate-500 font-medium text-center max-w-md">
              Сначала проверяем официальный ЕИС, затем при необходимости дополняем результаты AI-поиском. Обычно это занимает 5–30 секунд.
            </p>
          </motion.div>
        ) : error ? (
          <motion.div 
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-800"
          >
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </motion.div>
        ) : tenders.length === 0 ? (
          <motion.div 
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-12 text-center bg-white rounded-2xl border border-slate-100"
          >
            <SearchIcon className="h-12 w-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Закупки по данному запросу не найдены</p>
          </motion.div>
        ) : (
          <motion.div 
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 gap-4"
          >
            {tenders.map((tender) => (
              <div 
                key={tender.id} 
                className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {tender.platform} • {tender.date || "Актуально"}
                    </span>
                    <h4 className="font-bold text-slate-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                      {tender.title}
                    </h4>
                  </div>
                  <a 
                    href={tender.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="shrink-0 p-2 bg-slate-50 rounded-lg text-blue-600 hover:bg-blue-600 hover:text-white transition-all"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-emerald-50 rounded-lg shrink-0">
                      <DollarSign className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Цена контракта</p>
                      <p className="text-sm font-bold text-slate-900">{tender.price}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-violet-50 rounded-lg shrink-0">
                      <Hash className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">ОКПД 2</p>
                      <p
                        className="text-sm font-bold text-slate-900 break-words"
                        title={tender.okpd2 || undefined}
                      >
                        {tender.okpd2?.trim() ? tender.okpd2 : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 min-w-0 sm:col-span-2 lg:col-span-1">
                    <div className="p-2 bg-amber-50 rounded-lg shrink-0">
                      <ShieldAlert className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Ограничения</p>
                      <p className="text-sm font-bold text-slate-900 truncate sm:max-w-none lg:truncate lg:max-w-[220px]" title={tender.restrictions || undefined}>
                        {tender.restrictions?.trim() ? tender.restrictions : "Не указаны"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
