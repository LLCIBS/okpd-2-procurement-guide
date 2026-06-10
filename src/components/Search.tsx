import React, { useState, useEffect } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { cn } from "../lib/utils";
import { OKPDCode } from "../types";
import { okpdData } from "../data/okpdData";
import { motion, AnimatePresence } from "motion/react";

interface SearchProps {
  onSelect: (code: OKPDCode) => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** Enter при длине запроса ≥ 3 — сразу запустить поиск закупок (без ожидания debounce). */
  onTenderSearchSubmit?: () => void;
}

export function Search({ onSelect, query, onQueryChange, onTenderSearchSubmit }: SearchProps) {
  const [results, setResults] = useState<OKPDCode[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const canSearchTenders = query.trim().length >= 3;

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const filtered = okpdData.filter(
      (item) =>
        item.code.includes(query) ||
        item.name.toLowerCase().includes(query.toLowerCase())
    );
    setResults(filtered);
  }, [query]);

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="relative group flex items-center gap-3">
        <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <SearchIcon className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
        </div>
        <input
          type="text"
          className={cn(
            "block w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:text-sm transition-all shadow-sm",
            isOpen && results.length > 0 && "rounded-b-none"
          )}
          placeholder="Введите код ОКПД 2 или название товара..."
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim().length >= 3) {
              e.preventDefault();
              onTenderSearchSubmit?.();
              setIsOpen(false);
            }
          }}
          onFocus={() => setIsOpen(true)}
        />
        {query && (
          <button
            onClick={() => {
              onQueryChange("");
              setIsOpen(false);
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
          </button>
        )}
        </div>

        <button
          type="button"
          onClick={() => {
            if (!canSearchTenders) return;
            onTenderSearchSubmit?.();
            setIsOpen(false);
          }}
          disabled={!canSearchTenders}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-100"
        >
          <SearchIcon className="h-4 w-4" />
          Поиск
        </button>
      </div>

      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-10 w-full bg-white shadow-lg rounded-b-xl border-x border-b border-gray-200 overflow-hidden"
          >
            <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100">
              {results.map((item) => (
                <li
                  key={item.code}
                  onClick={() => {
                    onSelect(item);
                    setIsOpen(false);
                    onQueryChange("");
                  }}
                  className="px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors group"
                >
                  <div className="flex items-start">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-3">
                      {item.code}
                    </span>
                    <p className="text-sm text-gray-700 line-clamp-2 group-hover:text-blue-900">
                      {item.name}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
