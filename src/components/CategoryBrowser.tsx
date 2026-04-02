import React, { useMemo } from "react";
import { OKPDCode } from "../types";
import { okpdData } from "../data/okpdData";
import { ChevronRight, Folder } from "lucide-react";
import { motion } from "motion/react";

interface CategoryBrowserProps {
  onSelect: (code: OKPDCode) => void;
}

export function CategoryBrowser({ onSelect }: CategoryBrowserProps) {
  const categories = useMemo<Record<string, OKPDCode[]>>(() => {
    const groups: Record<string, OKPDCode[]> = {};
    okpdData.forEach((item) => {
      const cat = item.category || "Прочее";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900">Просмотр по категориям</h3>
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
          {Object.keys(categories).length} категорий
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.entries(categories) as [string, OKPDCode[]][]).map(([category, items], idx) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            key={category}
            className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md transition-all group"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                <Folder className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </div>
              <h4 className="font-bold text-slate-900">{category}</h4>
            </div>
            
            <div className="space-y-2">
              {items.map((item) => (
                <button
                  key={item.code}
                  onClick={() => onSelect(item)}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-left transition-colors group/item"
                >
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-tight mb-0.5">
                      {item.code}
                    </span>
                    <span className="text-sm text-slate-600 line-clamp-1 group-hover/item:text-slate-900">
                      {item.name}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover/item:text-blue-500 transition-colors" />
                </button>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
